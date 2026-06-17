// ── CollegeFootballData (CFBD) proxy ─────────────────────────────────────────
// Holds CFBD_KEY server-side (never shipped to the browser) and does the heavy
// filtering so the client gets compact JSON. CFBD's season-stat endpoint is
// long-format (one row per player×statType) and a year-only query is ~3.5MB,
// so we fetch upstream, filter to the player(s) we care about, and return a
// small normalized shape. Past college seasons are immutable → cache hard.
//
// Routed by ?resource=:
//   search    ?q=NAME                                  → [{ id, name, team, position, height, weight, jersey }]
//   career    ?playerId=ID&position=POS&from=Y&to=Y    → { player, seasons:[ normalized per (year,team) ] }
//   recruiting ?playerId=ID | ?name=NAME&year=Y        → { stars, rating, ranking, committedTo, year } | null
//   draft     ?playerId=ID | ?name=NAME&year=Y         → { round, pick, overall, nflTeam, year } | null
//   class     ?year=Y&position=POS&limit=N             → [{ id, name, team, position, stat }]  (top producers)

const CFBD_BASE = "https://api.collegefootballdata.com";

// Categories we pull per position. Skill players can have both rush+rec lines;
// QBs are passing-first with rushing for mobility.
const CATEGORIES_BY_POS = {
  QB: ["passing", "rushing", "fumbles"],
  RB: ["rushing", "receiving", "fumbles"],
  WR: ["receiving", "rushing", "fumbles", "kickReturns", "puntReturns"],
  TE: ["receiving", "rushing", "fumbles", "kickReturns", "puntReturns"],
};

const PRIMARY_CATEGORY = { QB: "passing", RB: "rushing", WR: "receiving", TE: "receiving" };
const PRIMARY_STATTYPE = { passing: "YDS", rushing: "YDS", receiving: "YDS" };

function normName(s) {
  return (s || "").toLowerCase().replace(/[^a-z]/g, "");
}

async function cfbd(path, key) {
  const res = await fetch(CFBD_BASE + path, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`CFBD ${res.status} on ${path}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Long-format rows → { [statType]: stat } for a single player in one category.
function rowsToStatMap(rows, playerId, category) {
  const out = {};
  for (const r of rows) {
    if (String(r.playerId) !== String(playerId)) continue;
    if (r.category !== category) continue;
    out[r.statType] = r.stat;
    out._team = r.team;
    out._conference = r.conference;
    out._position = r.position;
  }
  return out;
}

const num = (v) => (v === undefined || v === null || v === "" ? null : Number(v));

// ── Enrichment extractors ────────────────────────────────────────────────────
// Compact, prospect-relevant slices of CFBD's richer endpoints. Each returns a
// small object (or null) that rides along on the season and gets collapsed to a
// by-year map client-side, then stashed in the prospect's `athletic` bag.

// Player PPA (CFBD's EPA): per-play value + situational + cumulative.
// From /ppa/players/season.
function pickPlayerPPA(row) {
  if (!row) return null;
  const a = row.averagePPA || {}, t = row.totalPPA || {};
  const out = {
    all: num(a.all), pass: num(a.pass), rush: num(a.rush),
    third: num(a.thirdDown), total: num(t.all),
  };
  return Object.values(out).some((v) => v != null) ? out : null;
}

// Team offense environment: pace, pass-lean, and efficiency — the context that
// inflates or deflates a player's raw counting stats. From /stats/season/advanced.
function pickTeamCtx(row) {
  if (!row) return null;
  const o = row.offense || {};
  const out = {
    pace: num(o.plays), passRate: num(o.passingPlays?.rate),
    success: num(o.successRate), expl: num(o.explosiveness),
    ppa: num(o.ppa), ppo: num(o.pointsPerOpportunity),
  };
  return Object.values(out).some((v) => v != null) ? out : null;
}

// Program strength: SP+ overall/offense (rating + national rank) and roster
// talent composite. From /ratings/sp + /talent.
function pickProgram(spRow, talent) {
  const o = spRow?.offense || {};
  const out = {
    sp: num(spRow?.rating), spRank: num(spRow?.ranking),
    spOff: num(o.rating), spOffRank: num(o.ranking),
    talent: num(talent),
  };
  return Object.values(out).some((v) => v != null) ? out : null;
}

// Full player usage profile (we used to keep only the pass share). Overall +
// rush + situational shares describe how feature vs situational the role was.
// From /player/usage.
function pickUsage(u) {
  const x = u?.usage;
  if (!x) return null;
  const out = {
    overall: num(x.overall), pass: num(x.pass), rush: num(x.rush),
    third: num(x.thirdDown), passingDowns: num(x.passingDowns),
  };
  return Object.values(out).some((v) => v != null) ? out : null;
}

// RB total-offense dominator: the back's share of the team's scrimmage yards and
// TDs (rush + receiving), averaged, as a percentage. `teamTotal` = { yds, td }
// summed across every player on that team-season. ~35%+ is a true workhorse.
function rbDominator(cats, teamTotal) {
  if (!teamTotal) return null;
  const rush = cats.rushing || {}, rec = cats.receiving || {};
  const pYds = (num(rush.YDS) || 0) + (num(rec.YDS) || 0);
  const pTd = (num(rush.TD) || 0) + (num(rec.TD) || 0);
  const shares = [];
  if (teamTotal.yds > 0) shares.push(pYds / teamTotal.yds);
  if (teamTotal.td > 0) shares.push(pTd / teamTotal.td);
  if (!shares.length) return null;
  return Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 1000) / 10;
}

// NCAA passer rating from its components — CFBD doesn't return it directly.
function ncaaPasserRating({ yds, td, comp, int, att }) {
  if (!att) return null;
  return Math.round(((8.4 * yds + 330 * td + 100 * comp - 200 * int) / att) * 10) / 10;
}

// Count distinct games a player appears in for a (year, team), via per-game box
// scores. One upstream call per (year, team); we read the primary category.
async function gamesPlayed(year, team, category, playerId, key) {
  const games = await cfbd(
    `/games/players?year=${year}&team=${encodeURIComponent(team)}&seasonType=regular&category=${category}`,
    key,
  );
  let count = 0;
  for (const g of games || []) {
    const found = (g.teams || []).some((t) =>
      (t.categories || []).some((c) =>
        (c.types || []).some((ty) =>
          (ty.athletes || []).some((a) => String(a.id) === String(playerId)),
        ),
      ),
    );
    if (found) count++;
  }
  return count;
}

// QB quality per team for a season, ranked across every team's primary passer
// (most attempts). Used as WR/TE "QB help" context. Returns { [team]: { p, r, n } }
// where p = percentile 0–100 (100 = best passer that year), r = rank, n = total.
function qbQualityByTeam(passRows) {
  const players = new Map(); // pid -> { team, stats }
  for (const r of passRows || []) {
    const pid = String(r.playerId);
    let P = players.get(pid);
    if (!P) { P = { team: r.team, stats: {} }; players.set(pid, P); }
    P.team = r.team;
    P.stats[r.statType] = Number(r.stat) || 0;
  }
  const byTeam = new Map(); // team -> { att, rating }
  for (const P of players.values()) {
    const att = P.stats.ATT || 0;
    if (!att) continue;
    const cur = byTeam.get(P.team);
    if (!cur || att > cur.att) {
      byTeam.set(P.team, {
        att,
        rating: ncaaPasserRating({
          yds: P.stats.YDS || 0, td: P.stats.TD || 0,
          comp: P.stats.COMPLETIONS || 0, int: P.stats.INT || 0, att,
        }),
      });
    }
  }
  const ranked = [...byTeam.entries()].filter(([, v]) => v.rating != null)
    .sort((a, b) => b[1].rating - a[1].rating);
  const n = ranked.length;
  const out = {};
  ranked.forEach(([team], i) => {
    out[team] = { p: Math.round((1 - i / (n - 1 || 1)) * 100), r: i + 1, n };
  });
  return out;
}

async function buildCareer({ playerId, position, from, to, key }) {
  const pos = (position || "WR").toUpperCase();
  const categories = CATEGORIES_BY_POS[pos] || ["receiving", "rushing"];
  const years = [];
  for (let y = from; y <= to; y++) years.push(y);

  // Fetch every (year, category) scan in parallel, then filter to our player.
  // These are the heavy (~3.5MB) calls; everything downstream is targeted.
  const scanJobs = [];
  for (const y of years) {
    for (const cat of categories) {
      scanJobs.push(
        cfbd(`/stats/player/season?year=${y}&category=${cat}`, key)
          // Keep raw rows only for RB (needed for team scrimmage totals →
          // dominator); drop them otherwise to save memory.
          .then((rows) => ({ y, cat, map: rowsToStatMap(rows, playerId, cat), rows: pos === "RB" ? rows : null }))
          .catch(() => ({ y, cat, map: {}, rows: null })),
      );
    }
  }
  const scans = await Promise.all(scanJobs);

  // Group scans by year → { receiving:{...}, rushing:{...}, passing:{...}, team, conf }
  const byYear = new Map();
  let playerName = null;
  let detectedPos = null;
  for (const { y, cat, map } of scans) {
    if (!Object.keys(map).length) continue;
    if (!byYear.has(y)) byYear.set(y, { team: map._team, conference: map._conference, cats: {} });
    byYear.get(y).cats[cat] = map;
    if (map._team) byYear.get(y).team = map._team;
    detectedPos = detectedPos || map._position;
  }

  // For each season, fetch usage (target-share proxy) and games-played in
  // parallel. Both are targeted (year+team), so payloads are small.
  const primaryCat = PRIMARY_CATEGORY[pos] || "receiving";
  const seasonYears = [...byYear.keys()].sort((a, b) => a - b);
  const enrich = await Promise.all(
    seasonYears.map(async (y) => {
      const { team } = byYear.get(y);
      if (!team) return { y, games: null, passUsage: null };
      const T = encodeURIComponent(team);
      const [games, usageRows, ppaRows, advRows, spRows, talentRows] = await Promise.all([
        gamesPlayed(y, team, primaryCat, playerId, key).catch(() => null),
        cfbd(`/player/usage?year=${y}&team=${T}`, key).catch(() => []),
        cfbd(`/ppa/players/season?year=${y}&team=${T}`, key).catch(() => []),
        cfbd(`/stats/season/advanced?year=${y}&team=${T}`, key).catch(() => []),
        cfbd(`/ratings/sp?year=${y}&team=${T}`, key).catch(() => []),
        cfbd(`/talent?year=${y}`, key).catch(() => []),
      ]);
      const u = (usageRows || []).find((r) => String(r.id) === String(playerId));
      const pp = (ppaRows || []).find((r) => String(r.id) === String(playerId));
      const sp = (spRows || []).find((r) => r.team === team) || (spRows || [])[0];
      const tal = (talentRows || []).find((r) => r.team === team)?.talent ?? null;
      return {
        y, games, name: u?.name,
        passUsage: u?.usage?.pass ?? null,
        usage: pickUsage(u),
        ppa: pickPlayerPPA(pp),
        teamCtx: pickTeamCtx((advRows || [])[0]),
        program: pickProgram(sp, tal),
      };
    }),
  );
  const enrichByYear = new Map(enrich.map((e) => [e.y, e]));

  // RB dominator: team scrimmage totals from the kept raw rows, for the player's
  // team each season.
  const teamTotals = {};
  if (pos === "RB") {
    for (const { y, cat, rows } of scans) {
      if (!rows || (cat !== "rushing" && cat !== "receiving")) continue;
      const team = byYear.get(y)?.team;
      if (!team) continue;
      (teamTotals[y] ??= { yds: 0, td: 0 });
      for (const r of rows) {
        if (r.team !== team) continue;
        if (r.statType === "YDS") teamTotals[y].yds += Number(r.stat) || 0;
        else if (r.statType === "TD") teamTotals[y].td += Number(r.stat) || 0;
      }
    }
  }

  // WR/TE QB-help context: rank the team's primary passer each season. One extra
  // passing scan per year (shared, cached).
  const qbQualByYear = {};
  if (pos === "WR" || pos === "TE") {
    const passScans = await Promise.all(
      seasonYears.map((y) =>
        cfbd(`/stats/player/season?year=${y}&category=passing`, key)
          .then((rows) => ({ y, rows })).catch(() => ({ y, rows: [] })),
      ),
    );
    for (const { y, rows } of passScans) qbQualByYear[y] = qbQualityByTeam(rows);
  }

  const seasons = seasonYears.map((y) => {
    const { team, conference, cats } = byYear.get(y);
    const e = enrichByYear.get(y) || {};
    if (e.name) playerName = playerName || e.name;
    const s = assembleSeason({ year: y, team, conference, cats, games: e.games, passUsage: e.passUsage });
    if (pos === "RB") s.dominator = rbDominator(cats, teamTotals[y]);
    if (pos === "WR" || pos === "TE") s.qbHelp = qbQualByYear[y]?.[team] || null;
    s.ppa = e.ppa || null;
    s.teamCtx = e.teamCtx || null;
    s.program = e.program || null;
    s.usage = e.usage || null;
    return s;
  });

  return {
    player: { id: String(playerId), name: playerName, position: detectedPos || pos },
    seasons,
  };
}

// Normalize one season's per-category stat maps into the compact shape the
// client maps to the form schema. Shared by the single (career) and bulk
// (class-import) paths so both fill identical columns.
function assembleSeason({ year, team, conference, cats, games, passUsage }) {
  const rec = cats.receiving || {};
  const rush = cats.rushing || {};
  const pass = cats.passing || {};
  const fum = cats.fumbles || {};
  const kr = cats.kickReturns || {};
  const pr = cats.puntReturns || {};
  const out = { year, team, conference, games, passUsage };
  if (fum.LOST !== undefined) out.fumblesLost = num(fum.LOST);
  const stYds = (num(kr.YDS) || 0) + (num(pr.YDS) || 0);
  if (stYds) out.specialTeamsYds = stYds;
  if (Object.keys(rec).length) {
    out.receiving = {
      rec: num(rec.REC), yds: num(rec.YDS), td: num(rec.TD),
      ypr: num(rec.YPR), long: num(rec.LONG),
    };
  }
  if (Object.keys(rush).length) {
    out.rushing = {
      car: num(rush.CAR), yds: num(rush.YDS), td: num(rush.TD),
      ypc: num(rush.YPC), long: num(rush.LONG),
    };
  }
  if (Object.keys(pass).length) {
    const passing = {
      att: num(pass.ATT), comp: num(pass.COMPLETIONS), pct: num(pass.PCT),
      yds: num(pass.YDS), ypa: num(pass.YPA), td: num(pass.TD), int: num(pass.INT),
    };
    passing.rating = ncaaPasserRating({
      yds: passing.yds || 0, td: passing.td || 0, comp: passing.comp || 0,
      int: passing.int || 0, att: passing.att || 0,
    });
    out.passing = passing;
  }
  return out;
}

// Games-played for EVERY player in a season, via per-week box scores. One call
// per week (covers all teams); a player is credited a game if they appear in
// any stat type of the category that week. Far cheaper than per-player calls
// when building a whole class. Returns Map(playerId -> games).
async function weekGamesMap(year, category, key) {
  const weeks = [];
  for (let w = 1; w <= 16; w++) weeks.push(w);
  const results = await Promise.all(
    weeks.map((w) =>
      cfbd(`/games/players?year=${year}&week=${w}&seasonType=regular&category=${category}`, key)
        .catch(() => []),
    ),
  );
  const cnt = new Map();
  for (const games of results) {
    for (const g of games || []) {
      const seen = new Set();
      for (const t of g.teams || [])
        for (const c of t.categories || [])
          for (const ty of c.types || [])
            for (const a of ty.athletes || []) seen.add(String(a.id));
      for (const id of seen) cnt.set(id, (cnt.get(id) || 0) + 1);
    }
  }
  return cnt;
}

// Build the top-`limit` producers at a position for a college season, each with
// their multi-season (year-1 .. year) stats. All the heavy work is shared
// across the whole class: category scans, week-iterated games, year-wide usage,
// and one draft lookup — so a 50-player class costs ~the same as a few players.
async function buildClassImport({ year, position, limit, fbsOnly, key }) {
  const pos = (position || "WR").toUpperCase();
  const categories = CATEGORIES_BY_POS[pos] || ["receiving", "rushing", "fumbles"];
  const primaryCat = PRIMARY_CATEGORY[pos] || "receiving";
  const primaryStat = PRIMARY_STATTYPE[primaryCat];
  const from = year - 1;
  const to = year;
  const years = [from, to];

  // FBS team set for the season — used to strip FCS/lower-division producers
  // who pile up yards but aren't NFL dynasty prospects. One call.
  let fbsTeams = null;
  if (fbsOnly) {
    try {
      const teams = await cfbd(`/teams/fbs?year=${year}`, key);
      fbsTeams = new Set((teams || []).map((t) => t.school));
    } catch { fbsTeams = null; }
  }

  // Heavy category scans (shared by every player in the class).
  const scanJobs = [];
  for (const y of years)
    for (const cat of categories)
      scanJobs.push(
        cfbd(`/stats/player/season?year=${y}&category=${cat}`, key)
          .then((rows) => ({ y, cat, rows }))
          .catch(() => ({ y, cat, rows: [] })),
      );
  const scans = await Promise.all(scanJobs);

  // players: id -> { id, name, position, years: Map(y -> { team, conference, cats }) }
  const players = new Map();
  for (const { y, cat, rows } of scans) {
    for (const r of rows) {
      const pid = String(r.playerId);
      let P = players.get(pid);
      if (!P) { P = { id: pid, name: r.player, position: r.position, years: new Map() }; players.set(pid, P); }
      if (r.player) P.name = r.player;
      if (r.position) P.position = r.position;
      let Y = P.years.get(y);
      if (!Y) { Y = { team: r.team, conference: r.conference, cats: {} }; P.years.set(y, Y); }
      Y.team = r.team; Y.conference = r.conference;
      (Y.cats[cat] = Y.cats[cat] || {})[r.statType] = r.stat;
    }
  }

  // Rank by primary stat in the selected season; keep the position's top N.
  const ranked = [...players.values()]
    .filter((P) => (P.position || "").toUpperCase() === pos)
    .map((P) => {
      const Y = P.years.get(to);
      const v = Y && Y.cats[primaryCat] ? num(Y.cats[primaryCat][primaryStat]) : 0;
      return { P, v: v || 0, team: Y?.team };
    })
    .filter((x) => x.v > 0 && (!fbsTeams || fbsTeams.has(x.team)))
    .sort((a, b) => b.v - a.v)
    .slice(0, limit);

  // Shared enrichment, all one-call-per-year and shared across the whole class:
  // games, usage, player PPA, team advanced (by team), SP+ (by team), talent
  // (by team), draft (one lookup).
  const gamesMaps = {}, usageMaps = {}, ppaMaps = {}, advMaps = {}, spMaps = {}, talentMaps = {};
  await Promise.all([
    ...years.map(async (y) => { gamesMaps[y] = await weekGamesMap(y, primaryCat, key); }),
    ...years.map(async (y) => {
      const rows = await cfbd(`/player/usage?year=${y}`, key).catch(() => []);
      const m = new Map();
      for (const r of rows || []) m.set(String(r.id), pickUsage(r));
      usageMaps[y] = m;
    }),
    ...years.map(async (y) => {
      const rows = await cfbd(`/ppa/players/season?year=${y}`, key).catch(() => []);
      const m = new Map();
      for (const r of rows || []) m.set(String(r.id), pickPlayerPPA(r));
      ppaMaps[y] = m;
    }),
    ...years.map(async (y) => {
      const rows = await cfbd(`/stats/season/advanced?year=${y}`, key).catch(() => []);
      const m = new Map();
      for (const r of rows || []) m.set(r.team, pickTeamCtx(r));
      advMaps[y] = m;
    }),
    ...years.map(async (y) => {
      const rows = await cfbd(`/ratings/sp?year=${y}`, key).catch(() => []);
      const m = new Map();
      for (const r of rows || []) m.set(r.team, r);
      spMaps[y] = m;
    }),
    ...years.map(async (y) => {
      const rows = await cfbd(`/talent?year=${y}`, key).catch(() => []);
      const m = new Map();
      for (const r of rows || []) m.set(r.team, num(r.talent));
      talentMaps[y] = m;
    }),
  ]);
  const draftMap = new Map();
  try {
    const picks = await cfbd(`/draft/picks?year=${year + 1}`, key);
    for (const p of picks || [])
      draftMap.set(String(p.collegeAthleteId), { round: p.round, pick: p.pick, overall: p.overall, nflTeam: p.nflTeam });
  } catch { /* draft year may not exist yet */ }

  // WR/TE QB-help context: rank each team's primary passer per season.
  const qbQualByYear = {};
  if (pos === "WR" || pos === "TE") {
    await Promise.all(years.map(async (y) => {
      const rows = await cfbd(`/stats/player/season?year=${y}&category=passing`, key).catch(() => []);
      qbQualByYear[y] = qbQualityByTeam(rows);
    }));
  }

  // Team scrimmage totals per (year, team) for RB dominator — summed across
  // every scanned player, so it's free (no extra calls).
  const teamTotals = {};
  if (pos === "RB") {
    for (const P of players.values()) {
      for (const [y, Y] of P.years) {
        if (!Y.team) continue;
        const rush = Y.cats.rushing || {}, rec = Y.cats.receiving || {};
        const yds = (num(rush.YDS) || 0) + (num(rec.YDS) || 0);
        const td = (num(rush.TD) || 0) + (num(rec.TD) || 0);
        if (!yds && !td) continue;
        (teamTotals[y] ??= {});
        (teamTotals[y][Y.team] ??= { yds: 0, td: 0 });
        teamTotals[y][Y.team].yds += yds;
        teamTotals[y][Y.team].td += td;
      }
    }
  }

  return ranked.map(({ P }) => {
    const seasonYears = [...P.years.keys()].sort((a, b) => a - b);
    const seasons = seasonYears.map((y) => {
      const Y = P.years.get(y);
      const usage = usageMaps[y]?.get(P.id) ?? null;
      const s = assembleSeason({
        year: y, team: Y.team, conference: Y.conference, cats: Y.cats,
        games: gamesMaps[y]?.get(P.id) ?? null,
        passUsage: usage?.pass ?? null,
      });
      if (pos === "RB") s.dominator = rbDominator(Y.cats, teamTotals[y]?.[Y.team]);
      if (pos === "WR" || pos === "TE") s.qbHelp = qbQualByYear[y]?.[Y.team] || null;
      s.ppa = ppaMaps[y]?.get(P.id) ?? null;
      s.teamCtx = advMaps[y]?.get(Y.team) ?? null;
      s.program = pickProgram(spMaps[y]?.get(Y.team), talentMaps[y]?.get(Y.team));
      s.usage = usage;
      return s;
    });
    return { playerId: P.id, name: P.name, position: pos, seasons, draft: draftMap.get(P.id) || null };
  });
}

async function findRecruiting({ playerId, name, year, key }) {
  // Recruiting is keyed by class year; without one we can't scan efficiently,
  // so require a year (the client passes the player's first college year - 0/1).
  if (!year) return null;
  const rows = await cfbd(
    `/recruiting/players?year=${year}&classification=HighSchool`,
    key,
  );
  const target = normName(name);
  const hit =
    (playerId && rows.find((r) => String(r.athleteId) === String(playerId))) ||
    (target && rows.find((r) => normName(r.name) === target));
  if (!hit) return null;
  return {
    stars: hit.stars ?? null,
    rating: hit.rating ?? null,
    ranking: hit.ranking ?? null,
    committedTo: hit.committedTo ?? null,
    position: hit.position ?? null,
    year: hit.year ?? year,
  };
}

async function findDraft({ playerId, name, year, key }) {
  if (!year) return null;
  const rows = await cfbd(`/draft/picks?year=${year}`, key);
  const target = normName(name);
  const hit =
    (playerId && rows.find((r) => String(r.collegeAthleteId) === String(playerId))) ||
    (target && rows.find((r) => normName(r.name) === target));
  if (!hit) return null;
  return {
    round: hit.round ?? null,
    pick: hit.pick ?? null,
    overall: hit.overall ?? null,
    nflTeam: hit.nflTeam ?? null,
    year: hit.year ?? year,
  };
}

async function buildClass({ year, position, limit, key }) {
  const pos = (position || "WR").toUpperCase();
  const cat = PRIMARY_CATEGORY[pos] || "receiving";
  const statType = PRIMARY_STATTYPE[cat];
  const rows = await cfbd(`/stats/player/season?year=${year}&category=${cat}`, key);
  const byPlayer = new Map();
  for (const r of rows) {
    if (r.position && r.position.toUpperCase() !== pos) continue;
    if (r.statType !== statType) continue;
    byPlayer.set(String(r.playerId), {
      id: String(r.playerId), name: r.player, team: r.team,
      position: r.position, conference: r.conference, stat: num(r.stat),
    });
  }
  return [...byPlayer.values()]
    .sort((a, b) => (b.stat || 0) - (a.stat || 0))
    .slice(0, limit);
}

export default async function handler(req, res) {
  const key = process.env.CFBD_KEY;
  if (!key) {
    return res.status(500).json({ error: "CFBD_KEY is not configured on the server" });
  }
  const q = req.query || {};
  const resource = q.resource;

  try {
    let data;
    if (resource === "search") {
      const term = (q.q || "").trim();
      if (!term) return res.status(400).json({ error: "q (search term) is required" });
      const rows = await cfbd(`/player/search?searchTerm=${encodeURIComponent(term)}`, key);
      data = (rows || []).map((r) => ({
        id: String(r.id), name: r.name, team: r.team, position: r.position,
        height: r.height ?? null, weight: r.weight ?? null, jersey: r.jersey ?? null,
      }));
    } else if (resource === "career") {
      if (!q.playerId) return res.status(400).json({ error: "playerId is required" });
      const to = Number(q.to) || new Date().getFullYear();
      const from = Number(q.from) || to - 4;
      data = await buildCareer({
        playerId: q.playerId, position: q.position, from, to, key,
      });
    } else if (resource === "recruiting") {
      data = await findRecruiting({
        playerId: q.playerId, name: q.name, year: Number(q.year) || null, key,
      });
    } else if (resource === "draft") {
      data = await findDraft({
        playerId: q.playerId, name: q.name, year: Number(q.year) || null, key,
      });
    } else if (resource === "class") {
      if (!q.year) return res.status(400).json({ error: "year is required" });
      data = await buildClass({
        year: Number(q.year), position: q.position, limit: Number(q.limit) || 40, key,
      });
    } else if (resource === "class-import") {
      if (!q.year) return res.status(400).json({ error: "year is required" });
      data = await buildClassImport({
        year: Number(q.year), position: q.position, limit: Number(q.limit) || 50,
        fbsOnly: q.fbsOnly !== "false", key,
      });
    } else {
      return res.status(400).json({ error: `unknown resource: ${resource}` });
    }

    // Past college seasons are immutable; cache hard with a long SWR. Search is
    // cheaper to revalidate but still stable, so a shorter cache is fine.
    const maxAge = resource === "search" ? 86400 : 2592000;
    res.setHeader("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
    return res.status(200).json(data);
  } catch (err) {
    const status = err.status === 401 || err.status === 403 ? 502 : 500;
    return res.status(status).json({ error: err.message || "CFBD request failed" });
  }
}
