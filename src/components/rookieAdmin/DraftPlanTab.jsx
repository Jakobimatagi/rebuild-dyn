import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSleeper } from "../../lib/sleeperApi.js";
import { fetchFantasyCalcValues } from "../../lib/fantasyCalcApi.js";
import {
  fetchDraftPlan,
  fetchDraftPlans,
  upsertDraftPlan,
  deleteDraftPlan,
} from "../../lib/supabase.js";
import {
  buildLightPlayer,
  buildProspectSnapshot,
  clearConnection,
  computePlanImpact,
  loadConnection,
  ownedPicksForSeason,
  pickKey,
  pickLabel,
  saveConnection,
  synthesizeRookie,
} from "../../lib/draftPlanLogic.js";
import { POS_COLORS } from "./constants.js";

// One position cell of the impact grid.
function ImpactCell({ pos, before, after, delta, scoreDelta }) {
  const fmt = (v) => (v == null ? "—" : v);
  const arrow = delta > 0 ? "↑" : delta < 0 ? "↓" : "·";
  const color = delta > 0 ? "text-emerald-300" : delta < 0 ? "text-rose-300" : "text-slate-500";
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[pos]}`}>{pos}</span>
        <span className={`text-xs font-semibold ${color}`}>{arrow} {delta > 0 ? "+" : ""}{delta}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-slate-200 tabular-nums">{fmt(before?.grade)}</span>
        <span className="text-slate-600 text-sm">→</span>
        <span className="text-2xl font-bold text-emerald-300 tabular-nums">{fmt(after?.grade)}</span>
      </div>
      <div className="text-[10px] text-slate-500 mt-1">
        score {fmt(before?.score)} → {fmt(after?.score)}
        {scoreDelta !== 0 && <span className={`ml-1 ${color}`}>({scoreDelta > 0 ? "+" : ""}{scoreDelta})</span>}
      </div>
    </div>
  );
}

// Prospect typeahead.
function ProspectPicker({ prospects, value, onChange, onClear }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.trim().toLowerCase();
    return prospects.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [q, prospects]);

  if (value) {
    return (
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="flex-1 truncate text-sm text-slate-100 font-semibold">{value.name}</span>
        <span className={`text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded border ${POS_COLORS[value.position]}`}>{value.position}</span>
        <button onClick={onClear} className="text-xs text-slate-500 hover:text-rose-300 px-1.5 py-0.5">✕</button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0">
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Type a prospect name…"
        className="w-full bg-slate-800 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-emerald-400" />
      {open && matches.length > 0 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-slate-900 border border-white/15 rounded-md shadow-xl max-h-64 overflow-y-auto">
          {matches.map((p) => (
            <button key={p.id} onClick={() => { onChange(p.id); setQ(""); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center gap-2 border-b border-white/5 last:border-0">
              <span className="flex-1 truncate text-sm text-slate-100">{p.name}</span>
              <span className={`text-[9px] uppercase tracking-wide font-bold px-1 py-0.5 rounded border ${POS_COLORS[p.position]}`}>{p.position}</span>
              <span className="text-[10px] text-slate-500">{p.projectedDraftYear || ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DraftPlanTab({ prospects, annotations, user }) {
  // Connection (Sleeper league/team) — small, per-device, persisted in localStorage.
  const [conn, setConn] = useState(() => loadConnection() || {});
  const [step, setStep] = useState(conn.leagueId ? "ready" : "username");

  // Picks for the currently-viewed draft year — loaded from Supabase.
  const [picksByKey, setPicksByKey] = useState({});
  const [draftYear, setDraftYear] = useState(null);
  const [picksLoading, setPicksLoading] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const saveTimer = useRef(null);

  // Past plans across all seasons for this user+league.
  const [pastPlans, setPastPlans] = useState([]);

  // Connection-flow state
  const [usernameInput, setUsernameInput] = useState(() => conn.username || localStorage.getItem("sleeper_username") || "");
  const [busy, setBusy] = useState(false);
  const [connError, setConnError] = useState("");
  const [leagueOptions, setLeagueOptions] = useState([]);
  const [pendingLeague, setPendingLeague] = useState(null);
  const [teamOptions, setTeamOptions] = useState([]);

  // Loaded league context (Sleeper data, FantasyCalc).
  const [ctx, setCtx] = useState(null);
  const [ctxLoading, setCtxLoading] = useState(false);
  const [ctxError, setCtxError] = useState("");

  // Draft-slot mapping for the current draftYear: { rosterId: slotNumber }.
  // Loaded lazily (the draft endpoint is keyed by season).
  const [slotByRoster, setSlotByRoster] = useState(null);

  function persistConn(next) {
    setConn(next);
    saveConnection(next);
  }

  // Fetch league context whenever we have a leagueId + rosterId.
  useEffect(() => {
    if (!conn.leagueId || !conn.rosterId) return;
    let cancelled = false;
    setCtxLoading(true); setCtxError("");
    (async () => {
      try {
        const league = await fetchSleeper(`/league/${conn.leagueId}`);
        const [users, rosters, tradedPicks, players, fcValues, drafts] = await Promise.all([
          fetchSleeper(`/league/${conn.leagueId}/users`),
          fetchSleeper(`/league/${conn.leagueId}/rosters`),
          fetchSleeper(`/league/${conn.leagueId}/traded_picks`).catch(() => []),
          fetchSleeper(`/players/nfl`).catch(() => ({})),
          fetchFantasyCalcValues(league).catch(() => []),
          fetchSleeper(`/league/${conn.leagueId}/drafts`).catch(() => []),
        ]);
        if (cancelled) return;
        setCtx({ league, users, rosters, tradedPicks, players, fcValues, drafts });
        // Default draft year: the league's current season (its rookie draft
        // may still be pending). User can advance to next year via selector.
        setDraftYear((y) => y ?? (Number(league.season) || new Date().getFullYear()));
      } catch (e) {
        if (!cancelled) setCtxError(e.message || "Failed to load league.");
      } finally {
        if (!cancelled) setCtxLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [conn.leagueId, conn.rosterId]);

  // Resolve draft slot order whenever the active draftYear changes.
  // Sleeper exposes `slot_to_roster_id` on the draft details endpoint —
  // present once the draft has been created (often well before draft day).
  useEffect(() => {
    if (!ctx?.drafts || !draftYear) { setSlotByRoster(null); return; }
    let cancelled = false;
    const draft = ctx.drafts.find((d) => Number(d.season) === Number(draftYear));
    if (!draft?.draft_id) { setSlotByRoster(null); return; }
    (async () => {
      try {
        const detail = await fetchSleeper(`/draft/${draft.draft_id}`);
        if (cancelled) return;
        const map = detail?.slot_to_roster_id || {};
        // Invert: { rosterId: slotNumber }
        const inv = {};
        for (const [slot, rosterId] of Object.entries(map)) {
          if (rosterId != null) inv[Number(rosterId)] = Number(slot);
        }
        setSlotByRoster(Object.keys(inv).length ? inv : null);
      } catch {
        if (!cancelled) setSlotByRoster(null);
      }
    })();
    return () => { cancelled = true; };
  }, [ctx?.drafts, draftYear]);

  // Load picks for the selected draft year from Supabase.
  useEffect(() => {
    if (!user?.id || !conn.leagueId || !draftYear) return;
    let cancelled = false;
    setPicksLoading(true);
    (async () => {
      try {
        const row = await fetchDraftPlan(user.id, conn.leagueId, draftYear);
        if (!cancelled) setPicksByKey(row?.picks || {});
      } catch (e) {
        console.error("Failed to load draft plan:", e);
        if (!cancelled) setPicksByKey({});
      } finally {
        if (!cancelled) setPicksLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, conn.leagueId, draftYear]);

  // Load list of past plans for this user+league (for the "Past plans" section).
  useEffect(() => {
    if (!user?.id || !conn.leagueId) return;
    let cancelled = false;
    fetchDraftPlans(user.id, conn.leagueId)
      .then((rows) => { if (!cancelled) setPastPlans(rows); })
      .catch((e) => console.error("Failed to load past plans:", e));
    return () => { cancelled = true; };
  }, [user?.id, conn.leagueId]);

  // Debounced save: whenever picks change, push to Supabase 600ms later.
  function schedulePickSave(nextPicks) {
    if (!user?.id || !conn.leagueId || !draftYear) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await upsertDraftPlan({
          userId:           user.id,
          leagueId:         conn.leagueId,
          leagueName:       conn.leagueName,
          teamName:         conn.teamName,
          rosterId:         conn.rosterId,
          season:           draftYear,
          picks:            nextPicks,
          prospectSnapshot: buildProspectSnapshot(nextPicks, prospects, annotations),
        });
        setSaveState("saved");
        // Refresh past-plans list so the current one shows up immediately.
        fetchDraftPlans(user.id, conn.leagueId)
          .then(setPastPlans)
          .catch(() => {});
        // Fade "Saved ✓" back to idle after a moment.
        setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1500);
      } catch (e) {
        console.error("Failed to save plan:", e);
        setSaveState("error");
      }
    }, 600);
  }

  // ── Connection handlers ──────────────────────────────────────────────────

  async function handleConnectUsername(e) {
    e.preventDefault();
    const u = usernameInput.trim();
    if (!u) { setConnError("Enter your Sleeper username."); return; }
    setBusy(true); setConnError(""); setLeagueOptions([]);
    try {
      const sleeperUser = await fetchSleeper(`/user/${u}`);
      if (!sleeperUser?.user_id) throw new Error("User not found.");
      const now = new Date();
      const currentSeason = now.getFullYear();
      let leagues = await fetchSleeper(`/user/${sleeperUser.user_id}/leagues/nfl/${currentSeason}`).catch(() => []);
      if (!leagues?.length) leagues = await fetchSleeper(`/user/${sleeperUser.user_id}/leagues/nfl/${currentSeason - 1}`).catch(() => []);
      if (!leagues.length) throw new Error("No leagues found for that username.");
      setLeagueOptions(leagues);
      persistConn({ ...conn, username: u, sleeperUserId: sleeperUser.user_id });
      setStep("league");
    } catch (err) {
      setConnError(err.message || "Failed to look up user.");
    } finally {
      setBusy(false);
    }
  }

  async function handlePickLeague(league) {
    setBusy(true); setConnError(""); setPendingLeague(league);
    try {
      const [users, rosters] = await Promise.all([
        fetchSleeper(`/league/${league.league_id}/users`),
        fetchSleeper(`/league/${league.league_id}/rosters`),
      ]);
      const me = users.find((u) => u.user_id === conn.sleeperUserId);
      const myRoster = rosters.find((r) => r.owner_id === conn.sleeperUserId);
      if (myRoster) {
        const teamName = me?.metadata?.team_name || me?.display_name || `Roster ${myRoster.roster_id}`;
        persistConn({
          ...conn,
          leagueId: league.league_id,
          leagueName: league.name,
          rosterId: myRoster.roster_id,
          teamName,
        });
        setStep("ready");
      } else {
        setTeamOptions(rosters.map((r) => {
          const u = users.find((x) => x.user_id === r.owner_id);
          return { rosterId: r.roster_id, label: u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}` };
        }));
        setStep("team");
      }
    } catch (err) {
      setConnError(err.message || "Failed to load league.");
    } finally {
      setBusy(false);
    }
  }

  function handlePickTeam(opt) {
    persistConn({
      ...conn,
      leagueId: pendingLeague.league_id,
      leagueName: pendingLeague.name,
      rosterId: opt.rosterId,
      teamName: opt.label,
    });
    setStep("ready");
  }

  function handleDisconnect() {
    clearConnection();
    setConn({});
    setCtx(null);
    setLeagueOptions([]);
    setTeamOptions([]);
    setPendingLeague(null);
    setPicksByKey({});
    setDraftYear(null);
    setPastPlans([]);
    setStep("username");
  }

  // ── Pick edits (auto-save) ────────────────────────────────────────────────

  function setPickProspect(pk, prospectId) {
    setPicksByKey((prev) => {
      const next = { ...prev, [pk]: prospectId };
      schedulePickSave(next);
      return next;
    });
  }
  function clearPickProspect(pk) {
    setPicksByKey((prev) => {
      const next = { ...prev };
      delete next[pk];
      schedulePickSave(next);
      return next;
    });
  }

  async function handleDeleteCurrentPlan() {
    if (!user?.id || !conn.leagueId || !draftYear) return;
    if (!confirm(`Delete the ${draftYear} plan? This can't be undone.`)) return;
    try {
      await deleteDraftPlan(user.id, conn.leagueId, draftYear);
      setPicksByKey({});
      setSaveState("idle");
      const rows = await fetchDraftPlans(user.id, conn.leagueId);
      setPastPlans(rows);
    } catch (e) {
      console.error("Failed to delete plan:", e);
      setSaveState("error");
    }
  }

  // ── Render: connection flow ──────────────────────────────────────────────
  if (step === "username" || step === "league" || step === "team") {
    return (
      <div className="max-w-md">
        <h2 className="text-lg font-bold text-slate-100 mb-1">Rookie Draft Plan</h2>
        <p className="text-xs text-slate-500 mb-5">Connect your Sleeper league to plan picks. Saved per draft year so you can grade them next year.</p>

        {step === "username" && (
          <form onSubmit={handleConnectUsername} className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Sleeper Username</label>
              <input value={usernameInput} onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="your_sleeper_handle"
                className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400" />
            </div>
            {connError && <div className="text-rose-400 text-sm">{connError}</div>}
            <button type="submit" disabled={busy}
              className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-emerald-950 font-semibold px-5 py-2 rounded-lg text-sm">
              {busy ? "Looking up…" : "Continue"}
            </button>
          </form>
        )}

        {step === "league" && (
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-3">
            <div className="text-xs text-slate-400">Pick a league:</div>
            {leagueOptions.map((lg) => (
              <button key={lg.league_id} onClick={() => handlePickLeague(lg)} disabled={busy}
                className="w-full text-left rounded-lg border border-white/10 hover:border-emerald-400/50 bg-slate-800/60 px-4 py-3 disabled:opacity-50">
                <div className="text-sm text-slate-100 font-semibold">{lg.name}</div>
                <div className="text-[10px] text-slate-500">{lg.season} · {lg.total_rosters} teams</div>
              </button>
            ))}
            {connError && <div className="text-rose-400 text-sm">{connError}</div>}
            <button onClick={() => setStep("username")} className="text-xs text-slate-500 hover:text-slate-300">← back</button>
          </div>
        )}

        {step === "team" && (
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-2">
            <div className="text-xs text-slate-400 mb-2">Pick your team:</div>
            {teamOptions.map((t) => (
              <button key={t.rosterId} onClick={() => handlePickTeam(t)}
                className="w-full text-left rounded-lg border border-white/10 hover:border-emerald-400/50 bg-slate-800/60 px-4 py-2 text-sm text-slate-100">
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Render: ready ────────────────────────────────────────────────────────
  if (ctxLoading || !ctx || draftYear == null) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Rookie Draft Plan</h2>
            <div className="text-xs text-slate-500">{conn.leagueName} · {conn.teamName}</div>
          </div>
          <button onClick={handleDisconnect} className="text-xs text-slate-500 hover:text-slate-300 border border-white/10 px-2 py-1 rounded">disconnect</button>
        </div>
        {ctxError ? (
          <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200">{ctxError}</div>
        ) : (
          <div className="text-sm text-slate-500">Loading league…</div>
        )}
      </div>
    );
  }

  const baseSeason = Number(ctx.league.season) || new Date().getFullYear();
  const yearOptions = [baseSeason, baseSeason + 1, baseSeason + 2];
  const totalRosters = Number(ctx.league.total_rosters) || 12;
  const isSuperflex = (ctx.league.roster_positions || []).includes("SUPER_FLEX") ||
    (ctx.league.roster_positions || []).filter((s) => s === "QB").length > 1;

  const rosterNameById = {};
  for (const r of ctx.rosters) {
    const u = ctx.users.find((x) => x.user_id === r.owner_id);
    rosterNameById[r.roster_id] = u?.metadata?.team_name || u?.display_name || `Roster ${r.roster_id}`;
  }
  const picks = ownedPicksForSeason(ctx.tradedPicks, conn.rosterId, totalRosters, draftYear, 4, slotByRoster);

  const usedProspectIds = new Set(Object.values(picksByKey || {}));
  const upcoming = prospects.filter((p) => {
    if (Number(p.projectedDraftYear) > draftYear) return false;
    return !usedProspectIds.has(p.id);
  });

  // Roster + rookie objects for impact computation.
  const myRoster = ctx.rosters.find((r) => r.roster_id === conn.rosterId);
  const fcByName = new Map();
  for (const item of ctx.fcValues || []) {
    const sleeperId = item?.player?.sleeperId;
    if (sleeperId != null) fcByName.set(String(sleeperId), item.value);
  }
  const playerIds = myRoster?.players || [];
  const rosterPlayers = playerIds.map((id) => {
    const p = ctx.players?.[id];
    if (!p) return null;
    const fc = Number(fcByName.get(String(id)) || 0);
    const norm = fc > 0 ? Math.min(100, (fc / 10000) * 100) : 0;
    return buildLightPlayer(p, norm);
  }).filter(Boolean);

  const selectedRookies = Object.values(picksByKey || {})
    .map((pid) => prospects.find((p) => p.id === pid))
    .filter(Boolean)
    .map((p) => synthesizeRookie(p, annotations[p.id] || {}));

  const impact = computePlanImpact(rosterPlayers, selectedRookies, isSuperflex);

  const otherPlans = pastPlans.filter((pl) => Number(pl.season) !== Number(draftYear));

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Rookie Draft Plan</h2>
          <div className="text-xs text-slate-500">
            {conn.leagueName} · {conn.teamName} · {isSuperflex ? "Superflex" : "1QB"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">
            {saveState === "saving" && "Saving…"}
            {saveState === "saved" && <span className="text-emerald-400">Saved ✓</span>}
            {saveState === "error" && <span className="text-rose-400">Save failed</span>}
            {picksLoading && saveState === "idle" && "Loading…"}
          </span>
          <button onClick={handleDisconnect}
            className="text-xs text-slate-500 hover:text-slate-300 border border-white/10 px-2 py-1 rounded">
            disconnect
          </button>
        </div>
      </div>

      {/* Year selector */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-slate-500">Draft Year</span>
        {yearOptions.map((y) => (
          <button key={y} onClick={() => setDraftYear(y)}
            className={`px-3 py-1 rounded-md text-xs font-semibold border ${draftYear === y ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>
            {y}
          </button>
        ))}
      </div>

      {/* Position-grade impact */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        {["QB","RB","WR","TE"].map((pos) => (
          <ImpactCell key={pos} pos={pos} {...impact[pos]} />
        ))}
      </div>
      <div className="text-[10px] text-slate-500 mb-5">
        Position grades use a lightweight FantasyCalc-based score for current roster + prospect dynasty score for rookies.
        Directional vs. the dashboard, not exact. Year-1 rookie production is dampened.
      </div>

      {/* Picks list */}
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-slate-200 font-semibold">Your {draftYear} Picks</span>
          <span className="text-[10px] text-slate-500">{picks.length} owned · {Object.keys(picksByKey || {}).length} planned</span>
        </div>
        {picks.length === 0 && (
          <div className="text-sm text-slate-500 py-4 text-center">No owned picks for {draftYear}.</div>
        )}
        <div className="space-y-2">
          {picks.map((pick) => {
            const pk = pickKey(pick);
            const prospectId = (picksByKey || {})[pk];
            const selected = prospectId ? prospects.find((p) => p.id === prospectId) : null;
            return (
              <div key={pk} className="flex items-center gap-3 rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
                <div className="w-32 shrink-0">
                  <div className="text-sm font-bold text-slate-200">{pickLabel(pick, rosterNameById)}</div>
                  {pick.acquired && <div className="text-[9px] uppercase tracking-wider text-emerald-400">acquired</div>}
                </div>
                <ProspectPicker
                  prospects={upcoming.concat(selected ? [selected] : [])}
                  value={selected || null}
                  onChange={(pid) => setPickProspect(pk, pid)}
                  onClear={() => clearPickProspect(pk)} />
              </div>
            );
          })}
        </div>
        {Object.keys(picksByKey || {}).length > 0 && (
          <div className="mt-4 text-right">
            <button onClick={handleDeleteCurrentPlan}
              className="text-[10px] text-slate-500 hover:text-rose-300">
              clear {draftYear} plan
            </button>
          </div>
        )}
      </div>

      {/* Past plans across other seasons */}
      {otherPlans.length > 0 && (
        <div className="mt-6">
          <div className="text-xs uppercase tracking-widest text-slate-500 font-semibold mb-2">Saved plans</div>
          <div className="space-y-1">
            {otherPlans.map((pl) => {
              const count = Object.keys(pl.picks || {}).length;
              const updated = pl.updated_at ? new Date(pl.updated_at).toLocaleDateString() : "";
              return (
                <button key={pl.id} onClick={() => setDraftYear(Number(pl.season))}
                  className="w-full text-left rounded-lg border border-white/10 hover:border-emerald-400/40 bg-slate-900/40 px-3 py-2 flex items-center justify-between">
                  <span className="text-sm text-slate-200 font-semibold">{pl.season} class</span>
                  <span className="text-[10px] text-slate-500">{count} picks · last edit {updated}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
