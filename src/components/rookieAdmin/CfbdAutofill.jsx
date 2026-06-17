// ── CFBD auto-fill panel ─────────────────────────────────────────────────────
// Lives in the Prospector add/edit form. Search a player on CollegeFootballData,
// pick the match, and pull their college seasons (mapped to the form schema),
// NFL draft capital, and recruiting pedigree in one shot — replacing manual
// stat entry. Also offers a "browse the class" mode that lists the top
// producers at the selected position for a college season, each loadable into
// the form for review before saving.

import { useState } from "react";
import {
  searchPlayers, fetchCareerSeasons, fetchDraftInfo, fetchRecruiting, fetchClass,
} from "../../lib/cfbdApi.js";

const STARS = (n) => (n ? "★".repeat(n) + "☆".repeat(Math.max(0, 5 - n)) : "");

export default function CfbdAutofill({ position, name, projectedDraftYear, onApply }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("search"); // "search" | "class"
  const [query, setQuery] = useState("");
  const [classYear, setClassYear] = useState(String((parseInt(projectedDraftYear) || new Date().getFullYear()) - 1));
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const now = new Date();
  const currentYear = now.getFullYear();
  const draftYear = parseInt(projectedDraftYear) || currentYear;
  // College seasons finish in January; the latest season that can have data is
  // the current calendar year once it's underway (Aug+), otherwise last year.
  const lastCompletedSeason = now.getMonth() >= 7 ? currentYear : currentYear - 1;

  async function runSearch() {
    const term = (query || name || "").trim();
    if (!term) { setError("Type a player name to search."); return; }
    setBusy(true); setError(""); setStatus(""); setResults([]);
    try {
      const rows = await searchPlayers(term);
      setResults(rows);
      if (!rows.length) setStatus("No players found.");
    } catch (e) { setError(e.message || "Search failed."); }
    finally { setBusy(false); }
  }

  async function runClass() {
    const yr = parseInt(classYear);
    if (!yr) { setError("Enter a college season year."); return; }
    setBusy(true); setError(""); setStatus(""); setResults([]);
    try {
      const rows = await fetchClass(yr, position, 40);
      setResults(rows.map((r) => ({ ...r, _classStat: r.stat })));
      if (!rows.length) setStatus("No players found for that year/position.");
    } catch (e) { setError(e.message || "Class lookup failed."); }
    finally { setBusy(false); }
  }

  async function loadPlayer(row) {
    setBusy(true); setError(""); setStatus(`Loading ${row.name}…`);
    try {
      const from = Math.max(2010, draftYear - 5);
      const to = Math.min(currentYear, draftYear - 1);
      const {
        seasons, player, dominatorByYear, qbHelpByYear,
        ppaByYear, teamCtxByYear, programByYear, usageByYear,
      } = await fetchCareerSeasons(row.id, position, { from, to });
      if (!seasons.length) {
        setError(`No ${position} season stats found for ${row.name} (${from}–${to}). Try a different position or year range.`);
        setBusy(false);
        return;
      }
      const earliestYear = parseInt(seasons[0].season_year) || from;

      // Draft + recruiting are best-effort context — never block the stat fill.
      const [draft, recruiting] = await Promise.all([
        fetchDraftInfo(row.id, row.name, draftYear).catch(() => null),
        fetchRecruiting(row.id, row.name, earliestYear).catch(() => null),
      ]);

      const patch = { name: row.name, seasons };
      if (draft?.capitalKey) patch.draftCapital = draft.capitalKey;
      // Drafted → lock into the class as Declared (matches bulk-import behavior).
      if (draft?.round) patch.declared = true;
      if (recruiting) {
        patch.athletic = {
          recruitingStars: recruiting.stars ?? null,
          recruitingRank: recruiting.ranking ?? null,
          recruitingRating: recruiting.rating ?? null,
          committedTo: recruiting.committedTo ?? null,
        };
      }
      // Per-season context stashed in the athletic bag (read by the card/deep-dive):
      // RB dominator, WR/TE QB-help, player PPA efficiency, team offense context,
      // program strength, and full usage profile.
      const ctx = {};
      if (dominatorByYear) ctx.dom = dominatorByYear;
      if (qbHelpByYear) ctx.qb = qbHelpByYear;
      if (ppaByYear) ctx.ppa = ppaByYear;
      if (teamCtxByYear) ctx.team = teamCtxByYear;
      if (programByYear) ctx.prog = programByYear;
      if (usageByYear) ctx.use = usageByYear;
      if (Object.keys(ctx).length) patch.athletic = { ...(patch.athletic || {}), ...ctx };
      onApply(patch);

      const bits = [`${seasons.length} season${seasons.length > 1 ? "s" : ""} loaded`];
      if (recruiting?.stars) bits.push(`${STARS(recruiting.stars)} recruit`);
      if (draft?.round) bits.push(`drafted R${draft.round}.${draft.pick} (${draft.nflTeam})`);
      setStatus(`✓ ${player?.name || row.name}: ${bits.join(" · ")}`);
      setResults([]);
    } catch (e) {
      setError(e.message || "Failed to load player.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-semibold text-sky-300 hover:text-sky-200 border border-sky-400/30 bg-sky-500/10 rounded-lg px-3 py-1.5 transition-colors"
      >
        ⚡ Auto-fill from CFBD
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-sky-400/25 bg-sky-500/[0.06] p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {["search", "class"].map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setResults([]); setStatus(""); setError(""); }}
              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${
                mode === m ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-slate-200"
              }`}>
              {m === "search" ? "Find player" : `Browse ${position} class`}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
      </div>

      {mode === "search" ? (
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && runSearch()}
            placeholder={name ? `Search "${name}"…` : "Search CFBD player name…"}
            className="flex-1 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-400"
          />
          <button type="button" onClick={runSearch} disabled={busy}
            className="bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-50 text-sky-200 text-sm font-semibold px-4 rounded-lg">
            {busy ? "…" : "Search"}
          </button>
        </div>
      ) : (
        <div className="flex gap-2 items-center">
          <span className="text-[11px] text-slate-400">College season</span>
          <input type="number" value={classYear} onChange={(e) => setClassYear(e.target.value)}
            className="w-24 bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-400" />
          <button type="button" onClick={runClass} disabled={busy}
            className="bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-50 text-sky-200 text-sm font-semibold px-4 py-1.5 rounded-lg">
            {busy ? "…" : `Top ${position}s`}
          </button>
        </div>
      )}

      {error && <div className="text-rose-400 text-xs">{error}</div>}
      {status && <div className="text-emerald-300 text-xs">{status}</div>}

      {results.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/5">
          {results.map((r) => (
            <button key={`${r.id}-${r.team}`} type="button" onClick={() => loadPlayer(r)} disabled={busy}
              className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-white/5 disabled:opacity-50">
              <span className="text-sm text-slate-100">{r.name}</span>
              <span className="text-[11px] text-slate-400 flex items-center gap-2">
                {r.position && <span className="text-slate-500">{r.position}</span>}
                <span>{r.team}</span>
                {r._classStat != null && <span className="text-sky-300">{r._classStat} yds</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-500 leading-snug">
        Fills counting + efficiency stats, games, target-share estimate, NFL capital & recruiting pedigree,
        plus advanced context (per-play PPA, usage profile, team offense pace/efficiency, SP+ & roster talent).
        Age is estimated from college class standing (Fr ≈ 19 … Sr ≈ 22); refine it by hand.
        Targets and catch rate aren't in CFBD — enter those by hand.
      </p>
    </div>
  );
}
