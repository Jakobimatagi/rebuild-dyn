import { useEffect, useMemo, useState } from "react";
import { fetchAllUtilization } from "../lib/ocHistoryApi.js";
import {
  teamPlayerTrends,
  buildOcUsageProfile,
  projectTeamUsage,
} from "../lib/ocUsageModel.js";
import { findOcStints } from "../lib/ocData.js";

// Team & OC usage deep-dive: every player's multi-season usage for one team (catch
// rising/falling roles), the upcoming OC's system profile, and a predictive
// breakout/faller projection of how that OC will deploy the current pecking order.

const pctS = (v, d = 1) => (v == null || Number.isNaN(Number(v)) ? "—" : `${(Number(v) * 100).toFixed(d)}%`);
const num = (v, d = 1) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(d));
const lastN = (seasons, n) => seasons.slice(-n);

function TrendArrow({ delta }) {
  if (delta == null) return null;
  if (delta > 0.01) return <span className="text-emerald-400" title={`+${(delta * 100).toFixed(1)}%`}>▲</span>;
  if (delta < -0.01) return <span className="text-rose-400" title={`${(delta * 100).toFixed(1)}%`}>▼</span>;
  return <span className="text-slate-600">·</span>;
}

function ProfileCard({ ocName, profile }) {
  if (!profile) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 text-sm text-slate-500">
        No usage profile for {ocName || "this coordinator"} yet (needs ≥1 season of play-by-play under them).
      </div>
    );
  }
  const stat = (label, val) => (
    <div className="text-center">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-100">{val}</div>
    </div>
  );
  return (
    <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.04] p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-emerald-400/70">Coordinator system profile</div>
          <div className="text-base font-bold text-slate-100">{ocName}</div>
        </div>
        <span className="text-[10px] text-slate-500">{profile.n} season{profile.n === 1 ? "" : "s"} of pbp</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
        {stat("Pass%", profile.passRate == null ? "—" : `${Math.round(profile.passRate * 100)}`)}
        {stat("PROE", profile.proe == null ? "—" : (profile.proe > 0 ? "+" : "") + profile.proe.toFixed(1))}
        {stat("aDOT", num(profile.adot))}
        {stat("EPA/play", num(profile.epaPlay, 3))}
        {stat("Tgt HHI", num(profile.targetHHI, 3))}
        {stat("Lead Tgt", pctS(profile.leadTargetShare, 0))}
      </div>
      <div className="text-[11px] text-slate-400">
        Target distribution: <span className="text-slate-200 font-semibold">{profile.concentration}</span>
        {" · "}role slots{" "}
        {profile.recvSlots.filter((v) => v != null && v > 0).map((v, i) => (
          <span key={i} className="text-slate-300">{i ? " / " : " "}R{i + 1} {pctS(v, 0)}</span>
        ))}
        {profile.rushSlots[0] != null && (
          <span className="text-slate-300"> · B1 {pctS(profile.rushSlots[0], 0)} carries</span>
        )}
      </div>
    </div>
  );
}

function ProjectionList({ projections }) {
  if (!projections?.length) {
    return <div className="text-sm text-slate-500 py-4">No projection — need recent usage for this team.</div>;
  }
  const tone = (sig) =>
    sig === "breakout" ? "text-emerald-300" : sig === "faller" ? "text-rose-300" : "text-slate-400";
  return (
    <div className="space-y-1">
      {projections.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-xs py-1.5 px-2 rounded-md bg-slate-900/40 border border-white/5">
          <span className={`w-16 shrink-0 font-semibold uppercase text-[10px] ${tone(p.signal)}`}>{p.signal}</span>
          <span className="flex-1 truncate text-slate-200">{p.name}</span>
          <span className="text-slate-500 tabular-nums">
            tgt {pctS(p.recentTargetShare, 0)} → <span className="text-slate-300">{pctS(p.projTargetShare, 0)}</span>
          </span>
          {p.recentCarryShare > 0.02 && (
            <span className="text-slate-500 tabular-nums">
              · car {pctS(p.recentCarryShare, 0)} → <span className="text-slate-300">{pctS(p.projCarryShare, 0)}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function TeamDeepDive({ teams, ocData, schemeSeasons, upcomingSeason }) {
  const [allUtil, setAllUtil] = useState(null);
  const [team, setTeam] = useState(teams?.[0]?.abbr || "ARI");

  useEffect(() => {
    let cancelled = false;
    fetchAllUtilization().then((rows) => { if (!cancelled) setAllUtil(rows); });
    return () => { cancelled = true; };
  }, []);

  const trends = useMemo(() => (allUtil ? teamPlayerTrends(allUtil, team) : []), [allUtil, team]);

  // The team's current pecking order = only players active in its most recent
  // season of data (teamPlayerTrends spans all eras, so filter out old rosters).
  const { roster, dataMaxSeason } = useMemo(() => {
    if (!trends.length) return { roster: [], dataMaxSeason: null };
    const maxS = Math.max(...trends.map((p) => p.latest.season));
    // Current season's pecking order, skill-usage players only (drops QBs and
    // deep backups whose ~0 shares are projection noise).
    const roster = trends.filter(
      (p) => p.latest.season === maxS &&
        (p.latest.target_share >= 0.04 || p.latest.carry_share >= 0.08),
    );
    return { roster, dataMaxSeason: maxS };
  }, [trends]);

  // The OC we're projecting forward = the upcoming season's coordinator for this team.
  const ocName = useMemo(() => {
    for (const yr of [upcomingSeason, upcomingSeason - 1]) {
      const nm = ocData?.[yr]?.[team]?.name;
      if (nm && !/^vacant$/i.test(nm)) return nm;
    }
    return null;
  }, [ocData, team, upcomingSeason]);

  const ocProfile = useMemo(() => {
    if (!allUtil || !ocName) return null;
    const stints = findOcStints(ocName, ocData).map((s) => ({ team: s.team, season: Number(s.year) }));
    return buildOcUsageProfile({ teamSeasons: stints, allUtil, schemeRows: schemeSeasons });
  }, [allUtil, ocName, ocData, schemeSeasons]);

  // Project the current pecking order forward through the OC profile.
  const projections = useMemo(() => {
    if (!ocProfile || !roster.length) return [];
    const players = roster.map((p) => ({
      name: p.name,
      sleeper_id: p.sleeper_id,
      recentTargetShare: p.latest.target_share,
      recentCarryShare: p.latest.carry_share,
    }));
    return projectTeamUsage(players, ocProfile);
  }, [ocProfile, roster]);

  const seasonCols = useMemo(() => {
    const set = new Set();
    for (const p of roster) for (const s of p.seasons) set.add(s.season);
    return [...set].sort((a, b) => a - b).slice(-5);
  }, [roster]);

  if (!allUtil) return <div className="text-sm text-slate-400 py-8">Loading usage history…</div>;
  if (allUtil.length === 0) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-sm text-amber-200/90">
        No utilization history found. Publish it first:
        <code className="block mt-2 text-amber-100/80 text-xs">cd python &amp;&amp; python -m projections publish-oc --start 1999</code>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-slate-500">Team</span>
        <select value={team} onChange={(e) => setTeam(e.target.value)}
          className="bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-emerald-400">
          {teams.map((t) => <option key={t.abbr} value={t.abbr}>{t.name}</option>)}
        </select>
        <span className="text-[11px] text-slate-500 ml-2">true play-by-play shares · 1999+</span>
      </div>

      <ProfileCard ocName={ocName} profile={ocProfile} />

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Predictive breakout/faller */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
            Projected usage under {ocName || "current OC"} → breakouts & fallers
            {dataMaxSeason ? <span className="text-slate-600 normal-case"> · from {dataMaxSeason} roster</span> : null}
          </div>
          <ProjectionList projections={projections} />
          <div className="text-[10px] text-slate-600 mt-2 leading-snug">
            Blends each player's recent share with the OC's role-slot norm (stickiness 50%).
            Breakout = projected usage climbs (ascends a slot / joins a concentrating system);
            faller = trimmed (spread system / crowded room). Current pecking order from the latest season.
          </div>
        </div>

        {/* Multi-season usage trend table */}
        <div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
            Target share by season (last {seasonCols.length})
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/40">
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr className="border-b border-white/5">
                  <th className="text-left py-2 px-3 font-medium">Player</th>
                  {seasonCols.map((y) => <th key={y} className="text-center py-2 px-2 font-medium">{`'${String(y).slice(2)}`}</th>)}
                  <th className="text-center py-2 px-2 font-medium">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {roster.slice(0, 14).map((p) => {
                  const byYear = Object.fromEntries(p.seasons.map((s) => [s.season, s]));
                  return (
                    <tr key={p.player_id} className="hover:bg-slate-900/60">
                      <td className="py-1.5 px-3 text-slate-200 truncate max-w-[140px]">{p.name}</td>
                      {seasonCols.map((y) => (
                        <td key={y} className="text-center py-1.5 px-2 tabular-nums text-slate-300">
                          {byYear[y] ? pctS(byYear[y].target_share, 0) : <span className="text-slate-700">—</span>}
                        </td>
                      ))}
                      <td className="text-center py-1.5 px-2"><TrendArrow delta={p.trendTarget} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
