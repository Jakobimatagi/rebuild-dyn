// Build a sleeperId → recent-trades index from FantasyCalc's /trades feed.
//
// Each indexed entry is shaped for a single subject player: which side they
// were on, what the other side sent back, what rode with them, plus the
// pre-computed fairness metrics FC returns. Consumers (strategy sections,
// UI) look up a player by sleeperId and get up to a few recent market comps.

function normalizeAsset(rawAsset) {
  if (!rawAsset) return null;
  const sleeperId = rawAsset.sleeperId || null;
  const isPick = rawAsset.position === "PICK";
  return {
    sleeperId,
    name: rawAsset.name || null,
    position: rawAsset.position || null,
    age:
      rawAsset.maybeAge != null ? Math.round(Number(rawAsset.maybeAge)) : null,
    isPick,
  };
}

// Returns Map<sleeperId, comp[]>. Comps are sorted newest first and capped
// at MAX_COMPS_PER_PLAYER per subject so the index stays bounded in size.
const MAX_COMPS_PER_PLAYER = 8;

export function buildFantasyCalcTradeIndex(trades = []) {
  const index = new Map();
  if (!Array.isArray(trades) || trades.length === 0) return index;

  // Assume the caller passed a list already sorted newest-first (our cache
  // layer does this), but sort defensively.
  const sorted = [...trades].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  for (const trade of sorted) {
    if (!trade?.id || !Array.isArray(trade.side1) || !Array.isArray(trade.side2))
      continue;
    const side1 = trade.side1.map(normalizeAsset).filter(Boolean);
    const side2 = trade.side2.map(normalizeAsset).filter(Boolean);
    const meta = {
      id: trade.id,
      date: trade.date,
      grade: trade.maybeGrade || null,
      valueDiff: Number(trade.maybeTradedValueDiff || 0),
      score: Number(trade.maybeScore || 0),
    };

    const addComp = (subject, selfSide, otherSide, sideNum) => {
      if (!subject?.sleeperId) return;
      const key = String(subject.sleeperId);
      const bucket = index.get(key) || [];
      if (bucket.length >= MAX_COMPS_PER_PLAYER) return;
      bucket.push({
        ...meta,
        selfSide: sideNum,
        teammates: selfSide.filter((a) => a.sleeperId !== subject.sleeperId),
        counterparty: otherSide,
      });
      index.set(key, bucket);
    };

    for (const p of side1) addComp(p, side1, side2, 1);
    for (const p of side2) addComp(p, side2, side1, 2);
  }

  return index;
}

// Lookup helper — returns up to `limit` freshest comps for a player.
// Safe to call when the index is empty or the player has no comps.
export function getMarketComps(index, sleeperId, limit = 3) {
  if (!index || !sleeperId) return [];
  const bucket = index.get(String(sleeperId));
  if (!bucket || bucket.length === 0) return [];
  return bucket.slice(0, limit);
}

// Summarise a comp into a one-line human description.
// Example: "Sent for Jaxon Smith-Njigba + 2026 3.04 (even)"
export function describeMarketComp(comp) {
  if (!comp) return null;
  const parts = comp.counterparty.map((a) => {
    if (a.isPick) return a.name;
    const age = a.age != null ? `, ${a.age}` : "";
    return `${a.name}${age}`;
  });
  const received = parts.join(" + ") || "unknown";
  let fairness = "";
  if (comp.grade) fairness = ` (${comp.grade})`;
  else if (Math.abs(comp.valueDiff) > 1500) {
    fairness = comp.valueDiff > 0 ? " (overpay)" : " (discount)";
  }
  return `Traded for ${received}${fairness}`;
}
