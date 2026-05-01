// ── Historical NFL roster proxy ──────────────────────────────────────────────
// Returns a compact { sleeper_id: { team, position, name } } map for the given
// year. Source is nflverse-data's roster_{YEAR}.csv release, which lists
// per-week rosters with sleeper_id, position, and team. We collapse to a
// single primary-team-per-player based on the team they spent the most weeks
// on (handles mid-season trades by attributing to the dominant team — good
// enough for "what was this room?" analysis).
//
// Why we need this:
//   Sleeper's /stats/nfl/regular/{year} endpoint returns season-aggregated
//   fantasy points but no team-per-record, and Sleeper's /players/nfl is
//   *current* state. Without this map, attributing 2022 stats by player.team
//   silently mis-buckets every player who's changed teams since.

const TEAM_FIXUPS = { JAC: "JAX", LA: "LAR" }; // Sleeper uses JAX/LAR

export default async function handler(req, res) {
  const year = Number(req.query?.year);
  if (!Number.isFinite(year) || year < 2009 || year > 2030) {
    return res.status(400).json({ error: "year must be 2009-2030" });
  }

  const url = `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${year}.csv`;
  let text;
  try {
    const upstream = await fetch(url, { redirect: "follow" });
    if (!upstream.ok) {
      return res.status(502).json({ error: `nflverse roster fetch failed: ${upstream.status}` });
    }
    text = await upstream.text();
  } catch (err) {
    return res.status(502).json({ error: "Upstream request failed" });
  }

  const map = parseRosterCsv(text);

  const currentYear = new Date().getFullYear();
  const isPast = year < currentYear;
  // Past seasons are immutable — cache aggressively. Current season can move
  // (e.g., trade deadline, IR moves) so we cache a day with a long SWR.
  const maxAge = isPast ? 2592000 : 86400;
  const swr   = isPast ? 5184000 : 172800;
  res.setHeader("Cache-Control", `public, s-maxage=${maxAge}, stale-while-revalidate=${swr}`);
  return res.status(200).json(map);
}

function parseRosterCsv(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return {};

  const header = splitCsvRow(lines[0]);
  const idx = (col) => header.indexOf(col);
  const iSleeperId = idx("sleeper_id");
  const iTeam      = idx("team");
  const iPos       = idx("position");
  const iName      = idx("full_name");
  if (iSleeperId < 0 || iTeam < 0 || iPos < 0) return {};

  // For each player, count how many weekly rows assigned them to each team,
  // then keep the team with the highest count (ties: latest by row order).
  const counts = new Map(); // sleeperId -> { team -> count }
  const meta   = new Map(); // sleeperId -> { position, name }

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row) continue;
    const cells = splitCsvRow(row);
    const sid = (cells[iSleeperId] || "").trim();
    if (!sid) continue;
    const teamRaw = (cells[iTeam] || "").trim().toUpperCase();
    const team = TEAM_FIXUPS[teamRaw] || teamRaw;
    if (!team) continue;
    const position = (cells[iPos] || "").trim().toUpperCase();
    const name     = (iName >= 0 ? cells[iName] : "").trim();

    if (!counts.has(sid)) counts.set(sid, {});
    const tally = counts.get(sid);
    tally[team] = (tally[team] || 0) + 1;

    if (!meta.has(sid)) meta.set(sid, { position, name });
  }

  const out = {};
  for (const [sid, tally] of counts.entries()) {
    let bestTeam = null;
    let bestCount = -1;
    for (const [team, count] of Object.entries(tally)) {
      if (count > bestCount) { bestCount = count; bestTeam = team; }
    }
    if (!bestTeam) continue;
    const m = meta.get(sid) || {};
    out[sid] = { team: bestTeam, position: m.position || "", name: m.name || "" };
  }
  return out;
}

function splitCsvRow(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}
