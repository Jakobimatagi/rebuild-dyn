import { useEffect, useMemo, useRef, useState } from "react";
import { captureShareImage, tiktokFilename } from "../lib/shareImage.js";
import TikTokFrame from "./TikTokFrame.jsx";
import { adminSignIn, restoreAdmin, signOutAccount, fetchOcEntries, fetchAllRows } from "../lib/supabase.js";
import {
  fetchSleeper,
  fetchHistoricalStats,
  fetchDeepHistoricalStats,
} from "../lib/sleeperApi.js";
import { fetchFantasyCalcValues } from "../lib/fantasyCalcApi.js";
import { fetchRosterAuditValues, buildRosterAuditContext } from "../lib/rosterAuditApi.js";
import { buildFantasyCalcContext } from "../lib/fantasyCalcBlend.js";
import { buildBenchmarks, DEFAULT_SCORING_WEIGHTS } from "../lib/scoringEngine.js";
import { getLeagueRulesContext } from "../lib/marketValue.js";
import { buildPredictionContext } from "../lib/predictionEngine.js";
import { buildOcOutlookContext } from "../lib/ocAdjustment.js";
import { loadOcOverrides } from "../lib/ocData.js";
import { buildRosterSnapshot } from "../lib/rosterBuilder.js";
import { useModalBehavior } from "../lib/useModalBehavior.js";
import { fetchDeepDiveArticles, buildDeepDiveArticleInput } from "../lib/aiShareBlurbsApi.js";
import { DeepDiveShareCard, slugify } from "./dashboard/DeepDiveShareModal.jsx";

// Admin content-creation page (/admin/deep-dive-cards): search any player —
// from the live Sleeper active-player pool or the rookie prospects DB — queue
// them up (grouped by NFL team), and batch-export the same deep-dive share
// card PNG the dashboard's deep dive modal produces. Players are enriched
// through the identical synthetic-roster buildRosterSnapshot pass the
// This-or-That / waiver pools use, against a default 12-team SF full-PPR
// league, so the cards match what the dashboard shows.

const POS_COLORS = {
  QB: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  RB: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  WR: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  TE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const POSITIONS = new Set(["QB", "RB", "WR", "TE"]);

// Default dynasty profile — 12-team superflex full-PPR, same as AdminTopPlayers.
const DEFAULT_LEAGUE = {
  total_rosters: 12,
  roster_positions: [
    "QB", "RB", "RB", "WR", "WR", "WR",
    "TE", "FLEX", "FLEX", "SUPER_FLEX",
    "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN",
  ],
  scoring_settings: { rec: 1 },
};

const SELECTED_STORAGE_KEY = "admin_deepdive_selected_ids";
const MAX_SELECTED = 40;

function lastCompletedSeasonYear() {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

// Normalize a player name for cross-source matching (prospects DB has no
// sleeper_id, so rookies are joined to Sleeper by name + position).
function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/[.'’-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sleeperPhoto(id) {
  if (!id) return null;
  return `https://sleepercdn.com/content/nfl/players/${id}.jpg`;
}

function PlayerAvatar({ id, name, size = "w-9 h-9" }) {
  const [errored, setErrored] = useState(false);
  const initials = (name || "")
    .split(" ")
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const url = sleeperPhoto(id);
  if (!url || errored) {
    return (
      <div className={`${size} rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-[10px] font-bold text-slate-300 shrink-0`}>
        {initials || "—"}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      onError={() => setErrored(true)}
      className={`${size} rounded-full bg-slate-800 border border-white/10 object-cover shrink-0`}
    />
  );
}

function PosPill({ pos }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${POS_COLORS[pos] || "border-white/10 text-slate-400"}`}>
      {pos}
    </span>
  );
}

export default function AdminDeepDiveCards() {
  const [unlocked, setUnlocked] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [emailInput, setEmailInput] = useState("");
  const [passInput, setPassInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [ctx, setCtx] = useState(null); // model contexts + search pools

  const [source, setSource] = useState("active"); // 'active' | 'rookies'
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState(() => {
    try {
      const raw = localStorage.getItem(SELECTED_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  });
  const [showShare, setShowShare] = useState(false);
  const [tiktok, setTiktok] = useState(false);
  const [downloading, setDownloading] = useState(null); // player id, or "all"
  const [articles, setArticles] = useState(() => new Map()); // player id → article skeleton
  const [articlesLoading, setArticlesLoading] = useState(false);
  const [articlesError, setArticlesError] = useState("");
  const shareRefs = useRef({});

  useEffect(() => {
    try {
      localStorage.setItem(SELECTED_STORAGE_KEY, JSON.stringify(selectedIds));
    } catch {
      // storage full / private mode — selection just won't survive reload
    }
  }, [selectedIds]);

  // ── Session restore ────────────────────────────────────────────────────────
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

  // ── Load data + build model contexts once unlocked ─────────────────────────
  useEffect(() => {
    if (!unlocked || ctx) return;
    let cancelled = false;
    setDataLoading(true);
    setDataError("");

    (async () => {
      try {
        const lastSeason = lastCompletedSeasonYear();

        const [
          players,
          stats24,
          stats23,
          stats22,
          stats21,
          stats20,
          stats19,
          stats18,
          stats17,
          stats16,
          fcValues,
          raValues,
          ocDbOverrides,
          prospects,
        ] = await Promise.all([
          fetchSleeper("/players/nfl"),
          fetchSleeper(`/stats/nfl/regular/${lastSeason}`).catch(() => ({})),
          fetchSleeper(`/stats/nfl/regular/${lastSeason - 1}`).catch(() => ({})),
          fetchSleeper(`/stats/nfl/regular/${lastSeason - 2}`).catch(() => ({})),
          fetchHistoricalStats(2021),
          fetchHistoricalStats(2020),
          fetchHistoricalStats(2019),
          fetchHistoricalStats(2018),
          fetchDeepHistoricalStats(2017),
          fetchDeepHistoricalStats(2016),
          fetchFantasyCalcValues(DEFAULT_LEAGUE).catch(() => []),
          fetchRosterAuditValues(DEFAULT_LEAGUE).catch(() => []),
          fetchOcEntries().catch(() => loadOcOverrides()),
          fetchAllRows("prospects", "id,name,position,projected_draft_year").catch(() => []),
        ]);

        if (cancelled) return;

        const historicalStats = [
          { year: 2021, stats: stats21 },
          { year: 2020, stats: stats20 },
          { year: 2019, stats: stats19 },
          { year: 2018, stats: stats18 },
          { year: 2017, stats: stats17 },
          { year: 2016, stats: stats16 },
        ];

        const leagueContext = getLeagueRulesContext(DEFAULT_LEAGUE);
        const benchmarks = buildBenchmarks(
          players,
          stats22,
          stats23,
          stats24,
          leagueContext,
          historicalStats,
          lastSeason,
        );
        const fcContext = buildFantasyCalcContext(fcValues || []);
        const raContext = buildRosterAuditContext(raValues || [], null, "sf");
        const predictionContext = buildPredictionContext(
          [
            { year: lastSeason, stats: stats24 },
            { year: lastSeason - 1, stats: stats23 },
            { year: lastSeason - 2, stats: stats22 },
            ...historicalStats,
          ],
          players,
          benchmarks.ageCurves,
        );
        const ocOutlookContext = buildOcOutlookContext({
          targetSeason: lastSeason + 1,
          statsByYear: [
            { year: lastSeason, stats: stats24 },
            { year: lastSeason - 1, stats: stats23 },
            { year: lastSeason - 2, stats: stats22 },
          ],
          players,
          ocOverrides: ocDbOverrides || {},
        });

        // Market value lookup for search ranking (RA fills FC gaps).
        const valueOf = (id) => {
          const key = String(id);
          return Number(
            fcContext.bySleeperId.get(key)?.value ??
            raContext.bySleeperId.get(key)?.value ??
            0,
          );
        };

        // Active-player search pool, market value descending so the relevant
        // guys surface first when a query matches many names.
        const searchPool = [];
        const sleeperByName = new Map(); // normalized "name|pos" and name → id
        Object.entries(players || {}).forEach(([id, p]) => {
          const pos = p?.fantasy_positions?.[0] || p?.position;
          if (!POSITIONS.has(pos)) return;
          if (p.active === false) return;
          const name =
            p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim();
          if (!name) return;
          const entry = {
            id: String(id),
            name,
            position: pos,
            team: p.team || "FA",
            age: p.age || null,
            yearsExp: p.years_exp ?? null,
            value: valueOf(id),
          };
          searchPool.push(entry);
          const norm = normalizeName(name);
          const keyed = `${norm}|${pos}`;
          // First writer wins on collisions — pools are value-sorted below, but
          // at insert time prefer players on a team over free agents.
          const existing = sleeperByName.get(keyed);
          if (!existing || (players[existing]?.team == null && p.team)) {
            sleeperByName.set(keyed, String(id));
          }
          if (!sleeperByName.has(norm)) sleeperByName.set(norm, String(id));
        });
        searchPool.sort((a, b) => b.value - a.value);

        // Rookie prospects joined to Sleeper by name (+position when it agrees).
        // Unmatched prospects (pre-draft, not yet in Sleeper) render disabled —
        // the card needs Sleeper stats/market data to exist.
        const rookiePool = (prospects || [])
          .map((pr) => {
            const norm = normalizeName(pr.name);
            const sleeperId =
              sleeperByName.get(`${norm}|${pr.position}`) ||
              sleeperByName.get(norm) ||
              null;
            const sp = sleeperId ? players[sleeperId] : null;
            return {
              prospectId: pr.id,
              id: sleeperId,
              name: pr.name,
              position: pr.position,
              team: sp?.team || null,
              draftYear: pr.projected_draft_year || null,
              value: sleeperId ? valueOf(sleeperId) : 0,
            };
          })
          .sort(
            (a, b) =>
              (b.draftYear || 0) - (a.draftYear || 0) ||
              b.value - a.value ||
              a.name.localeCompare(b.name),
          );

        setCtx({
          players,
          stats24: stats24 || {},
          stats23: stats23 || {},
          stats22: stats22 || {},
          benchmarks,
          leagueContext,
          fcContext,
          raContext,
          predictionContext,
          ocOutlookContext,
          lastSeason,
          futureSeasons: [lastSeason + 1, lastSeason + 2, lastSeason + 3],
          searchPool,
          rookiePool,
        });
        setDataLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setDataError(err.message || "Failed to load player data.");
        setDataLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [unlocked, ctx]);

  // ── Search ──────────────────────────────────────────────────────────────────
  // Every whitespace token must match: name substring, team abbr, or position.
  // "kc wr" → all Chiefs WRs; "buf" → all Bills — team queries make it easy to
  // queue a whole offense for team-grouped content.
  const results = useMemo(() => {
    if (!ctx) return [];
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const pool = source === "rookies" ? ctx.rookiePool : ctx.searchPool;
    const matches = tokens.length
      ? pool.filter((p) =>
          tokens.every(
            (t) =>
              p.name.toLowerCase().includes(t) ||
              (p.team || "").toLowerCase() === t ||
              p.position.toLowerCase() === t,
          ),
        )
      : pool;
    return matches.slice(0, source === "rookies" ? 80 : 60);
  }, [ctx, source, query]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  function addPlayer(id) {
    if (!id) return;
    setSelectedIds((prev) =>
      prev.includes(id) || prev.length >= MAX_SELECTED ? prev : [...prev, id],
    );
  }

  function removePlayer(id) {
    setSelectedIds((prev) => prev.filter((x) => x !== id));
  }

  function addAllResults() {
    setSelectedIds((prev) => {
      const next = [...prev];
      for (const r of results) {
        if (next.length >= MAX_SELECTED) break;
        if (r.id && !next.includes(r.id)) next.push(r.id);
      }
      return next;
    });
  }

  // ── Enrichment — synthetic roster through the full deep-dive model ─────────
  const enriched = useMemo(() => {
    if (!ctx || !selectedIds.length) return [];
    return buildRosterSnapshot(
      { roster_id: -1, players: selectedIds },
      ctx.players,
      DEFAULT_LEAGUE,
      [],
      ctx.stats24,
      ctx.stats23,
      ctx.stats22,
      ctx.benchmarks,
      DEFAULT_SCORING_WEIGHTS,
      new Map(),
      ctx.leagueContext,
      ctx.fcContext,
      ctx.futureSeasons,
      ctx.lastSeason,
      ctx.predictionContext,
      ctx.raContext,
      ctx.ocOutlookContext,
      new Set(),
      null,
      null,
    ).enriched;
  }, [ctx, selectedIds]);

  // Team-grouped view of the queue — the whole point of the page: batch cards
  // per NFL team for content threads.
  const byTeam = useMemo(() => {
    const groups = new Map();
    for (const p of enriched) {
      const team = p.team || "FA";
      if (!groups.has(team)) groups.set(team, []);
      groups.get(team).push(p);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [enriched]);

  const enrichedIds = useMemo(() => new Set(enriched.map((p) => String(p.id))), [enriched]);
  const unenrichable = selectedIds.filter((id) => !enrichedIds.has(String(id)));

  // Selection metadata for the queue panel (works even before enrichment runs).
  function selectionMeta(id) {
    const p = ctx?.players?.[id];
    if (!p) return { name: `Player ${id}`, position: "", team: "FA" };
    return {
      name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      position: p.fantasy_positions?.[0] || p.position || "",
      team: p.team || "FA",
    };
  }

  const selectedByTeam = useMemo(() => {
    const groups = new Map();
    for (const id of selectedIds) {
      const meta = selectionMeta(id);
      if (!groups.has(meta.team)) groups.set(meta.team, []);
      groups.get(meta.team).push({ id, ...meta });
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds, ctx]);

  function cardFilename(player) {
    return tiktokFilename(
      `deepdive-${(player.team || "fa").toLowerCase()}-${slugify(player.name)}.png`,
      tiktok,
    );
  }

  async function downloadOne(player) {
    const node = shareRefs.current[String(player.id)];
    if (!node) return;
    setDownloading(String(player.id));
    try {
      const dataUrl = await captureShareImage(node, { tiktok });
      const link = document.createElement("a");
      link.download = cardFilename(player);
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to generate deep dive image:", err);
    } finally {
      setDownloading(null);
    }
  }

  // AI article notes — one skeleton (headline, hook, key points, verdict) per
  // queued player, generated in chunks of 6 so a full 40-player queue doesn't
  // blow the model's output budget in one request. Chunk results are cached by
  // player-set fingerprint in the lib, so a re-open with the same queue is free.
  const ARTICLE_CHUNK = 6;

  async function generateArticles({ force = false } = {}) {
    if (!enriched.length || articlesLoading) return;
    setArticlesLoading(true);
    setArticlesError("");
    try {
      const inputs = enriched.map(buildDeepDiveArticleInput);
      const scope = { season: ctx.lastSeason + 1 };
      const next = new Map(force ? [] : articles);
      for (let i = 0; i < inputs.length; i += ARTICLE_CHUNK) {
        const chunk = inputs.slice(i, i + ARTICLE_CHUNK);
        const pending = force ? chunk : chunk.filter((p) => !next.has(p.id));
        if (!pending.length) continue;
        const { articlesById } = await fetchDeepDiveArticles(pending, scope, { force });
        for (const [id, article] of articlesById) next.set(id, article);
        setArticles(new Map(next)); // progressive render as chunks land
      }
    } catch (err) {
      console.error("Article notes failed:", err);
      setArticlesError(String(err.message || err));
    } finally {
      setArticlesLoading(false);
    }
  }

  async function downloadAll() {
    setDownloading("all");
    for (const [, teamPlayers] of byTeam) {
      for (const player of teamPlayers) {
        const node = shareRefs.current[String(player.id)];
        if (!node) continue;
        try {
          const dataUrl = await captureShareImage(node, { tiktok });
          const link = document.createElement("a");
          link.download = cardFilename(player);
          link.href = dataUrl;
          link.click();
          await new Promise((r) => setTimeout(r, 250));
        } catch (err) {
          console.error(`Failed to generate card for ${player.name}:`, err);
        }
      }
    }
    setDownloading(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────
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
          <div className="text-emerald-400 text-xs uppercase tracking-widest mb-2">Admin · Deep Dive Cards</div>
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center flex-wrap gap-2 mb-1.5">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400">Admin</div>
              <a href="/" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">← Dashboard</a>
              <a href="/admin/top-players" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Top Players</a>
              <a href="/admin/rookie-prospector" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Rookies</a>
              <a href="/admin/oc-rankings" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">OC Rankings</a>
              <a href="/admin/dc-rankings" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">DC Rankings</a>
              <a href="/admin/hot-streaks" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Hot &amp; Cold</a>
              <a href="/admin/users" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Admins</a>
            </div>
            <h1 className="text-xl font-bold">Deep Dive Cards · Share Export</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Search Sleeper actives or the rookie prospect DB, queue players by team, export deep-dive PNG cards. Model context: 12-team SF full-PPR.
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
        {dataLoading && !ctx && (
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-10 text-center text-slate-400 text-sm">
            Loading Sleeper, FantasyCalc, RosterAudit, OC, and prospect data…
          </div>
        )}
        {dataError && (
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200 mb-4">
            {dataError}
          </div>
        )}

        {ctx && (
          <>
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="flex gap-1">
                {[
                  { key: "active", label: "Active players" },
                  { key: "rookies", label: `Rookie DB · ${ctx.rookiePool.length}` },
                ].map((s) => (
                  <button key={s.key} onClick={() => setSource(s.key)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                      source === s.key
                        ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                        : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, team, position… (e.g. “kc wr”)"
                className="bg-slate-900 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 w-64" />
              <button onClick={addAllResults}
                disabled={!results.some((r) => r.id && !selectedSet.has(r.id))}
                title={`Add every shown result to the queue (max ${MAX_SELECTED} total)`}
                className="px-3 py-1.5 rounded-md text-xs font-semibold border border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700 disabled:opacity-40">
                + Add all shown
              </button>
              <div className="ml-auto flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {selectedIds.length}/{MAX_SELECTED} queued
                </span>
                <button onClick={() => setShowShare(true)}
                  disabled={!enriched.length}
                  title="Open the deep-dive share cards for every queued player"
                  className="px-3 py-1.5 rounded-md text-xs font-semibold border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40">
                  Share Cards{enriched.length ? ` · ${enriched.length}` : ""}
                </button>
              </div>
            </div>

            {unenrichable.length > 0 && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200 mb-4">
                {unenrichable.length} queued player{unenrichable.length > 1 ? "s" : ""} couldn't be enriched (missing from the Sleeper player DB) and won't get a card.
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Search results */}
              <section className="lg:col-span-2">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                  {source === "rookies" ? "Rookie prospects (Supabase)" : "Active players (Sleeper)"} · {results.length} shown
                </div>
                <div className="space-y-1.5">
                  {results.map((r) => {
                    const added = r.id && selectedSet.has(r.id);
                    const matchable = !!r.id;
                    return (
                      <div key={r.prospectId ?? r.id}
                        className={`rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 flex items-center gap-3 ${matchable ? "" : "opacity-50"}`}>
                        <PlayerAvatar id={r.id} name={r.name} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-slate-100 font-semibold text-sm truncate">{r.name}</span>
                            <PosPill pos={r.position} />
                            <span className="text-[10px] text-slate-400 border border-white/10 px-1.5 py-0.5 rounded">{r.team || "—"}</span>
                            {r.draftYear && (
                              <span className="text-[10px] text-slate-500">{r.draftYear} class</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-0.5">
                            {matchable
                              ? `market ${Math.round(r.value)}`
                              : "not in Sleeper yet — no card data"}
                          </div>
                        </div>
                        <button onClick={() => addPlayer(r.id)}
                          disabled={!matchable || added || selectedIds.length >= MAX_SELECTED}
                          className={`text-xs font-semibold px-3 py-1.5 rounded border shrink-0 ${
                            added
                              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
                              : "border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                          }`}>
                          {added ? "✓ Queued" : "+ Add"}
                        </button>
                      </div>
                    );
                  })}
                  {!results.length && (
                    <div className="rounded-xl border border-white/10 bg-slate-900/40 p-8 text-center text-slate-500 text-sm">
                      No players match “{query}”.
                    </div>
                  )}
                </div>
              </section>

              {/* Queue, grouped by team */}
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] uppercase tracking-widest text-slate-500">Card queue · by team</div>
                  {selectedIds.length > 0 && (
                    <button onClick={() => setSelectedIds([])}
                      className="text-[10px] text-slate-500 hover:text-rose-300">Clear all</button>
                  )}
                </div>
                {selectedByTeam.length === 0 && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6 text-center text-slate-500 text-xs">
                    Nothing queued yet — add players from the search results.
                  </div>
                )}
                <div className="space-y-3">
                  {selectedByTeam.map(([team, teamPlayers]) => (
                    <div key={team} className="rounded-lg border border-white/10 bg-slate-900/60 overflow-hidden">
                      <div className="px-3 py-1.5 bg-slate-800/60 text-[11px] font-bold text-slate-300 flex items-center justify-between">
                        <span>{team}</span>
                        <span className="text-slate-500 font-normal">{teamPlayers.length}</span>
                      </div>
                      <div className="divide-y divide-white/5">
                        {teamPlayers.map((p) => (
                          <div key={p.id} className="px-3 py-1.5 flex items-center gap-2">
                            <PlayerAvatar id={p.id} name={p.name} size="w-6 h-6" />
                            <span className="text-xs text-slate-200 truncate flex-1">{p.name}</span>
                            <PosPill pos={p.position} />
                            <button onClick={() => removePlayer(p.id)}
                              aria-label={`Remove ${p.name}`}
                              className="text-slate-500 hover:text-rose-300 text-sm leading-none px-1">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}
      </main>

      {showShare && (
        <CardsShareModal
          byTeam={byTeam}
          shareRefs={shareRefs}
          tiktok={tiktok}
          setTiktok={setTiktok}
          downloading={downloading}
          articles={articles}
          articlesLoading={articlesLoading}
          articlesError={articlesError}
          onGenerateArticles={generateArticles}
          onDownloadOne={downloadOne}
          onDownloadAll={downloadAll}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

function CardsShareModal({
  byTeam, shareRefs, tiktok, setTiktok, downloading,
  articles, articlesLoading, articlesError, onGenerateArticles,
  onDownloadOne, onDownloadAll, onClose,
}) {
  const modalRef = useModalBehavior(onClose);
  const total = byTeam.reduce((acc, [, ps]) => acc + ps.length, 0);
  const articleCount = byTeam.reduce(
    (acc, [, ps]) => acc + ps.filter((p) => articles?.has(String(p.id))).length,
    0,
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div
        ref={modalRef}
        className="w-full h-full flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="Deep dive share cards"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 border-b border-white/10 px-6 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Share</span>
          <span className="text-sm text-slate-200">
            Deep dive cards · {total} player{total !== 1 ? "s" : ""} · {byTeam.length} team{byTeam.length !== 1 ? "s" : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {articlesError && (
              <span className="text-[10px] text-rose-300 max-w-[240px] truncate" title={articlesError}>
                {articlesError}
              </span>
            )}
            {!articlesError && articleCount > 0 && !articlesLoading && (
              <span className="text-[10px] text-slate-400">notes ✓ {articleCount}/{total}</span>
            )}
            <button onClick={() => onGenerateArticles({ force: articleCount >= total })}
              disabled={articlesLoading || !total}
              title="AI article skeleton per player — headline, hook, key points, verdict — from the card's model numbers"
              className="text-xs font-semibold px-3 py-1.5 rounded border border-amber-400/50 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-40">
              {articlesLoading
                ? `Writing notes… ${articleCount}/${total}`
                : articleCount >= total && total > 0
                ? "Regenerate article notes"
                : "✍ Generate article notes"}
            </button>
            <button onClick={() => setTiktok((v) => !v)}
              title="Export as 1080×1920 vertical cards sized for TikTok / Reels / Shorts"
              className={`text-xs font-semibold px-3 py-1.5 rounded border ${
                tiktok
                  ? "border-fuchsia-400/70 bg-fuchsia-500/20 text-fuchsia-100"
                  : "border-white/15 bg-slate-900/40 text-slate-300 hover:text-slate-100"
              }`}>
              📱 TikTok 9:16 {tiktok ? "on" : "off"}
            </button>
            <button onClick={onDownloadAll}
              disabled={downloading != null || !total}
              className="text-xs font-semibold px-3 py-1.5 rounded border border-emerald-400/60 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40">
              {downloading === "all" ? "Generating all…" : `Download all (${total} PNGs)`}
            </button>
            <button onClick={onClose}
              aria-label="Close share cards"
              className="text-slate-400 hover:text-slate-100 text-lg leading-none px-2">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-8">
          {byTeam.map(([team, teamPlayers]) => (
            <div key={team} className="flex flex-col items-center gap-4">
              <div className="self-start text-sm font-bold text-slate-300 border border-white/15 bg-slate-800/70 px-3 py-1 rounded-md">
                {team} · {teamPlayers.length}
              </div>
              {teamPlayers.map((player) => (
                <div key={player.id} className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{player.name} · {player.position}</span>
                    <button onClick={() => onDownloadOne(player)}
                      disabled={downloading != null}
                      className="text-xs font-semibold px-3 py-1 rounded border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40">
                      {downloading === String(player.id) ? "Generating…" : "Download PNG"}
                    </button>
                  </div>
                  <TikTokFrame enabled={tiktok}>
                    <DeepDiveShareCard
                      innerRef={(el) => { shareRefs.current[String(player.id)] = el; }}
                      player={player}
                    />
                  </TikTokFrame>
                  <ArticleNotesPanel player={player} article={articles?.get(String(player.id))} />
                </div>
              ))}
            </div>
          ))}
          {!total && (
            <div className="text-slate-500 text-sm">No enriched players to render.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Assemble the copy-paste Markdown draft for one player's article notes.
function articleMarkdown(player, article) {
  const lines = [
    `# ${article.headline || player.name}`,
    "",
    article.hook || "",
    "",
    "## Key Points",
    "",
    ...(article.keyPoints || []).map((pt) => `- ${pt}`),
    "",
    "## Verdict",
    "",
    article.verdict || "",
  ];
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// AI article skeleton under each share card: headline, hook, key points, and
// verdict, with a one-click Markdown copy so a card's story drops straight
// into a draft. Renders nothing until notes have been generated.
function ArticleNotesPanel({ player, article }) {
  const [copied, setCopied] = useState(false);
  if (!article) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(articleMarkdown(player, article));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("Clipboard write failed:", err);
    }
  }

  return (
    <div className="w-[1080px] max-w-full rounded-lg border border-amber-400/25 bg-slate-900/70 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-amber-300/80 font-bold mb-1">
            Article notes · AI
          </div>
          <div className="text-base font-bold text-slate-100">{article.headline}</div>
        </div>
        <button onClick={copy}
          className="text-xs font-semibold px-3 py-1 rounded border border-white/15 bg-slate-800/70 text-slate-200 hover:bg-slate-700 shrink-0">
          {copied ? "✓ Copied" : "Copy Markdown"}
        </button>
      </div>
      {article.hook && (
        <p className="text-sm text-slate-300 italic leading-snug mb-3">{article.hook}</p>
      )}
      {(article.keyPoints || []).length > 0 && (
        <ul className="space-y-1.5 mb-3">
          {article.keyPoints.map((pt, i) => (
            <li key={i} className="text-sm text-slate-200 leading-snug flex gap-2">
              <span className="text-amber-300/70 shrink-0">·</span>
              <span>{pt}</span>
            </li>
          ))}
        </ul>
      )}
      {article.verdict && (
        <div className="text-sm text-slate-100 border-t border-white/10 pt-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 mr-2">Verdict</span>
          {article.verdict}
        </div>
      )}
    </div>
  );
}
