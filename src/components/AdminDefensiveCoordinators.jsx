import { useEffect, useMemo, useState } from "react";
import {
  adminSignIn,
  restoreAdmin,
  signOutAccount,
  fetchDcEntries,
  upsertDcEntry,
  initDcYear,
} from "../lib/supabase.js";
import { NFL_TEAMS, DIVISIONS, ocSeasons, uniqueOcs, overridesToCsv } from "../lib/ocData.js";
import { loadDcOverrides, setDcOverride, addDcYear, mergeDcData } from "../lib/dcData.js";
import { fetchDefenseSchemeSeasons, defenseFingerprintFor } from "../lib/dcHistoryApi.js";
import { buildCoachProfile, careerDefenseSummary, fmtMetric, ordinal } from "../lib/dcFingerprint.js";
import {
  DefenseSchemeCell,
  DefenseRankBadge,
  StintFingerprint,
  CareerTrendChart,
} from "./DcFingerprintVisuals.jsx";
import DcShareModal from "./DcShareModal.jsx";

const TEAM_NAME_BY_ABBR = Object.fromEntries(NFL_TEAMS.map((t) => [t.abbr, t.name]));

export default function AdminDefensiveCoordinators() {
  const [unlocked, setUnlocked]       = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [user, setUser]               = useState(null);
  const [emailInput, setEmailInput]   = useState("");
  const [passInput, setPassInput]     = useState("");
  const [gateError, setGateError]     = useState("");
  const [signingIn, setSigningIn]     = useState(false);

  // Override layer — seeded from localStorage for instant load, then refreshed
  // from Supabase once the user is unlocked. Editor writes to both.
  const [overrides, setOverrides] = useState(() => loadDcOverrides());
  const [dbSyncError, setDbSyncError] = useState("");
  const effectiveDcData = useMemo(() => mergeDcData(overrides), [overrides]);

  // pbp defensive fingerprints (nflverse, published to Supabase). Empty array
  // until docs/migrations/dc_history_schema.sql is run and publish-dc executed.
  const [schemeRows, setSchemeRows] = useState([]);

  // Seasons: every year with a DC entry plus every published fingerprint
  // season — so the page is browsable before any names are entered.
  const seasons = useMemo(() => {
    const set = new Set(ocSeasons(effectiveDcData));
    for (const r of schemeRows) set.add(Number(r.season));
    const list = [...set].filter(Number.isFinite).sort((a, b) => b - a);
    return list.length > 0 ? list : [new Date().getFullYear()];
  }, [effectiveDcData, schemeRows]);

  const [season, setSeason] = useState(null);
  const activeSeason = seasons.includes(season) ? season : seasons[0];

  const [tab, setTab]       = useState("teams"); // teams | coordinators | editor
  const [search, setSearch] = useState("");
  const [division, setDivision] = useState("All");
  const [coachModal, setCoachModal] = useState(null); // { name, stints } from buildCoachProfile
  const [shareCoach, setShareCoach] = useState(null); // coach name | "" (picker default) — null = closed

  // ── Session restore ─────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    restoreAdmin()
      .then((u) => { if (!cancelled && u) { setUnlocked(true); setUser(u); } })
      .finally(() => { if (!cancelled) setInitLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // ── Fetch DC entries + fingerprints from Supabase once unlocked ─────────────
  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    fetchDcEntries()
      .then((dbOverrides) => {
        if (cancelled) return;
        setOverrides(dbOverrides);
        try { localStorage.setItem("dc_overrides_v1", JSON.stringify(dbOverrides)); } catch {}
      })
      .catch((err) => {
        if (!cancelled) setDbSyncError(
          "Could not load DC entries from DB (has docs/migrations/dc_entries_schema.sql been run?): "
          + (err.message || err)
        );
      });
    fetchDefenseSchemeSeasons()
      .then((rows) => { if (!cancelled) setSchemeRows(rows); });
    return () => { cancelled = true; };
  }, [unlocked]);

  const dcsBySeason = effectiveDcData[activeSeason] || {};
  const allDcs = useMemo(() => uniqueOcs(effectiveDcData), [effectiveDcData]);
  const dcNameSuggestions = useMemo(() => allDcs.map((d) => d.name), [allDcs]);

  const filteredDcs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allDcs;
    return allDcs.filter((d) => d.name.toLowerCase().includes(q));
  }, [allDcs, search]);

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    return NFL_TEAMS.filter((t) => {
      if (division !== "All" && t.division !== division) return false;
      if (!q) return true;
      const dc = dcsBySeason[t.abbr]?.name || "";
      const fp = defenseFingerprintFor(schemeRows, t.abbr, activeSeason);
      return (
        t.name.toLowerCase().includes(q) ||
        t.abbr.toLowerCase().includes(q) ||
        dc.toLowerCase().includes(q) ||
        (fp?.head_coach || "").toLowerCase().includes(q)
      );
    });
  }, [search, division, dcsBySeason, schemeRows, activeSeason]);

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
          <div className="text-emerald-400 text-xs uppercase tracking-widest mb-2">Admin · DC Rankings</div>
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
              <a href="/admin/oc-rankings" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">OC Rankings</a>
              <a href="/admin/idp-matchups" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">IDP Matchups</a>
              <a href="/admin/deep-dive-cards" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Deep Dive Cards</a>
              <a href="/admin/users" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Admins</a>
            </div>
            <h1 className="text-xl font-bold">Defensive Coordinator Rankings</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              DC assignments by season + defensive scheme fingerprints from nflverse pbp. Feeds the IDP Matchup Lab's continuity weighting.
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
        <div className="max-w-6xl mx-auto px-6 flex gap-6">
          <button onClick={() => setTab("teams")}
            className={`py-3 text-sm font-semibold border-b-2 ${tab === "teams" ? "border-emerald-400 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            Teams
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
        {tab === "teams" && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 mr-1">Season</span>
            {seasons.map((y) => (
              <button key={y} onClick={() => setSeason(y)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                  activeSeason === y
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
              placeholder="Search team, DC, or head coach…"
              className="bg-slate-900 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 w-64 ml-2" />
            <span className="text-xs text-slate-500 ml-auto">
              {schemeRows.length > 0 ? "pbp fingerprints ready" : "no pbp fingerprints published"}
            </span>
            <button onClick={() => setShareCoach("")}
              disabled={schemeRows.length === 0}
              title="Build a downloadable DC fingerprint share card"
              className="px-3 py-1.5 rounded-md text-xs font-semibold border border-sky-400/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 disabled:opacity-30 disabled:cursor-not-allowed">
              📸 Share cards
            </button>
          </div>
        )}
        {tab === "coordinators" && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search coordinator…"
              className="bg-slate-900 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 w-64" />
            <span className="text-xs text-slate-500 ml-auto">
              {allDcs.length} coordinators across {ocSeasons(effectiveDcData).length} seasons
            </span>
            <button onClick={() => setShareCoach("")}
              disabled={schemeRows.length === 0}
              title="Build a downloadable DC fingerprint share card"
              className="px-3 py-1.5 rounded-md text-xs font-semibold border border-sky-400/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 disabled:opacity-30 disabled:cursor-not-allowed">
              📸 Share cards
            </button>
          </div>
        )}

        {dbSyncError && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs text-amber-200 mb-4">
            {dbSyncError}
          </div>
        )}

        {tab === "teams" && (
          <>
            {Object.keys(dcsBySeason).filter((t) => dcsBySeason[t]?.name).length === 0 && (
              <div className="rounded-lg border border-dashed border-white/15 bg-slate-950/40 px-4 py-3 text-xs text-slate-500 mb-4">
                No DC names entered for {activeSeason} yet — add them in the <button onClick={() => setTab("editor")} className="text-emerald-300 hover:underline">Editor</button> tab
                (or import a CSV with <code className="text-slate-300">npm run import:ocs -- --dc dc.csv</code>).
                Names entered here power the IDP Matchup Lab's scheme-continuity weighting.
              </div>
            )}
            <DcTeamsTable
              teams={filteredTeams}
              dcs={dcsBySeason}
              schemeRows={schemeRows}
              season={activeSeason}
              onCoachClick={(name) => {
                const profile = buildCoachProfile(name, allDcs, schemeRows);
                if (profile) setCoachModal(profile);
              }}
            />
          </>
        )}

        {coachModal && (
          <DcFingerprintModal
            coach={coachModal}
            schemeRows={schemeRows}
            onShare={(name) => { setCoachModal(null); setShareCoach(name); }}
            onClose={() => setCoachModal(null)}
          />
        )}

        {shareCoach != null && (
          <DcShareModal
            allDcs={allDcs}
            schemeRows={schemeRows}
            initialCoach={shareCoach || undefined}
            onClose={() => setShareCoach(null)}
          />
        )}

        {tab === "coordinators" && (
          <DcCoordinatorsList dcs={filteredDcs} schemeRows={schemeRows} />
        )}

        {tab === "editor" && (
          <DcEditor
            seasons={ocSeasons(effectiveDcData).length > 0 ? ocSeasons(effectiveDcData) : seasons}
            effectiveDcData={effectiveDcData}
            overrides={overrides}
            nameSuggestions={dcNameSuggestions}
            onSetOverride={(year, team, entry) => {
              setOverrides(setDcOverride(overrides, year, team, entry));
              upsertDcEntry(year, team, entry).catch((err) =>
                setDbSyncError("Failed to save to DB: " + (err.message || err))
              );
            }}
            onAddYear={(year) => {
              setOverrides(addDcYear(overrides, year));
              setSeason(year);
              initDcYear(year).catch(() => {});
            }}
          />
        )}
      </main>
    </div>
  );
}

// ── Teams table ──────────────────────────────────────────────────────────────
function DcTeamsTable({ teams, dcs, schemeRows, season, onCoachClick }) {
  const rows = useMemo(() => {
    return teams.map((t) => ({
      ...t,
      dc: dcs[t.abbr] || null,
      fp: defenseFingerprintFor(schemeRows, t.abbr, season),
    }));
  }, [teams, dcs, schemeRows, season]);

  // EPA-allowed sort surfaces the best defenses first when fingerprints exist.
  const [sortByEpa, setSortByEpa] = useState(false);
  const sortedRows = useMemo(() => {
    if (!sortByEpa) return rows;
    return [...rows].sort((a, b) => {
      const ae = a.fp?.epa_play_allowed == null ? Infinity : Number(a.fp.epa_play_allowed);
      const be = b.fp?.epa_play_allowed == null ? Infinity : Number(b.fp.epa_play_allowed);
      return ae - be;
    });
  }, [rows, sortByEpa]);

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/80 text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="text-left py-2.5 px-3">
                <button onClick={() => setSortByEpa(false)} className={!sortByEpa ? "text-slate-200" : "hover:text-slate-200"}>Team</button>
              </th>
              <th className="text-left py-2.5 px-3">Coordinator</th>
              <th className="text-left py-2.5 px-3" title="Head coach per nflverse pbp for the fingerprint season">Head Coach</th>
              <th className="text-left py-2.5 px-3" title="Defensive identity from nflverse play-by-play (defense_scheme_seasons)">
                <button onClick={() => setSortByEpa(true)} className={sortByEpa ? "text-slate-200" : "hover:text-slate-200"}>
                  Defense (pbp){sortByEpa ? " ↑EPA" : ""}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {sortedRows.map((row) => (
              <tr key={row.abbr} className="hover:bg-slate-900/60">
                <td className="py-2 px-3">
                  <div className="font-semibold text-slate-100">{row.name}</div>
                  <div className="text-[10px] text-slate-500">{row.abbr} · {row.division}</div>
                </td>
                <td className="py-2 px-3">
                  {row.dc?.name ? (
                    <div>
                      <button
                        onClick={() => onCoachClick(row.dc.name)}
                        className="text-slate-200 hover:text-emerald-300 hover:underline text-left transition-colors">
                        {row.dc.name}
                      </button>
                      <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                        {row.dc.playcaller === "HC" && (
                          <span className="text-[9px] uppercase text-sky-400 bg-sky-500/10 border border-sky-400/30 px-1.5 py-0.5 rounded">HC runs D</span>
                        )}
                        {row.dc.partial && (
                          <span className="text-[9px] uppercase text-amber-400 bg-amber-500/10 border border-amber-400/30 px-1.5 py-0.5 rounded">partial</span>
                        )}
                        {row.dc.note && <span className="text-[10px] text-slate-500">{row.dc.note}</span>}
                      </div>
                    </div>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
                <td className="py-2 px-3 text-xs">
                  {row.fp?.head_coach ? (
                    <button
                      onClick={() => onCoachClick(row.fp.head_coach)}
                      className="text-slate-400 hover:text-emerald-300 hover:underline text-left transition-colors">
                      {row.fp.head_coach}
                    </button>
                  ) : (
                    <span className="text-slate-700">—</span>
                  )}
                </td>
                <td className="py-2 px-3"><DefenseSchemeCell rows={schemeRows} fp={row.fp} season={season} /></td>
              </tr>
            ))}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-10 text-center text-slate-500 text-sm">No teams match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── DC Fingerprint Modal ─────────────────────────────────────────────────────
// Full-screen overlay showing a coach's defensive career — the DC twin of the
// OC page's OcHistoryModal. Opened by clicking a coordinator or head-coach
// name in the Teams table. The header rolls the career up (KPI chips + a
// season-by-season defense-percentile trend); each stint below renders the
// full grouped fingerprint with league percentile bars and ranks.
function DcFingerprintModal({ coach, schemeRows, onShare, onClose }) {
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

  const summary = useMemo(
    () => careerDefenseSummary(coach.stints, schemeRows),
    [coach, schemeRows],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-slate-950 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {/* Close button — absolute top-right */}
        <button onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-100 hover:bg-white/10 transition-colors text-base">
          ✕
        </button>
        {/* Header — career rollup */}
        <div className="px-6 py-4 border-b border-white/10 shrink-0 pr-12">
          <div className="flex items-center gap-3">
            <div className="text-[10px] uppercase tracking-widest text-emerald-400">DC Fingerprint</div>
            <button
              onClick={() => onShare(coach.name)}
              title="Build a downloadable share card for this coach"
              className="text-[10px] font-semibold px-2 py-0.5 rounded border border-sky-400/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20">
              📸 Share card
            </button>
          </div>
          <h2 className="text-xl font-bold text-slate-100 mt-0.5">{coach.name}</h2>
          <div className="text-xs text-slate-500 mt-0.5">
            {coach.stints.map((s) => `${s.year} ${s.team}`).join(" · ")}
          </div>
          {summary && (
            <div className="mt-3 flex items-end justify-between gap-4 flex-wrap">
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {summary.best && (
                  <span className="px-2 py-1 rounded border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
                    Best D: #{summary.best.rank.rank} · {summary.best.year} {summary.best.team}
                  </span>
                )}
                <span className="px-2 py-1 rounded border border-white/10 bg-slate-800/70 text-slate-300">
                  Career EPA/play {fmtMetric("epa_play_allowed", summary.avgEpa)}
                </span>
                {summary.avgPct != null && (
                  <span className="px-2 py-1 rounded border border-white/10 bg-slate-800/70 text-slate-300">
                    Avg {ordinal(Math.round(summary.avgPct * 100))} pctile
                  </span>
                )}
                <span className="px-2 py-1 rounded border border-white/10 bg-slate-800/70 text-slate-300">
                  {summary.top10} top-10 {summary.top10 === 1 ? "defense" : "defenses"}
                </span>
              </div>
              {summary.points.length > 1 && <CareerTrendChart points={summary.points} size="sm" />}
            </div>
          )}
        </div>
        {/* Body — scrollable stint list, newest first */}
        <div className="overflow-y-auto flex-1 divide-y divide-white/5">
          {coach.stints.map((s) => {
            const fp = defenseFingerprintFor(schemeRows, s.team, s.year);
            const teamName = TEAM_NAME_BY_ABBR[s.team] || s.team;
            return (
              <div key={`${s.year}-${s.team}`} className="px-6 py-3.5">
                <div className="flex items-center gap-2 flex-wrap mb-2.5">
                  <span className="text-sm font-semibold text-slate-100">{s.year} · {teamName}</span>
                  {fp && Number(fp.season) === Number(s.year) && (
                    <DefenseRankBadge rows={schemeRows} fp={fp} />
                  )}
                  {s.headCoach && !s.name && (
                    <span className="text-[10px] uppercase text-violet-300 bg-violet-500/10 border border-violet-400/30 px-1.5 py-0.5 rounded">Head Coach</span>
                  )}
                  {s.partial && <span className="text-[10px] uppercase text-amber-400 bg-amber-500/10 border border-amber-400/30 px-1.5 py-0.5 rounded">partial</span>}
                  {s.playcaller === "HC" && <span className="text-[10px] uppercase text-sky-400 bg-sky-500/10 border border-sky-400/30 px-1.5 py-0.5 rounded">HC runs D</span>}
                </div>
                {s.note && <div className="text-[10px] text-slate-500 mb-2 italic">{s.note}</div>}
                <StintFingerprint rows={schemeRows} fp={fp} season={s.year} size="sm" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Coordinators list ────────────────────────────────────────────────────────
function DcCoordinatorsList({ dcs, schemeRows }) {
  const [expanded, setExpanded] = useState(null); // DC name (lowercased)

  return (
    <div className="space-y-2">
      {dcs.map((dc) => {
        const key = dc.name.toLowerCase();
        const isOpen = expanded === key;
        return (
          <div key={key} className="rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden">
            <button onClick={() => setExpanded(isOpen ? null : key)}
              className="w-full px-5 py-3 flex items-center justify-between hover:bg-slate-900">
              <div className="text-left">
                <div className="font-semibold text-slate-100">{dc.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {dc.stints.map((s) => `${s.year} ${s.team}`).join(" · ")}
                </div>
              </div>
              <span className="text-slate-500 text-xs">{isOpen ? "▾" : "▸"}</span>
            </button>
            {isOpen && (
              <div className="border-t border-white/10 bg-slate-950/40">
                {dc.stints.map((s) => {
                  const fp = defenseFingerprintFor(schemeRows, s.team, s.year);
                  const teamName = TEAM_NAME_BY_ABBR[s.team] || s.team;
                  return (
                    <div key={`${s.year}-${s.team}`} className="px-5 py-3 border-b border-white/5 last:border-b-0">
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-sm font-semibold text-slate-100">{s.year} · {teamName}</span>
                        {fp && Number(fp.season) === Number(s.year) && (
                          <DefenseRankBadge rows={schemeRows} fp={fp} />
                        )}
                        {s.partial && <span className="text-[10px] uppercase text-amber-400 bg-amber-500/10 border border-amber-400/30 px-1.5 py-0.5 rounded">partial</span>}
                        {s.playcaller === "HC" && <span className="text-[10px] uppercase text-sky-400 bg-sky-500/10 border border-sky-400/30 px-1.5 py-0.5 rounded">HC runs D</span>}
                      </div>
                      {s.note && <div className="text-[10px] text-slate-500 mb-2 italic">{s.note}</div>}
                      <StintFingerprint rows={schemeRows} fp={fp} season={s.year} size="sm" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {dcs.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-10 text-center text-slate-500 text-sm">
          No coordinators yet — add DC names in the Editor tab or import with <code className="text-slate-300">npm run import:ocs -- --dc dc.csv</code>.
        </div>
      )}
    </div>
  );
}

// ── Editor ───────────────────────────────────────────────────────────────────
function DcEditor({ seasons, effectiveDcData, overrides, nameSuggestions, onSetOverride, onAddYear }) {
  const [year, setYear] = useState(seasons[0]);
  const [newYearInput, setNewYearInput] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!seasons.includes(year)) setYear(seasons[0]);
  }, [seasons, year]);

  const yearData = effectiveDcData[year] || {};
  const overrideKeys = new Set(Object.keys(overrides[year] || {}));

  function handleAddYear(e) {
    e.preventDefault();
    const n = parseInt(newYearInput, 10);
    if (!Number.isFinite(n) || n < 1990 || n > 2099) return;
    onAddYear(n);
    setYear(n);
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
      <datalist id="dc-name-suggestions">
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
          Edits save to Supabase (and your browser). To bake overrides into the seed file, use Export → paste into a CSV → run <code className="text-emerald-300">npm run import:ocs -- --dc</code>.
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
              <DcEditorRow key={t.abbr}
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

function DcEditorRow({ team, entry, hasOverride, onCommit, onReset }) {
  const [draftName, setDraftName]             = useState(entry.name || "");
  const [draftNote, setDraftNote]             = useState(entry.note || "");
  const [draftPartial, setDraftPartial]       = useState(!!entry.partial);
  const [draftPlaycaller, setDraftPlaycaller] = useState(entry.playcaller || "");
  const [expanded, setExpanded]               = useState(false);

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
            list="dc-name-suggestions"
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
                HC runs the defense
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
