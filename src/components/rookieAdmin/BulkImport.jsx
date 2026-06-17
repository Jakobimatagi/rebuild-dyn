// ── Bulk class importer ──────────────────────────────────────────────────────
// Pick a college season + positions, and pull the top N FBS producers per
// position from CFBD (stats, games, target-share estimate, NFL capital), then
// write them straight into Supabase as prospects with a live progress bar.
//
// Dedupe: if a prospect with the same name + position already exists, we reuse
// its id so the import *overwrites* it (preserving its annotations and manual
// fields like comp/tier); otherwise we mint a stable `cfbd-{playerId}` id so
// re-importing a season updates the same records instead of duplicating.

import { useState } from "react";
import { fetchClassImport } from "../../lib/cfbdApi.js";
import { upsertProspect, upsertAnnotation } from "../../lib/supabase.js";
import { fetchHistoricalRoster } from "../../lib/historicalRostersApi.js";
import { normalizeName } from "./utils.js";

const POSITIONS = ["QB", "RB", "WR", "TE"];
const CUR = new Date().getFullYear();
const YEARS = Array.from({ length: 8 }, (_, i) => CUR - i);

// Name+position key that ignores generational suffixes (Jr./III) since CFBD and
// nflverse don't always agree on them. Used to match imports against the NFL roster.
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const matchKey = (name, pos) => {
  const core = (name || "").toLowerCase().replace(/[.,]/g, "").split(/\s+/)
    .filter((t) => !SUFFIXES.has(t)).join("").replace(/[^a-z]/g, "");
  return `${core}|${(pos || "").toUpperCase()}`;
};

export default function BulkImport({ prospects, annotations = {}, onReload }) {
  const [year, setYear] = useState(String(CUR - 1));
  const [positions, setPositions] = useState([...POSITIONS]);
  const [limit, setLimit] = useState(50);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("");      // "fetch" | "save" | ""
  const [pct, setPct] = useState(0);
  const [label, setLabel] = useState("");
  const [log, setLog] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  const togglePos = (p) =>
    setPositions((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));

  function resolveTarget(cand, pos, capital) {
    const existing = prospects.find(
      (p) => normalizeName(p.name) === normalizeName(cand.name) && p.position === pos,
    );
    return {
      id:                 existing?.id || `cfbd-${cand.playerId}`,
      name:               cand.name,
      position:           pos,
      projectedDraftYear: Number(year) + 1,
      draftCapital:       existing?.draftCapital || capital || "",
      comparablePlayer:   existing?.comparablePlayer || "",
      athletic:           {
        ...(existing?.athletic || {}),
        ...(cand.dominatorByYear ? { dom: cand.dominatorByYear } : {}),
        ...(cand.qbHelpByYear ? { qb: cand.qbHelpByYear } : {}),
        ...(cand.ppaByYear ? { ppa: cand.ppaByYear } : {}),
        ...(cand.teamCtxByYear ? { team: cand.teamCtxByYear } : {}),
        ...(cand.programByYear ? { prog: cand.programByYear } : {}),
        ...(cand.usageByYear ? { use: cand.usageByYear } : {}),
      },
      seasons:            cand.seasons,
      _isUpdate:          !!existing,
    };
  }

  async function run() {
    setRunning(true); setError(""); setSummary(null); setLog([]); setPct(0);
    const yr = Number(year);
    const draftYear = yr + 1;
    const chosen = POSITIONS.filter((p) => positions.includes(p));
    const estTotal = Math.max(1, chosen.length * limit);
    let done = 0, added = 0, updated = 0, failed = 0, declaredCount = 0;

    // NFL presence for the draft year (drafted + UDFA who made a roster) — the
    // signal for which imports get marked Declared. nflverse roster_{year}; if it
    // isn't out yet (future class), fall back to CFBD draft only.
    let nflRoster = null;
    try {
      const map = await fetchHistoricalRoster(draftYear);
      nflRoster = new Set(
        Object.values(map || {}).map((r) => matchKey(r.name, r.position)),
      );
    } catch { nflRoster = null; }

    // Drafted (CFBD) → keep their capital. Else on the NFL roster → UDFA. Else
    // didn't make it → not declared.
    const nflStatus = (cand, pos) => {
      if (cand.draftCapital) return { declared: true, capital: cand.draftCapital, via: "drafted" };
      if (nflRoster && nflRoster.has(matchKey(cand.name, pos)))
        return { declared: true, capital: "udfa", via: "udfa" };
      return { declared: false, capital: "", via: null };
    };

    try {
      for (const pos of chosen) {
        setPhase("fetch");
        setLabel(`Fetching top ${limit} ${pos} from CFBD… (~20s)`);
        let list;
        try {
          list = await fetchClassImport(yr, pos, limit);
        } catch (e) {
          setLog((l) => [{ name: `${pos} class`, pos, status: "err", msg: e.message }, ...l].slice(0, 10));
          done += limit;
          setPct(Math.min(99, Math.round((done / estTotal) * 100)));
          continue;
        }

        setPhase("save");
        for (const cand of list) {
          const nfl = nflStatus(cand, pos);
          const target = resolveTarget(cand, pos, nfl.capital);
          setLabel(`Saving ${cand.name} (${pos})…`);
          try {
            await upsertProspect(target);
            // Only players who reached the NFL — drafted or UDFA on a roster —
            // are marked Declared, so they surface in the Archive for that draft
            // year. Others import but stay undeclared. Merge to keep tier/notes.
            if (nfl.declared) {
              await upsertAnnotation(target.id, {
                ...(annotations[target.id] || {}),
                declared: true,
                ...(nfl.capital ? { draftCapital: nfl.capital } : {}),
              });
              declaredCount++;
            }
            if (target._isUpdate) updated++; else added++;
            setLog((l) => [{ name: cand.name, pos, status: target._isUpdate ? "upd" : "ok", via: nfl.via }, ...l].slice(0, 10));
          } catch (e) {
            failed++;
            setLog((l) => [{ name: cand.name, pos, status: "err", msg: e.message }, ...l].slice(0, 10));
          }
          done++;
          setPct(Math.min(99, Math.round((done / estTotal) * 100)));
        }
      }
      setPct(100); setPhase(""); setLabel("Import complete");
      setSummary({ added, updated, failed, declared: declaredCount });
      await onReload();
    } catch (e) {
      setError(e.message || "Import failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-bold text-slate-100 mb-1">Bulk Import from CFBD</h2>
      <p className="text-sm text-slate-400 mb-5">
        Pulls the top FBS producers per position for a college season — stats, games,
        target-share estimate, and NFL draft capital — and writes them to your database.
        Players who reached the NFL — <span className="text-amber-300">drafted or UDFA</span> — are marked
        Declared for the {Number(year) + 1} class, so they land in the Archive for that year and are
        comparable in VS. Existing players (matched by name + position) are overwritten; their tier/comp/notes are kept.
      </p>

      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-5">
        <div className="flex flex-wrap gap-5 items-end">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">College Season</label>
            <select value={year} onChange={(e) => setYear(e.target.value)} disabled={running}
              className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400 disabled:opacity-50">
              {YEARS.map((y) => <option key={y} value={y}>{y} season → {y + 1} draft</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Per position</label>
            <select value={limit} onChange={(e) => setLimit(Number(e.target.value))} disabled={running}
              className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400 disabled:opacity-50">
              {[10, 25, 50].map((n) => <option key={n} value={n}>Top {n}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Positions</label>
            <div className="flex gap-2">
              {POSITIONS.map((p) => (
                <button key={p} type="button" onClick={() => togglePos(p)} disabled={running}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-50 ${
                    positions.includes(p)
                      ? "border-sky-400/50 bg-sky-500/15 text-sky-200"
                      : "border-white/10 text-slate-400 hover:text-slate-200"
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button onClick={run} disabled={running || positions.length === 0}
            className="bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-sky-950 font-semibold px-6 py-2 rounded-lg text-sm">
            {running ? "Importing…" : `Import ${positions.length * limit} players`}
          </button>
          <span className="text-xs text-slate-500">
            {positions.length} position{positions.length !== 1 ? "s" : ""} · top {limit} each
          </span>
        </div>

        {(running || pct > 0) && (
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-slate-300">{label}</span>
              <span className="text-slate-400">{pct}%</span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all duration-300 ${phase === "fetch" ? "animate-pulse" : ""}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        {error && <div className="text-rose-400 text-sm">{error}</div>}

        {summary && (
          <div className="text-sm text-emerald-300">
            ✓ Done — {summary.added} added, {summary.updated} updated, {summary.declared} declared (drafted/UDFA)
            {summary.failed > 0 && <span className="text-rose-400"> · {summary.failed} failed</span>}.
          </div>
        )}

        {log.length > 0 && (
          <div className="rounded-lg border border-white/10 divide-y divide-white/5 max-h-52 overflow-y-auto">
            {log.map((e, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-1.5 text-xs">
                <span className="text-slate-300">
                  {e.name} <span className="text-slate-500">{e.pos}</span>
                  {e.via && <span className="ml-2 text-[10px] text-amber-300 bg-amber-500/15 border border-amber-400/30 px-1 py-0.5 rounded">{e.via === "drafted" ? "drafted · declared" : "UDFA · declared"}</span>}
                </span>
                <span className={
                  e.status === "err" ? "text-rose-400" : e.status === "upd" ? "text-amber-300" : "text-emerald-300"
                }>
                  {e.status === "err" ? `failed: ${e.msg}` : e.status === "upd" ? "updated" : "added"}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-[10px] text-slate-500 leading-snug">
          FBS only. Pulls two seasons ({"{year-1, year}"}) per player. Targets, catch rate, and age
          aren't in CFBD — fill those by hand. Re-running a season safely updates the same records.
        </p>
      </div>
    </div>
  );
}
