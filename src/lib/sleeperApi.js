const SLEEPER_BASE_URL = import.meta.env.DEV
  ? "/sleeper"
  : "https://api.sleeper.app/v1";

export async function fetchSleeper(path) {
  const res = await fetch(`${SLEEPER_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  return res.json();
}

// Historical season stats never change after the season ends, so we cache them
// for 7 days instead of the standard 24h used for current-season data.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Seasons from before 2018 are fully settled — cache 30 days to minimize API calls.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Cache key prefixes that are safe to evict when storage is full.
// Listed oldest-first as an eviction priority hint.
const EVICTABLE_PREFIXES = ["sleeper_stats_deep_", "sleeper_stats_"];

/**
 * Write to localStorage, falling back to evicting the oldest stats cache
 * entries if the quota is exceeded. Silently gives up if eviction doesn't help
 * (e.g. mobile Safari with a very small quota).
 */
export function safeLocalStorageWrite(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    if (e?.name !== "QuotaExceededError" && e?.code !== 22) return;

    // Collect all evictable keys sorted by their stored timestamp (oldest first).
    const candidates = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !EVICTABLE_PREFIXES.some((p) => k.startsWith(p))) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(k));
        candidates.push({ key: k, timestamp: parsed?.timestamp ?? 0 });
      } catch {
        candidates.push({ key: k, timestamp: 0 });
      }
    }
    candidates.sort((a, b) => a.timestamp - b.timestamp);

    for (const { key: evictKey } of candidates) {
      try {
        localStorage.removeItem(evictKey);
        localStorage.setItem(key, value);
        return; // succeeded after eviction
      } catch {
        // Keep evicting older entries until write succeeds or we run out
      }
    }
    // All eviction attempts failed — give up silently
  }
}

export async function fetchHistoricalStats(year) {
  const cacheKey = `sleeper_stats_${year}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < SEVEN_DAYS_MS) return data;
    }
  } catch {
    // ignore cache read issues
  }

  const data = await fetchSleeper(`/stats/nfl/regular/${year}`).catch(() => ({}));
  safeLocalStorageWrite(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
  return data;
}

/**
 * Fetch deep historical seasons (pre-2018) for building empirical age curves
 * and comp databases. These seasons are fully immutable so we cache aggressively.
 */
export async function fetchDeepHistoricalStats(year) {
  const cacheKey = `sleeper_stats_deep_${year}`;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const { timestamp, data } = JSON.parse(cached);
      if (Date.now() - timestamp < THIRTY_DAYS_MS) return data;
    }
  } catch {
    // ignore cache read issues
  }

  const data = await fetchSleeper(`/stats/nfl/regular/${year}`).catch(() => ({}));
  safeLocalStorageWrite(cacheKey, JSON.stringify({ timestamp: Date.now(), data }));
  return data;
}

export async function fetchDraftPicks(draftId) {
  if (!draftId) return [];
  return fetchSleeper(`/draft/${draftId}/picks`).catch(() => []);
}

async function fetchLeagueTransactionsForSeason(leagueId, maxWeek = 18) {
  const weeks = Array.from({ length: maxWeek }, (_, index) => index + 1);
  const responses = await Promise.all(
    weeks.map((week) =>
      fetchSleeper(`/league/${leagueId}/transactions/${week}`).catch(() => []),
    ),
  );

  return responses
    .flat()
    .filter((transaction) => transaction?.status === "complete");
}

export async function fetchLeagueTransactions(
  league,
  maxSeasons = 8,
  fallbackMaxWeek = 18,
) {
  const seenLeagues = new Set();
  const transactionMap = new Map();
  let currentLeague = league;
  let seasonsFetched = 0;

  while (currentLeague?.league_id && seasonsFetched < maxSeasons) {
    if (seenLeagues.has(currentLeague.league_id)) break;
    seenLeagues.add(currentLeague.league_id);

    const maxWeek = Math.max(
      fallbackMaxWeek,
      Number(currentLeague.settings?.playoff_week_start || 15) + 2,
    );
    const txs = await fetchLeagueTransactionsForSeason(
      currentLeague.league_id,
      maxWeek,
    ).catch(() => []);

    txs.forEach((tx) => {
      const key =
        tx.transaction_id ||
        `${tx.leg || "trade"}-${tx.created || Math.random()}`;
      if (!transactionMap.has(key)) transactionMap.set(key, tx);
    });

    seasonsFetched += 1;

    if (!currentLeague.previous_league_id) break;
    currentLeague = await fetchSleeper(
      `/league/${currentLeague.previous_league_id}`,
    ).catch(() => null);
  }

  return Array.from(transactionMap.values()).sort(
    (a, b) => Number(a.created || 0) - Number(b.created || 0),
  );
}
