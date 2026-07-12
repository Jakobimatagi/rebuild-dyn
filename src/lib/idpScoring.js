// IDP (individual defensive player) + team-defense (DST) fantasy scoring and
// season rankings. Fixed "standard Sleeper" scoring — the admin matchup page
// needs one consistent yardstick across seasons, not per-league settings, so
// the weights live here as tweakable constants rather than being read from a
// league. Dependency-free so it can be unit-tested with node --test.

export const IDP_POSITIONS = ["DL", "LB", "DB"];

export const IDP_SCORING = {
  solo: 1.0,    // solo tackle
  ast: 0.5,     // assisted tackle
  sack: 2.0,
  int: 3.0,
  ff: 2.0,      // forced fumble
  fumRec: 2.0,  // fumble recovery
  td: 6.0,      // defensive TD
  safety: 2.0,
  passDef: 1.0, // pass deflection
};

export const DST_SCORING = {
  sack: 1.0,
  int: 2.0,
  fumRec: 2.0,
  ff: 1.0,
  safety: 2.0,
  blkKick: 2.0,
  td: 6.0, // defensive or special-teams TD
};

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

// Sleeper stat keys, with alias fallbacks: the v1 season dict and v2 weekly
// list mostly agree on the idp_* namespace, but a few keys drift between
// endpoints/eras (idp_safe vs idp_safety, def_td vs idp_td), so each category
// tries the known spellings.
export function idpStatLine(s = {}) {
  return {
    solo: n(s.idp_tkl_solo ?? s.tkl_solo),
    ast: n(s.idp_tkl_ast ?? s.tkl_ast),
    sack: n(s.idp_sack ?? s.sack),
    int: n(s.idp_int ?? s.int),
    ff: n(s.idp_ff ?? s.ff),
    fumRec: n(s.idp_fum_rec ?? s.fum_rec),
    td: n(s.idp_def_td ?? s.idp_td ?? s.def_td),
    safety: n(s.idp_safe ?? s.idp_safety ?? s.safe),
    passDef: n(s.idp_pass_def ?? s.pass_def ?? s.idp_pd),
  };
}

export function dstStatLine(s = {}) {
  return {
    sack: n(s.sack ?? s.def_sack),
    int: n(s.int ?? s.def_int),
    fumRec: n(s.fum_rec ?? s.def_fum_rec),
    ff: n(s.ff ?? s.def_ff),
    safety: n(s.safe ?? s.safety),
    blkKick: n(s.blk_kick),
    td: n(s.def_td) + n(s.def_st_td ?? s.st_td),
    ptsAllow: s.pts_allow ?? s.pts_allowed ?? null,
  };
}

/**
 * Points-allowed tier bonus for a single game (standard DST tiers).
 * Takes the raw points allowed in ONE game — applying it to a season total
 * would always land in the bottom tier.
 */
export function ptsAllowedTierPoints(ptsAllow) {
  const pa = Number(ptsAllow);
  if (ptsAllow == null || !Number.isFinite(pa)) return 0;
  if (pa <= 0) return 10;
  if (pa <= 6) return 7;
  if (pa <= 13) return 4;
  if (pa <= 20) return 1;
  if (pa <= 27) return 0;
  if (pa <= 34) return -1;
  return -4;
}

/** Fantasy points for an IDP stat object (weekly or season aggregate — linear). */
export function scoreIdp(stats) {
  const line = idpStatLine(stats);
  let total = 0;
  for (const [k, w] of Object.entries(IDP_SCORING)) total += line[k] * w;
  return total;
}

/**
 * Fantasy points for a team-defense stat object covering ONE game (the
 * points-allowed tier is per-game). For season aggregates use
 * `buildIdpRankings`, which approximates the tier from per-game points allowed.
 */
export function scoreDst(stats) {
  const line = dstStatLine(stats);
  let total = ptsAllowedTierPoints(line.ptsAllow);
  for (const [k, w] of Object.entries(DST_SCORING)) total += n(line[k]) * w;
  return total;
}

function isTeamDefId(playerId, playerMeta) {
  if (playerMeta?.position === "DEF") return true;
  return /^[A-Z]{2,3}$/.test(String(playerId));
}

function playerName(id, p) {
  if (!p) return String(id);
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return p.full_name || name || String(id);
}

/**
 * Season fantasy rankings for IDP players (DL/LB/DB) and team defenses (DEF)
 * from a Sleeper v1 season-aggregate stats dict (player_id → stats) plus the
 * players DB (player_id → metadata).
 *
 * IDP scoring is linear so aggregates score exactly. For DEF the per-game
 * points-allowed tier is approximated as tier(season pts_allow / gp) × gp —
 * close enough for a season leaderboard, and flagged in the returned line.
 *
 * Returns rows { player_id, name, pos, team, gp, total, ppg, line } sorted by
 * total desc. `positions` filters to a subset of DL/LB/DB/DEF when given.
 */
export function buildIdpRankings(seasonStats, playersDb, { positions = null, minGp = 1 } = {}) {
  const wanted = positions ? new Set(positions) : null;
  const rows = [];

  for (const [id, stats] of Object.entries(seasonStats || {})) {
    if (!stats) continue;
    const p = playersDb?.[id];
    const gp = n(stats.gp);

    if (isTeamDefId(id, p)) {
      if (wanted && !wanted.has("DEF")) continue;
      if (gp < minGp) continue;
      const line = dstStatLine(stats);
      const paPerGame = line.ptsAllow != null && gp > 0 ? n(line.ptsAllow) / gp : null;
      let total = gp * ptsAllowedTierPoints(paPerGame);
      for (const [k, w] of Object.entries(DST_SCORING)) total += n(line[k]) * w;
      rows.push({
        player_id: id,
        name: playerName(id, p),
        pos: "DEF",
        team: p?.team || id,
        gp,
        total,
        ppg: gp > 0 ? total / gp : 0,
        line: { ...line, paPerGame },
      });
      continue;
    }

    const fantasyPos = p?.fantasy_positions || (p?.position ? [p.position] : []);
    const pos = IDP_POSITIONS.find((ip) => fantasyPos.includes(ip));
    if (!pos) continue;
    if (wanted && !wanted.has(pos)) continue;
    if (gp < minGp) continue;

    const total = scoreIdp(stats);
    if (total <= 0) continue;
    rows.push({
      player_id: id,
      name: playerName(id, p),
      pos,
      team: p?.team || null,
      gp,
      total,
      ppg: gp > 0 ? total / gp : 0,
      line: idpStatLine(stats),
    });
  }

  rows.sort((a, b) => b.total - a.total);
  return rows;
}
