import { useEffect, useMemo, useRef, useState } from "react";
import { adminSignIn, restoreAdmin, signOutAccount, fetchDcEntries, fetchOcEntries } from "../lib/supabase.js";
import { fetchPlayersDb, fetchHistoricalStats } from "../lib/sleeperApi.js";
import { fetchNflState } from "../lib/projectionsApi.js";
import { fetchSeasonWeeklyScores } from "../lib/weeklyScoringApi.js";
import { fetchSeasonIdpWeekly, fetchUpcomingWeek } from "../lib/idpWeeklyApi.js";
import { buildIdpRankings, IDP_POSITIONS } from "../lib/idpScoring.js";
import {
  buildMultipliers,
  getMultiplier,
  getMatchupEntry,
  defaultSeasonWeights,
} from "../lib/defenseMatchups.js";
import {
  buildPlayerProfiles,
  buildOutcomeRates,
  getOutcomeRate,
  outcomeVerdict,
} from "../lib/matchupOutcomes.js";
import { coordinatorFor, coordinatorContinuityFactors } from "../lib/dcBlueprint.js";
import { mergeDcData } from "../lib/dcData.js";
import { mergeOcData } from "../lib/ocData.js";
import { fetchDefenseSchemeSeasons, defenseFingerprintFor } from "../lib/dcHistoryApi.js";

const POS_COLORS = {
  QB: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  RB: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  WR: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  TE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  DL: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  LB: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  DB: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
  DEF: "bg-lime-500/15 text-lime-300 border-lime-500/30",
};

const OFF_POSITIONS = ["QB", "RB", "WR", "TE"];
const DEF_SIDE_POSITIONS = ["DL", "LB", "DB", "DEF"];
const REG_WEEKS = 18;

function PosPill({ pos }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${POS_COLORS[pos] || "border-white/10 text-slate-400"}`}>
      {pos || "—"}
    </span>
  );
}

function avatarUrl(playerId, pos) {
  if (!playerId) return null;
  if (pos === "DEF") return `https://sleepercdn.com/images/team_logos/nfl/${String(playerId).toLowerCase()}.png`;
  return `https://sleepercdn.com/content/nfl/players/${playerId}.jpg`;
}

function PlayerAvatar({ id, pos, name }) {
  const [errored, setErrored] = useState(false);
  const initials = (name || "")
    .split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const url = avatarUrl(id, pos);
  if (!url || errored) {
    return (
      <div className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
        {initials || "—"}
      </div>
    );
  }
  return (
    <img src={url} alt={name} onError={() => setErrored(true)}
      className="w-8 h-8 rounded-full bg-slate-800 border border-white/10 object-cover shrink-0" />
  );
}

// mult 1.0 = neutral slate; below = red (tough matchup), above = green (soft).
function multCellStyle(mult) {
  if (mult == null) return {};
  const t = Math.max(-1, Math.min(1, (mult - 1) / 0.3));
  const alpha = (Math.abs(t) * 0.55).toFixed(2);
  if (t > 0) return { backgroundColor: `rgba(16,185,129,${alpha})` };
  if (t < 0) return { backgroundColor: `rgba(244,63,94,${alpha})` };
  return {};
}

function fmtMult(mult) {
  return mult == null ? "—" : `${mult.toFixed(2)}×`;
}

function MultChip({ pos, mult, title }) {
  return (
    <span title={title}
      className="flex items-center gap-1 rounded-md border border-white/10 px-1.5 py-0.5 text-[11px]"
      style={multCellStyle(mult)}>
      <span className="font-bold">{pos}</span>
      <span className="font-mono">{fmtMult(mult)}</span>
    </span>
  );
}

function entryTitle(entry, verb = "allows") {
  if (!entry) return "No sample yet — neutral 1.00×";
  return `${verb} ${entry.weightedPpg.toFixed(1)} pts/g vs ${entry.leagueAvg.toFixed(1)} league avg · ${entry.games} games (recency-weighted)`;
}

function SortHeader({ label, sortKey, sort, setSort, className = "" }) {
  const active = sort.key === sortKey;
  return (
    <th className={`px-2 py-2 text-[10px] uppercase tracking-wider text-slate-500 cursor-pointer select-none hover:text-slate-300 ${className}`}
      onClick={() => setSort((s) => ({ key: sortKey, dir: s.key === sortKey ? -s.dir : -1 }))}>
      {label}{active ? (sort.dir < 0 ? " ↓" : " ↑") : ""}
    </th>
  );
}

// ── Tab: IDP Rankings ────────────────────────────────────────────────────────

const IDP_COLUMNS = [
  ["solo", "Solo"], ["ast", "Ast"], ["sack", "Sck"], ["int", "INT"],
  ["ff", "FF"], ["fumRec", "FR"], ["td", "TD"], ["safety", "Saf"], ["passDef", "PD"],
];
const DEF_COLUMNS = [
  ["sack", "Sck"], ["int", "INT"], ["fumRec", "FR"], ["ff", "FF"],
  ["blkKick", "Blk"], ["td", "TD"], ["paPerGame", "PA/g"],
];

function RankingsTab({ rows, loading, error, seasons, season, setSeason }) {
  const [mode, setMode] = useState("idp"); // idp | def
  const [posFilter, setPosFilter] = useState({ DL: true, LB: true, DB: true });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "total", dir: -1 });

  const cols = mode === "def" ? DEF_COLUMNS : IDP_COLUMNS;

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    const list = rows.filter((r) => (mode === "def" ? r.pos === "DEF" : r.pos !== "DEF" && posFilter[r.pos]));
    const searched = q
      ? list.filter((r) => (r.name || "").toLowerCase().includes(q) || (r.team || "").toLowerCase().includes(q))
      : list;
    const val = (r) =>
      sort.key === "total" || sort.key === "ppg" || sort.key === "gp" ? r[sort.key] : r.line[sort.key];
    return [...searched].sort((a, b) => sort.dir * ((val(a) ?? 0) - (val(b) ?? 0)));
  }, [rows, mode, posFilter, search, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-md overflow-hidden border border-white/10">
          <button onClick={() => setMode("idp")}
            className={`px-3 py-1.5 text-xs font-semibold ${mode === "idp" ? "bg-violet-500/20 text-violet-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
            IDP Players
          </button>
          <button onClick={() => setMode("def")}
            className={`px-3 py-1.5 text-xs font-semibold ${mode === "def" ? "bg-lime-500/20 text-lime-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
            Team Defenses
          </button>
        </div>
        <div className="flex rounded-md overflow-hidden border border-white/10">
          {seasons.map((yr) => (
            <button key={yr} onClick={() => setSeason(yr)}
              className={`px-3 py-1.5 text-xs font-semibold ${season === yr ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
              {yr}
            </button>
          ))}
        </div>
        {mode === "idp" && IDP_POSITIONS.map((pos) => (
          <button key={pos} onClick={() => setPosFilter((f) => ({ ...f, [pos]: !f[pos] }))}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${posFilter[pos] ? POS_COLORS[pos] : "border-white/10 text-slate-500 bg-slate-900/40"}`}>
            {pos}
          </button>
        ))}
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or team…"
          className="bg-slate-900 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 w-44" />
        {rows && <span className="text-xs text-slate-500 ml-auto">{filtered.length} ranked · fixed standard IDP/DST scoring</span>}
      </div>

      {loading && <div className="rounded-xl border border-white/10 bg-slate-900/40 p-8 text-center text-slate-400 text-sm">Loading {season} season stats…</div>}
      {error && <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}

      {rows && !loading && (
        <div className="rounded-xl border border-white/10 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70 text-left">
              <tr>
                <th className="px-2 py-2 text-[10px] uppercase tracking-wider text-slate-500">#</th>
                <th className="px-2 py-2 text-[10px] uppercase tracking-wider text-slate-500">Player</th>
                <SortHeader label="GP" sortKey="gp" sort={sort} setSort={setSort} className="text-right" />
                <SortHeader label="Pts" sortKey="total" sort={sort} setSort={setSort} className="text-right" />
                <SortHeader label="PPG" sortKey="ppg" sort={sort} setSort={setSort} className="text-right" />
                {cols.map(([k, label]) => (
                  <SortHeader key={k} label={label} sortKey={k} sort={sort} setSort={setSort} className="text-right" />
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 200).map((r, i) => (
                <tr key={r.player_id} className="border-t border-white/5 hover:bg-slate-900/40">
                  <td className="px-2 py-1.5 text-slate-500 text-xs">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar id={r.player_id} pos={r.pos} name={r.name} />
                      <div>
                        <div className="font-medium text-slate-200 leading-tight">{r.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <PosPill pos={r.pos} />
                          <span className="text-[10px] text-slate-500">{r.team || "FA"}</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-400">{r.gp || "—"}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-slate-100">{r.total.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-300">{r.ppg.toFixed(1)}</td>
                  {cols.map(([k]) => (
                    <td key={k} className="px-2 py-1.5 text-right text-slate-400">
                      {r.line[k] == null ? "—" : Number(r.line[k]).toFixed(k === "paPerGame" ? 1 : 0)}
                    </td>
                  ))}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5 + cols.length} className="px-4 py-10 text-center text-slate-500 text-sm">No players match the current filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {mode === "def" && rows && !loading && (
        <p className="text-[10px] text-slate-600 mt-2">
          Team-defense season totals approximate the points-allowed tier from average PA/game × games — weekly views use exact per-game tiers.
        </p>
      )}
    </div>
  );
}

// ── Tab: Defense vs Position (multiplier grid) ───────────────────────────────

function MultiplierGrid({ engine, dcData, ocData }) {
  const [direction, setDirection] = useState("offense"); // offense | idp
  const [sort, setSort] = useState({ key: "overall", dir: -1 });
  const anchorSeason = engine.seasons[0];

  const { result, positions, groupLabel, verb } = direction === "offense"
    ? { result: engine.dirA, positions: OFF_POSITIONS, groupLabel: "Defense", verb: "allows" }
    : { result: engine.dirB, positions: DEF_SIDE_POSITIONS, groupLabel: "Vs offense", verb: "yields" };

  // DC name for defenses, OC name for offenses — whichever side the group is.
  const coordName = (group) =>
    coordinatorFor(direction === "offense" ? dcData : ocData, anchorSeason, group);

  const rows = useMemo(() => {
    const list = result.groups.map((group) => {
      const cells = {};
      let sum = 0, cnt = 0;
      for (const pos of positions) {
        const entry = getMatchupEntry(result, group, pos);
        cells[pos] = entry;
        if (entry) { sum += entry.mult; cnt += 1; }
      }
      return { group, cells, overall: cnt ? sum / cnt : null };
    });
    const val = (r) => (sort.key === "overall" ? r.overall : r.cells[sort.key]?.mult) ?? -Infinity;
    return list.sort((a, b) => (val(b) - val(a)) * (sort.dir < 0 ? 1 : -1));
  }, [result, positions, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-md overflow-hidden border border-white/10">
          <button onClick={() => { setDirection("offense"); setSort({ key: "overall", dir: -1 }); }}
            className={`px-3 py-1.5 text-xs font-semibold ${direction === "offense" ? "bg-sky-500/20 text-sky-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
            Fantasy allowed to offense
          </button>
          <button onClick={() => { setDirection("idp"); setSort({ key: "overall", dir: -1 }); }}
            className={`px-3 py-1.5 text-xs font-semibold ${direction === "idp" ? "bg-violet-500/20 text-violet-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
            IDP production by opposing offense
          </button>
        </div>
        <span className="text-xs text-slate-500 ml-auto">
          {direction === "offense"
            ? "How QB/RB/WR/TE produce against each defense (1.15× = soft matchup)"
            : "How DL/LB/DB/DEF produce when facing each offense"}
        </span>
      </div>

      <div className="rounded-xl border border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/70 text-left">
            <tr>
              <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500">{groupLabel}</th>
              {positions.map((pos) => (
                <SortHeader key={pos} label={pos} sortKey={pos} sort={sort} setSort={setSort} className="text-center" />
              ))}
              <SortHeader label="Overall" sortKey="overall" sort={sort} setSort={setSort} className="text-center" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.group} className="border-t border-white/5 hover:bg-slate-900/40">
                <td className="px-3 py-1.5">
                  <div className="font-semibold text-slate-200">{r.group}</div>
                  {coordName(r.group) && (
                    <div className="text-[10px] text-slate-500">{direction === "offense" ? "DC" : "OC"} {coordName(r.group)}</div>
                  )}
                </td>
                {positions.map((pos) => (
                  <td key={pos} className="px-2 py-1.5 text-center font-mono text-xs text-slate-100"
                    style={multCellStyle(r.cells[pos]?.mult)}
                    title={entryTitle(r.cells[pos], verb)}>
                    {fmtMult(r.cells[pos]?.mult)}
                  </td>
                ))}
                <td className="px-2 py-1.5 text-center font-mono text-xs font-bold text-slate-100" style={multCellStyle(r.overall)}>
                  {fmtMult(r.overall)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-600 mt-2">
        Recency-weighted over {engine.seasons.join(" / ")} (weights 1.0 / 0.6 / 0.3) · Bayesian-shrunk toward league average by 4 pseudo-games · clamped to 0.75–1.30 · where the DC/OC datasets know a team's coordinator, seasons under a different one count at 0.35× weight. Hover a cell for the underlying sample.
        {direction === "offense" && Object.keys(dcData).length === 0 && (
          <span className="text-amber-500/80"> No DC names yet — add them in <a href="/admin/dc-rankings" className="underline hover:text-amber-300">DC Rankings</a> to activate continuity weighting.</span>
        )}
      </p>
    </div>
  );
}

// ── Tab: Week predictions ────────────────────────────────────────────────────

function SideCard({ team, opp, engine, baselines, idpTop }) {
  const offPlayers = useMemo(
    () => baselines.filter((b) => b.team === team).sort((a, b) => b.proj - a.proj).slice(0, 4),
    [baselines, team],
  );

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/50 p-3">
      <div className="text-sm font-bold text-slate-200 mb-2">{team} <span className="text-slate-500 font-normal">vs {opp}</span></div>

      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Offense vs {opp} defense</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {OFF_POSITIONS.map((pos) => (
          <MultChip key={pos} pos={pos} mult={getMultiplier(engine.dirA, opp, pos)}
            title={entryTitle(getMatchupEntry(engine.dirA, opp, pos), "allows")} />
        ))}
      </div>
      <div className="space-y-1 mb-3">
        {offPlayers.map((p) => {
          const mult = getMultiplier(engine.dirA, opp, p.pos);
          return (
            <div key={p.player_id} className="flex items-center gap-2 text-xs">
              <PosPill pos={p.pos} />
              <span className="text-slate-300 truncate flex-1">{p.name}</span>
              <span className="text-slate-500 font-mono">{p.proj.toFixed(1)}</span>
              <span className="text-slate-600">→</span>
              <span className={`font-mono font-semibold ${mult > 1.02 ? "text-emerald-300" : mult < 0.98 ? "text-rose-300" : "text-slate-300"}`}>
                {(p.proj * mult).toFixed(1)}
              </span>
            </div>
          );
        })}
        {offPlayers.length === 0 && <div className="text-xs text-slate-600">No projections for this side.</div>}
      </div>

      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Defense vs {opp} offense</div>
      <div className="flex flex-wrap gap-1 mb-2">
        {DEF_SIDE_POSITIONS.map((pos) => (
          <MultChip key={pos} pos={pos} mult={getMultiplier(engine.dirB, opp, pos)}
            title={entryTitle(getMatchupEntry(engine.dirB, opp, pos), "yields")} />
        ))}
      </div>
      <div className="space-y-1">
        {idpTop.map((p) => {
          const mult = getMultiplier(engine.dirB, opp, p.pos);
          return (
            <div key={p.player_id} className="flex items-center gap-2 text-xs">
              <PosPill pos={p.pos} />
              <span className="text-slate-300 truncate flex-1">{p.name}</span>
              <span className="text-slate-500 font-mono">{p.ppg.toFixed(1)}/g</span>
              <span className="text-slate-600">→</span>
              <span className={`font-mono font-semibold ${mult > 1.02 ? "text-emerald-300" : mult < 0.98 ? "text-rose-300" : "text-slate-300"}`}>
                {(p.ppg * mult).toFixed(1)}
              </span>
            </div>
          );
        })}
        {idpTop.length === 0 && <div className="text-xs text-slate-600">No IDP sample for this side.</div>}
      </div>
    </div>
  );
}

function PredictionsTab({ engine, playersDb, predSeason, predWeek, setPredWeek }) {
  const [upcoming, setUpcoming] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetchUpcomingWeek(predSeason, predWeek)
      .then((res) => { if (!cancelled) setUpcoming(res); })
      .catch((err) => { if (!cancelled) setError(err.message || "Failed to load the week's slate."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [predSeason, predWeek]);

  // Season PPG for every IDP player / DEF unit from the freshest season with
  // data, so each side card can show its top defenders with the matchup boost.
  const idpBySeason = useMemo(() => {
    const bySeason = new Map();
    for (const r of engine.idpRows) {
      if (!bySeason.has(r.season)) bySeason.set(r.season, []);
      bySeason.get(r.season).push(r);
    }
    return bySeason;
  }, [engine]);

  const idpTopByTeam = useMemo(() => {
    const seasonsWithData = [...idpBySeason.keys()].sort((a, b) => b - a);
    if (seasonsWithData.length === 0) return new Map();
    const rows = idpBySeason.get(seasonsWithData[0]);
    const acc = new Map(); // player_id → { pts, games, pos }
    for (const r of rows) {
      const cur = acc.get(r.player_id) || { pts: 0, games: 0, pos: r.pos };
      cur.pts += r.pts;
      cur.games += 1;
      acc.set(r.player_id, cur);
    }
    const byTeam = new Map();
    for (const [id, v] of acc) {
      if (v.games < 4) continue; // tiny samples make noisy "top defenders"
      // Current team from the players DB (players move); DEF units are their own id.
      const team = v.pos === "DEF" ? id : playersDb?.[id]?.team;
      if (!team) continue;
      const p = playersDb?.[id];
      const name = v.pos === "DEF"
        ? `${team} Defense`
        : p ? [p.first_name, p.last_name].filter(Boolean).join(" ") : id;
      if (!byTeam.has(team)) byTeam.set(team, []);
      byTeam.get(team).push({ player_id: id, name, pos: v.pos, ppg: v.pts / v.games });
    }
    for (const list of byTeam.values()) list.sort((a, b) => b.ppg - a.ppg);
    return byTeam;
  }, [idpBySeason, playersDb]);

  const games = useMemo(() => {
    if (!upcoming) return [];
    const seen = new Set();
    const out = [];
    for (const [team, opp] of upcoming.teamToOpp) {
      const k = [team, opp].sort().join("|");
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([team, opp]);
    }
    return out.sort((a, b) => a[0].localeCompare(b[0]));
  }, [upcoming]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-slate-400">{predSeason} · Week</span>
        <select value={predWeek} onChange={(e) => setPredWeek(Number(e.target.value))}
          className="bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400">
          {Array.from({ length: REG_WEEKS }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>{w}</option>
          ))}
        </select>
        <span className="text-xs text-slate-500 ml-auto">
          Sleeper weekly projection × matchup multiplier · IDP boosts use season PPG
        </span>
      </div>

      {loading && <div className="rounded-xl border border-white/10 bg-slate-900/40 p-8 text-center text-slate-400 text-sm">Loading week {predWeek} slate…</div>}
      {error && <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200">{error}</div>}
      {!loading && !error && upcoming && games.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-8 text-center text-slate-500 text-sm">
          No slate published for {predSeason} week {predWeek} — pick another week.
        </div>
      )}

      <div className="space-y-4">
        {!loading && upcoming && games.map(([a, b]) => (
          <div key={`${a}-${b}`} className="rounded-xl border border-white/10 bg-slate-900/30 p-3">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">{a} vs {b}</div>
            <div className="grid md:grid-cols-2 gap-3">
              <SideCard team={a} opp={b} engine={engine} baselines={upcoming.baselines}
                idpTop={(idpTopByTeam.get(a) || []).slice(0, 4)} />
              <SideCard team={b} opp={a} engine={engine} baselines={upcoming.baselines}
                idpTop={(idpTopByTeam.get(b) || []).slice(0, 4)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Offense vs Defense (ceiling / average / floor odds) ─────────────────

const VERDICT_STYLES = {
  ceiling: "bg-emerald-500/15 text-emerald-300 border-emerald-400/40",
  average: "bg-slate-500/15 text-slate-300 border-white/15",
  floor: "bg-rose-500/15 text-rose-300 border-rose-400/40",
};
const VERDICT_LABELS = { ceiling: "Ceiling lean", average: "Average", floor: "Floor risk" };

function VerdictBadge({ verdict, lift }) {
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${VERDICT_STYLES[verdict]}`}>
      {VERDICT_LABELS[verdict]}{verdict !== "average" && lift ? ` +${Math.round(lift * 100)}%` : ""}
    </span>
  );
}

function ProbBar({ rate }) {
  if (!rate) return <span className="text-xs text-slate-600">no sample</span>;
  const seg = (p, color) => (
    <div className="h-full" style={{ width: `${(p * 100).toFixed(1)}%`, backgroundColor: color }} />
  );
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2.5 w-40 rounded-full overflow-hidden bg-slate-800">
        {seg(rate.ceiling, "rgba(16,185,129,0.9)")}
        {seg(rate.average, "rgba(100,116,139,0.6)")}
        {seg(rate.floor, "rgba(244,63,94,0.9)")}
      </div>
      <span className="text-[11px] font-mono text-slate-400 whitespace-nowrap">
        <span className="text-emerald-300">{Math.round(rate.ceiling * 100)}</span>
        {" / "}{Math.round(rate.average * 100)}{" / "}
        <span className="text-rose-300">{Math.round(rate.floor * 100)}</span>
      </span>
    </div>
  );
}

// Compact chips describing the defense's scheme fingerprint (from the
// defense_scheme_seasons table, when published) — the "why" behind the odds.
function DcFingerprint({ fp, dcName }) {
  if (!fp && !dcName) return null;
  const chip = (label, value) => value != null && (
    <span key={label} className="rounded-md border border-white/10 bg-slate-900/60 px-1.5 py-0.5 text-[11px] text-slate-300">
      <span className="text-slate-500">{label}</span> <span className="font-mono">{value}</span>
    </span>
  );
  const pct = (v, digits = 1) => (v == null ? null : `${(v * 100).toFixed(digits)}%`);
  const funnel = fp?.proe_faced == null ? null
    : `${fp.proe_faced > 0 ? "+" : ""}${Number(fp.proe_faced).toFixed(1)} (${fp.proe_faced > 1 ? "pass funnel" : fp.proe_faced < -1 ? "run funnel" : "neutral"})`;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      {dcName && (
        <span className="rounded-md border border-lime-400/30 bg-lime-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-lime-300">
          DC {dcName}
        </span>
      )}
      {fp && chip("EPA/play allowed", Number(fp.epa_play_allowed ?? NaN).toFixed(3))}
      {fp && chip("sack rate", pct(fp.sack_rate))}
      {fp && chip("deep allowed", pct(fp.deep_rate_allowed, 0))}
      {fp && chip("PROE faced", funnel)}
      {fp && <span className="text-[10px] text-slate-600">({fp.season} pbp)</span>}
    </div>
  );
}

function OffenseVsDefenseTab({ engine, playersDb, dcScheme, dcData }) {
  const teams = engine.dirA.groups;
  const [offense, setOffense] = useState(teams[0] || "");
  const [defense, setDefense] = useState(teams[1] || "");
  const anchorSeason = engine.seasons[0];
  const dcName = coordinatorFor(dcData, anchorSeason, defense);
  const fingerprint = defenseFingerprintFor(dcScheme, defense, anchorSeason);

  const profiles = useMemo(() => buildPlayerProfiles(engine.offRows), [engine]);
  const rates = useMemo(
    () => buildOutcomeRates(engine.offRows, profiles, { seasonWeights: defaultSeasonWeights(engine.seasons[0]) }),
    [engine, profiles],
  );

  const overallRate = getOutcomeRate(rates, defense, "ALL");
  const overall = outcomeVerdict(overallRate, rates.base.get("ALL"));

  const posRows = OFF_POSITIONS.map((pos) => {
    const rate = getOutcomeRate(rates, defense, pos);
    return { pos, rate, verdict: outcomeVerdict(rate, rates.base.get(pos)), mult: getMultiplier(engine.dirA, defense, pos) };
  });

  const players = useMemo(() => {
    const list = [];
    for (const p of profiles.values()) {
      if (!OFF_POSITIONS.includes(p.pos)) continue;
      if (playersDb?.[p.player_id]?.team !== offense) continue;
      list.push(p);
    }
    return list.sort((a, b) => b.avg - a.avg).slice(0, 14);
  }, [profiles, playersDb, offense]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={offense} onChange={(e) => setOffense(e.target.value)}
          className="bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400">
          {teams.map((t) => <option key={t} value={t}>{t} offense</option>)}
        </select>
        <span className="text-xs text-slate-500">vs</span>
        <select value={defense} onChange={(e) => setDefense(e.target.value)}
          className="bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400">
          {teams.map((t) => <option key={t} value={t}>{t} defense</option>)}
        </select>
        <button onClick={() => { setOffense(defense); setDefense(offense); }}
          className="px-3 py-1.5 rounded-md text-xs font-semibold border border-white/10 text-slate-400 hover:text-slate-200 bg-slate-900/40">
          ⇄ Swap
        </button>
        <span className="text-xs text-slate-500 ml-auto">
          Games classified vs each player's own range (floor ≤ his p25, ceiling ≥ his p75)
        </span>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-sm font-bold text-slate-200">{offense} offense vs {defense} defense</div>
          <VerdictBadge verdict={overall.verdict} lift={overall.lift} />
          <div className="ml-auto"><ProbBar rate={overallRate} /></div>
        </div>
        <div className="text-[11px] text-slate-500 mt-1.5">
          {overallRate
            ? `Across ${overallRate.games} recency-weighted player-games vs ${defense}, offenses hit ceiling ${Math.round(overallRate.ceiling * 100)}% / average ${Math.round(overallRate.average * 100)}% / floor ${Math.round(overallRate.floor * 100)}% (league base ~25/50/25).`
            : `No graded games vs ${defense} yet.`}
        </div>
        <DcFingerprint fp={fingerprint} dcName={dcName} />
        {(!fingerprint || !dcName) && (
          <div className="mt-2 rounded-lg border border-dashed border-white/15 bg-slate-950/40 px-3 py-2 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-400">DC Blueprint {!fingerprint && !dcName ? "not active yet" : "partially active"}.</span>{" "}
            {!fingerprint && (
              dcScheme.length === 0
                ? <>Scheme chips need the fingerprint table: run <code className="text-slate-300">docs/migrations/dc_history_schema.sql</code> in the Supabase SQL editor, then <code className="text-slate-300">python -m projections publish-dc --start 2016</code>.</>
                : <>No published fingerprint for {defense} yet.</>
            )}
            {!fingerprint && !dcName && " "}
            {!dcName && (
              Object.keys(dcData).length === 0
                ? <>DC names + continuity weighting: add coordinators in <a href="/admin/dc-rankings" className="text-slate-300 underline">DC Rankings</a> (or <code className="text-slate-300">npm run import:ocs -- --dc dc.csv</code>).</>
                : <>No DC listed for {defense} in {anchorSeason} — add it in <a href="/admin/dc-rankings" className="text-slate-300 underline">DC Rankings</a>.</>
            )}
          </div>
        )}

        <div className="mt-3 space-y-1.5">
          {posRows.map(({ pos, rate, verdict, mult }) => (
            <div key={pos} className="flex flex-wrap items-center gap-3">
              <span className="w-9"><PosPill pos={pos} /></span>
              <span className="w-28"><VerdictBadge verdict={verdict.verdict} lift={verdict.lift} /></span>
              <MultChip pos="×" mult={mult} title={entryTitle(getMatchupEntry(engine.dirA, defense, pos), "allows")} />
              <div className="ml-auto"><ProbBar rate={rate} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-white/10 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/70 text-left">
            <tr>
              {["Player", "GP", "Floor", "Avg", "Ceiling", "Matchup", "Adj Avg", "Ceiling% / Floor%"].map((h, i) => (
                <th key={h} className={`px-2 py-2 text-[10px] uppercase tracking-wider text-slate-500 ${i > 0 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const mult = getMultiplier(engine.dirA, defense, p.pos);
              const rate = getOutcomeRate(rates, defense, p.pos);
              return (
                <tr key={p.player_id} className="border-t border-white/5 hover:bg-slate-900/40">
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <PlayerAvatar id={p.player_id} pos={p.pos} name={p.name} />
                      <div>
                        <div className="font-medium text-slate-200 leading-tight">{p.name}</div>
                        <div className="mt-0.5"><PosPill pos={p.pos} /></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{p.games}</td>
                  <td className="px-2 py-1.5 text-right text-rose-300/80 font-mono">{p.floor.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-200 font-mono">{p.avg.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right text-emerald-300/80 font-mono">{p.ceiling.toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs" style={multCellStyle(mult)}>{fmtMult(mult)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold text-slate-100 font-mono">{(p.avg * mult).toFixed(1)}</td>
                  <td className="px-2 py-1.5 text-right font-mono text-xs text-slate-400">
                    {rate ? <><span className="text-emerald-300">{Math.round(rate.ceiling * 100)}%</span> / <span className="text-rose-300">{Math.round(rate.floor * 100)}%</span></> : "—"}
                  </td>
                </tr>
              );
            })}
            {players.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-500 text-sm">No profiled players currently on {offense} (need ≥6 scored games).</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-slate-600 mt-2">
        Floor/Avg/Ceiling are each player's own p25 / mean / p75 single-game PPR over {engine.seasons.join(" / ")}. Matchup odds are the defense's recency-weighted rate of forcing floor games / allowing ceiling games at the position, shrunk toward the ~25/50/25 league base by 20 pseudo-games. Adj Avg = player average × defense-vs-position multiplier.
      </p>
    </div>
  );
}

// ── Tab: History (how offense actually produced vs a defense) ────────────────

function HistoryTab({ engine }) {
  const defenses = engine.dirA.groups;
  const [defense, setDefense] = useState(defenses[0] || "");
  const [season, setSeason] = useState(engine.seasons.find((s) => engine.offRows.some((r) => r.season === s)) ?? engine.seasons[0]);
  const [pos, setPos] = useState("ALL");
  const [expandedWeek, setExpandedWeek] = useState(null);

  const weeks = useMemo(() => {
    const rows = engine.offRows.filter(
      (r) => r.opponent === defense && r.season === season && r.pts != null && (pos === "ALL" || r.pos === pos),
    );
    const byWeek = new Map();
    for (const r of rows) {
      if (!byWeek.has(r.week)) byWeek.set(r.week, { week: r.week, totals: {}, players: [] });
      const w = byWeek.get(r.week);
      w.totals[r.pos] = (w.totals[r.pos] || 0) + r.pts;
      w.players.push(r);
    }
    for (const w of byWeek.values()) w.players.sort((a, b) => b.pts - a.pts);
    return [...byWeek.values()].sort((a, b) => a.week - b.week);
  }, [engine, defense, season, pos]);

  const lgAvg = engine.dirA.leagueAvgByPos;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={defense} onChange={(e) => { setDefense(e.target.value); setExpandedWeek(null); }}
          className="bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400">
          {defenses.map((d) => <option key={d} value={d}>{d} defense</option>)}
        </select>
        <div className="flex rounded-md overflow-hidden border border-white/10">
          {engine.seasons.map((yr) => (
            <button key={yr} onClick={() => { setSeason(yr); setExpandedWeek(null); }}
              className={`px-3 py-1.5 text-xs font-semibold ${season === yr ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
              {yr}
            </button>
          ))}
        </div>
        {["ALL", ...OFF_POSITIONS].map((p) => (
          <button key={p} onClick={() => setPos(p)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${pos === p ? (POS_COLORS[p] || "bg-slate-500/20 text-slate-200 border-white/20") : "border-white/10 text-slate-500 bg-slate-900/40"}`}>
            {p}
          </button>
        ))}
        <span className="text-xs text-slate-500 ml-auto">
          Actual PPR scored against {defense}, week by week · league avg/g: {OFF_POSITIONS.map((p) => `${p} ${lgAvg.get(p)?.toFixed(0) ?? "—"}`).join(" · ")}
        </span>
      </div>

      <div className="space-y-1.5">
        {weeks.map((w) => (
          <div key={w.week} className="rounded-lg border border-white/10 bg-slate-900/50 overflow-hidden">
            <button type="button" onClick={() => setExpandedWeek((cur) => (cur === w.week ? null : w.week))}
              className="w-full flex flex-wrap items-center gap-3 px-3 py-2 text-left hover:bg-slate-900/70">
              <span className="text-xs font-bold text-slate-300 w-14">Wk {w.week}</span>
              <span className="text-[10px] text-slate-500">{w.players[0]?.team} offense</span>
              <span className="flex flex-wrap gap-1.5 ml-auto">
                {OFF_POSITIONS.filter((p) => pos === "ALL" || p === pos).map((p) => {
                  const total = w.totals[p];
                  const avg = lgAvg.get(p);
                  const hot = total != null && avg != null && total > avg * 1.15;
                  const cold = total != null && avg != null && total < avg * 0.85;
                  return (
                    <span key={p} className={`text-[11px] font-mono px-1.5 py-0.5 rounded border border-white/10 ${hot ? "text-emerald-300" : cold ? "text-rose-300" : "text-slate-400"}`}>
                      {p} {total == null ? "—" : total.toFixed(1)}
                    </span>
                  );
                })}
              </span>
            </button>
            {expandedWeek === w.week && (
              <div className="border-t border-white/5 px-3 py-2 space-y-1">
                {w.players.map((p) => (
                  <div key={`${p.player_id}-${p.week}`} className="flex items-center gap-2 text-xs">
                    <PosPill pos={p.pos} />
                    <span className="text-slate-300 flex-1 truncate">{p.name}</span>
                    <span className="text-slate-500">{p.team}</span>
                    <span className="font-mono font-semibold text-slate-200 w-12 text-right">{p.pts.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {weeks.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-10 text-center text-slate-500 text-sm">
            No games for {defense} in {season} with the current filters.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page root ────────────────────────────────────────────────────────────────

const TABS = [
  ["rankings", "IDP Rankings"],
  ["defense", "Defense vs Position"],
  ["ovd", "Offense vs Defense"],
  ["predictions", "Week Predictions"],
  ["history", "History"],
];

function fallbackSeasonYear() {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

export default function AdminIdpMatchups() {
  const [unlocked, setUnlocked] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [emailInput, setEmailInput] = useState("");
  const [passInput, setPassInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const [tab, setTab] = useState("rankings");
  const [nflState, setNflState] = useState(null);
  const [playersDb, setPlayersDb] = useState(null);
  const [dcScheme, setDcScheme] = useState([]); // defense_scheme_seasons rows (best-effort)

  // Coordinator maps: static seed merged with the Supabase entries the
  // /admin/dc-rankings and /admin/oc-rankings editors maintain. The engine
  // awaits the same promises so continuity weighting sees the DB names too.
  const [dcData, setDcData] = useState(() => mergeDcData({}));
  const [ocData, setOcData] = useState(() => mergeOcData({}));
  const dcDataPromise = useRef(null);
  const ocDataPromise = useRef(null);

  // Rankings (per-season, loaded on demand)
  const [rankSeason, setRankSeason] = useState(null);
  const [rankingsBySeason, setRankingsBySeason] = useState({});
  const [rankLoading, setRankLoading] = useState(false);
  const [rankError, setRankError] = useState("");

  // Matchup engine (3 seasons of weekly rows, loaded once)
  const [engine, setEngine] = useState(null);
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [engineProgress, setEngineProgress] = useState({ done: 0, total: 1 });
  const engineStarted = useRef(false);

  const [predWeek, setPredWeek] = useState(1);

  // The season whose completed weeks anchor the analysis: the in-progress
  // regular season, or the last completed one during the offseason.
  const anchorSeason = useMemo(() => {
    if (!nflState) return fallbackSeasonYear();
    const s = Number(nflState.season) || fallbackSeasonYear();
    return nflState.season_type === "regular" || nflState.season_type === "post" ? s : s - 1;
  }, [nflState]);
  const seasons = useMemo(() => [anchorSeason, anchorSeason - 1, anchorSeason - 2], [anchorSeason]);
  const predSeason = anchorSeason;

  // ── Session restore ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    restoreAdmin()
      .then((u) => { if (!cancelled && u) { setUser(u); setUnlocked(true); } })
      .finally(() => { if (!cancelled) setInitLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function handleUnlock(e) {
    e.preventDefault();
    if (!emailInput.trim()) { setGateError("Enter your email."); return; }
    setSigningIn(true);
    setGateError("");
    try {
      const u = await adminSignIn(emailInput.trim(), passInput);
      setUser(u);
      setUnlocked(true);
      setSigningIn(false);
    } catch (err) {
      setSigningIn(false);
      setGateError(err.message || "Couldn't sign in. Check your email and password.");
      console.error(err);
    }
  }

  // ── NFL state + players DB (once) ────────────────────────────────────────
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    fetchNflState()
      .then((s) => {
        if (cancelled) return;
        setNflState(s);
        const wk = Number(s?.display_week ?? s?.week) || 1;
        if (s?.season_type === "regular") setPredWeek(Math.min(REG_WEEKS, Math.max(1, wk)));
      })
      .catch(() => {
        // Engine loading waits on NFL state; synthesize one so a failed fetch
        // still anchors the analysis at the last completed season.
        if (!cancelled) setNflState({ season: String(fallbackSeasonYear()), season_type: "regular", week: 1 });
      });
    fetchPlayersDb()
      .then((db) => { if (!cancelled) setPlayersDb(db); })
      .catch((err) => console.error("Failed to load players DB:", err));
    // DC-Blueprint fingerprints — resolves to [] until the table is published.
    fetchDefenseSchemeSeasons()
      .then((rows) => { if (!cancelled) setDcScheme(rows); });
    // Coordinator entries — resolve to the static seed if the tables are
    // missing or the fetch fails.
    dcDataPromise.current = fetchDcEntries().then(mergeDcData).catch(() => mergeDcData({}));
    ocDataPromise.current = fetchOcEntries().then(mergeOcData).catch(() => mergeOcData({}));
    dcDataPromise.current.then((d) => { if (!cancelled) setDcData(d); });
    ocDataPromise.current.then((d) => { if (!cancelled) setOcData(d); });
    return () => { cancelled = true; };
  }, [unlocked]);

  useEffect(() => {
    if (rankSeason == null) setRankSeason(anchorSeason);
  }, [anchorSeason, rankSeason]);

  // ── Rankings data (per selected season) ──────────────────────────────────
  useEffect(() => {
    if (!unlocked || !playersDb || rankSeason == null || rankingsBySeason[rankSeason]) return;
    let cancelled = false;
    setRankLoading(true);
    setRankError("");
    fetchHistoricalStats(rankSeason)
      .then((stats) => {
        if (cancelled) return;
        const rows = buildIdpRankings(stats, playersDb);
        setRankingsBySeason((prev) => ({ ...prev, [rankSeason]: rows }));
      })
      .catch((err) => { if (!cancelled) setRankError(err.message || "Failed to load season stats."); })
      .finally(() => { if (!cancelled) setRankLoading(false); });
    return () => { cancelled = true; };
  }, [unlocked, playersDb, rankSeason, rankingsBySeason]);

  // ── Matchup engine: 3 seasons of offensive + IDP weekly rows ─────────────
  const needsEngine = tab !== "rankings";
  useEffect(() => {
    if (!unlocked || !needsEngine || !nflState || engineStarted.current) return;
    engineStarted.current = true;
    let cancelled = false;
    setEngineLoading(true);
    setEngineError("");
    const totalUnits = seasons.length * REG_WEEKS * 2; // off + idp per week
    let done = 0;
    const tick = () => {
      done += 1;
      if (!cancelled) setEngineProgress({ done, total: totalUnits });
    };
    setEngineProgress({ done: 0, total: totalUnits });

    (async () => {
      try {
        const offRows = [];
        const idpRows = [];
        // One season at a time: each season already fans out to ~54 parallel
        // requests; all three at once would triple that for no real win.
        for (const season of seasons) {
          const [offEntries, idpEntries] = await Promise.all([
            fetchSeasonWeeklyScores(season, REG_WEEKS, tick),
            fetchSeasonIdpWeekly(season, REG_WEEKS, tick),
          ]);
          if (cancelled) return;
          for (const e of offEntries) {
            if (e.actual == null || !e.opponent || !e.position) continue;
            offRows.push({ season, week: e.week, pos: e.position, team: e.team, opponent: e.opponent, pts: e.actual, name: e.name, player_id: e.player_id });
          }
          for (const r of idpEntries) {
            if (!r.opponent) continue;
            idpRows.push({ season, ...r });
          }
        }
        const seasonWeights = defaultSeasonWeights(anchorSeason);
        // Coordinator continuity: a defense's pre-DC-change seasons (and an
        // offense's pre-OC-change seasons in the IDP direction) count less.
        // Empty datasets produce no overrides, so this is a no-op until the
        // DC/OC editors (or seed files) cover the seasons in play.
        const [dcMerged, ocMerged] = await Promise.all([
          dcDataPromise.current ?? mergeDcData({}),
          ocDataPromise.current ?? mergeOcData({}),
        ]);
        const dirA = buildMultipliers(offRows, {
          seasonWeights,
          groupSeasonFactors: coordinatorContinuityFactors(dcMerged, anchorSeason),
        });
        const dirB = buildMultipliers(idpRows, {
          seasonWeights,
          groupSeasonFactors: coordinatorContinuityFactors(ocMerged, anchorSeason),
        });
        if (!cancelled) setEngine({ offRows, idpRows, dirA, dirB, seasons });
      } catch (err) {
        if (!cancelled) setEngineError(err.message || "Failed to load weekly data.");
      } finally {
        if (!cancelled) setEngineLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [unlocked, needsEngine, nflState, seasons, anchorSeason]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (initLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6">
        <form onSubmit={handleUnlock} className="w-full max-w-sm bg-slate-900/80 border border-white/10 rounded-2xl p-8">
          <div className="text-emerald-400 text-xs uppercase tracking-widest mb-2">Admin · IDP Matchups</div>
          <h1 className="text-slate-100 text-2xl font-bold mb-6">Sign In</h1>
          <input type="email" autoFocus autoComplete="email" value={emailInput} onChange={(e) => setEmailInput(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-slate-100 focus:border-emerald-400 outline-none mb-3" placeholder="Email" />
          <input type="password" autoComplete="current-password" value={passInput} onChange={(e) => setPassInput(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-slate-100 focus:border-emerald-400 outline-none" placeholder="Password" />
          {gateError && <div className="text-rose-400 text-sm mt-3">{gateError}</div>}
          <button type="submit" disabled={signingIn}
            className="mt-6 w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-emerald-950 font-semibold py-3 rounded-lg">
            {signingIn ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    );
  }

  const enginePct = Math.round((engineProgress.done / engineProgress.total) * 100);
  const engineReady = engine && !engineLoading;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400">Admin</div>
              <a href="/" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">← Dashboard</a>
              <a href="/admin/top-players" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Top Players</a>
              <a href="/admin/hot-streaks" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Hot & Cold</a>
              <a href="/admin/rookie-prospector" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Rookies</a>
              <a href="/admin/oc-rankings" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">OC Rankings</a>
              <a href="/admin/dc-rankings" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">DC Rankings</a>
              <a href="/admin/deep-dive-cards" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Deep Dive Cards</a>
              <a href="/admin/users" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Admins</a>
            </div>
            <h1 className="text-xl font-bold">IDP & DEF · Matchup Lab</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              IDP/DST rankings, defense-vs-position multipliers, and weekly matchup predictions ({seasons.join(" / ")}, recency-weighted).
            </p>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-md">
                {user.username} <span className="text-slate-600">·</span> <span className="text-slate-500">{user.role}</span>
              </span>
            )}
            <button onClick={async () => { await signOutAccount().catch(() => {}); setUnlocked(false); setUser(null); setEmailInput(""); setPassInput(""); }}
              className="text-xs text-slate-400 hover:text-slate-100 border border-white/10 px-3 py-1.5 rounded-md">Logout</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex rounded-md overflow-hidden border border-white/10 mb-4 w-fit">
          {TABS.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-3 py-1.5 text-xs font-semibold ${tab === key ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === "rankings" && (
          <RankingsTab
            rows={rankingsBySeason[rankSeason]}
            loading={rankLoading || !playersDb}
            error={rankError}
            seasons={seasons}
            season={rankSeason ?? anchorSeason}
            setSeason={setRankSeason}
          />
        )}

        {tab !== "rankings" && engineLoading && (
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-8 text-center">
            <div className="text-slate-400 text-sm mb-3">
              Loading {seasons.join(", ")} weekly box scores + IDP stats… {engineProgress.done}/{engineProgress.total}
            </div>
            <div className="max-w-sm mx-auto h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${enginePct}%` }} />
            </div>
          </div>
        )}
        {tab !== "rankings" && engineError && (
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200 mb-4">{engineError}</div>
        )}

        {tab === "defense" && engineReady && <MultiplierGrid engine={engine} dcData={dcData} ocData={ocData} />}
        {tab === "ovd" && engineReady && <OffenseVsDefenseTab engine={engine} playersDb={playersDb} dcScheme={dcScheme} dcData={dcData} />}
        {tab === "predictions" && engineReady && (
          <PredictionsTab engine={engine} playersDb={playersDb}
            predSeason={predSeason} predWeek={predWeek} setPredWeek={setPredWeek} />
        )}
        {tab === "history" && engineReady && <HistoryTab engine={engine} />}
      </main>
    </div>
  );
}
