import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { fetchShareBlurbs, buildTopPlayerBlurbInput } from "../lib/aiShareBlurbsApi.js";
import { verifyLogin, fetchOcEntries } from "../lib/supabase.js";
import {
  fetchSleeper,
  fetchHistoricalStats,
  fetchDeepHistoricalStats,
} from "../lib/sleeperApi.js";
import { fetchFantasyCalcValues } from "../lib/fantasyCalcApi.js";
import { fetchRosterAuditValues } from "../lib/rosterAuditApi.js";
import {
  buildBenchmarks,
  calcScore,
  clamp,
  DEFAULT_SCORING_WEIGHTS,
} from "../lib/scoringEngine.js";
import { buildFantasyCalcContext, normalizeFantasyCalcValue, normalizeRosterAuditValue } from "../lib/fantasyCalcBlend.js";
import { buildRosterAuditContext } from "../lib/rosterAuditApi.js";
import { buildOcOutlookContext, buildPlayerOcOutlook } from "../lib/ocAdjustment.js";
import { loadOcOverrides } from "../lib/ocData.js";
import { useModalBehavior } from "../lib/useModalBehavior.js";
import { loadSession, saveSession, clearSession } from "./rookieAdmin/utils.js";

const POS_COLORS = {
  QB: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  RB: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  WR: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  TE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

// Cuts tightened after observing FC + RA cluster the top ~35-40 dynasty players
// at 90+ in normalized space. Pre-tighten S held 39 players ("cornerstone" should
// be ~10-15). Each cut moves up 5 to spread the curve out: S ≥ 95, A ≥ 85, etc.
const TIERS = [
  { key: "S", min: 95, label: "S",  desc: "Elite — cornerstone",       cls: "bg-yellow-400 text-yellow-950 border-yellow-300" },
  { key: "A", min: 85, label: "A",  desc: "Foundational starter",      cls: "bg-emerald-400 text-emerald-950 border-emerald-300" },
  { key: "B", min: 75, label: "B",  desc: "Strong starter / WR2-RB2",  cls: "bg-sky-400 text-sky-950 border-sky-300" },
  { key: "C", min: 65, label: "C",  desc: "Useful contributor / flex", cls: "bg-violet-400 text-violet-950 border-violet-300" },
  { key: "D", min: 55, label: "D",  desc: "Bench / dart throw",        cls: "bg-orange-400 text-orange-950 border-orange-300" },
];

function tierFor(score) {
  for (const t of TIERS) if (score >= t.min) return t;
  return null;
}

// Split a ranked list into pages around a target size, balancing the last
// page so we don't end up with a 2-player tail card (top-50 → 5 pages of
// 10, not 4×12 + 1×2). Returns [{ players, startRank, part, total }].
function splitIntoPages(players, target = 12) {
  const total = players.length;
  if (total === 0) return [];
  const numPages = Math.max(1, Math.ceil(total / target));
  const baseSize = Math.floor(total / numPages);
  const remainder = total % numPages;
  const pages = [];
  let start = 0;
  for (let i = 0; i < numPages; i++) {
    const size = baseSize + (i < remainder ? 1 : 0);
    pages.push({
      players: players.slice(start, start + size),
      startRank: start + 1,
      part: i + 1,
      total: numPages,
    });
    start += size;
  }
  return pages;
}

// TE Premium boost — half-TEP / full-TEP market consensus sits between +10%
// and +15% on TE dynasty value. FC/RA APIs don't expose TEP so we apply this
// post-hoc when the toggle is on.
const TEP_BOOST = 1.12;

// Default dynasty profile — 12-team superflex full-PPR. Used by the league-aware
// helpers (FC params, RA format, replacement-level benchmarks) so the model has
// the same context shape it gets in a real league.
const DEFAULT_LEAGUE = {
  total_rosters: 12,
  roster_positions: [
    "QB", "RB", "RB", "WR", "WR", "WR",
    "TE", "FLEX", "FLEX", "SUPER_FLEX",
    "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN", "BN",
  ],
  scoring_settings: { rec: 1 },
};

const DEFAULT_LEAGUE_CONTEXT = {
  numTeams: 12,
  starterCounts: { QB: 1, RB: 2, WR: 3, TE: 1 },
  flexCount: 2,
  isSuperflex: true,
};

function lastCompletedSeasonYear() {
  const now = new Date();
  return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

// Sleeper player photos. Returns null for IDs that don't have a portrait
// (kicker, defense, ancient retirees) — UI falls back to initials.
function sleeperPhoto(id) {
  if (!id) return null;
  return `https://sleepercdn.com/content/nfl/players/${id}.jpg`;
}

function PosPill({ pos }) {
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${POS_COLORS[pos] || "border-white/10 text-slate-400"}`}>
      {pos}
    </span>
  );
}

function PlayerAvatar({ id, name }) {
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
      <div className="w-12 h-12 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-[11px] font-bold text-slate-300 shrink-0">
        {initials || "—"}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={name}
      onError={() => setErrored(true)}
      className="w-12 h-12 rounded-full bg-slate-800 border border-white/10 object-cover shrink-0"
    />
  );
}

function ScoreBadge({ score, tier }) {
  return (
    <div className={`w-12 h-12 rounded-lg border flex flex-col items-center justify-center font-bold shrink-0 ${tier?.cls || "bg-slate-700 text-slate-200 border-slate-600"}`}>
      <span className="text-lg leading-none">{tier?.label || "—"}</span>
      <span className="text-[9px] leading-none mt-0.5 opacity-80">{score}</span>
    </div>
  );
}

function OcChip({ outlook }) {
  if (!outlook || !Number.isFinite(outlook.multiplier) || outlook.multiplier === 0) return null;
  const pct = outlook.multiplierPct;
  const positive = pct > 0;
  return (
    <span
      title={`OC: ${outlook.ocName}${outlook.schemes?.length ? ` · ${outlook.schemes.join(", ")}` : ""}`}
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
        positive
          ? "bg-emerald-500/10 text-emerald-300 border-emerald-400/40"
          : "bg-rose-500/10 text-rose-300 border-rose-400/40"
      }`}
    >
      OC {positive ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export default function AdminTopPlayers() {
  const [unlocked, setUnlocked] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passInput, setPassInput] = useState("");
  const [gateError, setGateError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [computed, setComputed] = useState(null); // { players: [...], lastSeasonYear, ocSeason }

  const [posFilter, setPosFilter] = useState({ QB: true, RB: true, WR: true, TE: true });
  const [search, setSearch] = useState("");
  const [tePremium, setTePremium] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareTab, setShareTab] = useState("QB");
  const [shareLimit, setShareLimit] = useState(24);
  const [downloading, setDownloading] = useState(null); // pos key while exporting, "all" for batch
  const [shareBlurbs, setShareBlurbs] = useState(() => new Map());
  const [blurbsLoading, setBlurbsLoading] = useState(false);
  const [blurbsError, setBlurbsError] = useState("");
  const [blurbsCached, setBlurbsCached] = useState(false);
  const [blurbBumpKey, setBlurbBumpKey] = useState(0);
  const shareRefs = useRef({});

  // ── Session restore ────────────────────────────────────────────────────────
  useEffect(() => {
    const session = loadSession();
    if (session) {
      setUser(session);
      setUnlocked(true);
    }
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

  // ── Load data + run model once unlocked ────────────────────────────────────
  useEffect(() => {
    if (!unlocked || computed) return;
    let cancelled = false;
    setDataLoading(true);
    setDataError("");

    (async () => {
      try {
        const lastSeason = lastCompletedSeasonYear();
        const ocTargetSeason = lastSeason + 1;

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
        ]);

        if (cancelled) return;

        const benchmarks = buildBenchmarks(
          players,
          stats22,
          stats23,
          stats24,
          DEFAULT_LEAGUE_CONTEXT,
          [
            { year: 2021, stats: stats21 },
            { year: 2020, stats: stats20 },
            { year: 2019, stats: stats19 },
            { year: 2018, stats: stats18 },
            { year: 2017, stats: stats17 },
            { year: 2016, stats: stats16 },
          ],
          lastSeason,
        );

        const fcContext = buildFantasyCalcContext(fcValues || []);
        const raContext = buildRosterAuditContext(raValues || [], null, "sf");

        // Extended per-position, per-year ppg distributions across every season
        // we fetched (not just the last 3). This lets the prod blend below see
        // a player's full career body of work — Jefferson's 2020-2022 elite peak
        // matters again, instead of only his recent down years.
        const POSITIONS_LIST = ["QB", "RB", "WR", "TE"];
        const allStatsByYear = {
          [String(lastSeason)]:     stats24,
          [String(lastSeason - 1)]: stats23,
          [String(lastSeason - 2)]: stats22,
          "2021": stats21, "2020": stats20, "2019": stats19,
          "2018": stats18, "2017": stats17, "2016": stats16,
        };
        const extDist = {};
        const extRepl = {};
        POSITIONS_LIST.forEach((pos) => { extDist[pos] = {}; extRepl[pos] = {}; });
        Object.entries(allStatsByYear).forEach(([year, yrStats]) => {
          POSITIONS_LIST.forEach((pos) => { extDist[pos][year] = []; });
          if (!yrStats) return;
          Object.entries(yrStats).forEach(([id, s]) => {
            if (!s?.gp || s.gp < 8) return;
            const pl = players[id];
            if (!pl) return;
            const pos = pl.fantasy_positions?.[0] || pl.position;
            if (!POSITIONS_LIST.includes(pos)) return;
            const ppg = (s.pts_ppr || 0) / s.gp;
            if (ppg > 0) extDist[pos][year].push(ppg);
          });
          POSITIONS_LIST.forEach((pos) => extDist[pos][year].sort((a, b) => a - b));
        });
        // Replacement-level ppg per (position, year): the player just outside
        // projected starters in a 12-team SF league. Used for the PAR bonus
        // below — same idea as scoringEngine's buildBenchmarks but applied
        // across every available year so peak elite seasons get the +bonus
        // they deserve, not just last 3.
        const REPL_RANK = { QB: 25, RB: 33, WR: 48, TE: 15 };
        Object.keys(allStatsByYear).forEach((year) => {
          POSITIONS_LIST.forEach((pos) => {
            const sorted = extDist[pos][year];
            const idx = Math.max(0, sorted.length - REPL_RANK[pos]);
            extRepl[pos][year] = sorted[idx] || 0;
          });
        });

        const ocOutlookContext = buildOcOutlookContext({
          targetSeason: ocTargetSeason,
          statsByYear: [
            { year: lastSeason,     stats: stats24 },
            { year: lastSeason - 1, stats: stats23 },
            { year: lastSeason - 2, stats: stats22 },
          ],
          players,
          ocOverrides: ocDbOverrides || {},
        });

        const POSITIONS = new Set(["QB", "RB", "WR", "TE"]);
        const enriched = [];

        Object.entries(players || {}).forEach(([id, p]) => {
          const pos = p?.fantasy_positions?.[0] || p?.position;
          if (!POSITIONS.has(pos)) return;

          const s24 = stats24[id] || null;
          const s23 = stats23[id] || null;
          const s22 = stats22[id] || null;

          const fcEntry = fcContext.bySleeperId.get(String(id));
          const raEntry = raContext.bySleeperId.get(String(id));
          const gp24 = s24?.gp || 0;
          const yearsExp = p.years_exp ?? 99;

          // Drop the long tail: keep anyone with market presence, real recent
          // production, or rookie/sophomore upside. Without this the page
          // would render hundreds of practice-squad / retired entries.
          const hasMarket = !!fcEntry || !!raEntry;
          const hasRecent = gp24 >= 4;
          const isYoung = yearsExp <= 2 && (p.team || p.draft_round != null);
          if (!hasMarket && !hasRecent && !isYoung) return;

          const playerData = {
            position: pos,
            age: p.age || 26,
            yearsExp,
            draftRound: p.draft_round != null ? Number(p.draft_round) : (p.metadata?.draft_round != null ? Number(p.metadata.draft_round) : null),
            draftSlot: p.draft_slot != null ? Number(p.draft_slot) : (p.metadata?.draft_slot != null ? Number(p.metadata.draft_slot) : null),
            team: p.team || "FA",
            injuryStatus: p.injury_status || null,
            depthOrder: p.depth_chart_order || 2,
          };

          // Career-extended prod blend: walk every year we fetched (2016-2025)
          // and compute this player's PAR-adjusted pctile vs that year's pool.
          // gp >= 6 keeps the rate stable. PAR bonus (max +8) rewards seasons
          // meaningfully above replacement level — same formula as the original
          // playerPctiles, just applied across every career year so Jefferson's
          // 2020-2022 dominant seasons land at 95-100 instead of 88-92.
          const careerYears = [];
          Object.entries(allStatsByYear).forEach(([yr, yrStats]) => {
            const ys = yrStats?.[id];
            if (!ys?.gp || ys.gp < 6) return;
            const ppg = (ys.pts_ppr || 0) / ys.gp;
            if (ppg <= 0) return;
            const sorted = extDist[pos]?.[yr] || [];
            if (!sorted.length) return;
            // binary search would be faster, but the per-year arrays are small
            const below = sorted.filter((v) => v < ppg).length;
            const basePctile = Math.round((below / sorted.length) * 100);
            const replPpg = extRepl[pos]?.[yr] || 0;
            const parBonus = replPpg > 0 && ppg > replPpg
              ? Math.min(8, Math.round(((ppg - replPpg) / replPpg) * 12))
              : 0;
            const pctile = Math.min(100, basePctile + parBonus);
            careerYears.push({ year: Number(yr), pctile });
          });
          careerYears.sort((a, b) => b.year - a.year); // most recent first

          const allPctiles = careerYears.map((y) => y.pctile);
          const currentPctile = allPctiles[0] ?? 40;
          const floorPctile = allPctiles.length
            ? allPctiles.reduce((a, b) => a + b, 0) / allPctiles.length
            : currentPctile;
          const peakPctile = allPctiles.length ? Math.max(...allPctiles) : currentPctile;
          const prodBlend = Math.round(0.4 * currentPctile + 0.3 * floorPctile + 0.3 * peakPctile);
          const { score: internalScore, components } = calcScore(
            playerData,
            s24,
            s23,
            prodBlend,
            benchmarks.ageCurves,
            DEFAULT_SCORING_WEIGHTS,
          );

          // Career-first blend: internal (production + age + situ) carries the
          // dominant 40% vote, FC and RA equalized at 30% each. Replaces the
          // shared computeBlendedScore (which weights market 80%) — we want
          // career production to outweigh consensus hype here.
          const fantasyCalcNormalized = normalizeFantasyCalcValue(fcEntry, fcContext);
          const rosterAuditNormalized = normalizeRosterAuditValue(raEntry, raContext);
          const hasFc = fantasyCalcNormalized != null;
          const hasRa = rosterAuditNormalized != null;
          let blended;
          if (hasFc && hasRa) {
            blended = Math.max(5, Math.round(internalScore * 0.40 + fantasyCalcNormalized * 0.30 + rosterAuditNormalized * 0.30));
          } else if (hasFc) {
            blended = Math.max(5, Math.round(internalScore * 0.55 + fantasyCalcNormalized * 0.45));
          } else if (hasRa) {
            blended = Math.max(5, Math.round(internalScore * 0.55 + rosterAuditNormalized * 0.45));
          } else {
            blended = internalScore;
          }

          // OC outlook is shown as an informational chip but no longer multiplied
          // into the score. The OC signal projects Year-1 PPG which over-rotates
          // dynasty value (e.g. a +17% NYG OC bump was pushing Jaxson Dart above
          // Jayden Daniels). FC/RA already capture forward-looking market consensus.
          const ppg = s24?.gp > 0 ? ((s24.pts_ppr || 0) / s24.gp).toFixed(1) : null;
          const enrichedForOc = { ...playerData, ppg, name: `${p.first_name} ${p.last_name}` };
          const ocOutlook = buildPlayerOcOutlook(enrichedForOc, ocOutlookContext);

          // Sample-size discount: cap the blended score at 85 for early-career
          // players with under a full season of NFL games. Stops "FC loves this
          // rookie" from rocketing unproven QBs (Mendoza, Shough, Dart) into A
          // tier above guys with real production. Established vets are exempt
          // (a Burrow injury year doesn't trigger this).
          const careerGpRecent = (s24?.gp || 0) + (s23?.gp || 0) + (s22?.gp || 0);
          const isUnproven = (yearsExp <= 2) && careerGpRecent < 17;
          const SAMPLE_SIZE_CAP = 85;
          const finalScore = Math.round(
            clamp(isUnproven ? Math.min(blended, SAMPLE_SIZE_CAP) : blended, 5, 100),
          );

          enriched.push({
            id,
            name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.full_name || "—",
            position: pos,
            team: p.team || "FA",
            age: p.age || null,
            yearsExp: p.years_exp ?? null,
            ppg,
            gp24,
            careerGpRecent,
            careerYearsScored: careerYears.length,
            isUnproven,
            internalScore,
            blendedScore: blended,
            finalScore,
            components,
            fantasyCalcNormalized,
            rosterAuditNormalized,
            ocOutlook,
            injuryStatus: p.injury_status || null,
          });
        });

        enriched.sort((a, b) => b.finalScore - a.finalScore);

        setComputed({ players: enriched, lastSeason, ocTargetSeason });
        setDataLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setDataError(err.message || "Failed to load player data.");
        setDataLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [unlocked, computed]);

  const filtered = useMemo(() => {
    if (!computed) return [];
    const q = search.trim().toLowerCase();
    return computed.players
      .filter((p) => posFilter[p.position])
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
      .map((p) => {
        const adj = tePremium && p.position === "TE" ? p.finalScore * TEP_BOOST : p.finalScore;
        const score = Math.round(clamp(adj, 5, 100));
        return { ...p, displayScore: score, displayTier: tierFor(score) };
      })
      .filter((p) => p.displayTier)
      .sort((a, b) => b.displayScore - a.displayScore);
  }, [computed, posFilter, search, tePremium]);

  const grouped = useMemo(() => {
    const groups = {};
    TIERS.forEach((t) => { groups[t.key] = []; });
    filtered.forEach((p) => {
      if (p.displayTier) groups[p.displayTier.key].push(p);
    });
    return groups;
  }, [filtered]);

  // Per-position top-N rankings for the share cards. Pulls from computed
  // (not filtered) so the shared image isn't affected by the active search/pos
  // toggles — the share is "the rankings", not "what I'm currently looking at".
  // Tier groupings used to live here but the cards now render as a flat 2×6
  // grid (paginated), and each row carries its tier in the score badge.
  const sharePositions = useMemo(() => {
    if (!computed) return null;
    const out = {};
    ["QB", "RB", "WR", "TE"].forEach((pos) => {
      out[pos] = computed.players
        .filter((p) => p.position === pos)
        .map((p) => {
          const adj = tePremium && p.position === "TE" ? p.finalScore * TEP_BOOST : p.finalScore;
          const score = Math.round(clamp(adj, 5, 100));
          return { ...p, displayScore: score, displayTier: tierFor(score) };
        })
        .sort((a, b) => b.displayScore - a.displayScore)
        .slice(0, shareLimit);
    });
    return out;
  }, [computed, tePremium, shareLimit]);

  // Split each position's ranking into pages of ~12 (2 cols × 6 rows). When
  // the total doesn't divide evenly we balance rather than leaving a tiny
  // last page — e.g. Top 50 becomes 5 pages of 10, not 4×12+1×2.
  const sharePages = useMemo(() => {
    if (!sharePositions) return null;
    const out = {};
    ["QB", "RB", "WR", "TE"].forEach((pos) => {
      out[pos] = splitIntoPages(sharePositions[pos] || []);
    });
    return out;
  }, [sharePositions]);

  // Auto-fetch per-player AI rationales whenever the active tab's set
  // changes (year is implicit since computed.players doesn't switch
  // mid-session, but shareLimit + tab + tePremium all reshape the list).
  // Results accumulate across tab switches so we don't re-pay for players
  // already explained. bumpKey forces a cache bypass for "Regenerate".
  useEffect(() => {
    if (!showShare || !sharePositions) return;
    const players = sharePositions[shareTab] || [];
    if (!players.length) return;
    const inputs = players.map(buildTopPlayerBlurbInput);
    const force = blurbBumpKey > 0;
    let cancelled = false;
    setBlurbsLoading(true);
    setBlurbsError("");
    fetchShareBlurbs("top-players", inputs, { position: shareTab }, { force })
      .then(({ blurbsById, cached }) => {
        if (cancelled) return;
        setShareBlurbs((prev) => {
          const next = new Map(prev);
          for (const [id, blurb] of blurbsById) next.set(id, blurb);
          return next;
        });
        setBlurbsCached(cached);
        setBlurbsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setBlurbsError(String(err.message || err));
        setBlurbsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showShare, sharePositions, shareTab, blurbBumpKey]);

  function shareFilenameFor(pos, page) {
    const base = `top-${pos.toLowerCase()}-top${shareLimit}`;
    return page.total > 1 ? `${base}-pt${page.part}.png` : `${base}.png`;
  }

  async function captureShareNode(node) {
    return toPng(node, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#020617",
    });
  }

  async function downloadCard(pos) {
    const pages = sharePages?.[pos] || [];
    if (!pages.length) return;
    setDownloading(pos);
    try {
      for (let i = 0; i < pages.length; i++) {
        const node = shareRefs.current[`${pos}-${i}`];
        if (!node) continue;
        const dataUrl = await captureShareNode(node);
        const link = document.createElement("a");
        link.download = shareFilenameFor(pos, pages[i]);
        link.href = dataUrl;
        link.click();
        if (i < pages.length - 1) await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) {
      console.error("Failed to generate image:", err);
    } finally {
      setDownloading(null);
    }
  }

  async function downloadAll() {
    setDownloading("all");
    for (const pos of ["QB", "RB", "WR", "TE"]) {
      const pages = sharePages?.[pos] || [];
      for (let i = 0; i < pages.length; i++) {
        const node = shareRefs.current[`${pos}-${i}`];
        if (!node) continue;
        try {
          const dataUrl = await captureShareNode(node);
          const link = document.createElement("a");
          link.download = shareFilenameFor(pos, pages[i]);
          link.href = dataUrl;
          link.click();
          await new Promise((r) => setTimeout(r, 250));
        } catch (err) {
          console.error(`Failed to generate ${pos} pt${pages[i].part} image:`, err);
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
          <div className="text-emerald-400 text-xs uppercase tracking-widest mb-2">Admin · Top Players</div>
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center flex-wrap gap-2 mb-1.5">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400">Admin</div>
              <a href="/" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">← Dashboard</a>
              <a href="/admin/rookie-prospector" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Rookies</a>
              <a href="/admin/oc-rankings" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">OC Rankings</a>
              <a href="/admin/hot-streaks" className="text-xs font-medium text-slate-200 hover:text-white border border-white/15 bg-slate-800/70 hover:bg-slate-700 hover:border-white/30 px-3 py-1.5 rounded-md transition-colors">Hot &amp; Cold</a>
            </div>
            <h1 className="text-xl font-bold">Top Players · Tier Board</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Career-first dynasty score (40% internal / 30% FC / 30% RA), prod blend across all available seasons. 12-team SF full-PPR. Under one full NFL season caps at 85.
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
        {dataLoading && !computed && (
          <div className="rounded-xl border border-white/10 bg-slate-900/40 p-10 text-center text-slate-400 text-sm">
            Loading Sleeper, FantasyCalc, RosterAudit, and OC data…
          </div>
        )}
        {dataError && (
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-200 mb-4">
            {dataError}
          </div>
        )}

        {computed && (
          <>
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {["QB","RB","WR","TE"].map((pos) => (
                <button key={pos} onClick={() => setPosFilter((f) => ({ ...f, [pos]: !f[pos] }))}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${posFilter[pos] ? POS_COLORS[pos] : "border-white/10 text-slate-500 bg-slate-900/40"}`}>
                  {pos}
                </button>
              ))}
              <button onClick={() => setTePremium((v) => !v)}
                title="TE Premium leagues — bumps TE dynasty value +12% (FC/RA APIs don't expose TEP)"
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${tePremium ? "border-amber-400/60 bg-amber-500/15 text-amber-200" : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"}`}>
                TE Premium {tePremium ? "ON" : "OFF"}
              </button>
              <button onClick={() => setShowShare(true)}
                title="Generate Twitter-ready PNGs — one card per position"
                className="px-3 py-1.5 rounded-md text-xs font-semibold border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25">
                Share Cards
              </button>
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or team…"
                className="bg-slate-900 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 w-48" />
              <span className="text-xs text-slate-500 ml-auto">
                {filtered.length} players · OC outlook {computed.ocTargetSeason}
              </span>
            </div>

            {/* Tier legend */}
            <div className="flex flex-wrap gap-2 mb-4 text-[10px]">
              {TIERS.map((t) => (
                <span key={t.key} className={`px-2 py-1 rounded font-bold border ${t.cls}`}>
                  {t.label} ≥ {t.min} · {grouped[t.key].length}
                </span>
              ))}
            </div>

            {/* Tier sections */}
            <div className="space-y-6">
              {TIERS.map((tier) => {
                const players = grouped[tier.key];
                if (!players.length) return null;
                return (
                  <section key={tier.key}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2.5 py-1 rounded text-sm font-bold border ${tier.cls}`}>
                        Tier {tier.label}
                      </span>
                      <span className="text-xs text-slate-500">{tier.desc} · {players.length} players</span>
                    </div>
                    <div className="space-y-1.5">
                      {players.map((p, i) => (
                        <PlayerRow key={p.id} player={p} rank={i + 1} />
                      ))}
                    </div>
                  </section>
                );
              })}
              {filtered.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-slate-900/40 p-10 text-center text-slate-500 text-sm">
                  No players match the current filters.
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {showShare && sharePages && (
        <ShareModal
          sharePages={sharePages}
          shareTab={shareTab}
          setShareTab={setShareTab}
          shareLimit={shareLimit}
          setShareLimit={setShareLimit}
          shareRefs={shareRefs}
          downloading={downloading}
          tePremium={tePremium}
          ocTargetSeason={computed?.ocTargetSeason}
          blurbs={shareBlurbs}
          blurbsLoading={blurbsLoading}
          blurbsError={blurbsError}
          blurbsCached={blurbsCached}
          onRegenerateBlurbs={() => setBlurbBumpKey((k) => k + 1)}
          onDownload={downloadCard}
          onDownloadAll={downloadAll}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}

function ShareModal({
  sharePages, shareTab, setShareTab, shareLimit, setShareLimit, shareRefs,
  downloading, tePremium, ocTargetSeason,
  blurbs, blurbsLoading, blurbsError, blurbsCached, onRegenerateBlurbs,
  onDownload, onDownloadAll, onClose,
}) {
  const modalRef = useModalBehavior(onClose);
  const activePages = sharePages?.[shareTab] || [];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div
        ref={modalRef}
        className="w-full h-full flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-cards-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 border-b border-white/10 px-6 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Share</span>
          <span id="share-cards-title" className="text-sm text-slate-200">Twitter-ready tier cards</span>

          <div className="flex items-center gap-1 ml-2">
            {[12, 24, 36, 50].map((n) => (
              <button key={n} onClick={() => setShareLimit(n)}
                className={`px-3 py-1 rounded text-xs font-semibold border ${shareLimit === n ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"}`}>
                Top {n}
              </button>
            ))}
          </div>

          <div className="flex gap-1 ml-2">
            {["QB","RB","WR","TE"].map((pos) => {
              const count = sharePages?.[pos]?.reduce((acc, pg) => acc + pg.players.length, 0) || 0;
              return (
                <button key={pos} onClick={() => setShareTab(pos)}
                  disabled={count === 0}
                  className={`px-3 py-1 rounded text-xs font-semibold border ${shareTab === pos ? POS_COLORS[pos] : "border-white/10 text-slate-500 bg-slate-900/40 hover:text-slate-200 disabled:opacity-30"}`}>
                  {pos}{count ? ` · ${count}` : ""}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-slate-400 mr-1">
              {blurbsLoading
                ? "AI insights…"
                : blurbsError
                ? <span className="text-rose-300" title={blurbsError}>insights error</span>
                : blurbs?.size > 0
                ? `insights ✓${blurbsCached ? " (cached)" : ""}`
                : ""}
            </span>
            <button onClick={onRegenerateBlurbs}
              disabled={blurbsLoading || !activePages.length}
              title="Force re-fetch of AI insights (bypasses cache)"
              className="text-[10px] font-semibold px-2 py-1 rounded border border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-40">
              Regenerate
            </button>
            <button onClick={() => onDownload(shareTab)}
              disabled={!activePages.length || downloading === shareTab || downloading === "all"}
              className="text-xs font-semibold px-3 py-1.5 rounded border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40">
              {downloading === shareTab
                ? "Generating…"
                : `Download ${shareTab}${activePages.length > 1 ? ` (${activePages.length} PNGs)` : " PNG"}`}
            </button>
            <button onClick={onDownloadAll}
              disabled={downloading === "all"}
              className="text-xs font-semibold px-3 py-1.5 rounded border border-emerald-400/60 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40">
              {downloading === "all" ? "Generating all…" : "Download all"}
            </button>
            <button onClick={onClose}
              aria-label="Close share cards"
              className="text-slate-400 hover:text-slate-100 text-lg leading-none px-2">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-6">
          {/* All position pages stay mounted so html-to-image can find them
              for "Download all"; inactive tabs sit at -9999px. */}
          {["QB","RB","WR","TE"].map((pos) => {
            const pages = sharePages?.[pos] || [];
            const isActive = shareTab === pos;
            if (!pages.length && !isActive) return null;
            const wrapperStyle = isActive ? {} : { position: "absolute", left: "-9999px", top: 0 };
            return (
              <div key={pos} style={wrapperStyle} className="flex flex-col items-center gap-6">
                {pages.map((page, idx) => (
                  <ShareCard
                    key={`${pos}-${idx}`}
                    innerRef={(el) => { shareRefs.current[`${pos}-${idx}`] = el; }}
                    pos={pos}
                    players={page.players}
                    startRank={page.startRank}
                    part={page.part}
                    total={page.total}
                    shareLimit={shareLimit}
                    tePremium={tePremium}
                    ocTargetSeason={ocTargetSeason}
                    blurbs={blurbs}
                  />
                ))}
              </div>
            );
          })}
          {!activePages.length && (
            <div className="text-slate-500 text-sm self-center">
              No players in this slice.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const POS_GRADIENTS = {
  QB: "from-rose-500 to-rose-700",
  RB: "from-emerald-500 to-emerald-700",
  WR: "from-sky-500 to-sky-700",
  TE: "from-amber-500 to-amber-700",
};

function ShareCard({ innerRef, pos, players, startRank = 1, part = 1, total = 1, shareLimit, tePremium, ocTargetSeason, blurbs }) {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const endRank = startRank + players.length - 1;
  const subtitle = total > 1
    ? `Top ${shareLimit} ${pos} · ${startRank}–${endRank}`
    : `Top ${Math.min(shareLimit, players.length)} ${pos}`;

  // Always 2 columns. With our page-split helper each page lands at ≤ 12
  // players, so this is 2 × 6 in the common case (or 2 × 5 for Top-50,
  // which produces 5 balanced pages of 10).
  const half = Math.ceil(players.length / 2);
  const col1 = players.slice(0, half);
  const col2 = players.slice(half);

  return (
    <div ref={innerRef}
      style={{ width: 1080, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
      className="bg-slate-950 text-slate-100 p-10 flex flex-col gap-5">
      <div className={`rounded-xl bg-gradient-to-br ${POS_GRADIENTS[pos]} p-6 flex items-center justify-between`}>
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-white/80 font-bold mb-1">
            Dynasty {ocTargetSeason ? `· ${ocTargetSeason}` : ""}
          </div>
          <div className="text-5xl font-black text-white leading-none">TOP {pos}</div>
          <div className="text-sm text-white/80 mt-2">
            {subtitle} · 12-Team SF · Full PPR{tePremium && pos === "TE" ? " · TEP" : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/70">As of</div>
          <div className="text-base font-bold text-white">{date}</div>
          {total > 1 && (
            <div className="text-[10px] uppercase tracking-widest text-white/70 mt-2">
              Part {part} / {total}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[col1, col2].map((col, ci) => (
          <div key={ci} className="rounded-xl border border-white/10 bg-slate-900/70 overflow-hidden">
            <div className="divide-y divide-white/5">
              {col.map((p, i) => (
                <ShareRow
                  key={p.id}
                  player={p}
                  rank={ci === 0 ? startRank + i : startRank + half + i}
                  blurb={blurbs?.get(p.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="text-center text-[11px] text-slate-500 pt-2 border-t border-white/10">
        Dynasty model + FantasyCalc + RosterAudit · sample-size capped under 17 NFL games
      </div>
    </div>
  );
}

function ShareRow({ player, rank, blurb }) {
  const { id, name, position, team, displayScore, displayTier, ppg } = player;
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <span className="text-base font-bold text-slate-500 w-7 text-right tabular-nums pt-1">{rank}</span>
      <PlayerAvatar id={id} name={name} />
      <div className={`w-12 h-12 rounded-lg border flex flex-col items-center justify-center font-bold shrink-0 ${displayTier?.cls || "bg-slate-700 text-slate-200 border-slate-600"}`}>
        <span className="text-lg leading-none">{displayTier?.label || "—"}</span>
        <span className="text-[9px] leading-none mt-0.5 opacity-80">{displayScore}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-100 font-bold text-base truncate">{name}</span>
          <span className="text-[10px] text-slate-400 border border-white/15 px-1.5 py-0.5 rounded font-semibold">{team}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${POS_COLORS[position]}`}>{position}</span>
        </div>
        {ppg && (
          <div className="text-[11px] text-slate-500 mt-0.5">{ppg} ppg</div>
        )}
        {blurb && (
          <div className="text-[11px] text-slate-300 italic mt-1 leading-snug">{blurb}</div>
        )}
      </div>
    </div>
  );
}

function PlayerRow({ player, rank }) {
  const {
    id, name, position, team, age, yearsExp, ppg, gp24,
    fantasyCalcNormalized, rosterAuditNormalized, ocOutlook,
    displayScore, displayTier, internalScore,
  } = player;

  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2 flex items-center gap-3">
      <span className="text-base font-bold text-slate-500 w-7 text-right shrink-0 tabular-nums">{rank}</span>
      <PlayerAvatar id={id} name={name} />
      <ScoreBadge score={displayScore} tier={displayTier} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-100 font-semibold truncate">{name}</span>
          <PosPill pos={position} />
          <span className="text-[10px] text-slate-400 border border-white/10 px-1.5 py-0.5 rounded">{team}</span>
          <OcChip outlook={ocOutlook} />
          {player.isUnproven && (
            <span title="Under 17 NFL games — score capped at 85"
              className="text-[10px] text-slate-300 bg-slate-700/50 border border-white/10 px-1.5 py-0.5 rounded uppercase tracking-wide">
              capped
            </span>
          )}
          {player.injuryStatus && (
            <span className="text-[10px] text-rose-300 bg-rose-500/15 border border-rose-400/30 px-1.5 py-0.5 rounded uppercase">
              {player.injuryStatus}
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {age != null && <span>age {age}</span>}
          {yearsExp != null && <span>{yearsExp === 0 ? "rookie" : `${yearsExp}yr exp`}</span>}
          {ppg != null && <span>{ppg} ppg · {gp24} gp</span>}
          {fantasyCalcNormalized != null && <span>FC {fantasyCalcNormalized}</span>}
          {rosterAuditNormalized != null && <span>RA {rosterAuditNormalized}</span>}
          <span>internal {internalScore}</span>
        </div>
      </div>
    </div>
  );
}
