import { useEffect, useRef, useState, useCallback } from "react";
import { verifyLogin, fetchAllData, upsertProspect, upsertAnnotation, fetchMyRankings, upsertExpertRanking, deleteExpertRanking, fetchExpertRankings } from "../lib/supabase.js";
import { TIER_RANK, computeGrade, deriveTier, dynastyScore, deriveSchool } from "../lib/prospectScoring.js";
import { POS_COLORS, PAGE_SIZE } from "./rookieAdmin/constants.js";
import { loadSession, saveSession, clearSession, normalizeName, computeCurrentDraftYear, blankSeason, initAddForm, computeValueScore } from "./rookieAdmin/utils.js";
import { GradeBadge, Pill, TierSelect, CapitalSelect, Pagination, AddPlayerSeasonRow } from "./rookieAdmin/Atoms.jsx";
import ProspectCard from "./rookieAdmin/ProspectCard.jsx";
import ProspectEditorTab from "./rookieAdmin/ProspectEditorTab.jsx";

// ── Main component ────────────────────────────────────────────────────────────

export default function RookieProspector({ rosterData: rosterDataProp, onLogout }) {
  const [state, setState] = useState({
    unlocked: false,
    initLoading: true,   // true while we check for a persisted session on mount
    user: null,          // { id, username, role }
    usernameInput: "",
    passInput: "",
    gateError: "",
    dbLoading: false,
    tab: "board",
    filters: { QB: true, RB: true, WR: true, TE: true },
    yearFilter: String(computeCurrentDraftYear()),
    prospects: [],
    sleeperByName: {},
    sleeperLoading: false,
    sleeperError: "",
    annotations: {},
    expertRankings: {}, // { [prospect_id]: { rankOrder, tier, notes } }
    page: 1,
    listSearch: "",
    search: "",
    rosterJson: "",
    rosterData: rosterDataProp || null,
    rosterParseError: "",
  });

  const update = (patch) => setState((s) => ({ ...s, ...patch }));
  const [addForm, setAddForm]           = useState(() => initAddForm());
  const [addFormError, setAddFormError] = useState("");
  const [addFormSaving, setAddFormSaving] = useState(false);

  function setAnnotation(id, patch) {
    setState((s) => {
      const merged = { ...(s.annotations[id] || {}), ...patch };
      const next   = { ...s.annotations, [id]: merged };
      upsertAnnotation(id, merged).catch(console.error);
      return { ...s, annotations: next };
    });
  }

  // ── Session restore on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const session = loadSession();
    if (!session) { update({ initLoading: false }); return; }
    Promise.all([fetchAllData(), fetchMyRankings(session.id)])
      .then(([{ prospects, annotations }, expertRankings]) => {
        update({
          unlocked: true, initLoading: false,
          user: session, prospects, annotations, expertRankings,
          tab: prospects.length === 0 ? "add" : "board",
        });
      })
      .catch(() => {
        clearSession();
        update({ initLoading: false });
      });
  }, []);

  async function setExpertRanking(prospectId, rankOrder) {
    if (!state.user) return;
    const next = { ...state.expertRankings };
    if (!rankOrder) {
      delete next[prospectId];
      deleteExpertRanking(state.user.id, prospectId).catch(console.error);
    } else {
      next[prospectId] = { rankOrder, tier: "", notes: "" };
      upsertExpertRanking(state.user.id, prospectId, rankOrder).catch(console.error);
    }
    update({ expertRankings: next });
  }

  async function autoRankUpcoming() {
    if (!state.user || upcomingAll.length === 0) return;
    const next = { ...state.expertRankings };
    await Promise.all(
      upcomingAll.map((x, i) => {
        const rankOrder = i + 1;
        next[x.p.id] = { rankOrder, tier: "", notes: "" };
        return upsertExpertRanking(state.user.id, x.p.id, rankOrder).catch(console.error);
      })
    );
    update({ expertRankings: next });
  }

  function setFormField(field, value) {
    setAddForm((f) => ({ ...f, [field]: value }));
  }

  function updateFormSeason(si, field, value) {
    setAddForm((f) => {
      const seasons = f.seasons.map((s, i) => i === si ? { ...s, [field]: value } : s);
      if (si === 0 && (field === "season_year" || field === "age")) {
        const baseYear = parseInt(seasons[0].season_year) || 0;
        const baseAge  = parseFloat(seasons[0].age) || 0;
        return {
          ...f,
          seasons: seasons.map((s, i) => i === 0 ? s : {
            ...s,
            ...(field === "season_year" && baseYear ? { season_year: String(baseYear + i) } : {}),
            ...(field === "age" && baseAge ? { age: String(parseFloat(baseAge) + i) } : {}),
          }),
        };
      }
      return { ...f, seasons };
    });
  }

  function addFormSeasonRow() {
    setAddForm((f) => {
      const last  = f.seasons[f.seasons.length - 1];
      const blank = blankSeason(f.position);
      const prevYear = parseInt(last?.season_year) || 0;
      const prevAge  = parseFloat(last?.age) || 0;
      return {
        ...f,
        seasons: [...f.seasons, {
          ...blank,
          season_year: prevYear ? String(prevYear + 1) : "",
          age:         prevAge  ? String(prevAge + 1)  : "",
          school:      last?.school || "",
        }],
      };
    });
  }

  function removeFormSeason(si) {
    setAddForm((f) => ({ ...f, seasons: f.seasons.filter((_, i) => i !== si) }));
  }

  async function handleSubmitPlayer() {
    if (!addForm.name.trim()) { setAddFormError("Player name is required."); return; }
    setAddFormSaving(true);
    setAddFormError("");
    try {
      const id = addForm.id || `${addForm.position.toLowerCase()}-${Date.now().toString(36)}`;
      const prospect = {
        id,
        name:               addForm.name.trim(),
        position:           addForm.position,
        projectedDraftYear: parseInt(addForm.projectedDraftYear) || computeCurrentDraftYear(),
        draftCapital:       addForm.draftCapital,
        comparablePlayer:   addForm.comparablePlayer.trim(),
        athletic:           addForm.athletic || {},
        seasons:            addForm.seasons.filter((s) => s.season_year),
      };
      await upsertProspect(prospect);
      const ann = {
        tier:           addForm.tier           || "",
        draftCapital:   addForm.draftCapital   || "",
        landingSpot:    addForm.landingSpot    || "",
        declared:       addForm.declared       || false,
        rookieDraftAdp: addForm.rookieDraftAdp || "",
      };
      await upsertAnnotation(id, ann);

      // On new prospect, insert into all existing experts' rankings at the right position
      const isNew = !addForm.id;
      let updatedExpertRankings = state.expertRankings;
      if (isNew) {
        try {
          const allRankings = await fetchExpertRankings();
          const byExpert = {};
          allRankings.forEach((r) => { (byExpert[r.user_id] ??= []).push(r); });

          const { total: newGrade } = computeGrade(prospect, undefined, ann.draftCapital || "");
          const newTierLabel = ann.tier || deriveTier(newGrade, ann.draftCapital || "") || "";
          const newTierRank = newTierLabel ? (TIER_RANK[newTierLabel] ?? 99) : 99;
          const newDs = dynastyScore(newGrade, prospect.position, prospect.seasons);

          const upserts = [];
          const insertPositions = {};

          Object.entries(byExpert).forEach(([userId, rows]) => {
            if (rows.length === 0) return;
            const sorted = [...rows].sort((a, b) => a.rank_order - b.rank_order);

            let insertAt = sorted[sorted.length - 1].rank_order + 1;
            for (let i = 0; i < sorted.length; i++) {
              const pid = sorted[i].prospect_id;
              const existingP = state.prospects.find((p) => p.id === pid);
              if (!existingP) continue;
              const existingAnn = state.annotations[pid] || {};
              const capKey = existingAnn.draftCapital || existingP.draftCapital || "";
              const { total: eGrade } = computeGrade(existingP, undefined, capKey);
              const eTierLabel = existingAnn.tier || deriveTier(eGrade, capKey) || "";
              const eTierRank = eTierLabel ? (TIER_RANK[eTierLabel] ?? 99) : 99;
              const eDs = dynastyScore(eGrade, existingP.position, existingP.seasons);
              if (newTierRank < eTierRank || (newTierRank === eTierRank && newDs > eDs)) {
                insertAt = sorted[i].rank_order;
                break;
              }
            }

            insertPositions[userId] = insertAt;
            sorted.forEach((r) => {
              if (r.rank_order >= insertAt) {
                upserts.push(upsertExpertRanking(userId, r.prospect_id, r.rank_order + 1, r.tier || "", r.notes || ""));
              }
            });
            upserts.push(upsertExpertRanking(userId, id, insertAt, "", ""));
          });

          await Promise.all(upserts);

          if (state.user && insertPositions[state.user.id] !== undefined) {
            const insertAt = insertPositions[state.user.id];
            const next = {};
            Object.entries(state.expertRankings).forEach(([pid, data]) => {
              next[pid] = data.rankOrder >= insertAt ? { ...data, rankOrder: data.rankOrder + 1 } : data;
            });
            next[id] = { rankOrder: insertAt, tier: "", notes: "" };
            updatedExpertRankings = next;
          }
        } catch (err) {
          console.error("Failed to sync new prospect into expert rankings:", err);
        }
      }

      setState((s) => {
        const existingIdx = s.prospects.findIndex((p) => p.id === id);
        const nextProspects = existingIdx >= 0
          ? s.prospects.map((p) => p.id === id ? prospect : p)
          : [...s.prospects, prospect];
        return { ...s, prospects: nextProspects, annotations: { ...s.annotations, [id]: ann }, expertRankings: updatedExpertRankings };
      });
      setAddForm(initAddForm(addForm.position));
      setAddFormSaving(false);
    } catch (err) {
      setAddFormError("Save failed: " + (err.message || err));
      setAddFormSaving(false);
      console.error(err);
    }
  }

  function handleEditProspect(p) {
    const ann = state.annotations[p.id] || {};
    setAddForm({
      ...initAddForm(p.position),
      id:                 p.id,
      name:               p.name,
      projectedDraftYear: String(p.projectedDraftYear || computeCurrentDraftYear()),
      draftCapital:       ann.draftCapital   || p.draftCapital   || "",
      comparablePlayer:   p.comparablePlayer || "",
      declared:           ann.declared       || false,
      rookieDraftAdp:     ann.rookieDraftAdp || "",
      landingSpot:        ann.landingSpot    || "",
      tier:               ann.tier           || "",
      athletic:           p.athletic         || {},
      seasons:            p.seasons.length > 0 ? p.seasons : [blankSeason(p.position)],
    });
    update({ tab: "add" });
  }

  async function moveRank(prospectId, direction) {
    if (!state.user) return;
    const sorted = Object.entries(state.expertRankings)
      .sort(([, a], [, b]) => a.rankOrder - b.rankOrder);
    const idx = sorted.findIndex(([id]) => id === prospectId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const [aId, aData] = sorted[idx];
    const [bId, bData] = sorted[swapIdx];
    const next = {
      ...state.expertRankings,
      [aId]: { ...aData, rankOrder: bData.rankOrder },
      [bId]: { ...bData, rankOrder: aData.rankOrder },
    };
    update({ expertRankings: next });
    await Promise.all([
      upsertExpertRanking(state.user.id, aId, bData.rankOrder).catch(console.error),
      upsertExpertRanking(state.user.id, bId, aData.rankOrder).catch(console.error),
    ]);
  }

  function declareWithYear(prospectId, year) {
    setAnnotation(prospectId, { declared: true });
    setState((s) => {
      const nextProspects = s.prospects.map((p) => {
        if (p.id !== prospectId) return p;
        const updated = { ...p, projectedDraftYear: year };
        upsertProspect(updated).catch(console.error);
        return updated;
      });
      return { ...s, prospects: nextProspects };
    });
  }

  // Called by the editor whenever any prospect data changes — syncs to state + Supabase.
  const handleProspectsChange = useCallback((newProspects) => {
    const normalized = newProspects.map((p) => ({ ...p, school: deriveSchool(p) }));
    update({ prospects: normalized });
    // Persist each changed prospect (fire-and-forget with error log)
    normalized.forEach((p) => upsertProspect(p).catch(console.error));
  }, []);

  // ── Sleeper fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.unlocked) return;
    let cancelled = false;
    update({ sleeperLoading: true });
    fetch("https://api.sleeper.app/v1/players/nfl")
      .then((r) => r.json())
      .then((all) => {
        if (cancelled) return;
        const map = {};
        Object.values(all || {}).forEach((pl) => {
          if (!pl?.full_name || typeof pl.search_rank !== "number") return;
          if (pl.years_exp !== 0 && !(pl.years_exp == null && !pl.team)) return;
          map[normalizeName(pl.full_name)] = { rank: pl.search_rank, college: pl.college || null };
        });
        update({ sleeperByName: map, sleeperLoading: false });
      })
      .catch((e) => { if (!cancelled) update({ sleeperError: e.message || "Sleeper failed", sleeperLoading: false }); });
    return () => { cancelled = true; };
  }, [state.unlocked]);

  async function handleUnlock(e) {
    e.preventDefault();
    if (!state.usernameInput.trim()) { update({ gateError: "Enter your username." }); return; }
    update({ dbLoading: true, gateError: "" });
    try {
      const result = await verifyLogin(state.usernameInput.trim(), state.passInput);
      if (!result?.ok) { update({ dbLoading: false, gateError: "Invalid username or passkey." }); return; }
      const user = { id: result.id, username: result.username, role: result.role };
      saveSession(user);
      const [{ prospects, annotations }, expertRankings] = await Promise.all([
        fetchAllData(), fetchMyRankings(user.id),
      ]);
      update({
        unlocked: true, dbLoading: false,
        user, prospects, annotations, expertRankings,
        tab: prospects.length === 0 ? "add" : "board",
      });
    } catch (err) {
      update({ dbLoading: false, gateError: "Connection error — check Supabase config." });
      console.error(err);
    }
  }

  function handleRosterPaste() {
    try { update({ rosterData: JSON.parse(state.rosterJson), rosterParseError: "" }); }
    catch { update({ rosterParseError: "Invalid JSON." }); }
  }

  // ── Gate ──────────────────────────────────────────────────────────────────────
  if (state.initLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!state.unlocked) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6">
        <form onSubmit={handleUnlock} className="w-full max-w-sm bg-slate-900/80 border border-white/10 rounded-2xl p-8">
          <div className="text-emerald-400 text-xs uppercase tracking-widest mb-2">Dynasty Pre-Draft Prospector</div>
          <h1 className="text-slate-100 text-2xl font-bold mb-6">Sign In</h1>
          <input type="text" autoFocus value={state.usernameInput} onChange={(e) => update({ usernameInput: e.target.value })}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-slate-100 focus:border-emerald-400 outline-none mb-3" placeholder="Username" />
          <input type="password" value={state.passInput} onChange={(e) => update({ passInput: e.target.value })}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-slate-100 focus:border-emerald-400 outline-none" placeholder="Passkey" />
          {state.gateError && <div className="text-rose-400 text-sm mt-3">{state.gateError}</div>}
          <button type="submit" disabled={state.dbLoading}
            className="mt-6 w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-emerald-950 font-semibold py-3 rounded-lg">
            {state.dbLoading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────────
  const currentDraftYear = computeCurrentDraftYear();
  const draftYearTabs    = [0, 1, 2, 3].map((o) => currentDraftYear + o);

  const isSleeperDeclared = (p) =>
    !!state.sleeperByName[normalizeName(p.name)] &&
    p.projectedDraftYear >= currentDraftYear &&
    p.projectedDraftYear <= currentDraftYear + 1;

  const filtered = state.prospects.filter((p) => {
    if (!state.filters[p.position]) return false;
    if (p.projectedDraftYear < currentDraftYear) return false;
    const ann = state.annotations[p.id] || {};
    if (ann.declared || isSleeperDeclared(p)) return state.yearFilter === String(currentDraftYear);
    return String(p.projectedDraftYear) === state.yearFilter;
  });

  const withGrade = filtered.map((p) => {
    const sleeperRank = state.sleeperByName[normalizeName(p.name)]?.rank;
    const ann         = state.annotations[p.id] || {};
    const capitalKey  = ann.draftCapital || p.draftCapital || "";
    const { total: grade, components } = computeGrade(p, sleeperRank, capitalKey);
    return { p, grade, components, sleeperRank, ann, sleeperDeclared: isSleeperDeclared(p) };
  });

  const listQ   = state.listSearch.trim().toLowerCase();
  const byGrade = [...withGrade]
    .sort((a, b) => b.grade - a.grade)
    .filter((x) => !listQ || x.p.name.toLowerCase().includes(listQ) || deriveSchool(x.p).toLowerCase().includes(listQ));
  const byGradeRank = new Map(byGrade.map((x, i) => [x.p.id, i + 1]));
  const withValue   = withGrade.map((x) => ({ ...x, value: computeValueScore(x.p, x.grade, x.sleeperRank, state.rosterData) }));
  const byValue     = [...withValue].sort((a, b) => b.value - a.value);

  const upcomingAll = state.prospects
    .filter((p) => {
      if (p.projectedDraftYear < currentDraftYear) return false;
      const ann = state.annotations[p.id] || {};
      return ann.declared || isSleeperDeclared(p);
    })
    .map((p) => {
      const sleeperRank = state.sleeperByName[normalizeName(p.name)]?.rank;
      const ann         = state.annotations[p.id] || {};
      const capitalKey  = ann.draftCapital || p.draftCapital || "";
      const { total: grade, components } = computeGrade(p, sleeperRank, capitalKey);
      const suggestedTier = deriveTier(grade, capitalKey);
      const value = computeValueScore(p, grade, sleeperRank, state.rosterData);
      return { p, grade, components, sleeperRank, ann, sleeperDeclared: isSleeperDeclared(p), suggestedTier, value };
    })
    .filter((x) => state.filters[x.p.position])
    .filter((x) => !listQ || x.p.name.toLowerCase().includes(listQ) || deriveSchool(x.p).toLowerCase().includes(listQ))
    .sort((a, b) => {
      const aTierLabel = a.ann.tier || a.suggestedTier || "";
      const bTierLabel = b.ann.tier || b.suggestedTier || "";
      const aTier = aTierLabel ? (TIER_RANK[aTierLabel] ?? 99) : 99;
      const bTier = bTierLabel ? (TIER_RANK[bTierLabel] ?? 99) : 99;
      if (aTier !== bTier) return aTier - bTier;
      const aDs = dynastyScore(a.grade, a.p.position, a.p.seasons);
      const bDs = dynastyScore(b.grade, b.p.position, b.p.seasons);
      return bDs - aDs;
    });

  // Expert-rank-sorted list of all filtered prospects (for My Value tab)
  const rankedAll = [...withGrade]
    .filter((x) => !listQ || x.p.name.toLowerCase().includes(listQ) || deriveSchool(x.p).toLowerCase().includes(listQ))
    .sort((a, b) => {
      const aRank = state.expertRankings[a.p.id]?.rankOrder;
      const bRank = state.expertRankings[b.p.id]?.rankOrder;
      if (aRank != null && bRank != null) return aRank - bRank;
      if (aRank != null) return -1;
      if (bRank != null) return 1;
      return b.grade - a.grade;
    });
  const rankedAllPages = Math.ceil(rankedAll.length / PAGE_SIZE);

  // Archive: declared prospects whose draft year has already passed
  const archiveProspects = state.prospects
    .filter((p) => {
      if (!state.filters[p.position]) return false;
      if (p.projectedDraftYear >= currentDraftYear) return false;
      return !!(state.annotations[p.id]?.declared);
    })
    .map((p) => {
      const ann        = state.annotations[p.id] || {};
      const capitalKey = ann.draftCapital || p.draftCapital || "";
      const { total: grade, components } = computeGrade(p, undefined, capitalKey);
      const tierLabel  = ann.tier || deriveTier(grade, capitalKey) || "";
      return { p, ann, grade, components, tierLabel };
    })
    .sort((a, b) => {
      if (b.p.projectedDraftYear !== a.p.projectedDraftYear)
        return b.p.projectedDraftYear - a.p.projectedDraftYear;
      const aTier = a.tierLabel ? (TIER_RANK[a.tierLabel] ?? 99) : 99;
      const bTier = b.tierLabel ? (TIER_RANK[b.tierLabel] ?? 99) : 99;
      if (aTier !== bTier) return aTier - bTier;
      return b.grade - a.grade;
    });

  const maxListPages  = Math.max(Math.ceil(byGrade.length / PAGE_SIZE), rankedAllPages, 1);
  const page          = Math.min(state.page, maxListPages);
  const totalPages    = Math.ceil(byGrade.length / PAGE_SIZE);
  const pagedBoard    = byGrade.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedUpcoming = upcomingAll.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedRankedAll = rankedAll.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const upcomingPages = Math.ceil(upcomingAll.length / PAGE_SIZE);

  const TABS = [
    { id: "add",      label: "Add Player" },
    { id: "upcoming", label: "Upcoming Draft" },
    { id: "board",    label: "Prospect Board" },
    { id: "value",    label: "My Value" },
    { id: "archive",  label: "Archive" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400">Admin</div>
              <a href="/" className="text-[10px] text-slate-500 hover:text-slate-300 border border-white/5 px-2 py-0.5 rounded">← Dashboard</a>
            </div>
            <h1 className="text-xl font-bold">Dynasty Pre-Draft Prospector</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs ${Object.keys(state.sleeperByName).length ? "text-emerald-400" : "text-slate-600"}`}>
              {state.sleeperLoading ? "Sleeper…" : state.sleeperError ? "Sleeper error" : Object.keys(state.sleeperByName).length ? `Sleeper ✓` : "Sleeper —"}
            </span>
            {state.user && (
              <span className="text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-md">
                {state.user.username} <span className="text-slate-600">·</span> <span className="text-slate-500">{state.user.role}</span>
              </span>
            )}
            <button onClick={() => { clearSession(); update({ unlocked: false, user: null, usernameInput: "", passInput: "", prospects: [], annotations: {} }); if (onLogout) onLogout(); }}
              className="text-xs text-slate-400 hover:text-slate-100 border border-white/10 px-3 py-1.5 rounded-md">Logout</button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 flex gap-6 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => update({ tab: t.id, page: 1 })}
              className={`py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${state.tab === t.id ? "border-emerald-400 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Add Player tab */}
        {state.tab === "add" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-100">
                  {addForm.id ? `Editing: ${addForm.name || "Player"}` : "Add Player"}
                </h2>
                {addForm.id && (
                  <button onClick={() => setAddForm(initAddForm())}
                    className="text-xs text-slate-400 hover:text-slate-200 mt-0.5">
                    ← New player
                  </button>
                )}
              </div>
            </div>

            {/* Position selector */}
            <div className="flex gap-2 mb-5">
              {["QB","RB","WR","TE"].map((pos) => (
                <button key={pos}
                  onClick={() => setAddForm((f) => ({ ...f, position: pos }))}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    addForm.position === pos ? POS_COLORS[pos] : "border-white/10 text-slate-400 hover:text-slate-200"
                  }`}>
                  {pos}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-4">
              {/* Row 1: Name, Draft Year, Capital, Comp */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[160px]">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Player Name</label>
                  <input value={addForm.name} onChange={(e) => setFormField("name", e.target.value)}
                    placeholder="e.g. Travis Hunter"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Draft Year</label>
                  <input type="number" value={addForm.projectedDraftYear}
                    onChange={(e) => setFormField("projectedDraftYear", e.target.value)}
                    className="w-24 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">NFL Capital</label>
                  <CapitalSelect value={addForm.draftCapital} onChange={(v) => setFormField("draftCapital", v)} />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Comparable Player</label>
                  <input value={addForm.comparablePlayer} onChange={(e) => setFormField("comparablePlayer", e.target.value)}
                    placeholder="e.g. Stefon Diggs"
                    className="w-full bg-violet-500/10 border border-violet-400/20 rounded-lg px-3 py-2 text-sm text-violet-300 outline-none focus:border-violet-400/50" />
                </div>
              </div>

              {/* Row 2: Tier, Landing Spot, Rookie ADP, Declared */}
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Tier</label>
                  <TierSelect value={addForm.tier} onChange={(v) => setFormField("tier", v)} />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Landing Spot</label>
                  <input value={addForm.landingSpot} onChange={(e) => setFormField("landingSpot", e.target.value)}
                    placeholder="e.g. Dallas Cowboys"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-400" />
                </div>
                <div className="w-36">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Rookie Draft ADP</label>
                  <input value={addForm.rookieDraftAdp} onChange={(e) => setFormField("rookieDraftAdp", e.target.value)}
                    placeholder="e.g. 1.01"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-400" />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <input type="checkbox" id="form-declared" checked={addForm.declared}
                    onChange={(e) => setFormField("declared", e.target.checked)}
                    className="w-4 h-4 accent-emerald-400" />
                  <label htmlFor="form-declared" className="text-sm text-slate-300 cursor-pointer">Declared</label>
                </div>
              </div>

              {/* Season rows */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-2">Season Stats</label>
                <div className="space-y-2 overflow-x-auto pb-1">
                  {addForm.seasons.map((season, si) => (
                    <AddPlayerSeasonRow
                      key={si}
                      season={season}
                      position={addForm.position}
                      isFirst={si === 0}
                      onChange={(field, value) => updateFormSeason(si, field, value)}
                      onRemove={addForm.seasons.length > 1 ? () => removeFormSeason(si) : null}
                    />
                  ))}
                </div>
                <button onClick={addFormSeasonRow}
                  className="mt-2 text-xs text-slate-500 hover:text-emerald-300 transition-colors font-medium">
                  + Add Season
                </button>
              </div>

              {addFormError && <div className="text-rose-400 text-sm">{addFormError}</div>}
              <div className="flex items-center gap-3">
                <button onClick={handleSubmitPlayer} disabled={addFormSaving}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-emerald-950 font-semibold px-6 py-2 rounded-lg text-sm">
                  {addFormSaving ? "Saving…" : addForm.id ? "Update Player" : "Add Player"}
                </button>
                {addForm.id && (
                  <button onClick={() => setAddForm(initAddForm())}
                    className="text-sm text-slate-400 hover:text-slate-200 border border-white/10 px-4 py-2 rounded-lg">
                    Cancel Edit
                  </button>
                )}
                <span className="text-xs text-slate-500 ml-auto">{state.prospects.length} prospects in DB</span>
              </div>
            </div>
          </div>
        )}

        {/* Board / Value / Upcoming share the filter bar */}
        {state.tab !== "add" && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {["QB","RB","WR","TE"].map((pos) => (
              <button key={pos} onClick={() => update({ filters: { ...state.filters, [pos]: !state.filters[pos] } })}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${state.filters[pos] ? POS_COLORS[pos] : "border-white/10 text-slate-500 bg-slate-900/40"}`}>
                {pos}
              </button>
            ))}
            <div className="flex items-center gap-1">
              {draftYearTabs.map((y) => (
                <button key={y} onClick={() => update({ yearFilter: String(y), page: 1 })}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${state.yearFilter === String(y) ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"}`}>
                  {y}
                </button>
              ))}
            </div>
            <input value={state.listSearch} onChange={(e) => update({ listSearch: e.target.value, page: 1 })}
              placeholder="Search…"
              className="bg-slate-900 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 w-44" />
            <span className="text-xs text-slate-500 ml-auto">{filtered.length} / {state.prospects.length} prospects</span>
          </div>
        )}

        {/* Upcoming Draft — model rankings (tier → dynasty value) */}
        {state.tab === "upcoming" && (
          <div className="space-y-2">
            {upcomingAll.length > 0 && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">{upcomingAll.length} declared · sorted by tier → dynasty value</span>
              </div>
            )}
            {upcomingAll.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6 text-center text-slate-400 text-sm">
                No declared players yet. Sleeper-matched prospects appear here automatically, or click "Declare?" on any prospect card.
              </div>
            )}
            {pagedUpcoming.map((x, i) => (
              <ProspectCard key={x.p.id} p={x.p} rank={(page-1)*PAGE_SIZE+i+1} adp={x.sleeperRank} grade={x.grade} components={x.components}
                annotation={{ ...x.ann, tier: x.ann.tier || x.suggestedTier }}
                onAnnotate={(patch) => setAnnotation(x.p.id, patch)}
                onDeclareYear={(y) => declareWithYear(x.p.id, y)}
                sleeperDeclared={x.sleeperDeclared}
                onEdit={() => handleEditProspect(x.p)} />
            ))}
            <Pagination page={page} total={upcomingPages} onChange={(p) => update({ page: p })} />
          </div>
        )}

        {/* Prospect Board */}
        {state.tab === "board" && (
          <div className="space-y-2">
            {state.prospects.length === 0 && (
              <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-6 text-center text-sm">
                <div className="text-violet-300 font-semibold mb-1">No prospects yet</div>
                <p className="text-slate-400">Head to the <button onClick={() => update({ tab: "add" })} className="text-emerald-400 underline">Add Player</button> tab to add your first player.</p>
              </div>
            )}
            {pagedBoard.map((x, i) => (
              <ProspectCard key={x.p.id} p={x.p} rank={(page-1)*PAGE_SIZE+i+1} adp={x.sleeperRank} grade={x.grade} components={x.components}
                annotation={x.ann} onAnnotate={(patch) => setAnnotation(x.p.id, patch)}
                onDeclareYear={(y) => declareWithYear(x.p.id, y)}
                sleeperDeclared={x.sleeperDeclared}
                onEdit={() => handleEditProspect(x.p)} />
            ))}
            <Pagination page={page} total={totalPages} onChange={(p) => update({ page: p })} />
          </div>
        )}

        {/* My Value — expert rankings with reorder arrows */}
        {state.tab === "value" && (
          <div className="space-y-2">
            {rankedAll.length > 0 && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">{rankedAll.length} prospects · use ▲▼ to set your rankings</span>
                <button onClick={autoRankUpcoming}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md border border-sky-400/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-colors">
                  Sync to model order
                </button>
              </div>
            )}
            {pagedRankedAll.map((x, i) => {
              const globalIdx = (page - 1) * PAGE_SIZE + i;
              const hasRank   = state.expertRankings[x.p.id] != null;
              return (
                <div key={x.p.id} className="flex gap-1 items-start">
                  <div className="flex flex-col gap-0.5 pt-5 shrink-0">
                    <button onClick={() => moveRank(x.p.id, "up")}
                      disabled={globalIdx === 0 || !hasRank}
                      className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[10px] leading-none px-1 py-0.5">▲</button>
                    <button onClick={() => moveRank(x.p.id, "down")}
                      disabled={globalIdx === rankedAll.length - 1 || !hasRank}
                      className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[10px] leading-none px-1 py-0.5">▼</button>
                  </div>
                  <div className="flex-1">
                    <ProspectCard p={x.p} rank={globalIdx + 1} adp={x.sleeperRank} grade={x.grade} components={x.components}
                      annotation={x.ann} onAnnotate={(patch) => setAnnotation(x.p.id, patch)}
                      onDeclareYear={(y) => declareWithYear(x.p.id, y)}
                      sleeperDeclared={x.sleeperDeclared}
                      onEdit={() => handleEditProspect(x.p)} />
                  </div>
                </div>
              );
            })}
            <Pagination page={page} total={rankedAllPages} onChange={(p) => update({ page: p })} />
          </div>
        )}

        {/* Archive — declared prospects from past draft classes */}
        {state.tab === "archive" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-slate-500">{archiveProspects.length} archived prospects</span>
            </div>
            {archiveProspects.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-10 text-center text-slate-500 text-sm">
                No archived prospects yet. Players declared for a past draft year will appear here.
              </div>
            )}
            {archiveProspects.length > 0 && (() => {
              const byYear = {};
              archiveProspects.forEach((x) => {
                const y = x.p.projectedDraftYear || "Unknown";
                (byYear[y] ??= []).push(x);
              });
              return Object.keys(byYear).sort((a, b) => Number(b) - Number(a)).map((year) => (
                <div key={year} className="mb-6">
                  <div className="text-xs uppercase tracking-widest text-slate-500 mb-2 font-semibold">{year} Draft Class</div>
                  <div className="space-y-2">
                    {byYear[year].map((x, i) => {
                      const cap  = x.ann.draftCapital || x.p.draft_capital || "";
                      const comp = x.p.comparablePlayer || "";
                      return (
                        <div key={x.p.id} className="rounded-xl border border-white/10 bg-slate-900/60 px-5 py-3 flex items-center gap-4">
                          <div className="w-6 text-center shrink-0">
                            <span className="text-sm font-bold text-slate-500">{i + 1}</span>
                          </div>
                          <GradeBadge score={x.grade} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="font-semibold text-slate-100">{x.p.name}</span>
                              <Pill pos={x.p.position} />
                              {x.tierLabel && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  x.ann.tier ? "bg-slate-700 text-slate-200" : "bg-slate-800 text-slate-400"
                                }`}>{x.tierLabel}</span>
                              )}
                              {comp && <span className="text-[10px] text-violet-300 bg-violet-500/15 border border-violet-400/30 px-1.5 py-0.5 rounded">Comp: {comp}</span>}
                            </div>
                            <div className="text-xs text-slate-500 flex gap-3 flex-wrap">
                              {cap && <span className="capitalize"><span className="text-slate-600">NFL:</span> {cap.replace(/_/g, " ")}</span>}
                              {x.ann.landingSpot && <><span className="text-slate-700">·</span><span>{x.ann.landingSpot}</span></>}
                            </div>
                          </div>
                          <button onClick={() => handleEditProspect(x.p)}
                            className="text-xs text-slate-400 hover:text-slate-200 border border-white/10 hover:border-sky-400/40 px-2 py-1 rounded shrink-0">
                            Edit
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

      </main>
    </div>
  );
}
