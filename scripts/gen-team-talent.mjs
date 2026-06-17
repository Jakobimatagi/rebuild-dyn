// Regenerate src/lib/teamTalent.js from CFBD's /talent endpoint (recruiting
// talent composite). Produces a per-year, per-team "situation" score (0–100)
// for the prospect grade's situ component — a data-driven, year-specific
// replacement for the hardcoded CONFERENCE_SCORES lookup.
//
// Usage: CFBD_KEY=... node scripts/gen-team-talent.mjs
//        (or it will read CFBD_KEY from .env.local)

import fs from "fs";

function loadKey() {
  if (process.env.CFBD_KEY) return process.env.CFBD_KEY.trim();
  try {
    const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    return env.match(/^CFBD_KEY\s*=\s*(.+)$/m)[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    throw new Error("CFBD_KEY not set and .env.local not found");
  }
}

// Talent → situ (0–100), calibrated to the old CONFERENCE_SCORES scale:
// ~1018 (Alabama) → 95, ~640 (mid-P5) → 68, ~330 (low-FBS) → 46. Clamp 40–95 to
// match that scale's range — the old floor for unlisted (G5/FCS) schools was the
// 40 default, so flooring here at 40 (not 48) keeps those prospects' situ steady
// instead of inflating it +8. Talent 0 (service academies / no recruiting
// composite) is omitted → the grade falls back to CONFERENCE_SCORES, then 40.
const situ = (t) => (t > 0 ? Math.round(Math.min(95, Math.max(40, 22 + t * 0.072))) : null);

const FROM = 2015, TO = 2025;
const base = "https://api.collegefootballdata.com";

async function main() {
  const key = loadKey();
  const H = { Authorization: `Bearer ${key}` };
  const table = {};
  for (let y = FROM; y <= TO; y++) {
    const r = await fetch(`${base}/talent?year=${y}`, { headers: H });
    if (!r.ok) { console.warn(`year ${y}: ${r.status}`); continue; }
    const rows = await r.json().catch(() => []);
    const m = {};
    for (const x of rows || []) { const s = situ(+x.talent); if (s != null) m[x.team] = s; }
    if (Object.keys(m).length) table[y] = m;
  }
  const banner = `// AUTO-GENERATED from CFBD /talent (recruiting talent composite), years ${FROM}–${TO}.
// Per-year, per-team "situation" score (0–100) for the prospect grade's situ
// component — a data-driven, year-specific replacement for the hardcoded
// CONFERENCE_SCORES lookup. Talent normalized: ~1018→95, ~640→68, clamp 40–95.
// Regenerate with scripts/gen-team-talent.mjs when CFBD updates a season.
`;
  const out = new URL("../src/lib/teamTalent.js", import.meta.url);
  fs.writeFileSync(out, banner + "export const TEAM_SITU = " + JSON.stringify(table) + ";\n");
  console.log(`wrote src/lib/teamTalent.js (${Object.keys(table).length} years)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
