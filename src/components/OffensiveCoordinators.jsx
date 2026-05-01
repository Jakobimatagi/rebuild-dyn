import { useEffect, useMemo, useState } from "react";
import { verifyLogin } from "../lib/supabase.js";
import { fetchSleeper, fetchHistoricalStats } from "../lib/sleeperApi.js";
import {
  NFL_TEAMS,
  DIVISIONS,
  ocSeasons,
  uniqueOcs,
  findOcStints,
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
  rankByPosition,
  ordinal,
  rankColor,
} from "../lib/teamFantasyRanks.js";
import { fetchHistoricalRoster } from "../lib/historicalRostersApi.js";
import { loadSession, saveSession, clearSession } from "./rookieAdmin/utils.js";

const POS_ACCENT = {
  QB: "text-rose-300",
  RB: "text-emerald-300",
  WR: "text-sky-300",
  TE: "text-amber-300",
};

const TEAM_NAME_BY_ABBR = Object.fromEntries(NFL_TEAMS.map((t) => [t.abbr, t.name]));

export default function OffensiveCoordinators() {
  const [unlocked, setUnlocked]       = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [user, setUser]               = useState(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passInput, setPassInput]         = useState("");
  const [gateError, setGateError]         = useState("");
  const [signingIn, setSigningIn]         = useState(false);

  // Override layer (localStorage) — merged on top of the static OC_DATA seed
  // every render. Editor writes through `setOcOverride` / `addOcYear`.
  const [overrides, setOverrides] = useState(() => loadOcOverrides());
  const effectiveOcData = useMemo(() => mergeOcData(overrides), [overrides]);
  const seasons = useMemo(() => ocSeasons(effectiveOcData), [effectiveOcData]);

  const [season, setSeason] = useState(() => ocSeasons(mergeOcData(loadOcOverrides()))[0]);
  const [tab, setTab]       = useState("teams"); // teams | coordinators | editor
  const [search, setSearch] = useState("");
  const [division, setDivision] = useState("All"); // "All" or a DIVISIONS entry

  // Per-season fantasy data ── lazy-loaded, cached in component state.
  const [players, setPlayers]   = useState(null);
  const [statsByYear, setStats] = useState({}); // { 2024: { ... } }
  const [rosterByYear, setRoster] = useState({}); // { 2024: { sleeperId: {team,position,name} } }
  const [dataError, setDataError] = useState("");
  const [dataLoading, setDataLoading] = useState(false);

  // ── Session restore ─────────────────────────────────────────────────────────
  useEffect(() => {
    const session = loadSession();
    if (session) { setUnlocked(true); setUser(session); }
    setInitLoading(false);
  }, []);

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

  // ── Derived: room totals + rank matrix for the selected season ─────────────
  const matrix = useMemo(() => {
    if (!players || !statsByYear[season] || !rosterByYear[season]) return null;
    const totals = buildTeamRoomTotals(players, statsByYear[season], rosterByYear[season]);
    return buildRankMatrix(totals);
  }, [players, statsByYear, rosterByYear, season]);

  const ocsBySeason = effectiveOcData[season] || {};
  const allOcs = useMemo(() => uniqueOcs(effectiveOcData), [effectiveOcData]);
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
    if (!usernameInput.trim()) { setGateError("Enter your username."); return; }
    setSigningIn(true);
    setGateError("");
    try {
      const result = await verifyLogin(usernameInput.trim(), passInput);
      if (!result?.ok) { setGateError("Invalid username or passkey."); setSigningIn(false); return; }
      const u = { id: result.id, username: result.username, role: result.role };
      saveSession(u);
      setUnlocked(true);
      setUser(u);
      setSigningIn(false);
    } catch (err) {
      setSigningIn(false);
      setGateError("Connection error — check Supabase config.");
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
          <input type="text" autoFocus value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-slate-100 focus:border-emerald-400 outline-none mb-3" placeholder="Username" />
          <input type="password" value={passInput} onChange={(e) => setPassInput(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-slate-100 focus:border-emerald-400 outline-none" placeholder="Passkey" />
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
            <div className="flex items-center gap-2 mb-0.5">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400">Admin</div>
              <a href="/" className="text-[10px] text-slate-500 hover:text-slate-300 border border-white/5 px-2 py-0.5 rounded">← Dashboard</a>
              <a href="/admin/rookie-prospector" className="text-[10px] text-slate-500 hover:text-slate-300 border border-white/5 px-2 py-0.5 rounded">Rookies</a>
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
            <button onClick={() => { clearSession(); setUnlocked(false); setUser(null); setUsernameInput(""); setPassInput(""); }}
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
          <button onClick={() => setTab("editor")}
            className={`py-3 text-sm font-semibold border-b-2 ${tab === "editor" ? "border-emerald-400 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            Editor
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Filter bar — Coordinators tab is a flat list across all years, so
            the season selector is hidden there. Editor has its own year UI. */}
        {tab !== "coordinators" && tab !== "editor" && (
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
            <span className="text-xs text-slate-500 ml-auto">
              {dataLoading ? "loading stats…" : matrix ? "stats ready" : "—"}
            </span>
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

        {/* Team Rankings tab — 32-team table for the selected season */}
        {tab === "teams" && (
          <TeamRankingsTable
            teams={filteredTeams}
            ocs={ocsBySeason}
            allOcs={allOcs}
            matrix={matrix}
            loading={!matrix && !dataError}
            onOcClick={(name) => {
              const oc = allOcs.find((o) => o.name.toLowerCase() === name.toLowerCase());
              if (oc) setOcModal(oc);
            }}
          />
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

        {/* Editor tab — edit any year's coordinators inline + add new year */}
        {tab === "editor" && (
          <OcEditor
            seasons={seasons}
            effectiveOcData={effectiveOcData}
            overrides={overrides}
            nameSuggestions={ocNameSuggestions}
            onSetOverride={(year, team, entry) => setOverrides(setOcOverride(overrides, year, team, entry))}
            onAddYear={(year) => { setOverrides(addOcYear(overrides, year)); setSeason(year); }}
          />
        )}
      </main>
    </div>
  );
}

// ── Team Rankings Table ──────────────────────────────────────────────────────
function TeamRankingsTable({ teams, ocs, matrix, loading, onOcClick }) {
  const [sort, setSort] = useState({ key: "team", dir: "asc" }); // key: team | QB | RB | WR | TE

  const rows = useMemo(() => {
    return teams.map((t) => ({
      ...t,
      oc: ocs[t.abbr] || null,
      ranks: matrix?.[t.abbr] || null,
    }));
  }, [teams, ocs, matrix]);

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
                      {(row.oc.partial || row.oc.note) && (
                        <div className="text-[10px] text-slate-500 mt-0.5">{row.oc.note}</div>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
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
                <td colSpan={6} className="py-10 text-center text-slate-500 text-sm">No teams match.</td>
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
        className="relative w-full max-w-4xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-slate-950 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {/* Close button — absolute top-right */}
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors text-base">
          ✕
        </button>
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 shrink-0 pr-12">
          <div className="text-[10px] uppercase tracking-widest text-emerald-400 mb-0.5">OC History</div>
          <h2 className="text-xl font-bold text-slate-100">{oc.name}</h2>
          <div className="text-xs text-slate-500 mt-0.5">
            {oc.stints.map((s) => `${s.year} ${s.team}`).join(" · ")}
          </div>
        </div>
        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 divide-y divide-white/5">
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
                <div className="font-semibold text-slate-100">{oc.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {oc.stints.map((s) => `${s.year} ${s.team}`).join(" · ")}
                </div>
              </div>
              <span className="text-slate-500 text-xs">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="border-t border-white/10 bg-slate-950/40">
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
      {ranks && (
        <TopContributors ranks={ranks} />
      )}
    </div>
  );
}

function TopContributors({ ranks }) {
  return (
    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
      {FANTASY_POSITIONS.map((pos) => {
        const top = ranks[pos]?.players?.slice(0, 3) || [];
        if (top.length === 0) return <div key={pos} />;
        return (
          <div key={pos} className="text-[10px] text-slate-500 leading-relaxed px-1">
            {top.map((p) => (
              <div key={p.id}>
                <span className="text-slate-300">{p.name}</span>{" "}
                <span className="text-slate-600">{Math.round(p.points)} pts</span>
              </div>
            ))}
          </div>
        );
      })}
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
