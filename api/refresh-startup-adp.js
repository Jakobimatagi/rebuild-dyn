// ── Weekly community startup-ADP refresh cron ────────────────────────────────
// Dynasty startups have no public ADP endpoint, so we derive one from a community
// value feed (KeepTradeCut) — in startups, consensus value order ≈ ADP. We fetch
// the feed, map players onto Sleeper ids, and write a value-ranked ADP per
// canonical format to Supabase. The browser reads it (anon SELECT) to drive the
// Draft Blueprint example builds and league outlook.
//
// Scheduled via vercel.json crons. Writes with the Supabase service-role key
// (bypasses RLS — see docs/migrations/startup_adp_schema.sql).
//
// Required env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Optional: CRON_SECRET,
// KTC_ADP_URL (override the community feed URL).

import { createClient } from "@supabase/supabase-js";
import { buildSleeperIndex, mapFeedToSleeper, rankByValue } from "../src/lib/startupAdp.js";

// Canonical formats. KTC exposes per-format value objects; we key our rows the
// same way the value-snapshot cron does so the whole app speaks one format vocab.
const FORMATS = [
  { key: "sf_12", valueKey: "superflexValues" },
  { key: "1qb_12", valueKey: "oneQBValues" },
];

const KTC_URL = process.env.KTC_ADP_URL || "https://keeptradecut.com/dev-api/v1/players";
const SLEEPER_PLAYERS_URL = "https://api.sleeper.app/v1/players/nfl";

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "User-Agent": "dynasty-oracle/adp-cron" } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

export default async function handler(req, res) {
  // Guard like snapshot-values: when CRON_SECRET is set, require it.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers?.authorization || "";
    if (auth !== `Bearer ${secret}`) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).json({ error: "missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" });
    return;
  }
  const supabase = createClient(url, serviceKey);

  try {
    const [players, feed] = await Promise.all([fetchJson(SLEEPER_PLAYERS_URL), fetchJson(KTC_URL)]);
    const sleeperIndex = buildSleeperIndex(players);
    const feedRows = Array.isArray(feed) ? feed : feed?.players || feed?.data || [];

    const updatedAt = new Date().toISOString();
    let total = 0;
    const perFormat = {};
    for (const f of FORMATS) {
      const mapped = mapFeedToSleeper(feedRows, sleeperIndex, f.valueKey);
      const rows = rankByValue(mapped).map((r) => ({
        format: f.key,
        sleeper_id: r.sleeper_id,
        name: r.name,
        position: r.position,
        value: r.value,
        adp_rank: r.adp_rank,
        updated_at: updatedAt,
      }));
      perFormat[f.key] = rows.length;
      if (rows.length) {
        // Refresh the format wholesale so dropped players don't linger.
        await supabase.from("startup_adp").delete().eq("format", f.key);
        const { error } = await supabase.from("startup_adp").insert(rows);
        if (error) throw new Error(`insert ${f.key}: ${error.message}`);
        total += rows.length;
      }
    }

    res.status(200).json({ ok: true, total, perFormat, source: KTC_URL });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
