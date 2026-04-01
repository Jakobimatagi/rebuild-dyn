const SLEEPER_BASE_URL = import.meta.env.DEV
  ? "/sleeper"
  : "https://api.sleeper.app/v1";

export async function fetchSleeper(path) {
  const res = await fetch(`${SLEEPER_BASE_URL}${path}`);
  if (!res.ok) throw new Error(`Sleeper API error: ${res.status}`);
  return res.json();
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
    .filter(
      (transaction) =>
        transaction?.type === "trade" && transaction?.status === "complete",
    );
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
    const trades = await fetchLeagueTransactionsForSeason(
      currentLeague.league_id,
      maxWeek,
    ).catch(() => []);

    trades.forEach((trade) => {
      const key =
        trade.transaction_id ||
        `${trade.leg || "trade"}-${trade.created || Math.random()}`;
      if (!transactionMap.has(key)) transactionMap.set(key, trade);
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
