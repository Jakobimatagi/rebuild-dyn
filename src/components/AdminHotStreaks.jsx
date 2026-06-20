import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { verifyLogin } from "../lib/supabase.js";
import { fetchSeasonWeeklyScores } from "../lib/weeklyScoringApi.js";
import {
  buildPlayerStreaks,
  rankHot,
  rankCold,
  rankInjured,
  DEFAULT_ELIGIBILITY,
} from "../lib/hotStreaks.js";
import { loadSession, saveSession, clearSession } from "./rookieAdmin/utils.js";
import { useModalBehavior } from "../lib/useModalBehavior.js";
import { fetchShareBlurbs, buildHotColdBlurbInput } from "../lib/aiShareBlurbsApi.js";

const POS_COLORS = {
  QB: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  RB: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  WR: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  TE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const REG_WEEKS = 18;

function lastCompletedSeasonYear() {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

function sleeperPhoto(id) {
  if (!id) return null;
  return `https://sleepercdn.com/content/nfl/players/${id}.jpg`;
}

function PosPill({ pos }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${POS_COLORS[pos] || "border-white/10 text-slate-400"}`}>
      {pos || "—"}
    </span>
  );
}

function PlayerAvatar({ id, name }) {
  const [errored, setErrored] = useState(false);
  const initials = (name || "")
    .split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const url = sleeperPhoto(id);
  if (!url || errored) {
    return (
      <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0">
        {initials || "—"}
      </div>
    );
  }
  return (
    <img src={url} alt={name} onError={() => setErrored(true)}
      className="w-10 h-10 rounded-full bg-slate-800 border border-white/10 object-cover shrink-0" />
  );
}

// One color cell per regular-season week. Green = beat projection, red = missed,
// opacity scales with the size of the beat/miss. Empty weeks (DNP / below the
// projection floor) render as faint placeholders so the row stays week-aligned.
function WeekHeatmap({ weeks }) {
  const byWeek = new Map(weeks.map((w) => [w.week, w]));
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: REG_WEEKS }, (_, i) => i + 1).map((wk) => {
        const w = byWeek.get(wk);
        if (!w) {
          return <div key={wk} className="w-3.5 h-6 rounded-sm bg-slate-800/60 border border-white/5" title={`Wk ${wk}: —`} />;
        }
        const intensity = Math.min(1, Math.abs(w.residual) / 12);
        const alpha = (0.25 + intensity * 0.75).toFixed(2);
        const color = w.beat ? `rgba(16,185,129,${alpha})` : `rgba(244,63,94,${alpha})`;
        return (
          <div key={wk} className="w-3.5 h-6 rounded-sm border border-white/5"
            style={{ backgroundColor: color }}
            title={`Wk ${wk}: ${w.actual.toFixed(1)} vs ${w.proj.toFixed(1)} proj (${w.residual >= 0 ? "+" : ""}${w.residual.toFixed(1)})`} />
        );
      })}
    </div>
  );
}

function StreakBadge({ streak, mode }) {
  if (!streak) return <span className="text-[10px] text-slate-500">no streak</span>;
  const n = Math.abs(streak);
  const hot = streak > 0;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
      hot ? "bg-orange-500/15 text-orange-300 border-orange-400/40" : "bg-cyan-500/15 text-cyan-300 border-cyan-400/40"
    }`}>
      {hot ? "🔥" : "🧊"} {n}W {hot ? "hot" : "cold"}
    </span>
  );
}

function ResidualTag({ value, label }) {
  const positive = value > 0;
  return (
    <span className="text-[10px] text-slate-500 flex items-center gap-1">
      {label}
      <span className={positive ? "text-emerald-300 font-semibold" : value < 0 ? "text-rose-300 font-semibold" : "text-slate-300"}>
        {value >= 0 ? "+" : ""}{value.toFixed(1)}
      </span>
    </span>
  );
}

function PlayerRow({ player, rank, mode, season, expanded, onToggle }) {
  return (
    <div className={`rounded-lg border bg-slate-900/60 overflow-hidden transition-colors ${expanded ? "border-emerald-400/40" : "border-white/10"}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        title="Click for the week-by-week projected vs actual breakdown"
        className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-slate-800/70 focus:outline-none focus:bg-slate-800/70 transition-colors">
      <span className="text-sm font-bold text-slate-500 w-6 text-right shrink-0 tabular-nums">{rank}</span>
      <PlayerAvatar id={player.player_id} name={player.name} />
      <div className="min-w-0 w-44 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-slate-100 font-semibold truncate">{player.name || "—"}</span>
          <PosPill pos={player.position} />
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-2 items-center">
          <span>{player.team || "FA"}</span>
          <span>{player.beatCount}/{player.evaluatedWeeks} beat ({Math.round(player.beatRate * 100)}%)</span>
          {player.seasonEndedEarly && (
            <span className="text-amber-300 font-semibold" title={`Last played Week ${player.lastPlayedWeek} · missed the ${player.weeksMissedRecent} most recent weeks`}>
              🚑 OUT · missed {player.weeksMissedRecent}w
            </span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 w-28 shrink-0">
        <StreakBadge streak={player.currentStreak} mode={mode} />
        <ResidualTag value={player.recentAvgResidual} label="last 4:" />
      </div>
      <div className="hidden sm:flex flex-col gap-0.5 w-24 shrink-0">
        <ResidualTag value={player.seasonAvgResidual} label="szn:" />
        <span className="text-[10px] text-slate-500">{player.avgActual.toFixed(1)} / {player.avgProj.toFixed(1)} proj</span>
      </div>
      <div className="ml-auto overflow-x-auto">
        <WeekHeatmap weeks={player.weeks} />
      </div>
      <span className={`text-slate-500 text-lg leading-none shrink-0 pl-1 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true">›</span>
      </button>
      {expanded && <PlayerDetail player={player} season={season} />}
    </div>
  );
}

function SummaryStat({ label, value, signed }) {
  const cls = signed
    ? value > 0 ? "text-emerald-300" : value < 0 ? "text-rose-300" : "text-slate-200"
    : "text-slate-200";
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-sm font-bold ${cls}`}>
        {signed && value > 0 ? "+" : ""}{value}
      </div>
    </div>
  );
}

// Inline expandable panel: every week's projected vs actual for the player, so
// the streak is fully legible (which weeks counted, by how much). Rendered in
// place beneath the row — not a side drawer.
function PlayerDetail({ player, season }) {
  // Scale the dual bars to the player's biggest single-week number.
  const maxVal = Math.max(
    1,
    ...player.allWeeks.flatMap((w) => [w.proj || 0, w.actual || 0]),
  );

  return (
    <div className="border-t border-white/10 bg-slate-950/40 px-4 py-4">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <SummaryStat label="Beat rate" value={`${player.beatCount}/${player.evaluatedWeeks} (${Math.round(player.beatRate * 100)}%)`} />
        <SummaryStat label="Last 4 avg ±" value={player.recentAvgResidual} signed />
        <SummaryStat label="Season avg ±" value={player.seasonAvgResidual} signed />
        <SummaryStat label="Avg actual / proj" value={`${player.avgActual} / ${player.avgProj}`} />
      </div>

      {/* Week-by-week */}
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-3 flex-wrap">
        <span>{season} · week-by-week</span>
        <span className="flex items-center gap-1 normal-case tracking-normal">
          <span className="w-2.5 h-2.5 rounded-sm bg-slate-500" /> proj
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 ml-2" /> beat
          <span className="w-2.5 h-2.5 rounded-sm bg-rose-400 ml-2" /> miss
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {player.allWeeks.map((w) => {
              const graded = w.residual != null; // both proj + actual present
              const projW = `${((w.proj || 0) / maxVal) * 100}%`;
              const actW = `${((w.actual || 0) / maxVal) * 100}%`;
              const actColor = w.beat ? "bg-emerald-400" : "bg-rose-400";
              return (
                <div key={w.week} className={`rounded-md border px-2.5 py-1.5 ${w.evaluated ? "border-white/10 bg-slate-900/50" : "border-white/5 bg-slate-900/20"}`}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-400 font-semibold w-12">Wk {w.week}</span>
                    {graded ? (
                      <span className="flex items-center gap-2 tabular-nums">
                        <span className="text-slate-500">proj {w.proj.toFixed(1)}</span>
                        <span className="text-slate-200 font-semibold">act {w.actual.toFixed(1)}</span>
                        <span className={`font-bold ${w.residual > 0 ? "text-emerald-300" : w.residual < 0 ? "text-rose-300" : "text-slate-300"}`}>
                          {w.residual >= 0 ? "+" : ""}{w.residual.toFixed(1)}
                        </span>
                        {!w.evaluated && <span className="text-[9px] text-slate-600 uppercase" title="Below projection floor — not counted toward the streak">n/c</span>}
                      </span>
                    ) : (
                      <span className="text-slate-600 italic">
                        {w.actual == null ? "DNP" : `played ${w.actual.toFixed(1)} · no proj`}
                      </span>
                    )}
                  </div>
                  {graded && (
                    <div className="space-y-0.5">
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className="h-full bg-slate-500" style={{ width: projW }} />
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                        <div className={`h-full ${actColor}`} style={{ width: actW }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
      </div>
    </div>
  );
}

export default function AdminHotStreaks() {
  const [unlocked, setUnlocked] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passInput, setPassInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const lastSeason = lastCompletedSeasonYear();
  const SEASONS = [lastSeason, lastSeason - 1];

  const [season, setSeason] = useState(lastSeason);
  const [dataLoading, setDataLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: REG_WEEKS });
  const [dataError, setDataError] = useState("");
  const [bySeasonPlayers, setBySeasonPlayers] = useState({}); // { [season]: players[] }

  const [mode, setMode] = useState("hot"); // hot | cold
  const [posFilter, setPosFilter] = useState({ QB: true, RB: true, WR: true, TE: true });
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null); // player_id of the open inline panel
  const [showShare, setShowShare] = useState(false);

  // ── Session restore ──────────────────────────────────────────────────────
  useEffect(() => {
    const s = loadSession();
    if (s) { setUser(s); setUnlocked(true); }
    setInitLoading(false);
  }, []);

  async function handleUnlock(e) {
    e.preventDefault();
    if (!usernameInput.trim()) { setGateError("Enter your username."); return; }
    setSigningIn(true);
    setGateError("");
    try {
      const result = await verifyLogin(usernameInput.trim(), passInput);
      if (!result?.ok) { setSigningIn(false); setGateError("Invalid username or passkey."); return; }
      const u = { id: result.id, username: result.username, role: result.role };
      saveSession(u);
      setUser(u);
      setUnlocked(true);
      setSigningIn(false);
    } catch (err) {
      setSigningIn(false);
      setGateError("Connection error — check Supabase config.");
      console.error(err);
    }
  }

  // ── Load + compute streaks for the selected season (once each) ─────────────
  useEffect(() => {
    if (!unlocked || bySeasonPlayers[season]) return;
    let cancelled = false;
    setDataLoading(true);
    setDataError("");
    setProgress({ done: 0, total: REG_WEEKS });

    (async () => {
      try {
        const entries = await fetchSeasonWeeklyScores(season, REG_WEEKS, (done, total) => {
          if (!cancelled) setProgress({ done, total });
        });
        if (cancelled) return;
        const players = buildPlayerStreaks(entries);
        setBySeasonPlayers((prev) => ({ ...prev, [season]: players }));
        setDataLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setDataError(err.message || "Failed to load weekly scores.");
        setDataLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [unlocked, season, bySeasonPlayers]);

  const players = bySeasonPlayers[season];

  const ranked = useMemo(() => {
    if (!players) return [];
    const list =
      mode === "hot" ? rankHot(players)
      : mode === "cold" ? rankCold(players)
      : rankInjured(players);
    const q = search.trim().toLowerCase();
    return list
      .filter((p) => posFilter[p.position])
      .filter((p) => !q || (p.name || "").toLowerCase().includes(q) || (p.team || "").toLowerCase().includes(q));
  }, [players, mode, posFilter, search]);

  // ── Render ─────────────────────────────────────────────────────────────────
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
          <div className="text-emerald-400 text-xs uppercase tracking-widest mb-2">Admin · Hot & Cold</div>
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

  const pct = Math.round((progress.done / progress.total) * 100);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400">Admin</div>
              <a href="/" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">← Dashboard</a>
              <a href="/admin/top-players" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Top Players</a>
              <a href="/admin/rookie-prospector" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Rookies</a>
              <a href="/admin/oc-rankings" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">OC Rankings</a>
            </div>
            <h1 className="text-xl font-bold">Hot & Cold · Beat-the-Projection Board</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Weekly actual vs projected PPR (Sleeper). 🔥 hot = outscoring projection → sell high · 🧊 cold = under → buy low.
            </p>
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
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {/* Mode */}
          <div className="flex rounded-md overflow-hidden border border-white/10">
            <button onClick={() => setMode("hot")}
              className={`px-3 py-1.5 text-xs font-semibold ${mode === "hot" ? "bg-orange-500/20 text-orange-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
              🔥 Hot · Sell High
            </button>
            <button onClick={() => setMode("cold")}
              className={`px-3 py-1.5 text-xs font-semibold ${mode === "cold" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
              🧊 Cold · Buy Low
            </button>
            <button onClick={() => setMode("injured")}
              className={`px-3 py-1.5 text-xs font-semibold ${mode === "injured" ? "bg-amber-500/20 text-amber-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
              🚑 Hurt · Stash
            </button>
          </div>

          {/* Season */}
          <div className="flex rounded-md overflow-hidden border border-white/10 ml-1">
            {SEASONS.map((yr) => (
              <button key={yr} onClick={() => setSeason(yr)}
                className={`px-3 py-1.5 text-xs font-semibold ${season === yr ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
                {yr}
              </button>
            ))}
          </div>

          {/* Positions */}
          {["QB", "RB", "WR", "TE"].map((pos) => (
            <button key={pos} onClick={() => setPosFilter((f) => ({ ...f, [pos]: !f[pos] }))}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${posFilter[pos] ? POS_COLORS[pos] : "border-white/10 text-slate-500 bg-slate-900/40"}`}>
              {pos}
            </button>
          ))}

          <button onClick={() => setShowShare(true)} disabled={!players}
            title="Generate social-ready PNGs — top hot/cold leaderboard + individual player cards"
            className="px-3 py-1.5 rounded-md text-xs font-semibold border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40">
            Share Cards
          </button>

          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or team…"
            className="bg-slate-900 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 w-44" />

          {players && (
            <span className="text-xs text-slate-500 ml-auto">
              {ranked.length} {mode === "hot" ? "hot" : mode === "cold" ? "cold" : "injured"} players · {season}
            </span>
          )}
        </div>

        {/* Loading */}
        {dataLoading && (
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-8 text-center">
            <div className="text-slate-400 text-sm mb-3">Loading {season} weekly projections + box scores… {progress.done}/{progress.total} weeks</div>
            <div className="max-w-sm mx-auto h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {dataError && (
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200 mb-4">
            {dataError}
          </div>
        )}

        {/* Legend */}
        {players && !dataLoading && (
          <div className="flex flex-wrap items-center gap-3 mb-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <span className="w-3.5 h-4 rounded-sm" style={{ backgroundColor: "rgba(16,185,129,0.85)" }} /> beat projection
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3.5 h-4 rounded-sm" style={{ backgroundColor: "rgba(244,63,94,0.85)" }} /> missed projection
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3.5 h-4 rounded-sm bg-slate-800/60 border border-white/5" /> DNP / not projected
            </span>
            <span>· deeper color = bigger gap · eligibility: ≥{DEFAULT_ELIGIBILITY.minEvaluatedWeeks} graded weeks · startable avg proj (QB {DEFAULT_ELIGIBILITY.minAvgProjByPos.QB} / RB·WR {DEFAULT_ELIGIBILITY.minAvgProjByPos.RB} / TE {DEFAULT_ELIGIBILITY.minAvgProjByPos.TE})</span>
          </div>
        )}

        {/* List */}
        {players && !dataLoading && (
          <div className="space-y-1.5">
            {ranked.map((p, i) => (
              <PlayerRow
                key={p.player_id}
                player={p}
                rank={i + 1}
                mode={mode}
                season={season}
                expanded={expandedId === p.player_id}
                onToggle={() => setExpandedId((cur) => (cur === p.player_id ? null : p.player_id))}
              />
            ))}
            {ranked.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-10 text-center text-slate-500 text-sm">
                No {mode === "hot" ? "hot" : mode === "cold" ? "cold" : "injured"} players match the current filters.
              </div>
            )}
          </div>
        )}
      </main>

      {showShare && players && (
        <ShareModal
          players={players}
          season={season}
          initialList={mode}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

// ── Share cards ──────────────────────────────────────────────────────────────

const SHARE_ACCENT = {
  hot: {
    grad: "from-orange-500 to-rose-600",
    emoji: "🔥", title: "HOT", tag: "SELL HIGH",
    chip: "bg-orange-500/20 text-orange-100 border-orange-300/50",
    streakWord: "HOT",
  },
  cold: {
    grad: "from-cyan-500 to-sky-700",
    emoji: "🧊", title: "COLD", tag: "BUY LOW",
    chip: "bg-cyan-500/20 text-cyan-100 border-cyan-300/50",
    streakWord: "COLD",
  },
  injured: {
    grad: "from-amber-500 to-orange-700",
    emoji: "🚑", title: "HURT", tag: "STASH · BUY-LOW",
    chip: "bg-amber-500/20 text-amber-100 border-amber-300/50",
    streakWord: "HOT",
  },
};

const CARD_FONT = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

function sign1(n) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}`;
}

// Bigger heatmap variant for the 1080-wide share cards.
function ShareHeatmap({ weeks, cell = "w-5 h-9" }) {
  const byWeek = new Map(weeks.map((w) => [w.week, w]));
  return (
    <div className="flex gap-1">
      {Array.from({ length: REG_WEEKS }, (_, i) => i + 1).map((wk) => {
        const w = byWeek.get(wk);
        if (!w) return <div key={wk} className={`${cell} rounded bg-slate-800/60 border border-white/5`} />;
        const intensity = Math.min(1, Math.abs(w.residual) / 12);
        const alpha = (0.3 + intensity * 0.7).toFixed(2);
        const color = w.beat ? `rgba(16,185,129,${alpha})` : `rgba(244,63,94,${alpha})`;
        return <div key={wk} className={`${cell} rounded border border-white/5`} style={{ backgroundColor: color }} />;
      })}
    </div>
  );
}

function streakHeadline(player, accent) {
  if (player.currentStreak) {
    const n = Math.abs(player.currentStreak);
    return `${n} STRAIGHT WEEK${n > 1 ? "S" : ""} ${accent.streakWord}`;
  }
  return `TRENDING ${accent.streakWord}`;
}

// Top-N leaderboard card (the "who's hot / who's cold" board for a post).
function ShareLeaderboardCard({ innerRef, list, players, season }) {
  const a = SHARE_ACCENT[list];
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <div ref={innerRef} style={{ width: 1080, fontFamily: CARD_FONT }}
      className="bg-slate-950 text-slate-100 p-10 flex flex-col gap-5">
      <div className={`rounded-xl bg-gradient-to-br ${a.grad} p-6 flex items-center justify-between`}>
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-white/80 font-bold mb-1">
            Beat the Projection · {season}
          </div>
          <div className="text-5xl font-black text-white leading-none">
            {a.emoji} TOP {players.length} {a.title}
          </div>
          <div className="text-sm text-white/85 mt-2 font-semibold">
            {a.tag} · actual vs projected PPR · last-4-week form
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/70">As of</div>
          <div className="text-base font-bold text-white">{date}</div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/70 divide-y divide-white/5">
        {players.map((p, i) => (
          <div key={p.player_id} className="flex items-center gap-4 px-5 py-3">
            <span className="text-2xl font-black text-slate-500 w-8 text-right tabular-nums">{i + 1}</span>
            <ShareAvatar id={p.player_id} name={p.name} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-slate-100 truncate">{p.name}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${POS_COLORS[p.position] || "border-white/10 text-slate-400"}`}>{p.position}</span>
                <span className="text-[11px] text-slate-400 border border-white/15 px-1.5 py-0.5 rounded font-semibold">{p.team || "FA"}</span>
              </div>
              <div className="text-[12px] text-slate-400 mt-0.5">
                {p.beatCount}/{p.evaluatedWeeks} beat ({Math.round(p.beatRate * 100)}%) · avg {p.avgActual.toFixed(1)} vs {p.avgProj.toFixed(1)} proj
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className={`text-sm font-bold px-2.5 py-1 rounded border inline-block ${a.chip}`}>
                {list === "injured" ? `🚑 missed ${p.weeksMissedRecent}w` : `${a.emoji} ${Math.abs(p.currentStreak) || "—"}W`}
              </div>
              <div className={`text-sm font-bold mt-1 ${p.recentAvgResidual >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {sign1(p.recentAvgResidual)} <span className="text-[10px] text-slate-500 font-normal">{list === "injured" ? "pre-inj" : "last 4"}</span>
              </div>
            </div>
            <ShareHeatmap weeks={p.weeks} cell="w-3.5 h-8" />
          </div>
        ))}
      </div>

      <div className="text-center text-[12px] text-slate-500 pt-1 border-t border-white/10">
        Dynasty Oracle · weekly actual vs projected (Sleeper) · {list === "hot" ? "hot = sell-high window" : list === "cold" ? "cold = buy-low window" : "hurt = last-played form is pre-injury · stash / buy-low"}
      </div>
    </div>
  );
}

// Single-player spotlight card (how hot / cold one guy is right now).
function PlayerShareCard({ innerRef, list, player, season }) {
  const a = SHARE_ACCENT[list];
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const maxVal = Math.max(1, ...player.allWeeks.flatMap((w) => [w.proj || 0, w.actual || 0]));
  return (
    <div ref={innerRef} style={{ width: 1080, fontFamily: CARD_FONT }}
      className="bg-slate-950 text-slate-100 p-10 flex flex-col gap-5">
      <div className={`rounded-xl bg-gradient-to-br ${a.grad} p-6 flex items-center gap-5`}>
        <ShareAvatar id={player.player_id} name={player.name} size={92} ring />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-4xl font-black text-white truncate">{player.name}</span>
            <span className="text-sm font-bold text-white/90 bg-white/15 px-2 py-0.5 rounded">{player.position}</span>
            <span className="text-sm font-bold text-white/90 bg-white/15 px-2 py-0.5 rounded">{player.team || "FA"}</span>
          </div>
          <div className="text-2xl font-black text-white">{a.emoji} {streakHeadline(player, a)}</div>
          <div className="text-sm text-white/85 mt-1 font-semibold">{a.tag} · {season} season</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-widest text-white/70">As of</div>
          <div className="text-base font-bold text-white">{date}</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <ShareStat label="Last 4 avg ±" value={sign1(player.recentAvgResidual)} good={player.recentAvgResidual >= 0} />
        <ShareStat label="Season avg ±" value={sign1(player.seasonAvgResidual)} good={player.seasonAvgResidual >= 0} />
        <ShareStat label="Beat rate" value={`${Math.round(player.beatRate * 100)}%`} />
        <ShareStat label="Avg act / proj" value={`${player.avgActual.toFixed(1)} / ${player.avgProj.toFixed(1)}`} />
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/70 p-5">
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-3 flex items-center gap-3">
          <span>Week-by-week · actual vs projected</span>
          <span className="flex items-center gap-1 normal-case">
            <span className="w-3 h-3 rounded-sm bg-slate-500" /> proj
            <span className="w-3 h-3 rounded-sm bg-emerald-400 ml-2" /> beat
            <span className="w-3 h-3 rounded-sm bg-rose-400 ml-2" /> miss
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {player.allWeeks.map((w) => {
            const graded = w.residual != null; // both proj + actual present
            const actColor = w.beat ? "bg-emerald-400" : "bg-rose-400";
            return (
              <div key={w.week} className={`rounded-lg border px-3 py-2 ${w.evaluated ? "border-white/10 bg-slate-900/50" : "border-white/5 bg-slate-900/20"}`}>
                <div className="flex items-center justify-between text-[13px] mb-1.5">
                  <span className="text-slate-400 font-bold w-12">Wk {w.week}</span>
                  {graded ? (
                    <span className="flex items-center gap-2 tabular-nums">
                      <span className="text-slate-500">proj {w.proj.toFixed(1)}</span>
                      <span className="text-slate-100 font-bold">act {w.actual.toFixed(1)}</span>
                      <span className={`font-black ${w.residual > 0 ? "text-emerald-300" : w.residual < 0 ? "text-rose-300" : "text-slate-300"}`}>{sign1(w.residual)}</span>
                    </span>
                  ) : (
                    <span className="text-slate-600 italic">{w.actual == null ? "DNP" : `played ${w.actual.toFixed(1)} · no proj`}</span>
                  )}
                </div>
                {graded && (
                  <div className="space-y-1">
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-slate-500" style={{ width: `${((w.proj || 0) / maxVal) * 100}%` }} /></div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className={`h-full ${actColor}`} style={{ width: `${((w.actual || 0) / maxVal) * 100}%` }} /></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-center text-[12px] text-slate-500 pt-1 border-t border-white/10">
        Dynasty Oracle · weekly actual vs projected (Sleeper)
      </div>
    </div>
  );
}

function ShareStat({ label, value, good }) {
  const cls = good === undefined ? "text-slate-100" : good ? "text-emerald-300" : "text-rose-300";
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl font-black mt-0.5 ${cls}`}>{value}</div>
    </div>
  );
}

// Share avatar (variable size). No crossOrigin — html-to-image fetches and
// inlines the portrait into the PNG itself; setting crossOrigin here would clash
// with the plain-<img> row avatars' cache entry and break the load.
function ShareAvatar({ id, name, size = 56, ring }) {
  const [errored, setErrored] = useState(false);
  const url = sleeperPhoto(id);
  const initials = (name || "").split(" ").filter(Boolean).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const dim = { width: size, height: size };
  if (!url || errored) {
    return (
      <div style={dim} className={`rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-slate-300 shrink-0 ${ring ? "ring-4 ring-white/30" : ""}`}>
        {initials || "—"}
      </div>
    );
  }
  return (
    <img src={url} alt={name} onError={() => setErrored(true)}
      style={dim} className={`rounded-full bg-slate-800 border border-white/10 object-cover shrink-0 ${ring ? "ring-4 ring-white/30" : ""}`} />
  );
}

function accentKey(player) {
  return player.recentAvgResidual >= 0 ? "hot" : "cold";
}

function teamLogo(team) {
  if (!team) return null;
  return `https://sleepercdn.com/images/team_logos/nfl/${team.toLowerCase()}.png`;
}

function TeamLogo({ team, size = 64 }) {
  const [errored, setErrored] = useState(false);
  const url = teamLogo(team);
  if (!url || errored) return null;
  return <img src={url} alt={team} onError={() => setErrored(true)} style={{ width: size, height: size }} className="object-contain shrink-0" />;
}

// Team "hot zones" card: the team's graded players ranked by recent form, hot at
// the top (green rail) → cold at the bottom (red rail).
function TeamShareCard({ innerRef, team, players, season }) {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return (
    <div ref={innerRef} style={{ width: 1080, fontFamily: CARD_FONT }}
      className="bg-slate-950 text-slate-100 p-10 flex flex-col gap-5">
      <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-violet-700 p-6 flex items-center gap-5">
        <TeamLogo team={team} size={76} />
        <div className="flex-1">
          <div className="text-xs uppercase tracking-[0.3em] text-white/80 font-bold mb-1">Heat Map · {season}</div>
          <div className="text-5xl font-black text-white leading-none">{team} HOT ZONES</div>
          <div className="text-sm text-white/85 mt-2 font-semibold">actual vs projected PPR · 🔥 sell-high & 🧊 buy-low signals</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/70">As of</div>
          <div className="text-base font-bold text-white">{date}</div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/70 divide-y divide-white/5">
        {players.map((p) => {
          const hot = p.recentAvgResidual >= 0;
          const ac = SHARE_ACCENT[hot ? "hot" : "cold"];
          return (
            <div key={p.player_id} className="flex items-center gap-4 px-5 py-3"
              style={{ borderLeft: `4px solid ${hot ? "rgba(16,185,129,0.7)" : "rgba(244,63,94,0.7)"}` }}>
              <ShareAvatar id={p.player_id} name={p.name} size={52} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-slate-100 truncate">{p.name}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${POS_COLORS[p.position] || "border-white/10 text-slate-400"}`}>{p.position}</span>
                </div>
                <div className="text-[12px] text-slate-400 mt-0.5">
                  {p.beatCount}/{p.evaluatedWeeks} beat ({Math.round(p.beatRate * 100)}%) · avg {p.avgActual.toFixed(1)} vs {p.avgProj.toFixed(1)} proj
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className={`text-sm font-bold px-2.5 py-1 rounded border inline-block ${ac.chip}`}>{ac.emoji} {Math.abs(p.currentStreak) || "—"}W</div>
                <div className={`text-sm font-bold mt-1 ${hot ? "text-emerald-300" : "text-rose-300"}`}>
                  {sign1(p.recentAvgResidual)} <span className="text-[10px] text-slate-500 font-normal">last 4</span>
                </div>
              </div>
              <ShareHeatmap weeks={p.weeks} cell="w-3.5 h-8" />
            </div>
          );
        })}
        {players.length === 0 && (
          <div className="px-5 py-8 text-center text-slate-500 text-sm">No graded players for {team} this season.</div>
        )}
      </div>

      <div className="text-center text-[12px] text-slate-500 pt-1 border-t border-white/10">
        Dynasty Oracle · weekly actual vs projected (Sleeper) · sorted by recent form
      </div>
    </div>
  );
}

const TEAM_MIN_WEEKS = 3;

function ShareModal({ players, season, initialList, onClose }) {
  const modalRef = useModalBehavior(onClose);
  const [view, setView] = useState("leaderboard"); // 'leaderboard' | 'player' | 'team'
  const [list, setList] = useState(
    initialList === "cold" ? "cold" : initialList === "injured" ? "injured" : "hot",
  );
  const [count, setCount] = useState(10);
  const [sharePos, setSharePos] = useState({ QB: true, RB: true, WR: true, TE: true });
  const [query, setQuery] = useState("");
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState("");
  const [downloading, setDownloading] = useState(null);
  const cardRefs = useRef({});

  const ranked = useMemo(() => {
    const full =
      list === "hot" ? rankHot(players)
      : list === "cold" ? rankCold(players)
      : rankInjured(players);
    return full.filter((p) => sharePos[p.position]).slice(0, count);
  }, [players, list, count, sharePos]);

  const teams = useMemo(
    () => [...new Set(players.map((p) => p.team).filter(Boolean))].sort(),
    [players],
  );

  const lookupMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return players
      .filter((p) => (p.name || "").toLowerCase().includes(q) || (p.team || "").toLowerCase().includes(q))
      .sort((a, b) => b.evaluatedWeeks - a.evaluatedWeeks || (a.name || "").localeCompare(b.name || ""))
      .slice(0, 40);
  }, [players, query]);

  const lookupPlayer = useMemo(
    () => players.find((p) => p.player_id === selectedPlayerId) || null,
    [players, selectedPlayerId],
  );

  const teamPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    return players
      .filter((p) => p.team === selectedTeam && p.evaluatedWeeks >= TEAM_MIN_WEEKS)
      .sort((a, b) => b.recentAvgResidual - a.recentAvgResidual)
      .slice(0, 16);
  }, [players, selectedTeam]);

  const a = SHARE_ACCENT[list];

  async function capture(node) {
    // skipFonts: cards use system fonts (CARD_FONT), and html-to-image otherwise
    // tries to inline every stylesheet's web fonts — which throws a SecurityError
    // on cross-origin sheets (Google Fonts) and aborts the whole capture.
    return toPng(node, { cacheBust: true, pixelRatio: 2, backgroundColor: "#020617", skipFonts: true });
  }

  async function downloadKey(key, filename) {
    const node = cardRefs.current[key];
    if (!node) return;
    const dataUrl = await capture(node);
    const link = document.createElement("a");
    link.download = filename;
    link.href = dataUrl;
    link.click();
  }

  function slugify(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function downloadLeaderboard() {
    setDownloading("leaderboard");
    try { await downloadKey("leaderboard", `hotcold-${list}-top${count}-${season}.png`); }
    catch (err) { console.error("Failed to generate leaderboard:", err); }
    finally { setDownloading(null); }
  }

  async function downloadPlayer(p, refKey) {
    setDownloading(p.player_id);
    try { await downloadKey(refKey, `hotcold-${accentKey(p)}-${slugify(p.name || p.player_id)}-${season}.png`); }
    catch (err) { console.error("Failed to generate player card:", err); }
    finally { setDownloading(null); }
  }

  async function downloadAll() {
    setDownloading("all");
    try {
      await downloadKey("leaderboard", `hotcold-${list}-top${count}-${season}.png`);
      await new Promise((r) => setTimeout(r, 250));
      for (const p of ranked) {
        await downloadKey(`p-${p.player_id}`, `hotcold-${list}-${slugify(p.name || p.player_id)}-${season}.png`);
        await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) { console.error("Failed to generate all cards:", err); }
    finally { setDownloading(null); }
  }

  async function downloadTeam() {
    setDownloading("team");
    try { await downloadKey("team", `hotzones-${slugify(selectedTeam)}-${season}.png`); }
    catch (err) { console.error("Failed to generate team card:", err); }
    finally { setDownloading(null); }
  }

  const busy = downloading !== null;
  const tabCls = (v) => `px-3 py-1 text-xs font-semibold ${view === v ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`;

  // ── AI card-level synopsis (Gemini via /api/ai-share-blurbs) ──────────────
  const [aiOn, setAiOn] = useState(false);
  const [synopses, setSynopses] = useState({}); // cardKey -> { text, loading, error }

  async function genSynopsis(key, cardPlayers, card) {
    if (!cardPlayers.length) return;
    setSynopses((s) => ({ ...s, [key]: { ...(s[key] || {}), loading: true, error: null } }));
    try {
      const input = cardPlayers.map(buildHotColdBlurbInput);
      const { synopsis } = await fetchShareBlurbs("hot-cold", input, { season, card });
      setSynopses((s) => ({ ...s, [key]: { text: synopsis || "No synopsis returned.", loading: false, error: null } }));
    } catch (err) {
      setSynopses((s) => ({ ...s, [key]: { ...(s[key] || {}), loading: false, error: err.message } }));
    }
  }

  function synopsisPanel(key, cardPlayers, card) {
    if (!aiOn) return null;
    const st = synopses[key] || {};
    return (
      <div className="w-[1080px] max-w-full rounded-lg border border-violet-400/30 bg-violet-500/10 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-violet-300 font-bold">✨ AI synopsis</span>
          <button onClick={() => genSynopsis(key, cardPlayers, card)} disabled={st.loading}
            className="text-[11px] font-semibold px-2.5 py-1 rounded border border-violet-400/50 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25 disabled:opacity-50">
            {st.loading ? "Thinking…" : st.text ? "Regenerate" : "Generate"}
          </button>
          {st.text && <span className="text-[10px] text-slate-500">Gemini · cached 24h</span>}
        </div>
        {st.error && <div className="text-rose-300 text-xs mt-2">{st.error}</div>}
        {st.text && <p className="text-sm text-slate-100 mt-2 leading-snug">{st.text}</p>}
        {!st.text && !st.loading && !st.error && (
          <p className="text-xs text-slate-500 mt-1.5">Quick read on this card — one click.</p>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label="Share cards"
        className="w-full h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Toolbar */}
        <div className="bg-slate-900 border-b border-white/10 px-6 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Share</span>

          <div className="flex rounded-md overflow-hidden border border-white/10">
            <button onClick={() => setView("leaderboard")} className={tabCls("leaderboard")}>Leaderboard</button>
            <button onClick={() => setView("player")} className={tabCls("player")}>Player lookup</button>
            <button onClick={() => setView("team")} className={tabCls("team")}>Team</button>
          </div>

          {/* Leaderboard controls */}
          {view === "leaderboard" && (
            <>
              <div className="flex rounded-md overflow-hidden border border-white/10 ml-1">
                <button onClick={() => setList("hot")}
                  className={`px-3 py-1 text-xs font-semibold ${list === "hot" ? "bg-orange-500/20 text-orange-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>🔥 Hot</button>
                <button onClick={() => setList("cold")}
                  className={`px-3 py-1 text-xs font-semibold ${list === "cold" ? "bg-cyan-500/20 text-cyan-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>🧊 Cold</button>
                <button onClick={() => setList("injured")}
                  className={`px-3 py-1 text-xs font-semibold ${list === "injured" ? "bg-amber-500/20 text-amber-200" : "bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>🚑 Hurt</button>
              </div>
              <div className="flex items-center gap-1">
                {[5, 10, 15].map((n) => (
                  <button key={n} onClick={() => setCount(n)}
                    className={`px-3 py-1 rounded text-xs font-semibold border ${count === n ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"}`}>
                    Top {n}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                {["QB", "RB", "WR", "TE"].map((pos) => (
                  <button key={pos} onClick={() => setSharePos((f) => ({ ...f, [pos]: !f[pos] }))}
                    className={`px-2.5 py-1 rounded text-xs font-semibold border ${sharePos[pos] ? POS_COLORS[pos] : "border-white/10 text-slate-500 bg-slate-900/40"}`}>
                    {pos}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Player lookup controls */}
          {view === "player" && (
            <input value={query} onChange={(e) => setQuery(e.target.value)} autoFocus
              placeholder="Search any player by name or team…"
              className="bg-slate-950 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 w-64" />
          )}

          {/* Team controls */}
          {view === "team" && (
            <select value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}
              className="bg-slate-950 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-400">
              <option value="">Select a team…</option>
              {teams.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => setAiOn((v) => !v)}
              title="Show a one-click AI synopsis panel on each card"
              className={`text-xs font-semibold px-3 py-1.5 rounded border ${aiOn ? "border-violet-400/70 bg-violet-500/20 text-violet-100" : "border-white/15 bg-slate-900/40 text-slate-300 hover:text-slate-100"}`}>
              ✨ AI synopsis {aiOn ? "on" : "off"}
            </button>
            {view === "leaderboard" && (
              <>
                <button onClick={downloadLeaderboard} disabled={busy}
                  className="text-xs font-semibold px-3 py-1.5 rounded border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40">
                  {downloading === "leaderboard" ? "Generating…" : "Download leaderboard"}
                </button>
                <button onClick={downloadAll} disabled={busy}
                  className="text-xs font-semibold px-3 py-1.5 rounded border border-emerald-400/60 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40">
                  {downloading === "all" ? "Generating all…" : `Download all (${ranked.length + 1})`}
                </button>
              </>
            )}
            {view === "player" && lookupPlayer && (
              <button onClick={() => downloadPlayer(lookupPlayer, "lookup")} disabled={busy}
                className="text-xs font-semibold px-3 py-1.5 rounded border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40">
                {downloading === lookupPlayer.player_id ? "Generating…" : `Download ${lookupPlayer.name} card`}
              </button>
            )}
            {view === "team" && selectedTeam && (
              <button onClick={downloadTeam} disabled={busy}
                className="text-xs font-semibold px-3 py-1.5 rounded border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40">
                {downloading === "team" ? "Generating…" : `Download ${selectedTeam} card`}
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-100 text-lg leading-none px-2">✕</button>
          </div>
        </div>

        {/* Preview / capture area */}
        <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-8">
          {view === "leaderboard" && (
            <>
              <div className="flex flex-col items-center gap-2">
                <span className="text-[11px] uppercase tracking-widest text-slate-500">Leaderboard — Top {count} {a.title}</span>
                {synopsisPanel(`lb-${list}-${count}`, ranked, `${list === "hot" ? "HOT sell-high" : list === "cold" ? "COLD buy-low" : "INJURED / season-cut-short (last-played form is pre-injury) stash"} leaderboard, top ${count}`)}
                <ShareLeaderboardCard
                  innerRef={(el) => { cardRefs.current.leaderboard = el; }}
                  list={list} players={ranked} season={season}
                />
              </div>
              {ranked.map((p) => (
                <div key={p.player_id} className="flex flex-col items-center gap-2">
                  <button onClick={() => downloadPlayer(p, `p-${p.player_id}`)} disabled={busy}
                    className="text-xs font-semibold px-3 py-1.5 rounded border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40">
                    {downloading === p.player_id ? "Generating…" : `Download ${p.name} card`}
                  </button>
                  {synopsisPanel(`pl-${p.player_id}`, [p], "single-player spotlight")}
                  <PlayerShareCard
                    innerRef={(el) => { cardRefs.current[`p-${p.player_id}`] = el; }}
                    list={list} player={p} season={season}
                  />
                </div>
              ))}
            </>
          )}

          {view === "player" && (
            <div className="w-full max-w-[720px] flex flex-col items-center gap-4">
              {query.trim() && (
                <div className="w-full rounded-lg border border-white/10 bg-slate-900/60 divide-y divide-white/5 max-h-56 overflow-auto">
                  {lookupMatches.length === 0 && (
                    <div className="px-4 py-3 text-sm text-slate-500">No players match “{query}”.</div>
                  )}
                  {lookupMatches.map((p) => {
                    const hot = p.recentAvgResidual >= 0;
                    return (
                      <button key={p.player_id} onClick={() => setSelectedPlayerId(p.player_id)}
                        className={`w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-slate-800/70 ${selectedPlayerId === p.player_id ? "bg-slate-800/70" : ""}`}>
                        <PlayerAvatar id={p.player_id} name={p.name} />
                        <span className="text-slate-100 font-semibold">{p.name}</span>
                        <PosPill pos={p.position} />
                        <span className="text-[11px] text-slate-400">{p.team || "FA"}</span>
                        <span className="text-[11px] text-slate-500">{p.evaluatedWeeks}w graded</span>
                        <span className={`ml-auto text-xs font-bold ${hot ? "text-emerald-300" : "text-rose-300"}`}>
                          {SHARE_ACCENT[hot ? "hot" : "cold"].emoji} {sign1(p.recentAvgResidual)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              {lookupPlayer ? (
                <>
                  {synopsisPanel(`pl-${lookupPlayer.player_id}`, [lookupPlayer], "single-player spotlight")}
                  <PlayerShareCard
                    innerRef={(el) => { cardRefs.current.lookup = el; }}
                    list={accentKey(lookupPlayer)} player={lookupPlayer} season={season}
                  />
                </>
              ) : (
                <div className="text-slate-500 text-sm py-10">
                  {query.trim() ? "Pick a player above to build their card." : "Search for any player to build their hot/cold card."}
                </div>
              )}
            </div>
          )}

          {view === "team" && (
            selectedTeam ? (
              <div className="flex flex-col items-center gap-2">
                {synopsisPanel(`team-${selectedTeam}`, teamPlayers, `${selectedTeam} team heat map (mixed hot and cold)`)}
                <TeamShareCard
                  innerRef={(el) => { cardRefs.current.team = el; }}
                  team={selectedTeam} players={teamPlayers} season={season}
                />
              </div>
            ) : (
              <div className="text-slate-500 text-sm py-10">Select a team to see its hot zones.</div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
