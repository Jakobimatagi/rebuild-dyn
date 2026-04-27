#!/usr/bin/env node
// Import a per-year "Anatomy of Top WR & RB" CSV into historical_players.
//
// Headers drift year-to-year (2018 has multi-line descriptive labels,
// 2026 lacks NFL outcome columns, etc.) so this is header-driven via an
// alias map rather than positional.
//
// Two modes:
//
//   1) Emit a SQL file you paste into the Supabase SQL editor (no env vars):
//        node scripts/import_historical.mjs --dir <directory> --sql <out.sql>
//
//   2) Direct upsert via service-role key (CI / single-year re-imports):
//        SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//        node scripts/import_historical.mjs --dir <directory>
//        node scripts/import_historical.mjs <year> <csv-path>

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ── CSV parser (handles quoted fields with embedded commas + newlines) ───────
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (v) => {
  if (v == null) return null;
  const s = String(v).trim().replace(/,/g, "");
  if (!s || s.toUpperCase() === "N/A") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const str = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return !s || s.toUpperCase() === "N/A" ? null : s;
};
const bool = (v) => {
  const s = str(v);
  if (s == null) return null;
  if (/^y(es)?$/i.test(s)) return true;
  if (/^n(o)?$/i.test(s)) return false;
  return null;
};

const normalizeHeader = (h) =>
  String(h || "")
    .replace(/\s+/g, " ")
    .replace(/[‘’]/g, "'")
    .trim()
    .toLowerCase();

// "1.12" -> { round: 1, pick: 12 }; "UDFA" -> { round: null, pick: null }
function parseDraftCapital(raw) {
  const s = str(raw);
  if (!s) return { round: null, pick: null };
  if (/^udfa$/i.test(s)) return { round: null, pick: null };
  const m = s.match(/^(\d+)\.(\d+)$/);
  if (!m) return { round: null, pick: null };
  return { round: parseInt(m[1], 10), pick: parseInt(m[2], 10) };
}

// ── Header alias maps ────────────────────────────────────────────────────────
// Each entry: canonical key + a regex that matches any header variant we've
// seen across 2011-2026. Match is run on the lowercased, single-spaced header.
const WR_ALIASES = [
  ["draft_capital",          /draft capital|rounds?\s*\d+(\s*-\s*\d+)?(\s*draft capital)?/],
  ["forty_time",             /^(40 time|4\.\d+( or better)?)$/],
  ["ten_yard_split",         /10 yard split/],
  ["wdom",                   /^wdom$/],
  ["yptpa",                  /^yptpa$/],
  ["ypr_dom",                /^ypr dom$/],
  ["boa",                    /^boa\b/],
  ["boy",                    /^boy\b/],
  ["early_declare",          /early declare/],
  ["height",                 /^(height|6'\+?)$/],
  ["standing_vert",          /standing vert/],
  ["bmi",                    /^bmi$/],
  ["hand_size",              /hand size/],
  ["arm_length",             /arm length/],
  ["ras",                    /^ras$/],
  ["ypr",                    /^ypr$/],
  ["ten_plus_ppg_seasons",   /10\+ ppg seasons/],
  ["avg_top_finish",         /avg top finish/],
];

const RB_ALIASES = [
  ["draft_capital",          /draft capital|rounds?\s*\d+(\s*-\s*\d+)?(\s*draft capital)?/],
  ["speed_score",            /speed score/],
  ["ten_yss",                /^10yss$/],
  ["forty_time",             /^(40 time|4\.\d+( or better)?)$/],
  ["ten_yard_split",         /10 yard split/],
  ["weight",                 /^weight$/],
  ["bmi",                    /^bmi$/],
  ["burst_score",            /burst score/],
  ["burst_density",          /burst density/],
  ["composite_bdr",          /composite bdr/],
  ["career_bdr",             /career bdr/],
  ["peak_bdr",               /peak bdr/],
  ["peak_yardage",           /(peak yardage|1500\+ scrimmage|scrimmage yard season)/],
  ["peak_rec",               /(peak rec|recption season|reception season)/],
  ["ras",                    /^ras$/],
  ["ypa_dom",                /^ypa dom$/],
  ["college_ypa",            /college ypa/],
  ["weighted_ypa_dom",       /weighted ypa dom/],
  ["ten_plus_ppg_seasons",   /10\+ ppg seasons/],
  ["avg_top_finish",         /avg top finish/],
  ["drop_pct",               /^drop %$/],
  ["y_rr",                   /^y\/rr$/],
  ["tgt_yr",                 /^tgt\/yr$/],
  ["rore",                   /^rore$/],
];

const CANONICAL_TYPES = {
  draft_capital: "str",
  early_declare: "bool",
  height: "str",
  standing_vert: "str",
  drop_pct: "str", // contains "%"
  // everything else: numeric
};
const valueType = (key) => CANONICAL_TYPES[key] || "num";
const castValue = (key, raw) => {
  const t = valueType(key);
  if (t === "bool") return bool(raw);
  if (t === "str")  return str(raw);
  return num(raw);
};

function canonicalKey(headerText, aliases) {
  const norm = normalizeHeader(headerText);
  if (!norm) return null;
  for (const [key, re] of aliases) {
    if (re.test(norm)) return key;
  }
  return null;
}

// ── Section detection ────────────────────────────────────────────────────────
// Each section begins with an unlabeled "name" column, followed by a "draft
// capital"-ish header. There are exactly two of those header cells per file.
function findSectionBounds(headerRow) {
  const dcIndices = [];
  headerRow.forEach((h, i) => {
    if (/draft capital|rounds?\s*\d+/i.test(normalizeHeader(h))) dcIndices.push(i);
  });
  if (dcIndices.length < 2) {
    throw new Error("Could not locate two 'Draft Capital' columns in header.");
  }
  const wrNameIdx = dcIndices[0] - 1;
  const rbNameIdx = dcIndices[1] - 1;
  // WR section runs from name col to one before RB name col.
  return { wrNameIdx, wrEndIdx: rbNameIdx - 1, rbNameIdx, rbEndIdx: headerRow.length - 1 };
}

function buildSectionPlan(headerRow, nameIdx, endIdx, aliases) {
  // index → canonical key (or null if unrecognized / blank)
  const plan = [];
  for (let i = nameIdx + 1; i <= endIdx; i++) {
    plan.push({ idx: i, key: canonicalKey(headerRow[i], aliases) });
  }
  return plan;
}

function buildRow(record, nameIdx, plan, position, draftYear) {
  const name = str(record[nameIdx]);
  if (!name) return null;

  const data = {};
  for (const { idx, key } of plan) {
    if (!key) continue;
    const v = castValue(key, record[idx]);
    if (v != null) data[key] = v;
  }

  const { round, pick } = parseDraftCapital(data.draft_capital);

  // Promote a handful of fields to real columns; rest go into metrics jsonb.
  const promoted = new Set([
    "draft_capital",
    "forty_time",
    "ras",
    "ten_plus_ppg_seasons",
    "avg_top_finish",
  ]);
  const metrics = {};
  for (const [k, v] of Object.entries(data)) {
    if (!promoted.has(k)) metrics[k] = v;
  }

  return {
    name,
    position,
    draft_year: draftYear,
    draft_capital: data.draft_capital ?? null,
    draft_round: round,
    draft_pick: pick,
    forty_time: data.forty_time ?? null,
    ras: data.ras ?? null,
    ten_plus_ppg_seasons: data.ten_plus_ppg_seasons ?? null,
    avg_top_finish: data.avg_top_finish ?? null,
    metrics,
  };
}

// ── Per-file pipeline ────────────────────────────────────────────────────────
function loadRowsForFile(filePath, draftYear) {
  const text = readFileSync(filePath, "utf8");
  const parsed = parseCsv(text);
  if (parsed.length < 2) throw new Error(`${filePath}: empty CSV`);

  const header = parsed[0];
  const dataRows = parsed.slice(1).filter((r) => r.some((c) => c && c.trim()));

  const { wrNameIdx, wrEndIdx, rbNameIdx, rbEndIdx } = findSectionBounds(header);
  const wrPlan = buildSectionPlan(header, wrNameIdx, wrEndIdx, WR_ALIASES);
  const rbPlan = buildSectionPlan(header, rbNameIdx, rbEndIdx, RB_ALIASES);

  const wrRows = dataRows.map((r) => buildRow(r, wrNameIdx, wrPlan, "WR", draftYear)).filter(Boolean);
  const rbRows = dataRows.map((r) => buildRow(r, rbNameIdx, rbPlan, "RB", draftYear)).filter(Boolean);

  return { wrRows, rbRows };
}

async function importFile(supabase, filePath, draftYear) {
  const { wrRows, rbRows } = loadRowsForFile(filePath, draftYear);
  const all = [...wrRows, ...rbRows];
  if (all.length === 0) {
    console.log(`  ${draftYear}: no rows`);
    return 0;
  }
  const { error } = await supabase
    .from("historical_players")
    .upsert(all, { onConflict: "name,draft_year" });
  if (error) {
    console.error(`  ${draftYear}: upsert failed`, error.message);
    throw error;
  }
  console.log(`  ${draftYear}: ${wrRows.length} WR + ${rbRows.length} RB = ${all.length}`);
  return all.length;
}

// ── SQL emit ─────────────────────────────────────────────────────────────────
const sqlEscape = (s) => "'" + String(s).replace(/'/g, "''") + "'";
function sqlValue(v) {
  if (v == null) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  return sqlEscape(v);
}
function sqlJson(obj) {
  // jsonb literal: '{"k":1}'::jsonb
  return sqlEscape(JSON.stringify(obj)) + "::jsonb";
}
function rowToSqlValuesList(r) {
  return [
    sqlValue(r.name),
    sqlValue(r.position),
    sqlValue(r.draft_year),
    sqlValue(r.draft_capital),
    sqlValue(r.draft_round),
    sqlValue(r.draft_pick),
    sqlValue(r.forty_time),
    sqlValue(r.ras),
    sqlValue(r.ten_plus_ppg_seasons),
    sqlValue(r.avg_top_finish),
    sqlJson(r.metrics || {}),
  ].join(", ");
}
function emitSqlFile(outPath, allRows) {
  const header =
    "-- Auto-generated by scripts/import_historical.mjs\n" +
    "-- Paste into the Supabase SQL editor AFTER running historical_players_schema.sql\n" +
    `-- ${allRows.length} rows total\n\n` +
    "begin;\n\n" +
    "insert into historical_players (\n" +
    "  name, position, draft_year, draft_capital, draft_round, draft_pick,\n" +
    "  forty_time, ras, ten_plus_ppg_seasons, avg_top_finish, metrics\n" +
    ") values\n";
  const body = allRows.map((r) => "  (" + rowToSqlValuesList(r) + ")").join(",\n");
  const footer =
    "\non conflict (name, draft_year) do update set\n" +
    "  position             = excluded.position,\n" +
    "  draft_capital        = excluded.draft_capital,\n" +
    "  draft_round          = excluded.draft_round,\n" +
    "  draft_pick           = excluded.draft_pick,\n" +
    "  forty_time           = excluded.forty_time,\n" +
    "  ras                  = excluded.ras,\n" +
    "  ten_plus_ppg_seasons = excluded.ten_plus_ppg_seasons,\n" +
    "  avg_top_finish       = excluded.avg_top_finish,\n" +
    "  metrics              = excluded.metrics;\n\n" +
    "commit;\n";
  writeFileSync(outPath, header + body + footer);
}

// ── Entry ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const sqlIdx = args.indexOf("--sql");
const sqlOut = sqlIdx >= 0 ? args[sqlIdx + 1] : null;
const cliArgs = sqlIdx >= 0 ? args.filter((_, i) => i !== sqlIdx && i !== sqlIdx + 1) : args;

const FILE_RE = /Anatomy of Top WR & RB.*?(20\d{2})\.csv$/i;

function gatherDir(dir) {
  return readdirSync(dir)
    .map((n) => {
      const m = n.match(FILE_RE);
      return m ? { path: join(dir, n), year: parseInt(m[1], 10) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.year - b.year);
}

let entries;
if (cliArgs[0] === "--dir") {
  const dir = cliArgs[1];
  if (!dir) { console.error("Usage: --dir <directory> [--sql <out.sql>]"); process.exit(1); }
  entries = gatherDir(dir);
  if (entries.length === 0) { console.error(`No matching CSVs in ${dir}`); process.exit(1); }
} else {
  const [yearArg, csvPath] = cliArgs;
  if (!yearArg || !csvPath) {
    console.error("Usage: node scripts/import_historical.mjs <year> <csv-path> [--sql <out.sql>]");
    console.error("       node scripts/import_historical.mjs --dir <directory> [--sql <out.sql>]");
    process.exit(1);
  }
  const year = parseInt(yearArg, 10);
  if (!Number.isFinite(year)) { console.error(`Invalid year: ${yearArg}`); process.exit(1); }
  entries = [{ path: csvPath, year }];
}

if (sqlOut) {
  // SQL-only path: parse files, emit a SQL file, no Supabase connection.
  const allRows = [];
  for (const e of entries) {
    const { wrRows, rbRows } = loadRowsForFile(e.path, e.year);
    console.log(`  ${e.year}: ${wrRows.length} WR + ${rbRows.length} RB`);
    allRows.push(...wrRows, ...rbRows);
  }
  emitSqlFile(sqlOut, allRows);
  console.log(`\nWrote ${allRows.length} rows to ${sqlOut}`);
  console.log(`Paste that file's contents into the Supabase SQL editor.`);
} else {
  // Direct upsert path.
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.");
    console.error("(or pass --sql <out.sql> to generate a SQL file instead)");
    process.exit(1);
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  let total = 0;
  for (const e of entries) total += await importFile(supabase, e.path, e.year);
  console.log(`Done. Total rows: ${total}`);
}
