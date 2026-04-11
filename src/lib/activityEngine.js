// activityEngine.js
// Computes League Activity grades — a measure of how engaged and healthy
// the league is, based on trade volume, breadth, dynasty behavior, and consistency.

const ELITE_TRADES_PER_TEAM_PER_SEASON = 6;
const PICK_TRADE_ELITE_RATE = 0.5;
const PICK_TRADE_GOOD_RATE = 0.25;

export function scoreToGrade(score) {
  if (score >= 80) return { grade: 'A', color: '#00f5a0', label: 'Very Active' };
  if (score >= 65) return { grade: 'B', color: '#7fff7f', label: 'Active' };
  if (score >= 50) return { grade: 'C', color: '#ffd84d', label: 'Average' };
  if (score >= 35) return { grade: 'D', color: '#ff9800', label: 'Quiet' };
  return { grade: 'F', color: '#ff2d55', label: 'Inactive' };
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// Piecewise scale: maps a ratio (0-1) to a score (0-100) with soft thresholds
// at 1/3 and 2/3 of the benchmark.
function piecewiseScale(ratio) {
  if (ratio >= 1.0) return 100;
  if (ratio >= 0.67) return Math.round(70 + ((ratio - 0.67) / 0.33) * 30);
  if (ratio >= 0.33) return Math.round(40 + ((ratio - 0.33) / 0.34) * 30);
  return Math.round((ratio / 0.33) * 40);
}

// Derive how many distinct seasons are represented in the transaction history.
function countEffectiveSeasons(trades) {
  const years = new Set(trades.map((t) => new Date(t.created).getFullYear()));
  return Math.max(1, Math.min(years.size, 8));
}

// Returns the set of roster IDs that appear as a sender or receiver in any trade.
function getActiveTraderSet(transactions) {
  const active = new Set();
  for (const t of transactions) {
    if (t.adds) {
      for (const rosterId of Object.values(t.adds)) active.add(String(rosterId));
    }
    if (t.drops) {
      for (const rosterId of Object.values(t.drops)) active.add(String(rosterId));
    }
    if (t.draft_picks) {
      for (const p of t.draft_picks) {
        if (p.owner_id != null) active.add(String(p.owner_id));
        if (p.previous_owner_id != null) active.add(String(p.previous_owner_id));
      }
    }
  }
  return active;
}

// Count trades that include at least one draft pick for a season at or after the
// trade's own year. Using the trade's timestamp (not the current calendar year)
// ensures historical trades are scored correctly — a 2023 trade with a 2024 pick
// was absolutely a dynasty pick trade at the time it happened.
function countPickTrades(transactions) {
  return transactions.filter((t) => {
    if (!t.draft_picks || !t.draft_picks.length) return false;
    const tradeYear = new Date(t.created).getFullYear();
    return t.draft_picks.some((p) => Number(p.season) >= tradeYear);
  }).length;
}

// --- Component scorers ---

function calcTradeVelocityScore(tradesPerTeamPerSeason) {
  const ratio = tradesPerTeamPerSeason / ELITE_TRADES_PER_TEAM_PER_SEASON;
  return piecewiseScale(clamp(ratio, 0, 1));
}

// Roster management score based on FA/waiver add activity.
// Counts total adds per team per season vs a dynasty benchmark.
// An active dynasty manager picks up ~8–12 players per season (streaming + handcuffs).
// Elite managers hit 15+ adds/season; below 4 is essentially inactive.
function calcRosterMgmtScore(moves, numTeams, effectiveSeasons) {
  const totalAdds = moves.reduce(
    (sum, t) => sum + Object.keys(t.adds || {}).length,
    0
  );
  const addsPerTeamPerSeason = totalAdds / Math.max(1, numTeams) / effectiveSeasons;

  // Piecewise: 15 adds/team/season = 100, 8 = ~70, 4 = ~40, 0 = 0
  const ELITE_ADDS = 15;
  const ratio = addsPerTeamPerSeason / ELITE_ADDS;
  const score = piecewiseScale(clamp(ratio, 0, 1));
  return { score, totalAdds, addsPerTeamPerSeason: Math.round(addsPerTeamPerSeason * 10) / 10 };
}

function calcTradeBreadthScore(transactions, numTeams) {
  const active = getActiveTraderSet(transactions).size;
  const pct = active / Math.max(1, numTeams);
  if (pct >= 0.9) return 100;
  if (pct >= 0.75) return Math.round(70 + ((pct - 0.75) / 0.15) * 30);
  if (pct >= 0.5) return Math.round(40 + ((pct - 0.5) / 0.25) * 30);
  return Math.round((pct / 0.5) * 40);
}

function calcDynastyEngagementScore(transactions) {
  const total = transactions.length;
  if (total === 0) return 0;
  const withPicks = countPickTrades(transactions);
  const rate = withPicks / total;
  if (rate >= PICK_TRADE_ELITE_RATE) return 100;
  if (rate >= PICK_TRADE_GOOD_RATE)
    return Math.round(50 + ((rate - PICK_TRADE_GOOD_RATE) / PICK_TRADE_GOOD_RATE) * 50);
  return Math.round((rate / PICK_TRADE_GOOD_RATE) * 50);
}

function calcConsistencyScore(trades, effectiveSeasons) {
  // Only consider in-season trades (week > 0); offseason trades have arbitrary
  // or missing week values and would unfairly collapse the distribution.
  const inSeason = trades.filter((t) => t.week > 0);
  if (inSeason.length < 3) return 50;

  // Group by (year, week) so the same week number in different seasons is distinct.
  const weekCounts = {};
  for (const t of inSeason) {
    const key = `${new Date(t.created).getFullYear()}-${t.week}`;
    weekCounts[key] = (weekCounts[key] || 0) + 1;
  }

  const total = inSeason.length;
  const numBuckets = Object.keys(weekCounts).length;
  const hhi = Object.values(weekCounts).reduce(
    (sum, count) => sum + (count / total) ** 2,
    0
  );
  // Normalize: 0 = perfectly spread, 1 = all in one bucket.
  // Floor uses 18 week-slots per season — the theoretical max spread.
  const maxBuckets = 18 * effectiveSeasons;
  const minHhi = 1 / Math.max(numBuckets, maxBuckets);
  const hhiNorm = clamp((hhi - minHhi) / (1 - minHhi), 0, 1);
  return Math.round((1 - hhiNorm) * 100);
}

// --- Transaction feed ---

function pickLabel(pick) {
  const ordinal = pick.round === 1 ? '1st' : pick.round === 2 ? '2nd' : pick.round === 3 ? '3rd' : `${pick.round}th`;
  return `${pick.season} ${ordinal}`;
}

// Build a human-readable feed entry for a single transaction from a team's perspective.
function formatTransaction(t, rosterId, players, rosterLabels) {
  const rid = String(rosterId);
  const date = new Date(t.created);
  const year = date.getFullYear();
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const pName = (id) => players[id]?.full_name || players[id]?.first_name && `${players[id].first_name} ${players[id].last_name}` || `Player ${id}`;

  if (t.type === 'trade') {
    const resolveLabel = (id) => rosterLabels.get(Number(id)) || rosterLabels.get(id) || `Roster ${id}`;

    // Build per-partner legs: group sent/received assets by which partner
    // they went to / came from. This makes 3+ team trades readable.
    const legMap = {}; // partnerId → { sent: [], received: [] }
    const allSent = [];
    const allReceived = [];

    // Players: adds[pid] = toRosterId, drops[pid] = fromRosterId
    if (t.adds && t.drops) {
      for (const [pid, toRid] of Object.entries(t.adds)) {
        const fromRid = t.drops[pid];
        if (String(toRid) === rid && fromRid != null) {
          // We received this player — came from fromRid
          const partner = String(fromRid);
          if (!legMap[partner]) legMap[partner] = { sent: [], received: [] };
          legMap[partner].received.push(pName(pid));
          allReceived.push(pName(pid));
        }
        if (fromRid != null && String(fromRid) === rid) {
          // We sent this player — went to toRid
          const partner = String(toRid);
          if (!legMap[partner]) legMap[partner] = { sent: [], received: [] };
          legMap[partner].sent.push(pName(pid));
          allSent.push(pName(pid));
        }
      }
    }
    // Picks
    if (t.draft_picks) {
      for (const pick of t.draft_picks) {
        if (String(pick.owner_id) === rid) {
          const partner = String(pick.previous_owner_id);
          if (!legMap[partner]) legMap[partner] = { sent: [], received: [] };
          legMap[partner].received.push(pickLabel(pick));
          allReceived.push(pickLabel(pick));
        }
        if (String(pick.previous_owner_id) === rid) {
          const partner = String(pick.owner_id);
          if (!legMap[partner]) legMap[partner] = { sent: [], received: [] };
          legMap[partner].sent.push(pickLabel(pick));
          allSent.push(pickLabel(pick));
        }
      }
    }

    const legs = Object.entries(legMap).map(([partnerId, assets]) => ({
      partnerId,
      partnerLabel: resolveLabel(partnerId),
      sent: assets.sent,
      received: assets.received,
    }));
    const isMultiTeam = legs.length > 1;

    return {
      id: t.transaction_id || t.created,
      type: 'trade',
      typeLabel: isMultiTeam ? `${legs.length}-Team Trade` : 'Trade',
      color: '#c084fc',
      year,
      week: t.week || 0,
      date: dateStr,
      sent: allSent,
      received: allReceived,
      legs,
      isMultiTeam,
      partner: legs.map((l) => l.partnerLabel).join(', '),
      description: `Sent ${allSent.join(', ') || '—'} → Received ${allReceived.join(', ') || '—'}`,
    };
  }

  // FA / Waiver
  const added = [];
  const dropped = [];
  if (t.adds) for (const [pid, toRid] of Object.entries(t.adds)) {
    if (String(toRid) === rid) added.push(pName(pid));
  }
  if (t.drops) for (const [pid, fromRid] of Object.entries(t.drops)) {
    if (String(fromRid) === rid) dropped.push(pName(pid));
  }
  const isWaiver = t.type === 'waiver';
  const parts = [];
  if (added.length) parts.push(`Added ${added.join(', ')}`);
  if (dropped.length) parts.push(`Dropped ${dropped.join(', ')}`);

  return {
    id: t.transaction_id || t.created,
    type: t.type,
    typeLabel: isWaiver ? 'Waiver' : 'FA',
    color: isWaiver ? '#64b5f6' : '#7a819c',
    year,
    week: t.week || 0,
    date: dateStr,
    sent: dropped,
    received: added,
    partner: null,
    description: parts.join(' · ') || 'Roster move',
  };
}

// Build a per-team feed of all their transactions, most recent first.
function buildTeamTransactionFeeds(trades, moves, rosters, players, rosterLabels) {
  const allTransactions = [...trades, ...moves].sort(
    (a, b) => Number(b.created || 0) - Number(a.created || 0)
  );

  const feeds = {};
  const years = new Set();

  for (const r of rosters) {
    feeds[String(r.roster_id)] = [];
  }

  for (const t of allTransactions) {
    // Determine which rosters are involved
    const involved = new Set();
    if (t.adds) for (const rid of Object.values(t.adds)) involved.add(String(rid));
    if (t.drops) for (const rid of Object.values(t.drops)) involved.add(String(rid));
    if (t.draft_picks) for (const p of t.draft_picks) {
      if (p.owner_id != null) involved.add(String(p.owner_id));
      if (p.previous_owner_id != null) involved.add(String(p.previous_owner_id));
    }

    for (const rid of involved) {
      if (!feeds[rid]) continue;
      const entry = formatTransaction(t, rid, players, rosterLabels);
      feeds[rid].push(entry);
      years.add(entry.year);
    }
  }

  return { feeds, years: [...years].sort((a, b) => b - a) };
}

// --- Per-team data ---

function buildTeamActivityData(transactions, moves, rosters, users, effectiveSeasons, players) {
  const userById = new Map(
    users.map((u) => [u.user_id, u.metadata?.team_name || u.team_name || u.display_name])
  );

  const claimedRosters = rosters.filter((r) => r.owner_id != null);
  const numTeams = claimedRosters.length;

  const rosterLabels = new Map(
    claimedRosters.map((r) => [
      r.roster_id,
      userById.get(r.owner_id) || r.settings?.team_name || `Roster ${r.roster_id}`,
    ])
  );

  const { feeds, years: feedYears } = buildTeamTransactionFeeds(
    transactions, moves, claimedRosters, players || {}, rosterLabels
  );

  // Per-team stats
  const stats = {};
  for (const r of claimedRosters) {
    const rid = String(r.roster_id);
    stats[rid] = {
      rosterId: r.roster_id,
      label: userById.get(r.owner_id) || r.settings?.team_name || `Roster ${r.roster_id}`,
      trades: 0,
      futurePickTrades: 0,
      faAdds: 0,
      partners: new Set(),
    };
  }

  for (const t of transactions) {
    const involved = new Set();
    if (t.adds) {
      for (const rid of Object.values(t.adds)) involved.add(String(rid));
    }
    if (t.drops) {
      for (const rid of Object.values(t.drops)) involved.add(String(rid));
    }
    if (t.draft_picks) {
      for (const p of t.draft_picks) {
        if (p.owner_id != null) involved.add(String(p.owner_id));
        if (p.previous_owner_id != null) involved.add(String(p.previous_owner_id));
      }
    }

    const tradeYear = new Date(t.created).getFullYear();
    const hasFuturePick =
      t.draft_picks && t.draft_picks.some((p) => Number(p.season) >= tradeYear);

    for (const rid of involved) {
      if (!stats[rid]) continue;
      stats[rid].trades++;
      if (hasFuturePick) stats[rid].futurePickTrades++;
      for (const partner of involved) {
        if (partner !== rid) stats[rid].partners.add(partner);
      }
    }
  }

  // Count FA/waiver adds per team
  for (const move of moves) {
    for (const [, rosterId] of Object.entries(move.adds || {})) {
      const rid = String(rosterId);
      if (stats[rid]) stats[rid].faAdds++;
    }
  }

  // Compute league averages for relative scoring
  const allStats = Object.values(stats);
  const avgTradesPerSeason =
    allStats.reduce((sum, s) => sum + s.trades, 0) / Math.max(1, numTeams) / effectiveSeasons;
  const avgFaAddsPerSeason =
    allStats.reduce((sum, s) => sum + s.faAdds, 0) / Math.max(1, numTeams) / effectiveSeasons;

  return allStats.map((s) => {
    const tradesPerSeason = s.trades / effectiveSeasons;

    // 1. Trade Activity (40%): blend of absolute benchmark + relative to league avg.
    // Pure relative scoring caps average teams at 50 even in elite leagues, which
    // under-rates genuinely active managers. A 50/50 blend rewards both high volume
    // and standing out from leaguemates.
    const ELITE_PER_TEAM = ELITE_TRADES_PER_TEAM_PER_SEASON;
    const absoluteTrade = piecewiseScale(clamp(tradesPerSeason / ELITE_PER_TEAM, 0, 1));
    const relativeTrade = avgTradesPerSeason > 0
      ? Math.round(clamp((tradesPerSeason / avgTradesPerSeason) / 2, 0, 1) * 100)
      : absoluteTrade;
    const tradeActivityScore = Math.round(absoluteTrade * 0.5 + relativeTrade * 0.5);

    // 2. FA/Waiver Activity (25%): blend absolute benchmark + relative.
    // Falls back to 50 (neutral) when no FA data is available in the feed.
    const ELITE_ADDS_PER_TEAM = 15;
    const faAddsPerSeason = s.faAdds / effectiveSeasons;
    const absoluteFa = piecewiseScale(clamp(faAddsPerSeason / ELITE_ADDS_PER_TEAM, 0, 1));
    const relativeFa = avgFaAddsPerSeason > 0
      ? Math.round(clamp((faAddsPerSeason / avgFaAddsPerSeason) / 2, 0, 1) * 100)
      : absoluteFa;
    const faActivityScore = (absoluteFa + relativeFa) > 0
      ? Math.round(absoluteFa * 0.5 + relativeFa * 0.5)
      : 50;

    // 3. Pick Trade Rate (20%)
    const pickRate = s.trades > 0 ? s.futurePickTrades / s.trades : 0;
    const pickRateScore = Math.round(clamp(pickRate / PICK_TRADE_ELITE_RATE, 0, 1) * 100);

    // 4. Trade Diversity (15%)
    const diversityScore = Math.round(
      clamp(s.partners.size / Math.max(1, numTeams - 1), 0, 1) * 100
    );

    const teamActivityScore = Math.round(
      tradeActivityScore * 0.4 +
        faActivityScore * 0.25 +
        pickRateScore * 0.2 +
        diversityScore * 0.15
    );

    return {
      rosterId: s.rosterId,
      label: s.label,
      teamActivityScore,
      grade: scoreToGrade(teamActivityScore),
      tradeCount: s.trades,
      tradesPerSeason: Math.round(tradesPerSeason * 10) / 10,
      faAdds: s.faAdds,
      futurePickTrades: s.futurePickTrades,
      uniquePartners: s.partners.size,
      subScores: {
        tradeActivity: tradeActivityScore,
        faActivity: faActivityScore,
        pickRate: pickRateScore,
        diversity: diversityScore,
      },
      transactions: feeds[String(s.rosterId)] || [],
      feedYears,
    };
  });
}

function buildSummaryText(overallScore, stats) {
  const totalAdds = stats.totalAdds ?? 0;
  if (stats.totalTrades === 0 && totalAdds === 0) {
    return 'No trade history found — this league has no recorded activity.';
  }
  if (stats.totalTrades === 0) {
    return 'No trade history found, but managers are still active on waivers and free agency.';
  }
  const tpt = stats.tradesPerTeamPerSeason.toFixed(1);
  const pickPct = Math.round(stats.pickTradeRate * 100);
  const breadthPct = Math.round((stats.activeTraderCount / stats.numTeams) * 100);

  if (overallScore >= 80) {
    return `This league is very active. Teams average ${tpt} trades/season, ${breadthPct}% are trading, and ${pickPct}% of trades include future picks — strong dynasty engagement.`;
  }
  if (overallScore >= 65) {
    return `This league is in good shape. Teams average ${tpt} trades/season with ${breadthPct}% participation. Increasing pick trading (currently ${pickPct}%) would push activity higher.`;
  }
  if (overallScore >= 50) {
    return `Average activity. ${breadthPct}% of teams have traded, averaging ${tpt} deals/season. Some managers are carrying the league — broader engagement would help.`;
  }
  if (overallScore >= 35) {
    return `This league is quiet. At ${tpt} trades/team/season and only ${breadthPct}% of teams trading, teams are missing out on the dynasty rebuild cycle.`;
  }
  return `Inactive league. Very few trades are happening (${tpt}/team/season). Dynasty value requires active management — teams that don't trade typically fall behind.`;
}

// --- Main export ---

export function buildLeagueActivity(transactions, rosters, users, players) {
  // Include all transactions up to the current calendar year. Offseason trades
  // (e.g. Jan–Aug 2026 before the 2026 NFL season starts) are legitimate dynasty
  // activity and should be visible and scored. countEffectiveSeasons only counts
  // years that actually have transactions, so an empty year can't inflate the
  // denominator.
  const trades = transactions.filter((t) => t.type === 'trade');
  // FA adds and waiver claims — used for the roster management score.
  const moves = transactions.filter(
    (t) => (t.type === 'free_agent' || t.type === 'waiver') && t.adds && Object.keys(t.adds).length > 0
  );

  const claimedRosters = rosters.filter((r) => r.owner_id != null);
  const numTeams = claimedRosters.length || 1;
  // Derive seasons from all transaction types so FA-only years aren't missed.
  const effectiveSeasons = countEffectiveSeasons([...trades, ...moves]);
  const totalTrades = trades.length;

  // Count team-involvements, not just transactions — each trade involves ~2 teams,
  // so dividing raw transaction count by numTeams under-reports by ~2x.
  let tradeInvolvements = 0;
  for (const t of trades) {
    const involved = new Set();
    if (t.adds) for (const rid of Object.values(t.adds)) involved.add(rid);
    if (t.drops) for (const rid of Object.values(t.drops)) involved.add(rid);
    if (t.draft_picks) for (const p of t.draft_picks) {
      if (p.owner_id != null) involved.add(p.owner_id);
      if (p.previous_owner_id != null) involved.add(p.previous_owner_id);
    }
    tradeInvolvements += involved.size;
  }
  const tradesPerTeamPerSeason = tradeInvolvements / numTeams / effectiveSeasons;

  const pickTrades = countPickTrades(trades);
  const pickTradeRate = totalTrades > 0 ? pickTrades / totalTrades : 0;
  const activeTraderCount = getActiveTraderSet(trades).size;

  const velocityScore = calcTradeVelocityScore(tradesPerTeamPerSeason);
  const { score: rosterMgmtScore, totalAdds, addsPerTeamPerSeason } = calcRosterMgmtScore(moves, numTeams, effectiveSeasons);
  const breadthScore = calcTradeBreadthScore(trades, numTeams);
  const dynastyScore = calcDynastyEngagementScore(trades);
  const consistencyScore = calcConsistencyScore(trades, effectiveSeasons);

  const overallScore = Math.round(
    velocityScore * 0.3 +
      rosterMgmtScore * 0.25 +
      breadthScore * 0.2 +
      dynastyScore * 0.15 +
      consistencyScore * 0.1
  );

  const stats = {
    totalTrades,
    totalAdds,
    effectiveSeasons,
    numTeams,
    tradesPerTeamPerSeason: Math.round(tradesPerTeamPerSeason * 10) / 10,
    pickTradeRate,
    activeTraderCount,
  };

  const teams = buildTeamActivityData(trades, moves, claimedRosters, users, effectiveSeasons, players)
    .sort((a, b) => b.teamActivityScore - a.teamActivityScore);

  return {
    overallScore,
    overallGrade: scoreToGrade(overallScore),
    components: {
      tradeVelocity: {
        score: velocityScore,
        weight: 0.3,
        label: 'Trade Velocity',
        description: 'How frequently teams are making trades per season',
        statLine: `${stats.tradesPerTeamPerSeason} trades/team/season`,
      },
      rosterMgmt: {
        score: rosterMgmtScore,
        weight: 0.25,
        label: 'Roster Management',
        description: 'How actively teams work the waiver wire and free agent pool',
        statLine: totalAdds > 0
          ? `${addsPerTeamPerSeason} FA/waiver adds per team/season (${totalAdds} total)`
          : 'No FA/waiver data available',
      },
      tradeBreadth: {
        score: breadthScore,
        weight: 0.2,
        label: 'Trade Breadth',
        description: 'What percentage of teams are participating in trades',
        statLine: `${activeTraderCount} of ${numTeams} teams trading (${Math.round((activeTraderCount / numTeams) * 100)}%)`,
      },
      dynastyEngagement: {
        score: dynastyScore,
        weight: 0.15,
        label: 'Dynasty Engagement',
        description: 'Percentage of trades that include future draft picks',
        statLine: `${Math.round(pickTradeRate * 100)}% of trades include future picks`,
      },
      consistency: {
        score: consistencyScore,
        weight: 0.1,
        label: 'Activity Consistency',
        description: 'How evenly spread trade activity is across the season',
        statLine: `Spread across ${Object.keys(
          trades.reduce((acc, t) => {
            if (t.week > 0) acc[`${new Date(t.created).getFullYear()}-${t.week}`] = 1;
            return acc;
          }, {})
        ).length} of ${18 * effectiveSeasons} week slots`,
      },
    },
    stats,
    teams,
    summaryText: buildSummaryText(overallScore, stats),
  };
}
