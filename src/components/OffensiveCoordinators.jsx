import { useEffect, useMemo, useState } from "react";
import { adminSignIn, restoreAdmin, signOutAccount, fetchOcEntries, upsertOcEntry, initOcYear } from "../lib/supabase.js";
import { fetchSleeper, fetchHistoricalStats } from "../lib/sleeperApi.js";
import {
  NFL_TEAMS,
  DIVISIONS,
  ocSeasons,
  uniqueOcs,
  loadOcOverrides,
  setOcOverride,
  addOcYear,
  mergeOcData,
  overridesToCsv,
} from "../lib/ocData.js";
import {
  FANTASY_POSITIONS,
  buildTeamRoomTotals,
  buildRankMatrix,
  ordinal,
  rankColor,
} from "../lib/teamFantasyRanks.js";
import { fetchHistoricalRoster } from "../lib/historicalRostersApi.js";
import { getOcSchemes, SCHEMES } from "../lib/ocSchemes.js";
import {
  buildTeamUsage,
  aggregateOcUsage,
  buildSeasonUsage,
  pct,
  dec,
  concentrationLabel,
} from "../lib/ocUtilization.js";
import { fetchOcAnalysis } from "../lib/aiOcAnalyzeApi.js";
import OcShareModal from "./OcShareModal.jsx";
import CoachTreePanel from "./CoachTreePanel.jsx";
import TeamDeepDive from "./TeamDeepDive.jsx";
import { fetchSchemeSeasons, fetchPlayerUtilization } from "../lib/ocHistoryApi.js";

const POS_ACCENT = {
  QB: "text-rose-300",
  RB: "text-emerald-300",
  WR: "text-sky-300",
  TE: "text-amber-300",
};

const TEAM_NAME_BY_ABBR = Object.fromEntries(NFL_TEAMS.map((t) => [t.abbr, t.name]));

// Compact true-scheme fingerprint from nflverse play-by-play (team_scheme_seasons).
// PROE = pass rate over expected (signed), EPA = expected points added / play,
// aDOT = intended air yards / attempt, Pass% = dropback share.
function SchemeCell({ scheme }) {
  if (!scheme) return <span className="text-slate-700 text-xs">—</span>;
  const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
  const proe = num(scheme.proe);
  const epa = num(scheme.epa_play);
  const adot = num(scheme.adot);
  const passPct = num(scheme.pass_rate);
  const sg = num(scheme.shotgun_rate);
  const nh = num(scheme.no_huddle_rate);
  const chip = (label, val, cls = "text-slate-300") =>
    val == null ? null : (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/70 border border-white/10">
        <span className="text-slate-500">{label}</span> <span className={cls}>{val}</span>
      </span>
    );
  const signed = (v, d = 1) => (v > 0 ? "+" : "") + v.toFixed(d);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {chip("PROE", proe == null ? null : signed(proe), proe >= 0 ? "text-emerald-300" : "text-rose-300")}
        {chip("EPA", epa == null ? null : signed(epa, 3), epa >= 0 ? "text-emerald-300" : "text-rose-300")}
      </div>
      <div className="flex flex-wrap gap-1">
        {chip("aDOT", adot == null ? null : adot.toFixed(1))}
        {chip("Pass", passPct == null ? null : `${Math.round(passPct * 100)}%`)}
        {sg != null && chip("SG", `${Math.round(sg * 100)}%`)}
        {nh != null && nh > 0.05 && chip("NH", `${Math.round(nh * 100)}%`)}
      </div>
    </div>
  );
}

function SchemeChips({ name, size = "sm" }) {
  const schemes = getOcSchemes(name);
  if (schemes.length === 0) return null;
  const cls = size === "xs"
    ? "text-[9px] px-1.5 py-0"
    : "text-[10px] px-2 py-0.5";
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {schemes.map((s) => (
        <span key={s.key} title={s.desc}
          className={`${cls} rounded-full border font-semibold uppercase tracking-wide ${s.accent}`}>
          {s.short}
        </span>
      ))}
    </div>
  );
}

export default function OffensiveCoordinators() {
  const [unlocked, setUnlocked]       = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [user, setUser]               = useState(null);
  const [emailInput, setEmailInput]       = useState("");
  const [passInput, setPassInput]         = useState("");
  const [gateError, setGateError]         = useState("");
  const [signingIn, setSigningIn]         = useState(false);

  // Override layer — seeded from localStorage for instant load, then refreshed
  // from Supabase once the user is unlocked. Editor writes to both.
  const [overrides, setOverrides] = useState(() => loadOcOverrides());
  const [dbSyncError, setDbSyncError] = useState("");
  const effectiveOcData = useMemo(() => mergeOcData(overrides), [overrides]);
  const seasons = useMemo(() => ocSeasons(effectiveOcData), [effectiveOcData]);

  const [season, setSeason] = useState(() => ocSeasons(mergeOcData(loadOcOverrides()))[0]);
  const [tab, setTab]       = useState("teams"); // teams | coordinators | compare | editor
  const [search, setSearch] = useState("");
  const [division, setDivision] = useState("All"); // "All" or a DIVISIONS entry

  // Compare tab — two OC slots
  const [compareA, setCompareA] = useState(null); // OC object from uniqueOcs()
  const [compareB, setCompareB] = useState(null);

  // Oracle analysis state
  const [oracleResult,      setOracleResult]      = useState(null);
  const [oracleLoading,     setOracleLoading]     = useState(false);
  const [oracleError,       setOracleError]       = useState("");
  const [oracleFromCache,   setOracleFromCache]   = useState(false);
  const [oracleGeneratedAt, setOracleGeneratedAt] = useState(null);
  const [schemeKeyOpen,     setSchemeKeyOpen]     = useState(false);
  const [shareOpen,         setShareOpen]         = useState(false);

  // Per-season fantasy data ── lazy-loaded, cached in component state.
  const [players, setPlayers]   = useState(null);
  const [statsByYear, setStats] = useState({}); // { 2024: { ... } }
  const [rosterByYear, setRoster] = useState({}); // { 2024: { sleeperId: {team,position,name} } }
  const [dataError, setDataError] = useState("");
  const [dataLoading, setDataLoading] = useState(false);

  // pbp-derived OC history (nflverse, published to Supabase). Loaded once when
  // unlocked; empty arrays if the tables aren't published yet (graceful).
  const [schemeSeasons, setSchemeSeasons] = useState([]);
  const [utilByYear, setUtilByYear] = useState({}); // { 2024: [util rows] }

  // ── Session restore ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    restoreAdmin()
      .then((u) => { if (!cancelled && u) { setUnlocked(true); setUser(u); } })
      .finally(() => { if (!cancelled) setInitLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Fetch OC overrides from Supabase once unlocked ──────────────────────────
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    fetchOcEntries()
      .then((dbOverrides) => {
        if (cancelled) return;
        // Merge DB data on top of seed; update localStorage cache too.
        setOverrides(dbOverrides);
        try { localStorage.setItem("oc_overrides_v1", JSON.stringify(dbOverrides)); } catch {}
      })
      .catch((err) => {
        if (!cancelled) setDbSyncError("Could not load OC overrides from DB: " + (err.message || err));
      });
    return () => { cancelled = true; };
  }, [unlocked]);

  // ── Load player DB once unlocked ────────────────────────────────────────────
  useEffect(() => {
    if (!unlocked || players) return;
    let cancelled = false;
    setDataLoading(true);
    fetchSleeper("/players/nfl")
      .then((all) => { if (!cancelled) { setPlayers(all || {}); } })
      .catch((e) => { if (!cancelled) setDataError(e.message || "Failed to load players."); })
      .finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [unlocked, players]);

  // ── Lazy-load stats + historical roster for the selected season ─────────────
  // Both are needed before we can render: the stats give us pts_ppr, the
  // roster map tells us which team a player was on *that* season (since
  // Sleeper's player.team is current state).
  useEffect(() => {
    if (!unlocked || !season) return;
    let cancelled = false;
    if (statsByYear[season] && rosterByYear[season]) return;
    setDataLoading(true);
    Promise.all([
      statsByYear[season] ? Promise.resolve(statsByYear[season]) : fetchHistoricalStats(season),
      rosterByYear[season] ? Promise.resolve(rosterByYear[season]) : fetchHistoricalRoster(season),
    ])
      .then(([s, r]) => {
        if (cancelled) return;
        if (!statsByYear[season])  setStats((prev) => ({ ...prev, [season]: s || {} }));
        if (!rosterByYear[season]) setRoster((prev) => ({ ...prev, [season]: r || {} }));
      })
      .catch((e) => { if (!cancelled) setDataError(e.message || `Failed to load ${season} data.`); })
      .finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [unlocked, season, statsByYear, rosterByYear]);

  // ── pbp scheme fingerprints (once) + per-season player utilization ──────────
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    fetchSchemeSeasons().then((rows) => { if (!cancelled) setSchemeSeasons(rows); });
    return () => { cancelled = true; };
  }, [unlocked]);

  useEffect(() => {
    if (!unlocked || utilByYear[season]) return;
    let cancelled = false;
    fetchPlayerUtilization(season).then((rows) => {
      if (!cancelled) setUtilByYear((prev) => ({ ...prev, [season]: rows }));
    });
    return () => { cancelled = true; };
  }, [unlocked, season, utilByYear]);

  // Scheme fingerprint by team abbr for the selected season.
  const schemeByTeam = useMemo(() => {
    const out = {};
    for (const r of schemeSeasons) {
      if (Number(r.season) === Number(season)) out[r.team] = r;
    }
    return out;
  }, [schemeSeasons, season]);

  // ── Derived: room totals + rank matrix for the selected season ─────────────
  const matrix = useMemo(() => {
    if (!players || !statsByYear[season] || !rosterByYear[season]) return null;
    const totals = buildTeamRoomTotals(players, statsByYear[season], rosterByYear[season]);
    return buildRankMatrix(totals);
  }, [players, statsByYear, rosterByYear, season]);

  const ocsBySeason = effectiveOcData[season] || {};
  const allOcs = useMemo(() => uniqueOcs(effectiveOcData), [effectiveOcData]);

  // Reset oracle when season changes
  useEffect(() => { setOracleResult(null); setOracleError(""); }, [season]);

  async function askOracle({ force = false } = {}) {
    if (!matrix) return;
    setOracleLoading(true);
    setOracleError("");
    try {
      const teams = NFL_TEAMS.map((t) => {
        const oc = ocsBySeason[t.abbr];
        const schemes = oc?.name ? getOcSchemes(oc.name).map((s) => s.short) : [];
        const m = matrix[t.abbr] || {};
        return {
          team:    t.name,
          abbr:    t.abbr,
          division: t.division,
          oc:      oc?.name || "Unknown",
          schemes,
          QB:      m.QB?.rank   ?? null,
          RB:      m.RB?.rank   ?? null,
          WR:      m.WR?.rank   ?? null,
          TE:      m.TE?.rank   ?? null,
          QB_ppg:  m.QB?.ppg   != null ? +m.QB.ppg.toFixed(1) : null,
          RB_ppg:  m.RB?.ppg   != null ? +m.RB.ppg.toFixed(1) : null,
          WR_ppg:  m.WR?.ppg   != null ? +m.WR.ppg.toFixed(1) : null,
          TE_ppg:  m.TE?.ppg   != null ? +m.TE.ppg.toFixed(1) : null,
        };
      });
      const { result, cached, generatedAt } = await fetchOcAnalysis(teams, season, { force });
      setOracleResult(result);
      setOracleFromCache(cached);
      setOracleGeneratedAt(generatedAt);
    } catch (err) {
      setOracleError(err.message || "Oracle failed");
    } finally {
      setOracleLoading(false);
    }
  }
  // Names available for the editor's autocomplete — every distinct OC ever
  // entered (seed or override). Used as the <datalist> source.
  const ocNameSuggestions = useMemo(() => allOcs.map((o) => o.name), [allOcs]);

  // Coordinator history modal (triggered from Team Rankings table)
  const [ocModal, setOcModal] = useState(null); // OC object from uniqueOcs()

  const filteredOcs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allOcs;
    return allOcs.filter((o) => o.name.toLowerCase().includes(q));
  }, [allOcs, search]);

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return NFL_TEAMS.filter((t) => {
      if (division !== "All" && t.division !== division) return false;
      if (!q) return true;
      const oc = ocsBySeason[t.abbr]?.name || "";
      return (
        t.name.toLowerCase().includes(q) ||
        t.abbr.toLowerCase().includes(q) ||
        oc.toLowerCase().includes(q)
      );
    });
  }, [search, division, ocsBySeason]);

  async function handleUnlock(e) {
    e.preventDefault();
    if (!emailInput.trim()) { setGateError("Enter your email."); return; }
    setSigningIn(true);
    setGateError("");
    try {
      const u = await adminSignIn(emailInput.trim(), passInput);
      setUnlocked(true);
      setUser(u);
      setSigningIn(false);
    } catch (err) {
      setSigningIn(false);
      setGateError(err.message || "Couldn't sign in. Check your email and password.");
      console.error(err);
    }
  }

  // ── Gate ────────────────────────────────────────────────────────────────────
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
          <div className="text-emerald-400 text-xs uppercase tracking-widest mb-2">Admin · OC Rankings</div>
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center flex-wrap gap-2 mb-1.5">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400">Admin</div>
              <a href="/" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">← Dashboard</a>
              <a href="/admin/rookie-prospector" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Rookies</a>
              <a href="/admin/top-players" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Top Players</a>
              <a href="/admin/hot-streaks" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Hot &amp; Cold</a>
              <a href="/admin/deep-dive-cards" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Deep Dive Cards</a>
              <a href="/admin/users" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Admins</a>
            </div>
            <h1 className="text-xl font-bold">Offensive Coordinator Rankings</h1>
            <p className="text-xs text-slate-500 mt-0.5">Fantasy PPR PPG by position room, ranked 1–32 across the NFL.</p>
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
        <div className="max-w-6xl mx-auto px-6 flex gap-6">
          <button onClick={() => setTab("teams")}
            className={`py-3 text-sm font-semibold border-b-2 ${tab === "teams" ? "border-emerald-400 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            Team Rankings
          </button>
          <button onClick={() => setTab("coordinators")}
            className={`py-3 text-sm font-semibold border-b-2 ${tab === "coordinators" ? "border-emerald-400 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            Coordinators
          </button>
          <button onClick={() => setTab("compare")}
            className={`py-3 text-sm font-semibold border-b-2 ${tab === "compare" ? "border-violet-400 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            Compare
          </button>
          <button onClick={() => setTab("usage")}
            className={`py-3 text-sm font-semibold border-b-2 ${tab === "usage" ? "border-sky-400 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            Usage Boards
          </button>
          <button onClick={() => setTab("deepdive")}
            className={`py-3 text-sm font-semibold border-b-2 ${tab === "deepdive" ? "border-sky-400 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            Team Lab
          </button>
          <button onClick={() => setTab("trees")}
            className={`py-3 text-sm font-semibold border-b-2 ${tab === "trees" ? "border-emerald-400 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            Coach Trees
          </button>
          <button onClick={() => setTab("editor")}
            className={`py-3 text-sm font-semibold border-b-2 ${tab === "editor" ? "border-emerald-400 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            Editor
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Filter bar — Coordinators tab is a flat list across all years, so
            the season selector is hidden there. Editor has its own year UI. */}
        {tab !== "coordinators" && tab !== "editor" && tab !== "compare" && tab !== "trees" && tab !== "deepdive" && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 mr-1">Season</span>
            {seasons.map((y) => (
              <button key={y} onClick={() => setSeason(y)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                  season === y
                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                    : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"
                }`}>
                {y}
              </button>
            ))}
            <span className="text-[10px] uppercase tracking-widest text-slate-500 ml-3 mr-1">Division</span>
            <select value={division} onChange={(e) => setDivision(e.target.value)}
              className="bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400">
              <option value="All">All divisions</option>
              {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team or coordinator…"
              className="bg-slate-900 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 w-64 ml-2" />
            <button onClick={() => setSchemeKeyOpen((o) => !o)}
              className="text-[10px] text-slate-400 hover:text-slate-200 border border-white/10 px-2 py-1 rounded-md ml-1">
              {schemeKeyOpen ? "Hide Scheme Key" : "Scheme Key"}
            </button>
            {matrix && (
              <button onClick={() => askOracle()} disabled={oracleLoading}
                className="text-[10px] text-amber-300 hover:text-amber-100 border border-amber-400/30 bg-amber-500/5 px-2 py-1 rounded-md disabled:opacity-40">
                {oracleLoading ? "Analyzing…" : "✦ Oracle"}
              </button>
            )}
            {players && (
              <button onClick={() => setShareOpen(true)}
                className="text-[10px] text-sky-300 hover:text-sky-100 border border-sky-400/30 bg-sky-500/5 px-2 py-1 rounded-md">
                ↗ Share
              </button>
            )}
            <span className="text-xs text-slate-500 ml-auto">
              {dataLoading ? "loading stats…" : matrix ? "stats ready" : "—"}
            </span>
          </div>
        )}
        {/* Scheme key legend */}
        {schemeKeyOpen && tab !== "coordinators" && tab !== "editor" && tab !== "compare" && (
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {Object.entries(SCHEMES).map(([key, s]) => (
              <div key={key} className="flex items-start gap-2 p-2 rounded-lg bg-slate-900/40">
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase shrink-0 ${s.accent}`}>{s.short}</span>
                <div>
                  <div className="text-[11px] font-semibold text-slate-200">{s.label}</div>
                  <div className="text-[10px] text-slate-500 leading-tight mt-0.5">{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "coordinators" && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search coordinator…"
              className="bg-slate-900 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 w-64" />
            <span className="text-xs text-slate-500 ml-auto">
              {allOcs.length} coordinators across {seasons.length} seasons
            </span>
          </div>
        )}

        {dataError && (
          <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-xs text-rose-200 mb-4">
            {dataError}
          </div>
        )}
        {dbSyncError && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-200 mb-4">
            {dbSyncError}
          </div>
        )}

        {/* Team Rankings tab — 32-team table for the selected season */}
        {tab === "teams" && (
          <>
            {(oracleLoading || oracleResult || oracleError) && (
              <OcOraclePanel
                result={oracleResult}
                loading={oracleLoading}
                error={oracleError}
                fromCache={oracleFromCache}
                generatedAt={oracleGeneratedAt}
                onRefresh={() => askOracle({ force: true })}
              />
            )}
            <TeamRankingsTable
              teams={filteredTeams}
              ocs={ocsBySeason}
              allOcs={allOcs}
              matrix={matrix}
              schemeByTeam={schemeByTeam}
              loading={!matrix && !dataError}
              onOcClick={(name) => {
                const oc = allOcs.find((o) => o.name.toLowerCase() === name.toLowerCase());
                if (oc) setOcModal(oc);
              }}
            />
          </>
        )}

        {/* Coordinator history modal */}
        {ocModal && (
          <OcHistoryModal
            oc={ocModal}
            players={players}
            statsByYear={statsByYear}
            rosterByYear={rosterByYear}
            setStats={setStats}
            setRoster={setRoster}
            onClose={() => setOcModal(null)}
          />
        )}

        {/* Share-card studio */}
        {shareOpen && (
          <OcShareModal
            players={players}
            statsByYear={statsByYear}
            rosterByYear={rosterByYear}
            setStats={setStats}
            setRoster={setRoster}
            effectiveOcData={effectiveOcData}
            allOcs={allOcs}
            initialSeason={season}
            onClose={() => setShareOpen(false)}
          />
        )}

        {/* Coordinators tab — list + per-stint room ranks */}
        {tab === "coordinators" && (
          <CoordinatorsList
            ocs={filteredOcs}
            players={players}
            statsByYear={statsByYear}
            rosterByYear={rosterByYear}
            setStats={setStats}
            setRoster={setRoster}
          />
        )}

        {/* Compare tab — side-by-side OC skill profiles */}
        {tab === "compare" && (
          <OcCompareTab
            allOcs={allOcs}
            ocA={compareA}
            ocB={compareB}
            onSelectA={setCompareA}
            onSelectB={setCompareB}
            players={players}
            statsByYear={statsByYear}
            rosterByYear={rosterByYear}
            setStats={setStats}
            setRoster={setRoster}
          />
        )}

        {/* Usage Boards tab — league-wide leaderboards for the selected season */}
        {tab === "usage" && (
          <UsageLeaderboards
            players={players}
            stats={statsByYear[season]}
            roster={rosterByYear[season]}
            ocsBySeason={ocsBySeason}
            season={season}
            loading={dataLoading}
            util={utilByYear[season]}
          />
        )}

        {/* Team Lab — per-team usage deep dive: multi-season player trends, the
            upcoming OC's system profile, and predictive breakout/faller projection. */}
        {tab === "deepdive" && (
          <TeamDeepDive
            teams={NFL_TEAMS}
            ocData={effectiveOcData}
            schemeSeasons={schemeSeasons}
            upcomingSeason={seasons[0]}
          />
        )}

        {/* Coach Trees tab — pbp-derived head-coach lineage (1999+) joined with the
            OC map into mentor→disciple trees, each carrying its offenses' scheme DNA. */}
        {tab === "trees" && <CoachTreePanel ocData={effectiveOcData} />}

        {/* Editor tab — edit any year's coordinators inline + add new year */}
        {tab === "editor" && (
          <OcEditor
            seasons={seasons}
            effectiveOcData={effectiveOcData}
            overrides={overrides}
            nameSuggestions={ocNameSuggestions}
            onSetOverride={(year, team, entry) => {
              setOverrides(setOcOverride(overrides, year, team, entry));
              upsertOcEntry(year, team, entry).catch((err) =>
                setDbSyncError("Failed to save to DB: " + (err.message || err))
              );
            }}
            onAddYear={(year) => {
              setOverrides(addOcYear(overrides, year));
              setSeason(year);
              initOcYear(year).catch(() => {});
            }}
          />
        )}
      </main>
    </div>
  );
}

// ── Oracle Panel ─────────────────────────────────────────────────────────────
function OcOraclePanel({ result, loading, error, fromCache, generatedAt, onRefresh }) {
  if (error) {
    return (
      <div className="rounded-xl border border-rose-400/30 bg-rose-500/5 px-4 py-3 mb-4 flex items-center justify-between">
        <span className="text-xs text-rose-300">{error}</span>
        <button onClick={onRefresh} className="text-[10px] text-slate-400 hover:text-slate-200 border border-white/10 px-2 py-1 rounded ml-3">Retry</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 mb-4 flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <span className="text-sm text-amber-200">ORACLE is analyzing the coordinator landscape…</span>
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-5 mb-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest text-amber-400">✦ Oracle Analysis</span>
          {fromCache && generatedAt && (
            <span className="text-[9px] text-slate-500 border border-white/10 px-1.5 py-0.5 rounded">
              cached · {new Date(generatedAt).toLocaleDateString()}
            </span>
          )}
        </div>
        <button onClick={onRefresh}
          className="text-[10px] text-slate-500 hover:text-slate-300 border border-white/10 px-2 py-1 rounded">
          Refresh ↺
        </button>
      </div>

      {/* Overview */}
      {result.overview && (
        <p className="text-sm text-slate-200 leading-relaxed">{result.overview}</p>
      )}

      {/* Winners + Losers */}
      <div className="grid sm:grid-cols-2 gap-3">
        {result.winners?.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1">Winners</div>
            {result.winners.map((w, i) => (
              <div key={i} className="rounded-lg border border-emerald-400/20 bg-emerald-500/5 px-3 py-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-emerald-200">{w.name}</span>
                  {w.team && <span className="text-[9px] text-slate-500 border border-white/10 px-1 rounded">{w.team}</span>}
                </div>
                <div className="text-[11px] text-slate-400 leading-snug">{w.reason}</div>
              </div>
            ))}
          </div>
        )}
        {result.losers?.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-rose-400 mb-1">Losers</div>
            {result.losers.map((l, i) => (
              <div key={i} className="rounded-lg border border-rose-400/20 bg-rose-500/5 px-3 py-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-rose-200">{l.name}</span>
                  {l.team && <span className="text-[9px] text-slate-500 border border-white/10 px-1 rounded">{l.team}</span>}
                </div>
                <div className="text-[11px] text-slate-400 leading-snug">{l.reason}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scheme Watch */}
      {result.scheme_watch && (
        <div className="rounded-lg border border-violet-400/20 bg-violet-500/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-widest text-violet-400 mb-1">Scheme Watch</div>
          <div className="text-[11px] text-slate-300 leading-snug">{result.scheme_watch}</div>
        </div>
      )}
    </div>
  );
}

// ── Team Rankings Table ──────────────────────────────────────────────────────
function TeamRankingsTable({ teams, ocs, matrix, schemeByTeam = {}, loading, onOcClick }) {
  const [sort, setSort] = useState({ key: "team", dir: "asc" }); // key: team | QB | RB | WR | TE

  const rows = useMemo(() => {
    return teams.map((t) => ({
      ...t,
      oc: ocs[t.abbr] || null,
      ranks: matrix?.[t.abbr] || null,
      scheme: schemeByTeam[t.abbr] || null,
    }));
  }, [teams, ocs, matrix, schemeByTeam]);

  const sortedRows = useMemo(() => {
    const r = [...rows];
    if (sort.key === "team") {
      r.sort((a, b) => a.name.localeCompare(b.name));
    } else if (FANTASY_POSITIONS.includes(sort.key)) {
      r.sort((a, b) => {
        const ar = a.ranks?.[sort.key]?.rank ?? 999;
        const br = b.ranks?.[sort.key]?.rank ?? 999;
        return ar - br;
      });
    }
    if (sort.dir === "desc") r.reverse();
    return r;
  }, [rows, sort]);

  function toggleSort(key) {
    setSort((s) => s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/80 text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="text-left py-2.5 px-3">
                <button onClick={() => toggleSort("team")} className="hover:text-slate-200">Team {sort.key === "team" ? (sort.dir === "asc" ? "↑" : "↓") : ""}</button>
              </th>
              <th className="text-left py-2.5 px-3">Coordinator</th>
              <th className="text-left py-2.5 px-3" title="True scheme identity from nflverse play-by-play">Scheme (pbp)</th>
              {FANTASY_POSITIONS.map((pos) => (
                <th key={pos} className="text-center py-2.5 px-3">
                  <button onClick={() => toggleSort(pos)} className={`hover:text-slate-200 ${POS_ACCENT[pos]}`}>
                    {pos} {sort.key === pos ? (sort.dir === "asc" ? "↑" : "↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sortedRows.map((row) => (
              <tr key={row.abbr} className="hover:bg-slate-900/60">
                <td className="py-2 px-3">
                  <div className="font-semibold text-slate-100">{row.name}</div>
                  <div className="text-[10px] text-slate-500">{row.abbr}</div>
                </td>
                <td className="py-2 px-3">
                  {row.oc ? (
                    <div>
                      <button
                        onClick={() => onOcClick(row.oc.name)}
                        className="text-slate-200 hover:text-emerald-300 hover:underline text-left transition-colors">
                        {row.oc.name}
                      </button>
                      <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                        <SchemeChips name={row.oc.name} size="xs" />
                        {row.oc.note && <span className="text-[10px] text-slate-500">{row.oc.note}</span>}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
                <td className="py-2 px-3"><SchemeCell scheme={row.scheme} /></td>
                {FANTASY_POSITIONS.map((pos) => {
                  const r = row.ranks?.[pos];
                  return (
                    <td key={pos} className="py-2 px-3 text-center tabular-nums">
                      {loading ? (
                        <span className="text-slate-700 text-xs">—</span>
                      ) : r ? (
                        <div>
                          <div className={`font-bold ${rankColor(r.rank)}`}>{ordinal(r.rank)}</div>
                          <div className="text-[10px] text-slate-500">{r.ppg.toFixed(1)} ppg</div>
                        </div>
                      ) : (
                        <span className="text-slate-700 text-xs">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-500 text-sm">No teams match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── OC History Modal ─────────────────────────────────────────────────────────
// Full-screen overlay showing a coordinator's career stint history.
// Reuses CoordinatorStintRow so the data/UX is identical to the Coordinators
// tab expanded view.
function OcHistoryModal({ oc, players, statsByYear, rosterByYear, setStats, setRoster, onClose }) {
  // Kick off any missing season fetches for this OC's stints.
  useEffect(() => {
    if (!players) return;
    oc.stints.forEach((s) => {
      if (!statsByYear[s.year]) {
        fetchHistoricalStats(s.year).then((data) => {
          setStats((prev) => prev[s.year] ? prev : { ...prev, [s.year]: data || {} });
        }).catch((err) => console.error(`Failed to load ${s.year} stats:`, err));
      }
      if (!rosterByYear[s.year]) {
        fetchHistoricalRoster(s.year).then((data) => {
          setRoster((prev) => prev[s.year] ? prev : { ...prev, [s.year]: data || {} });
        }).catch((err) => console.error(`Failed to load ${s.year} roster:`, err));
      }
    });
  }, [oc, players, statsByYear, rosterByYear, setStats, setRoster]);

  // Lock body scroll while modal is open; close on Escape key
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="relative w-full max-w-[1400px] max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-slate-950 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {/* Close button — absolute top-right */}
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors text-base">
          ✕
        </button>
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 shrink-0 pr-12">
          <div className="text-[10px] uppercase tracking-widest text-emerald-400 mb-0.5">OC History</div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold text-slate-100">{oc.name}</h2>
            <SchemeChips name={oc.name} />
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {oc.stints.map((s) => `${s.year} ${s.team}`).join(" · ")}
          </div>
        </div>
        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 divide-y divide-white/5">
          <OcSkillProfile
            oc={oc}
            players={players}
            statsByYear={statsByYear}
            rosterByYear={rosterByYear}
          />
          {oc.stints.map((s) => (
            <CoordinatorStintRow
              key={`${s.year}-${s.team}`}
              stint={s}
              players={players}
              stats={statsByYear[s.year]}
              roster={rosterByYear[s.year]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Coordinators List ────────────────────────────────────────────────────────
function CoordinatorsList({ ocs, players, statsByYear, rosterByYear, setStats, setRoster }) {
  const [expanded, setExpanded] = useState(null); // OC name (lowercased)

  // When a coordinator's row expands, kick off any missing-season fetches so
  // every stint's ranks render without a separate loading state per row.
  useEffect(() => {
    if (!expanded || !players) return;
    const oc = ocs.find((o) => o.name.toLowerCase() === expanded);
    if (!oc) return;
    oc.stints.forEach((s) => {
      if (!statsByYear[s.year]) {
        fetchHistoricalStats(s.year).then((data) => {
          setStats((prev) => prev[s.year] ? prev : { ...prev, [s.year]: data || {} });
        }).catch((err) => console.error(`Failed to load ${s.year} stats:`, err));
      }
      if (!rosterByYear[s.year]) {
        fetchHistoricalRoster(s.year).then((data) => {
          setRoster((prev) => prev[s.year] ? prev : { ...prev, [s.year]: data || {} });
        }).catch((err) => console.error(`Failed to load ${s.year} roster:`, err));
      }
    });
  }, [expanded, ocs, players, statsByYear, rosterByYear, setStats, setRoster]);

  return (
    <div className="space-y-2">
      {ocs.map((oc) => {
        const key = oc.name.toLowerCase();
        const isOpen = expanded === key;
        return (
          <div key={key} className="rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden">
            <button onClick={() => setExpanded(isOpen ? null : key)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-900">
              <div className="text-left">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-semibold text-slate-100">{oc.name}</div>
                  <SchemeChips name={oc.name} />
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {oc.stints.map((s) => `${s.year} ${s.team}`).join(" · ")}
                </div>
              </div>
              <span className="text-slate-500 text-xs">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="border-t border-white/10 bg-slate-950/40">
                <OcSkillProfile
                  oc={oc}
                  players={players}
                  statsByYear={statsByYear}
                  rosterByYear={rosterByYear}
                />
                {oc.stints.map((s) => (
                  <CoordinatorStintRow key={`${s.year}-${s.team}`}
                    stint={s} players={players}
                    stats={statsByYear[s.year]}
                    roster={rosterByYear[s.year]} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {ocs.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-10 text-center text-slate-500 text-sm">
          No coordinators match.
        </div>
      )}
    </div>
  );
}

function CoordinatorStintRow({ stint, players, stats, roster }) {
  const matrix = useMemo(() => {
    if (!players || !stats || !roster) return null;
    const totals = buildTeamRoomTotals(players, stats, roster);
    return buildRankMatrix(totals);
  }, [players, stats, roster]);

  const ranks = matrix?.[stint.team];
  const teamName = TEAM_NAME_BY_ABBR[stint.team] || stint.team;

  return (
    <div className="px-5 py-3 border-b border-white/5 last:border-b-0">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          <span className="text-sm font-semibold text-slate-100">{stint.year} · {teamName}</span>
          {stint.partial && <span className="ml-2 text-[10px] uppercase text-amber-400 bg-amber-500/10 border border-amber-400/30 px-1.5 py-0.5 rounded">partial</span>}
          {stint.playcaller === "HC" && <span className="ml-2 text-[10px] uppercase text-sky-400 bg-sky-500/10 border border-sky-400/30 px-1.5 py-0.5 rounded">HC playcaller</span>}
        </div>
      </div>
      {stint.note && (
        <div className="text-[10px] text-slate-500 mb-2 italic">{stint.note}</div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FANTASY_POSITIONS.map((pos) => {
          const r = ranks?.[pos];
          return (
            <div key={pos} className="rounded-lg border border-white/5 bg-slate-900/60 px-3 py-2">
              <div className={`text-[10px] uppercase tracking-widest font-bold ${POS_ACCENT[pos]}`}>{pos}</div>
              {r ? (
                <>
                  <div className={`text-lg font-bold ${rankColor(r.rank)}`}>{ordinal(r.rank)}</div>
                  <div className="text-[10px] text-slate-500">{r.ppg.toFixed(1)} ppg · {Math.round(r.points)} total</div>
                </>
              ) : (
                <div className="text-slate-600 text-xs">loading…</div>
              )}
            </div>
          );
        })}
      </div>
      {players && stats && roster && (
        <StintUsage usage={buildTeamUsage(players, stats, roster, stint.team)} />
      )}
    </div>
  );
}

// ── Per-stint usage cards (Phase B) ──────────────────────────────────────────
// For a single team-season, surface how the OC actually deployed the room:
// snap / target / carry / red-zone shares + aDOT + WOPR per player, with a
// room-summary header (pass rate, backfield shape, alpha target share).
const USAGE_ROOMS = [
  { pos: "RB", label: "Backfield", accent: "text-emerald-300" },
  { pos: "WR", label: "Wide Receiver", accent: "text-sky-300" },
  { pos: "TE", label: "Tight End", accent: "text-amber-300" },
];

// Color-code a share by magnitude so high-usage players pop without needing a
// bar — keeps every numeric cell a single right-aligned token, so the column
// data lines up perfectly under its right-aligned header.
function shareTextColor(v) {
  if (v == null) return "text-slate-600";
  if (v >= 0.30) return "text-emerald-300";
  if (v >= 0.18) return "text-sky-300";
  if (v >= 0.10) return "text-amber-300";
  return "text-slate-400";
}

function ShareCell({ value, digits = 0 }) {
  return (
    <span className={`tabular-nums font-semibold ${shareTextColor(value)}`}>
      {pct(value, digits)}
    </span>
  );
}

function StintUsage({ usage }) {
  if (!usage) {
    return <div className="mt-3 text-[11px] text-slate-600">Usage loading…</div>;
  }
  if (!usage.played) {
    return <div className="mt-3 text-[11px] text-slate-600">No usage data yet for this season.</div>;
  }

  const { concentration, passRate, denom } = usage;
  const teamAdot = denom.rec_tgt ? denom.rec_air_yd / denom.rec_tgt : null;

  return (
    <div className="mt-3 space-y-3">
      {/* Room-summary chips */}
      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        <span className="px-2 py-0.5 rounded-full border border-white/10 bg-slate-900/60 text-slate-300">
          Pass rate <span className="font-semibold text-slate-100">{pct(passRate, 0)}</span>
        </span>
        <span className="px-2 py-0.5 rounded-full border border-white/10 bg-slate-900/60 text-slate-300">
          Backfield <span className="font-semibold text-emerald-300">{concentrationLabel(concentration.carry.hhi)}</span>
          {concentration.carry.lead && (
            <span className="text-slate-500"> · {concentration.carry.lead.name.split(" ").slice(-1)} {pct(concentration.carry.lead.share, 0)}</span>
          )}
        </span>
        {concentration.target.lead && (
          <span className="px-2 py-0.5 rounded-full border border-white/10 bg-slate-900/60 text-slate-300">
            Alpha tgt <span className="font-semibold text-sky-300">{concentration.target.lead.name.split(" ").slice(-1)} {pct(concentration.target.lead.share, 0)}</span>
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full border border-white/10 bg-slate-900/60 text-slate-300">
          Team aDOT <span className="font-semibold text-slate-100">{dec(teamAdot)}</span>
        </span>
      </div>

      {/* Per-room usage tables */}
      <div className="grid gap-3 lg:grid-cols-3">
        {USAGE_ROOMS.map(({ pos, label, accent }) => (
          <UsageRoomTable key={pos} pos={pos} label={label} accent={accent}
            playersList={usage.byPos[pos]} />
        ))}
      </div>
    </div>
  );
}

function UsageRoomTable({ pos, label, accent, playersList }) {
  // Only show players who actually saw the field; cap to keep cards scannable.
  const rows = (playersList || [])
    .filter((p) => p.snaps > 0 || p.targets > 0 || p.carries > 0)
    .slice(0, 6);
  const isRush = pos === "RB";

  return (
    <div className="rounded-lg border border-white/5 bg-slate-900/40 overflow-hidden">
      <div className={`px-3 py-1.5 text-[10px] uppercase tracking-widest font-bold ${accent} border-b border-white/5`}>
        {label}
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-slate-600">No usage.</div>
      ) : (
        <table className="w-full text-[10px]">
          <thead className="text-slate-500">
            <tr className="border-b border-white/5">
              <th className="text-left font-normal py-1 px-2">Player</th>
              <th className="text-right font-normal py-1 px-2" title="Snap share">Snap</th>
              {isRush ? (
                <>
                  <th className="text-right font-normal py-1 px-2" title="Carry share">Car</th>
                  <th className="text-right font-normal py-1 px-2" title="Red-zone carry share">RZ</th>
                  <th className="text-right font-normal py-1 px-2" title="Target share">Tgt</th>
                </>
              ) : (
                <>
                  <th className="text-right font-normal py-1 px-2" title="Target share">Tgt</th>
                  <th className="text-right font-normal py-1 px-2" title="Red-zone target share">RZ</th>
                  <th className="text-right font-normal py-1 px-2" title="Air yards per catch (average depth of completion)">aDOT</th>
                  <th className="text-right font-normal py-1 px-2" title="Weighted Opportunity Rating">WOPR</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-slate-900/60">
                <td className="py-1 px-2">
                  <div className="text-slate-200 truncate max-w-[160px]">{p.name}</div>
                  <div className="text-slate-600">{p.gp}g · {Math.round(p.pts)} pts</div>
                </td>
                <td className="py-1 px-2 text-right"><ShareCell value={p.snapShare} /></td>
                {isRush ? (
                  <>
                    <td className="py-1 px-2 text-right"><ShareCell value={p.carryShare} /></td>
                    <td className="py-1 px-2 text-right"><ShareCell value={p.rzCarryShare} /></td>
                    <td className="py-1 px-2 text-right tabular-nums text-slate-300">{pct(p.targetShare, 0)}</td>
                  </>
                ) : (
                  <>
                    <td className="py-1 px-2 text-right"><ShareCell value={p.targetShare} /></td>
                    <td className="py-1 px-2 text-right"><ShareCell value={p.rzTargetShare} /></td>
                    <td className="py-1 px-2 text-right tabular-nums text-slate-300">{dec(p.adot)}</td>
                    <td className="py-1 px-2 text-right tabular-nums text-slate-300">{dec(p.wopr, 2)}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Skill Profile ────────────────────────────────────────────────────────────
// Aggregate view across all of an OC's stints: a radar chart of average rank
// per position room, and a season-by-season heatmap showing how each room
// performed under them. Lets you spot specialists vs generalists, and see
// whether they're trending up or scheme-dependent on prior personnel.

const RADAR_COLOR_PRIMARY  = { stroke: "rgb(52,211,153)",  fill: "rgba(52,211,153,0.22)" };  // emerald
const RADAR_COLOR_COMPARE  = { stroke: "rgb(168,85,247)",  fill: "rgba(168,85,247,0.18)" };  // violet

/**
 * Aggregate an OC's stints into the shape needed for the radar/heatmap views.
 * Returns null when `oc` is undefined. Stints with all-zero PPG are flagged
 * `played: false` and excluded from averages so unplayed seasons (e.g. current
 * year before Week 1) don't dilute the profile.
 */
function useOcAggregate(oc, players, statsByYear, rosterByYear) {
  return useMemo(() => {
    if (!oc) return null;
    const stintRanks = oc.stints.map((s) => {
      if (!players || !statsByYear[s.year] || !rosterByYear[s.year]) {
        return { stint: s, ranks: null, played: false };
      }
      const totals = buildTeamRoomTotals(players, statsByYear[s.year], rosterByYear[s.year]);
      const matrix = buildRankMatrix(totals);
      const ranks = matrix?.[s.team] || null;
      const played = !!ranks && FANTASY_POSITIONS.some((pos) => (ranks[pos]?.ppg || 0) > 0);
      return { stint: s, ranks, played };
    });
    const loaded = stintRanks.filter((r) => r.ranks);
    const played = stintRanks.filter((r) => r.played);
    const avgByPos = {};
    FANTASY_POSITIONS.forEach((pos) => {
      const ranks = played.map((r) => r.ranks[pos]?.rank).filter(Number.isFinite);
      avgByPos[pos] = ranks.length
        ? { avg: ranks.reduce((a, b) => a + b, 0) / ranks.length, count: ranks.length }
        : null;
    });
    let specialty = null;
    FANTASY_POSITIONS.forEach((pos) => {
      const a = avgByPos[pos];
      if (!a) return;
      if (!specialty || a.avg < specialty.avg) specialty = { pos, avg: a.avg };
    });
    // Strength: rank 1 → 1.0, rank 32 → 0. Linear inversion.
    const radarValues = FANTASY_POSITIONS.map((pos) => {
      const a = avgByPos[pos];
      if (!a) return 0;
      return Math.max(0, Math.min(1, (33 - a.avg) / 32));
    });
    const sortedStints = [...stintRanks].sort((a, b) => a.stint.year - b.stint.year);
    return { stintRanks, loaded, played, avgByPos, specialty, radarValues, sortedStints };
  }, [oc, players, statsByYear, rosterByYear]);
}

function OcSkillProfile({ oc, players, statsByYear, rosterByYear }) {
  const agg = useOcAggregate(oc, players, statsByYear, rosterByYear);
  if (!agg) return null;
  const { loaded, played, avgByPos, specialty, radarValues, sortedStints } = agg;

  if (loaded.length === 0) {
    return (
      <div className="px-5 py-4 border-b border-white/10 bg-slate-950/40 text-xs text-slate-500">
        Loading skill profile…
      </div>
    );
  }

  if (played.length === 0) {
    return (
      <div className="px-5 py-4 border-b border-white/10 bg-slate-950/40 text-xs text-slate-500">
        Skill profile pending — no completed seasons yet for this coordinator.
      </div>
    );
  }

  return (
    <div className="px-5 py-4 border-b border-white/10 bg-gradient-to-b from-slate-950/60 to-slate-900/30">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="text-[10px] uppercase tracking-widest text-emerald-400">Skill Profile</div>
            <SchemeChips name={oc.name} size="xs" />
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Across {played.length} of {oc.stints.length} stint{oc.stints.length === 1 ? "" : "s"}
            {played.length < loaded.length && <> · {loaded.length - played.length} pending</>}
            {specialty && (
              <> · Specialty: <span className={`font-semibold ${POS_ACCENT[specialty.pos]}`}>{specialty.pos}</span> (avg {ordinal(Math.round(specialty.avg))})</>
            )}
          </div>
        </div>
      </div>
      <div className="grid md:grid-cols-[280px_1fr] gap-4 items-start">
        <SkillRadar
          datasets={[{ values: radarValues, color: RADAR_COLOR_PRIMARY.stroke, fillColor: RADAR_COLOR_PRIMARY.fill }]}
          avgByPos={avgByPos}
        />
        <SkillHeatmap stintRanks={sortedStints} />
      </div>
      <UsageFingerprint oc={oc} players={players} statsByYear={statsByYear} rosterByYear={rosterByYear} />
    </div>
  );
}

// ── OC usage fingerprint (Phase A) ───────────────────────────────────────────
// One-glance "how this OC deploys a room" signature, averaged across played
// stints: pass/run lean, backfield concentration, alpha target share, downfield
// tendency. The number under each tile shows the per-stint spread so a single
// outlier season is obvious.
function UsageFingerprint({ oc, players, statsByYear, rosterByYear }) {
  const agg = useMemo(
    () => aggregateOcUsage(oc, players, statsByYear, rosterByYear),
    [oc, players, statsByYear, rosterByYear],
  );
  if (!agg || agg.played.length === 0) return null;
  const { fingerprint, played } = agg;
  const n = played.length;

  const tiles = [
    {
      label: "Pass Lean",
      value: pct(fingerprint.passRate, 0),
      sub: fingerprint.passRate == null ? "—"
        : fingerprint.passRate >= 0.6 ? "Pass-first"
        : fingerprint.passRate <= 0.52 ? "Run-leaning" : "Balanced",
      accent: "text-sky-300",
    },
    {
      label: "Backfield",
      value: concentrationLabel(fingerprint.carryHHI),
      sub: fingerprint.leadCarryShare != null ? `lead ${pct(fingerprint.leadCarryShare, 0)} carries` : "—",
      accent: "text-emerald-300",
    },
    {
      label: "Alpha Target",
      value: pct(fingerprint.leadTargetShare, 0),
      sub: fingerprint.targetHHI != null
        ? (fingerprint.targetHHI >= 0.16 ? "concentrated" : "spread") : "—",
      accent: "text-violet-300",
    },
    {
      label: "Team aDOT",
      value: dec(fingerprint.teamAdot),
      sub: fingerprint.teamAdot == null ? "—"
        : fingerprint.teamAdot >= 7 ? "downfield"
        : fingerprint.teamAdot <= 5.5 ? "underneath" : "intermediate",
      accent: "text-amber-300",
    },
  ];

  return (
    <div className="mt-4 pt-4 border-t border-white/10">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
        Usage Fingerprint <span className="text-slate-600">· avg across {n} season{n === 1 ? "" : "s"}</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-white/5 bg-slate-900/60 px-3 py-2">
            <div className="text-[9px] uppercase tracking-widest text-slate-500">{t.label}</div>
            <div className={`text-base font-bold ${t.accent}`}>{t.value}</div>
            <div className="text-[10px] text-slate-500">{t.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SkillRadar({ datasets = [], avgByPos }) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 50;
  const n = FANTASY_POSITIONS.length;
  const angle = (i) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i, v) => [cx + Math.cos(angle(i)) * r * v, cy + Math.sin(angle(i)) * r * v];
  const ringPts = (level) => Array.from({ length: n }, (_, i) => point(i, level).join(",")).join(" ");

  return (
    <svg width={size} height={size} className="mx-auto block" aria-label="Skill profile radar">
      {[0.25, 0.5, 0.75, 1].map((level) => (
        <polygon key={level} points={ringPts(level)}
          fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
      ))}
      {Array.from({ length: n }).map((_, i) => {
        const [x, y] = point(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" />;
      })}
      {datasets.map((d, di) => {
        const dataPts = d.values.map((v, i) => point(i, v).join(",")).join(" ");
        return (
          <g key={di}>
            <polygon points={dataPts} fill={d.fillColor} stroke={d.color} strokeWidth={2} />
            {d.values.map((v, i) => {
              const [x, y] = point(i, v);
              return <circle key={i} cx={x} cy={y} r={3} fill={d.color} />;
            })}
          </g>
        );
      })}
      {FANTASY_POSITIONS.map((pos, i) => {
        const [lx, ly] = point(i, 1.18);
        const a = avgByPos?.[pos];
        // Stack the sub-label vertically below the position label so the
        // horizontal axes (RB right, TE left) don't overlap with the avg text.
        return (
          <g key={pos}>
            <text x={lx} y={ly} fontSize={12} fontWeight={700}
              textAnchor="middle" dominantBaseline="middle"
              className={POS_ACCENT[pos]} fill="currentColor">{pos}</text>
            {avgByPos && (
              <text x={lx} y={ly + 14} fontSize={10}
                textAnchor="middle" dominantBaseline="middle" fill="rgb(100,116,139)">
                {a ? `${ordinal(Math.round(a.avg))} avg` : "—"}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function SkillHeatmap({ stintRanks }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-separate border-spacing-x-1 border-spacing-y-1">
        <thead>
          <tr>
            <th className="text-left pr-2 pb-1 w-10"></th>
            {stintRanks.map((sr) => (
              <th key={`${sr.stint.year}-${sr.stint.team}`}
                className="text-center font-normal pb-1 whitespace-nowrap min-w-[52px]">
                <div className="text-[11px] font-semibold text-slate-300">{sr.stint.year}</div>
                <div className="text-[10px] text-slate-500">{sr.stint.team}</div>
                {sr.stint.partial && (
                  <div className="text-[9px] uppercase text-amber-400/80 mt-0.5">partial</div>
                )}
                {sr.ranks && !sr.played && (
                  <div className="text-[9px] uppercase text-slate-500 mt-0.5">pending</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {FANTASY_POSITIONS.map((pos) => (
            <tr key={pos}>
              <td className={`text-[10px] uppercase font-bold pr-2 ${POS_ACCENT[pos]}`}>{pos}</td>
              {stintRanks.map((sr) => {
                const r = sr.played ? sr.ranks?.[pos] : null;
                return (
                  <td key={`${sr.stint.year}-${sr.stint.team}-${pos}`} className="p-0">
                    <div className={`rounded-md border text-center py-1.5 px-1 ${heatCellBg(r?.rank)}`}>
                      <div className={`text-xs font-bold ${rankColor(r?.rank)}`}>
                        {r ? ordinal(r.rank) : "—"}
                      </div>
                      {r && (
                        <div className="text-[9px] text-slate-500 mt-0.5">{r.ppg.toFixed(1)}</div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function heatCellBg(rank) {
  if (!rank) return "border-white/5 bg-slate-900/40";
  if (rank <= 8)  return "border-emerald-400/30 bg-emerald-500/10";
  if (rank <= 16) return "border-sky-400/30 bg-sky-500/10";
  if (rank <= 24) return "border-amber-400/30 bg-amber-500/10";
  return "border-rose-400/30 bg-rose-500/10";
}

// ── OC Compare Tab ────────────────────────────────────────────────────────────
// Pick two coordinators and see their skill profiles side by side: overlaid
// radar chart (emerald = A, violet = B) + separate heatmaps.
function OcCompareTab({ allOcs, ocA, ocB, onSelectA, onSelectB, players, statsByYear, rosterByYear, setStats, setRoster }) {
  const aggA = useOcAggregate(ocA, players, statsByYear, rosterByYear);
  const aggB = useOcAggregate(ocB, players, statsByYear, rosterByYear);

  // Kick off missing season fetches for both selected OCs
  useEffect(() => {
    [ocA, ocB].forEach((oc) => {
      if (!oc || !players) return;
      oc.stints.forEach((s) => {
        if (!statsByYear[s.year]) {
          fetchHistoricalStats(s.year).then((data) => {
            setStats((prev) => prev[s.year] ? prev : { ...prev, [s.year]: data || {} });
          }).catch(console.error);
        }
        if (!rosterByYear[s.year]) {
          fetchHistoricalRoster(s.year).then((data) => {
            setRoster((prev) => prev[s.year] ? prev : { ...prev, [s.year]: data || {} });
          }).catch(console.error);
        }
      });
    });
  }, [ocA, ocB, players, statsByYear, rosterByYear, setStats, setRoster]);

  const datasets = [];
  if (aggA?.played.length) datasets.push({ values: aggA.radarValues, color: RADAR_COLOR_PRIMARY.stroke, fillColor: RADAR_COLOR_PRIMARY.fill });
  if (aggB?.played.length) datasets.push({ values: aggB.radarValues, color: RADAR_COLOR_COMPARE.stroke,  fillColor: RADAR_COLOR_COMPARE.fill  });

  // Merged avgByPos for the shared axis labels — show both averages
  const mergedAvgByPos = {};
  FANTASY_POSITIONS.forEach((pos) => {
    mergedAvgByPos[pos] = aggA?.avgByPos?.[pos] || aggB?.avgByPos?.[pos] || null;
  });

  return (
    <div className="space-y-6">
      {/* Picker row */}
      <div className="grid sm:grid-cols-2 gap-4">
        <OcPicker label="Coordinator A" accent="emerald" allOcs={allOcs} selected={ocA} onSelect={onSelectA} />
        <OcPicker label="Coordinator B" accent="violet"  allOcs={allOcs} selected={ocB} onSelect={onSelectB} />
      </div>

      {/* Nothing selected yet */}
      {!ocA && !ocB && (
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-12 text-center text-slate-500 text-sm">
          Pick two coordinators above to compare their career skill profiles.
        </div>
      )}

      {/* Overlaid radar */}
      {(ocA || ocB) && (
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-4">Radar Overlay</div>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            {ocA && (
              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
                <span className="font-semibold text-emerald-300">{ocA.name}</span>
                <SchemeChips name={ocA.name} size="xs" />
              </div>
            )}
            {ocB && (
              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <span className="w-3 h-3 rounded-full bg-violet-400 inline-block" />
                <span className="font-semibold text-violet-300">{ocB.name}</span>
                <SchemeChips name={ocB.name} size="xs" />
              </div>
            )}
          </div>

          {datasets.length > 0 ? (
            <div className="flex justify-center">
              <SkillRadar datasets={datasets} avgByPos={mergedAvgByPos} />
            </div>
          ) : (
            <div className="text-center text-slate-500 text-xs py-8">
              Stats loading — expand each coordinator to trigger data fetch.
            </div>
          )}
        </div>
      )}

      {/* Side-by-side stat grids */}
      {(ocA || ocB) && (
        <div className="grid sm:grid-cols-2 gap-4">
          <ComparePanel oc={ocA} agg={aggA} accent="emerald" />
          <ComparePanel oc={ocB} agg={aggB} accent="violet"  />
        </div>
      )}
    </div>
  );
}

function OcPicker({ label, accent, allOcs, selected, onSelect }) {
  const [query, setQuery] = useState(selected?.name || "");
  const accentClasses = accent === "violet"
    ? { border: "focus:border-violet-400", badge: "border-violet-400/40 text-violet-300 bg-violet-500/10", clear: "hover:text-violet-300" }
    : { border: "focus:border-emerald-400", badge: "border-emerald-400/40 text-emerald-300 bg-emerald-500/10", clear: "hover:text-emerald-300" };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOcs.slice(0, 12);
    return allOcs.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 12);
  }, [allOcs, query]);

  const [open, setOpen] = useState(false);

  useEffect(() => { setQuery(selected?.name || ""); }, [selected]);

  return (
    <div className="relative">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">{label}</div>
      {selected ? (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${accentClasses.badge} text-sm`}>
          <span className="font-semibold flex-1">{selected.name}</span>
          <SchemeChips name={selected.name} size="xs" />
          <button onClick={() => { onSelect(null); setQuery(""); }}
            className={`text-slate-500 ${accentClasses.clear} ml-1 text-base leading-none`}>✕</button>
        </div>
      ) : (
        <div className="relative">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Search coordinator…"
            className={`w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none ${accentClasses.border}`}
          />
          {open && filtered.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-lg border border-white/10 bg-slate-900 shadow-xl overflow-hidden max-h-52 overflow-y-auto">
              {filtered.map((oc) => (
                <button key={oc.name} onMouseDown={() => { onSelect(oc); setOpen(false); }}
                  className="w-full text-left px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 flex items-center gap-2">
                  <span className="flex-1">{oc.name}</span>
                  <SchemeChips name={oc.name} size="xs" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ComparePanel({ oc, agg, accent }) {
  const accentLabel = accent === "violet" ? "text-violet-400" : "text-emerald-400";
  const accentPos   = accent === "violet" ? "border-violet-400/20 bg-violet-500/5" : "border-emerald-400/20 bg-emerald-500/5";

  if (!oc) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/30 p-6 flex items-center justify-center text-slate-600 text-sm min-h-40">
        No coordinator selected
      </div>
    );
  }

  if (!agg || agg.loaded.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/30 p-6 flex items-center justify-center text-slate-500 text-sm min-h-40">
        Loading stats…
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden`}>
      <div className={`px-4 py-3 border-b border-white/10 ${accentPos}`}>
        <div className={`text-[10px] uppercase tracking-widest ${accentLabel} mb-0.5`}>
          {accent === "violet" ? "Coordinator B" : "Coordinator A"}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-bold text-slate-100">{oc.name}</div>
          <SchemeChips name={oc.name} size="xs" />
        </div>
        <div className="text-[11px] text-slate-500 mt-0.5">
          {agg.played.length} season{agg.played.length !== 1 ? "s" : ""} of data
          {agg.specialty && (
            <> · Specialty: <span className={`font-semibold ${POS_ACCENT[agg.specialty.pos]}`}>{agg.specialty.pos}</span></>
          )}
        </div>
      </div>
      <div className="p-3">
        {/* Avg rank per position */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          {FANTASY_POSITIONS.map((pos) => {
            const a = agg.avgByPos[pos];
            return (
              <div key={pos} className="rounded-lg border border-white/5 bg-slate-900/60 px-2 py-2 text-center">
                <div className={`text-[10px] uppercase font-bold ${POS_ACCENT[pos]}`}>{pos}</div>
                {a ? (
                  <>
                    <div className={`text-base font-bold ${rankColor(Math.round(a.avg))}`}>{ordinal(Math.round(a.avg))}</div>
                    <div className="text-[9px] text-slate-500">{a.count} stints</div>
                  </>
                ) : (
                  <div className="text-slate-600 text-xs mt-1">—</div>
                )}
              </div>
            );
          })}
        </div>
        {/* Heatmap */}
        <SkillHeatmap stintRanks={agg.sortedStints} />
      </div>
    </div>
  );
}

// ── Usage Leaderboards (Phase C) ─────────────────────────────────────────────
// League-wide boards for one season, mined from the same usage engine: alpha
// target hogs, bell-cow backs, pass/run extremes, downfield offenses. Built for
// "top 10" content pulls.
function UsageLeaderboards({ players, stats, roster, ocsBySeason, season, loading, util }) {
  // Source toggle: Sleeper (2009+, completed air yards) vs nflverse play-by-play
  // (1999+, TRUE intended air yards & exact shares).
  const [source, setSource] = useState("sleeper");
  const hasNflverse = Array.isArray(util) && util.length > 0;

  const toggle = (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-[10px] uppercase tracking-widest text-slate-500">Source</span>
      <div className="inline-flex rounded-md border border-white/10 overflow-hidden">
        <button onClick={() => setSource("sleeper")}
          className={`px-2.5 py-1 text-xs font-semibold ${source === "sleeper" ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-slate-200"}`}>
          Sleeper
        </button>
        <button onClick={() => setSource("nflverse")} disabled={!hasNflverse}
          title={hasNflverse
            ? "True shares from play-by-play, back to 1999"
            : `No play-by-play for ${season} yet — nflverse covers completed seasons (1999–2025). Pick an earlier season.`}
          className={`px-2.5 py-1 text-xs font-semibold border-l border-white/10 ${source === "nflverse" ? "bg-emerald-500/20 text-emerald-200" : "text-slate-400 hover:text-slate-200 disabled:opacity-40 disabled:cursor-not-allowed"}`}>
          nflverse · 1999+
        </button>
      </div>
      {source === "nflverse" && (
        <span className="text-[10px] text-emerald-400/70">true intended air yards · exact shares</span>
      )}
      {!hasNflverse && (
        <span className="text-[10px] text-slate-500">
          no play-by-play for {season} yet — pick a completed season (≤ 2025)
        </span>
      )}
    </div>
  );

  if (source === "nflverse" && hasNflverse) {
    return <>{toggle}<NflverseUsageBoards util={util} season={season} /></>;
  }

  return <>{toggle}<SleeperUsageBoards players={players} stats={stats} roster={roster} ocsBySeason={ocsBySeason} season={season} loading={loading} /></>;
}

// nflverse play-by-play usage boards (player_utilization_seasons). Position-free —
// target/carry-share boards inherently surface receivers/backs. aDOT here is TRUE
// intended air yards / target, not Sleeper's completed-only depth.
function NflverseUsageBoards({ util, season }) {
  const rows = useMemo(() => (util || []).map((r) => ({
    ...r,
    adotTrue: Number(r.targets) > 0 ? Number(r.rec_air_yards) / Number(r.targets) : null,
  })), [util]);

  const label = (p) => `${p.name} · ${p.team}`;
  const byTgt   = topBy(rows.filter((p) => Number(p.targets) >= 30), "target_share");
  const byAir   = topBy(rows.filter((p) => Number(p.targets) >= 30), "air_yard_share");
  const byAdot  = topBy(rows.filter((p) => Number(p.targets) >= 40), "adotTrue");
  const byCarry = topBy(rows.filter((p) => Number(p.carries) >= 40), "carry_share");
  const byRzTgt = topBy(rows.filter((p) => Number(p.targets) >= 20), "rz_target_share");
  const byRzCar = topBy(rows.filter((p) => Number(p.carries) >= 20), "rz_carry_share");

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-slate-500">
        {season} season · nflverse play-by-play · exact team-denominator shares · min volume applied
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <LeaderBoard title="Target Share" accent="text-sky-300"
          rows={byTgt} label={label} value={(p) => pct(p.target_share, 1)}
          sub={(p) => `${p.targets} tgt`} />
        <LeaderBoard title="Air-Yard Share" accent="text-sky-300"
          rows={byAir} label={label} value={(p) => pct(p.air_yard_share, 1)}
          sub={(p) => `${Math.round(p.rec_air_yards)} air yds`} />
        <LeaderBoard title="True aDOT (40+ tgt)" accent="text-amber-300"
          rows={byAdot} label={label} value={(p) => dec(p.adotTrue)}
          sub={(p) => `${p.targets} tgt`} />
        <LeaderBoard title="RB Carry Share" accent="text-emerald-300"
          rows={byCarry} label={label} value={(p) => pct(p.carry_share, 1)}
          sub={(p) => `${p.carries} car`} />
        <LeaderBoard title="RZ Target Share" accent="text-rose-300"
          rows={byRzTgt} label={label} value={(p) => pct(p.rz_target_share, 0)}
          sub={(p) => `${p.targets} tgt`} />
        <LeaderBoard title="RZ Carry Share" accent="text-rose-300"
          rows={byRzCar} label={label} value={(p) => pct(p.rz_carry_share, 0)}
          sub={(p) => `${p.carries} car`} />
      </div>
    </div>
  );
}

function SleeperUsageBoards({ players, stats, roster, ocsBySeason, season, loading }) {
  const data = useMemo(() => {
    if (!players || !stats || !roster) return null;
    return buildSeasonUsage(players, stats, roster, ocsBySeason, { minGp: 4 });
  }, [players, stats, roster, ocsBySeason]);

  if (!data) {
    return (
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-12 text-center text-slate-500 text-sm">
        {loading ? "Loading season usage…" : "Select a season to build usage boards."}
      </div>
    );
  }

  const { playerRows, teamRows } = data;
  const teamOf = (p) => `${p.name} · ${p.team}`;

  // Player boards
  const byTargetShare = topBy(playerRows.filter((p) => p.pos === "WR" || p.pos === "TE"), "targetShare");
  const byWopr        = topBy(playerRows.filter((p) => p.pos === "WR" || p.pos === "TE"), "wopr");
  const byAdot        = topBy(playerRows.filter((p) => (p.pos === "WR" || p.pos === "TE") && p.targets >= 40), "adot");
  const byCarryShare  = topBy(playerRows.filter((p) => p.pos === "RB"), "carryShare");
  const byRzTgt       = topBy(playerRows.filter((p) => p.pos === "WR" || p.pos === "TE"), "rzTargetShare");
  const byRzCarry     = topBy(playerRows.filter((p) => p.pos === "RB"), "rzCarryShare");

  // Team / OC boards
  const passHappy   = topBy(teamRows, "passRate");
  const runHeavy    = topBy(teamRows, "passRate", { asc: true });
  const concentrated = topBy(teamRows.filter((t) => t.carryHHI != null), "carryHHI");
  const downfield   = topBy(teamRows.filter((t) => t.teamAdot != null), "teamAdot");

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-slate-500">
        {season} season · min 4 games for player boards · shares are exact team fractions
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <LeaderBoard title="Target Share" accent="text-sky-300"
          rows={byTargetShare} label={teamOf} value={(p) => pct(p.targetShare, 1)}
          sub={(p) => `${p.targets} tgt · ${p.oc || "—"}`} />
        <LeaderBoard title="WOPR" accent="text-sky-300"
          rows={byWopr} label={teamOf} value={(p) => dec(p.wopr, 2)}
          sub={(p) => `${pct(p.targetShare, 0)} tgt · ${pct(p.airYardShare, 0)} air`} />
        <LeaderBoard title="aDOT (40+ tgt)" accent="text-amber-300"
          rows={byAdot} label={teamOf} value={(p) => dec(p.adot)}
          sub={(p) => `${p.targets} tgt · ${Math.round(p.recYd)} yds`} />
        <LeaderBoard title="RB Carry Share" accent="text-emerald-300"
          rows={byCarryShare} label={teamOf} value={(p) => pct(p.carryShare, 1)}
          sub={(p) => `${p.carries} car · ${p.oc || "—"}`} />
        <LeaderBoard title="RZ Target Share" accent="text-rose-300"
          rows={byRzTgt} label={teamOf} value={(p) => pct(p.rzTargetShare, 0)}
          sub={(p) => `${p.rzTgt} RZ tgt`} />
        <LeaderBoard title="RZ Carry Share" accent="text-rose-300"
          rows={byRzCarry} label={teamOf} value={(p) => pct(p.rzCarryShare, 0)}
          sub={(p) => `${p.rzCarry} RZ car`} />
        <LeaderBoard title="Pass-Happiest Offenses" accent="text-sky-300"
          rows={passHappy} label={(t) => `${t.teamName}`} value={(t) => pct(t.passRate, 0)}
          sub={(t) => t.oc || "—"} />
        <LeaderBoard title="Run-Heaviest Offenses" accent="text-emerald-300"
          rows={runHeavy} label={(t) => `${t.teamName}`} value={(t) => pct(t.passRate, 0)}
          sub={(t) => t.oc || "—"} />
        <LeaderBoard title="Most Concentrated Backfields" accent="text-emerald-300"
          rows={concentrated} label={(t) => t.teamName} value={(t) => concentrationLabel(t.carryHHI)}
          sub={(t) => t.leadCarry ? `${t.leadCarry.name.split(" ").slice(-1)} ${pct(t.leadCarry.share, 0)} · ${t.oc || "—"}` : (t.oc || "—")} />
        <LeaderBoard title="Most Downfield Offenses" accent="text-amber-300"
          rows={downfield} label={(t) => t.teamName} value={(t) => dec(t.teamAdot)}
          sub={(t) => t.oc || "—"} />
      </div>
    </div>
  );
}

// Sort a list desc (or asc) by a numeric key, dropping null/0, keep top 10.
function topBy(rows, key, { asc = false, limit = 10 } = {}) {
  return [...rows]
    .filter((r) => r[key] != null && Number.isFinite(r[key]) && r[key] > 0)
    .sort((a, b) => asc ? a[key] - b[key] : b[key] - a[key])
    .slice(0, limit);
}

function LeaderBoard({ title, accent, rows, label, value, sub }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
      <div className={`px-3 py-2 text-[10px] uppercase tracking-widest font-bold ${accent} border-b border-white/5`}>
        {title}
      </div>
      {rows.length === 0 ? (
        <div className="px-3 py-4 text-[11px] text-slate-600">No data.</div>
      ) : (
        <ol className="divide-y divide-white/5">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-900/60">
              <span className="text-[10px] text-slate-600 w-4 text-right tabular-nums">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-200 truncate">{label(r)}</div>
                <div className="text-[10px] text-slate-500 truncate">{sub(r)}</div>
              </div>
              <span className="text-sm font-bold text-slate-100 tabular-nums">{value(r)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ── OC Editor ────────────────────────────────────────────────────────────────
// 32-row table for a single year. Each row's name input is a free-text field
// backed by an HTML5 <datalist> autocomplete sourced from every distinct OC
// name in the merged dataset. Edits persist to localStorage via setOcOverride
// — they layer on top of the seed without rewriting ocData.js. Use the
// "Export CSV" button to round-trip a season's overrides back through the
// importer for permanent storage in the seed file.
function OcEditor({ seasons, effectiveOcData, overrides, nameSuggestions, onSetOverride, onAddYear }) {
  const [year, setYear] = useState(seasons[0]);
  const [newYearInput, setNewYearInput] = useState("");
  const [copied, setCopied] = useState(false);

  // If the year we were editing disappears (shouldn't normally) snap to newest.
  useEffect(() => {
    if (!seasons.includes(year)) setYear(seasons[0]);
  }, [seasons, year]);

  const yearData = effectiveOcData[year] || {};
  const overrideKeys = new Set(Object.keys(overrides[year] || {}));

  function handleAddYear(e) {
    e.preventDefault();
    const n = parseInt(newYearInput, 10);
    if (!Number.isFinite(n) || n < 1990 || n > 2099) return;
    onAddYear(n);
    setNewYearInput("");
  }

  function handleExport() {
    const csv = overridesToCsv(overrides);
    if (!csv) return;
    navigator.clipboard.writeText(csv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }

  const hasAnyOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="space-y-4">
      <datalist id="oc-name-suggestions">
        {nameSuggestions.map((n) => <option key={n} value={n} />)}
      </datalist>

      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 mr-1">Year</span>
          {seasons.map((y) => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                year === y
                  ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                  : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"
              }`}>
              {y}
            </button>
          ))}
          <form onSubmit={handleAddYear} className="flex items-center gap-1 ml-3">
            <input value={newYearInput} onChange={(e) => setNewYearInput(e.target.value)}
              placeholder="2027"
              className="w-20 bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-emerald-400" />
            <button type="submit"
              className="px-2 py-1.5 rounded-md text-xs font-semibold border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
              + Add Year
            </button>
          </form>
          <button onClick={handleExport}
            disabled={!hasAnyOverrides}
            className="ml-auto px-3 py-1.5 rounded-md text-xs font-semibold border border-sky-400/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 disabled:opacity-30 disabled:cursor-not-allowed">
            {copied ? "✓ Copied CSV" : "Export overrides → CSV"}
          </button>
        </div>
        <div className="text-[10px] text-slate-500 mt-2">
          Edits save to your browser. To bake overrides into the seed file, use Export → paste into a CSV → run <code className="text-emerald-300">npm run import:ocs</code>.
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/80 text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="text-left py-2.5 px-3 w-44">Team</th>
              <th className="text-left py-2.5 px-3">Coordinator ({year})</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {NFL_TEAMS.map((t) => (
              <OcEditorRow key={t.abbr}
                team={t}
                entry={yearData[t.abbr] || {}}
                hasOverride={overrideKeys.has(t.abbr)}
                onCommit={(entry) => {
                  if (!entry || !entry.name?.trim()) onSetOverride(year, t.abbr, null);
                  else onSetOverride(year, t.abbr, entry);
                }}
                onReset={() => onSetOverride(year, t.abbr, null)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OcEditorRow({ team, entry, hasOverride, onCommit, onReset }) {
  const [draftName, setDraftName]           = useState(entry.name || "");
  const [draftNote, setDraftNote]           = useState(entry.note || "");
  const [draftPartial, setDraftPartial]     = useState(!!entry.partial);
  const [draftPlaycaller, setDraftPlaycaller] = useState(entry.playcaller || "");
  const [expanded, setExpanded]             = useState(false);

  // Keep drafts in sync when year switches or an upstream reset happens.
  useEffect(() => {
    setDraftName(entry.name || "");
    setDraftNote(entry.note || "");
    setDraftPartial(!!entry.partial);
    setDraftPlaycaller(entry.playcaller || "");
    setExpanded(false);
  }, [entry, team.abbr]);

  function buildEntry() {
    const e = { name: draftName.trim() };
    if (draftPartial) e.partial = true;
    if (draftNote.trim()) e.note = draftNote.trim();
    if (draftPlaycaller.trim()) e.playcaller = draftPlaycaller.trim();
    return e;
  }

  function commitName() {
    const trimmed = draftName.trim();
    if (!trimmed) { onCommit(null); return; }
    // Only write if something actually changed.
    if (trimmed !== (entry.name || "") ||
        draftNote.trim() !== (entry.note || "") ||
        draftPartial !== !!entry.partial ||
        draftPlaycaller.trim() !== (entry.playcaller || "")) {
      onCommit(buildEntry());
    }
  }

  function commitMeta() {
    if (!draftName.trim()) return; // Don't save metadata with no name.
    onCommit(buildEntry());
  }

  const hasMetadata = entry.partial || entry.note || entry.playcaller;

  return (
    <>
      <tr className="hover:bg-slate-900/60">
        <td className="py-2 px-3">
          <div className="font-semibold text-slate-100">{team.name}</div>
          <div className="text-[10px] text-slate-500">{team.abbr} · {team.division}</div>
        </td>
        <td className="py-2 px-3">
          <input
            list="oc-name-suggestions"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.currentTarget.blur(); }
              if (e.key === "Escape") { setDraftName(entry.name || ""); e.currentTarget.blur(); }
            }}
            placeholder="Coordinator name…"
            className="w-full bg-slate-950 border border-white/10 rounded-md px-3 py-1.5 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-400"
          />
        </td>
        <td className="py-2 px-3 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5">
            {hasMetadata && !expanded && (
              <span className="text-[9px] text-amber-400/70 border border-amber-400/30 px-1.5 py-0.5 rounded">has notes</span>
            )}
            <button onClick={() => setExpanded((v) => !v)} title="Edit notes / flags"
              className={`text-[10px] border px-2 py-1 rounded transition-colors ${
                expanded
                  ? "border-emerald-400/40 text-emerald-300 bg-emerald-500/10"
                  : "border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20"
              }`}>
              {expanded ? "▴ less" : "▾ more"}
            </button>
            {hasOverride && (
              <button onClick={onReset} title="Reset to seed value"
                className="text-[10px] text-slate-500 hover:text-rose-300 border border-white/10 hover:border-rose-400/40 px-2 py-1 rounded">
                ↺ reset
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-900/80">
          <td />
          <td colSpan={2} className="px-3 pb-3 pt-1">
            <div className="flex flex-wrap gap-3 items-start">
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                <input type="checkbox" checked={draftPartial} onChange={(e) => { setDraftPartial(e.target.checked); }}
                  onBlur={commitMeta}
                  className="accent-amber-400 w-3 h-3" />
                Partial season
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                <input type="checkbox" checked={draftPlaycaller === "HC"} onChange={(e) => { setDraftPlaycaller(e.target.checked ? "HC" : ""); }}
                  onBlur={commitMeta}
                  className="accent-sky-400 w-3 h-3" />
                HC playcaller
              </label>
              <input
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                onBlur={commitMeta}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                placeholder="Note (e.g. Fired mid-season; X finished)"
                className="flex-1 min-w-48 bg-slate-950 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-emerald-400"
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
