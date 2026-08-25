// Pure waiver-wire scoring math for the Waivers tab.
//
// Ranks the free-agent pool by blending six 0-100 signals:
//   dynasty      — long-term asset value (fused dynastyValue from rosterBuilder)
//   projection   — rest-of-season scoring expectation, percentile within position
//   upside       — youth-adjusted ascension: dynasty value reweighted toward
//                  players still inside their ascending window (see upsideScore)
//   form         — proj-vs-actual momentum (hotStreaks residuals)
//   trending     — platform-wide add velocity (the opportunity-shock proxy: a
//                  backup elevated by a starter injury spikes here within hours)
//   availability — injury status / unsigned / recent missed weeks
//
// The intent for a dynasty pool is a BARBELL: a free agent earns a claim by
// being a *young ascending stash* (dynasty + upside) OR by producing *right
// now* (projection + form). What we deliberately do NOT reward is a healthy,
// signed, replacement-level veteran — a 2nd/3rd-string body with no future and
// no points. That's why `upside` exists (age was previously ignored, so those
// veterans looked identical to young stashes) and why `availability` carries
// only a light weight: being healthy and rostered-somewhere is table stakes,
// not a reason to add someone.
//
// Signals that are unavailable (offseason: no projections, no streaks) come
// back null and their weight is renormalized across the rest — so at week 0
// the board degrades to dynasty + upside + trending + availability with no
// special-case code path. That renormalization IS the season-adaptation
// mechanism.
//
// This module is dependency-free (no fetch, no Supabase) so it can be
// unit-tested in isolation (waiverEngine.test.mjs). WaiverTab handles fetching.

export const DEFAULT_WAIVER_WEIGHTS = {
  dynasty: 0.25,
  projection: 0.28,
  upside: 0.17,
  form: 0.12,
  trending: 0.13,
  availability: 0.05,
};

// Trending-only candidates (not in the FC/RA value pool) have no dynastyValue.
// Score them a neutral-low 30: real enough to surface on trending, unproven
// enough not to outrank established assets on the dynasty signal.
export const LITE_DYNASTY_SCORE = 30;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round1 = (n) => Math.round(n * 10) / 10;

/** Long-term signal from the fused dynasty value (1-130 scale → 0-100). */
export function dynastyScore(candidate) {
  const v = candidate?.dynastyValue?.value;
  if (v == null) return candidate?.isLite ? LITE_DYNASTY_SCORE : null;
  return clamp(v / 1.3, 0, 100);
}

// Age curve for youth upside: full credit through the ascending window, then a
// linear fade to zero as a player exits it. ≤22 → 100, 24 → ~78, 26 → ~56,
// 28 → ~33, ≥31 → 0. Positionless on purpose — RB/WR/QB age curves differ, but
// this is a coarse "still ascending vs. declining" gate, not a projection.
function ageUpsideCurve(age) {
  if (!Number.isFinite(age) || age <= 0) return null;
  if (age <= 22) return 100;
  if (age >= 31) return 0;
  return clamp(100 - (age - 22) * (100 / 9), 0, 100);
}

/**
 * Youth-upside signal — the piece that lets the dynasty board separate a young
 * ascending stash from a same-value aging body. Age alone is NOT upside (a
 * 22-yo camp arm nobody values is still worthless), so the age curve is gated
 * by `pathStrength` (0-1): how real the ascending path is, derived by the
 * caller from dynasty value and platform interest. A young player with no value
 * and no buzz collapses to ~0; an old player collapses via the age curve no
 * matter how much value they hold. That asymmetry is the whole point.
 *
 * Null when age is unknown — renormalize the weight away rather than guess.
 */
export function upsideScore(age, pathStrength = 0) {
  const curve = ageUpsideCurve(age);
  if (curve == null) return null;
  return clamp(curve * clamp(pathStrength, 0, 1), 0, 100);
}

/**
 * Percentile (0-100) of each candidate's projected PPG *within its position* —
 * 14 PPG is elite for a TE and mid for a QB, so cross-position ranks would
 * systematically bury shallow positions.
 *
 * @param entries [{ playerId, position, ppg }] — ppg null when unprojected.
 * @returns Map<playerId, 0-100> (only players with a ppg get an entry)
 */
export function projectionPercentilesByPos(entries) {
  const byPos = new Map();
  for (const e of entries || []) {
    if (e?.ppg == null || !e.position) continue;
    let arr = byPos.get(e.position);
    if (!arr) byPos.set(e.position, (arr = []));
    arr.push(e);
  }
  const out = new Map();
  for (const arr of byPos.values()) {
    arr.sort((a, b) => a.ppg - b.ppg);
    const n = arr.length;
    for (let i = 0; i < n; i++) {
      out.set(String(arr[i].playerId), n === 1 ? 50 : (i / (n - 1)) * 100);
    }
  }
  return out;
}

/**
 * Recent-form signal from a hotStreaks entry (buildPlayerStreaks output).
 * Momentum (recent avg residual + streak term) carries most of it; beatRate
 * adds season-long consistency. Null under 2 evaluated weeks — one graded game
 * isn't form. Capped at 40 when the season ended early: that form is
 * pre-injury and shouldn't read as current.
 */
export function formScore(streak) {
  if (!streak || !(streak.evaluatedWeeks >= 2)) return null;
  const momentumPart = clamp(50 + (streak.momentum || 0) * 7, 0, 100);
  const blended = momentumPart * 0.7 + (streak.beatRate || 0) * 100 * 0.3;
  return streak.seasonEndedEarly ? Math.min(blended, 40) : blended;
}

/**
 * Add-velocity signal, log-scaled against the pool max so the platform-wide
 * (unbounded) counts normalize regardless of magnitude. Drops subtract a
 * smaller penalty — being widely dropped is a caution, not a veto.
 * Null when there's no trending data at all (endpoint failed / offseason lull).
 */
export function trendingScore(adds, drops, maxAdds, maxDrops) {
  if (!maxAdds || maxAdds <= 0) return null;
  const addPart = adds > 0 ? (100 * Math.log1p(adds)) / Math.log1p(maxAdds) : 0;
  const dropPart =
    drops > 0 && maxDrops > 0 ? (25 * Math.log1p(drops)) / Math.log1p(maxDrops) : 0;
  return clamp(addPart - dropPart, 0, 100);
}

// Base availability by Sleeper injury_status. Unknown statuses read as mild
// caution rather than healthy — Sleeper only sets the field when something's up.
const STATUS_AVAILABILITY = {
  questionable: 75,
  doubtful: 55,
  out: 35,
  sus: 25,
  ir: 15,
  pup: 15,
  na: 15,
  cov: 55,
  dnr: 15,
};

/**
 * Can this player actually help soon? 100 = healthy and signed. Unsigned
 * (no NFL team) clamps hard — nobody to earn snaps with. A trailing run of
 * missed weeks in-season knocks further even when the status field lags.
 */
export function availabilityScore(candidate, streak, week = 0) {
  const status = String(candidate?.injuryStatus || "").toLowerCase();
  let base = status ? STATUS_AVAILABILITY[status] ?? 60 : 100;
  if (!candidate?.team) base = Math.min(base, 25);
  if (week > 0 && streak && streak.weeksMissedRecent >= 3) base -= 20;
  return clamp(base, 0, 100);
}

// Verdict bands: [minScore, verdict, faab % band of budget]. Speculative is a
// deliberate DART range — a thin wire shouldn't recommend double-digit % of
// budget on a WATCH-adjacent flier; that money is for the in-season injury that
// actually flips a season.
const VERDICT_BANDS = [
  [80, "priority-add", [20, 35]],
  [65, "strong-add", [10, 20]],
  [50, "speculative", [1, 4]],
  [0, "watch", [0, 0]],
];

// A speculative bid stays a dart even after roster-fit / shock bonuses — the
// bonuses matter most where you're actually contesting (strong/priority).
const SPECULATIVE_CEIL = 5;

/**
 * FAAB advice for a scored candidate. Opportunity shocks and roster fits bid
 * the band up a few points — those are the adds leagues actually fight over.
 * In waiver-priority leagues (budget 0) only the verdict applies.
 *
 * `unprojected` = the player has no real points projection (trending/youth drove
 * the score, not expected production). That's a SITUATION bet, not a points bet,
 * so it's always a small dart no matter how high the score climbed — the app
 * shouldn't recommend real money on a guy it can't project.
 */
export function suggestFaab(
  waiverScore,
  { hasShock = false, fillsNeed = false, faabBudget = 0, unprojected = false } = {},
) {
  const [, verdict, band] = VERDICT_BANDS.find(([min]) => waiverScore >= min);
  if (!(faabBudget > 0) || verdict === "watch") {
    return { verdict, faabPct: null, faabLabel: null, unprojected };
  }
  const bid = (pct) => Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * faabBudget));
  if (unprojected) {
    const hi = verdict === "priority-add" || verdict === "strong-add" ? 5 : 3;
    return {
      verdict,
      faabPct: { min: 1, max: hi },
      faabLabel: `$${bid(1)}–$${bid(hi)} of $${faabBudget} · situational`,
      unprojected: true,
    };
  }
  const bonus = (hasShock ? 3 : 0) + (fillsNeed ? 2 : 0);
  const ceil = verdict === "speculative" ? SPECULATIVE_CEIL : 40;
  const lo = Math.min(ceil, band[0] + bonus);
  const hi = Math.min(ceil, band[1] + bonus);
  return {
    verdict,
    faabPct: { min: lo, max: hi },
    faabLabel: `$${bid(lo)}–$${bid(hi)} of $${faabBudget}`,
    unprojected: false,
  };
}

/**
 * Week-over-week board movement vs the previously saved board (localStorage
 * snapshot). Powers the Risers/Fallers strip with zero backend.
 *
 * @param currentBoard  [{ playerId, rank, waiverScore }]
 * @param previousBoard same shape (or null/empty on first visit)
 * @returns Map<playerId, { rankDelta, scoreDelta, isNew }>
 *          rankDelta > 0 = climbed (was ranked worse before).
 */
export function buildBoardDeltas(currentBoard, previousBoard) {
  const prevById = new Map(
    (previousBoard || []).map((p) => [String(p.playerId), p]),
  );
  const out = new Map();
  for (const cur of currentBoard || []) {
    const prev = prevById.get(String(cur.playerId));
    out.set(
      String(cur.playerId),
      prev
        ? {
            rankDelta: prev.rank - cur.rank,
            scoreDelta: round1((cur.waiverScore || 0) - (prev.waiverScore || 0)),
            isNew: false,
          }
        : { rankDelta: null, scoreDelta: null, isNew: true },
    );
  }
  return out;
}

/**
 * Score and rank the waiver pool.
 *
 * @param candidates       enriched FA players (analysis.waiver.enriched values —
 *                         have dynastyValue, injuryStatus, team, age, position)
 * @param liteCandidates   trending-only players outside the value pool:
 *                         [{ playerId, name, position, team, age, injuryStatus }]
 * @param streaksById      Map<player_id, streak> (buildPlayerStreaks output, keyed by caller)
 * @param rosProjPpgById   Map<player_id, ppg> (fetchSeasonProjectedPpg)
 * @param weekProjById     Map<player_id, row> with proj_ppr (fetchProjections .byPlayerId)
 * @param trendingAddsById Map<player_id, count>
 * @param trendingDropsById Map<player_id, count>
 * @param needs            positions my roster is thin at (analysis.needs)
 * @param surplusPositions positions I'm deep at (analysis.surplusPositions)
 * @param week             current NFL week (0 = offseason)
 * @param faabBudget       league waiver budget in $ (0 = priority league)
 * @returns array sorted by waiverScore desc; see result shape in the map below.
 */
export function scoreWaiverCandidates({
  candidates = [],
  liteCandidates = [],
  streaksById = new Map(),
  rosProjPpgById = new Map(),
  weekProjById = new Map(),
  trendingAddsById = new Map(),
  trendingDropsById = new Map(),
  needs = [],
  surplusPositions = [],
  week = 0,
  faabBudget = 0,
  weights = DEFAULT_WAIVER_WEIGHTS,
} = {}) {
  const pool = [
    ...candidates.map((c) => ({ ref: c, isLite: false })),
    ...liteCandidates.map((c) => ({ ref: c, isLite: true })),
  ];

  // Resolve each candidate's projected PPG (season pace, falling back to the
  // current-week projection) once, then percentile within position.
  const resolved = pool.map(({ ref, isLite }) => {
    const id = String(ref.playerId ?? ref.id);
    const rosPpg = rosProjPpgById.get(id) ?? null;
    const weekRow = weekProjById.get(id);
    const weekProj = weekRow?.proj_ppr != null ? Number(weekRow.proj_ppr) : null;
    return {
      id,
      ref,
      isLite,
      position: ref.position || null,
      rosPpg,
      weekProj,
      ppgForPctile: rosPpg ?? weekProj,
    };
  });
  const projPctiles = projectionPercentilesByPos(
    resolved.map((r) => ({ playerId: r.id, position: r.position, ppg: r.ppgForPctile })),
  );

  // Pool-wide trending maxima for normalization (only over this pool, so a
  // rostered league-winner trending everywhere doesn't compress FA scores).
  let maxAdds = 0;
  let maxDrops = 0;
  for (const r of resolved) {
    maxAdds = Math.max(maxAdds, trendingAddsById.get(r.id) || 0);
    maxDrops = Math.max(maxDrops, trendingDropsById.get(r.id) || 0);
  }

  const results = resolved.map(({ id, ref, isLite, position, rosPpg, weekProj }) => {
    const streak = streaksById.get(id) || null;
    const adds = trendingAddsById.get(id) || 0;
    const drops = trendingDropsById.get(id) || 0;

    const dynSig = dynastyScore({ ...ref, isLite });
    const trendSig = trendingScore(adds, drops, maxAdds, maxDrops);

    // How real is this young player's path to relevance? Established dynasty
    // value counts fully; raw platform buzz counts a little less (it's noisier
    // and often injury-driven, which is exactly the young-opportunity case we
    // still want to reward). A player with neither has no path — upside → 0.
    const pathStrength = clamp(
      Math.max((dynSig ?? 0) / 100, (trendSig ?? 0) / 100 * 0.85),
      0,
      1,
    );

    const signals = {
      dynasty: dynSig,
      projection: projPctiles.get(id) ?? null,
      upside: upsideScore(ref.age, pathStrength),
      form: formScore(streak),
      trending: trendSig,
      availability: availabilityScore(ref, streak, week),
    };

    // Renormalize weights over the signals we actually have.
    let totalW = 0;
    for (const k of Object.keys(weights)) if (signals[k] != null) totalW += weights[k];
    const weightsUsed = {};
    let base = 0;
    for (const k of Object.keys(weights)) {
      if (signals[k] == null) continue;
      const w = totalW > 0 ? weights[k] / totalW : 0;
      weightsUsed[k] = w;
      base += w * signals[k];
    }

    const fillsNeed = needs.includes(position);
    const isSurplus = surplusPositions.includes(position);
    const needMult = fillsNeed ? 1.12 : isSurplus ? 0.9 : 1.0;
    const waiverScore = round1(clamp(base * needMult, 0, 100));

    const flags = [];
    const dyn = signals.dynasty;
    const trend = signals.trending;
    const up = signals.upside;
    if (trend != null && trend >= 80 && dyn != null && dyn < 50) flags.push("opportunity-shock");
    else if (trend != null && trend >= 60) flags.push("trending-riser");
    // Young player with a real ascending path — the dynasty stash worth a bench
    // spot even before the points arrive.
    if (up != null && up >= 50 && ref.age != null && ref.age <= 24) flags.push("young-upside");
    if (drops > adds && drops >= 10) flags.push("being-dropped");
    if (signals.availability <= 55) flags.push("injury-risk");
    if (fillsNeed) flags.push("fills-need");
    if (dyn != null && dyn >= 55 && signals.projection != null && signals.projection <= 25) {
      flags.push("stash-only");
    }

    // No real points projection (season or week) — the score came from trending
    // / youth, not expected production. Surface it honestly and keep FAAB small.
    const unprojected =
      (rosPpg == null || rosPpg <= 0) && (weekProj == null || weekProj <= 0);

    const advice = suggestFaab(waiverScore, {
      hasShock: flags.includes("opportunity-shock"),
      fillsNeed,
      faabBudget,
      unprojected,
    });

    return {
      playerId: id,
      name: ref.name || "",
      position,
      team: ref.team || null,
      age: ref.age ?? null,
      injuryStatus: ref.injuryStatus ?? null,
      isLite,
      waiverScore,
      unprojected,
      breakdown: {
        dynasty: dyn != null ? round1(dyn) : null,
        projection: signals.projection != null ? round1(signals.projection) : null,
        upside: up != null ? round1(up) : null,
        form: signals.form != null ? round1(signals.form) : null,
        trending: trend != null ? round1(trend) : null,
        availability: round1(signals.availability),
        needMult,
        weightsUsed,
      },
      advice,
      flags,
      rosPpg,
      weekProj,
      trendCount: adds,
      dropCount: drops,
      momentum: streak?.momentum ?? null,
      dynastyTier: ref.dynastyValue?.tier ?? null,
    };
  });

  // Deterministic: score desc, then dynasty desc, then id asc.
  results.sort(
    (a, b) =>
      b.waiverScore - a.waiverScore ||
      (b.breakdown.dynasty ?? -1) - (a.breakdown.dynasty ?? -1) ||
      (a.playerId < b.playerId ? -1 : a.playerId > b.playerId ? 1 : 0),
  );
  return results;
}
