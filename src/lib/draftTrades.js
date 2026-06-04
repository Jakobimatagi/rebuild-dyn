// League-wide trade feed for the live draft. Turns raw Sleeper transactions into
// one entry per trade, listing what each team received — readable for 2- and
// 3+-team deals alike. Pure so it can parse both the seeded history and trades
// polled live during the draft through the same path.

function playerName(players, pid) {
  const p = players?.[pid];
  if (!p) return `Player ${pid}`;
  return (
    p.full_name ||
    `${p.first_name || ""} ${p.last_name || ""}`.trim() ||
    `Player ${pid}`
  );
}

function roundOrdinal(round) {
  if (round === 1) return "1st";
  if (round === 2) return "2nd";
  if (round === 3) return "3rd";
  return `${round}th`;
}

function pickLabel(pick) {
  const season = pick.season ? `${pick.season} ` : "";
  return `${season}${roundOrdinal(Number(pick.round))}`;
}

/**
 * @param {Array}  transactions  raw Sleeper transactions (any type; non-trades ignored)
 * @param {Object} opts.players        Sleeper players map (id → player) for names
 * @param {Map}    opts.teamLabelById  rosterId → team label
 * @param {number} opts.myRosterId     viewer's roster id (sorted/ highlighted first)
 * @returns {Array} trades newest-first, each: { id, created, week, isMultiTeam, teams: [{ rosterId, label, isMe, received }] }
 */
export function parseTrades(
  transactions,
  { players = {}, teamLabelById = new Map(), myRosterId } = {},
) {
  const seen = new Set();
  const out = [];

  for (const t of transactions || []) {
    if (t?.type !== "trade") continue;
    const id = String(t.transaction_id || t.created || "");
    if (seen.has(id)) continue;
    seen.add(id);

    // Every roster touched by the deal.
    const involved = new Set((t.roster_ids || []).map(Number));
    if (t.adds) for (const rid of Object.values(t.adds)) involved.add(Number(rid));
    if (t.drops) for (const rid of Object.values(t.drops)) involved.add(Number(rid));
    if (t.draft_picks) {
      for (const p of t.draft_picks) {
        if (p.owner_id != null) involved.add(Number(p.owner_id));
        if (p.previous_owner_id != null) involved.add(Number(p.previous_owner_id));
      }
    }

    // Assets each roster received.
    const received = new Map();
    const ensure = (rid) => {
      if (!received.has(rid)) received.set(rid, []);
      return received.get(rid);
    };
    if (t.adds) {
      for (const [pid, toRid] of Object.entries(t.adds)) {
        ensure(Number(toRid)).push({
          kind: "player",
          label: playerName(players, pid),
          position: (players?.[pid]?.position || "").toUpperCase(),
        });
      }
    }
    if (t.draft_picks) {
      for (const pick of t.draft_picks) {
        if (pick.owner_id != null) {
          ensure(Number(pick.owner_id)).push({ kind: "pick", label: pickLabel(pick) });
        }
      }
    }
    if (Array.isArray(t.waiver_budget)) {
      for (const wb of t.waiver_budget) {
        if (wb.receiver != null) {
          ensure(Number(wb.receiver)).push({
            kind: "faab",
            label: `$${wb.amount} FAAB`,
          });
        }
      }
    }

    const teams = Array.from(involved)
      .map((rid) => ({
        rosterId: rid,
        label: teamLabelById.get(rid) || `Roster ${rid}`,
        isMe: rid === myRosterId,
        received: received.get(rid) || [],
      }))
      .sort((a, b) => (a.isMe === b.isMe ? 0 : a.isMe ? -1 : 1));

    out.push({
      id,
      created: Number(t.created || 0),
      week: t.leg || t.week || 0,
      isMultiTeam: teams.length > 2,
      teams,
    });
  }

  out.sort((a, b) => b.created - a.created);
  return out;
}

/**
 * Merge two raw-transaction lists, de-duped by transaction_id — used to fold
 * freshly polled trades into the seeded history.
 */
export function mergeTransactions(a = [], b = []) {
  const byId = new Map();
  for (const t of [...a, ...b]) {
    const id = String(t?.transaction_id || t?.created || Math.random());
    if (!byId.has(id)) byId.set(id, t);
  }
  return Array.from(byId.values());
}
