#!/usr/bin/env node
// ── OC database CSV importer ─────────────────────────────────────────────────
//
// Merges a CSV of offensive coordinators into src/lib/ocData.js. Use this to
// add a new season's column or correct names without hand-editing the file.
//
// Usage:
//   node scripts/import-ocs.mjs <path/to/data.csv>
//   cat data.csv | node scripts/import-ocs.mjs --stdin
//
// CSV format (header row + one row per team):
//
//   Team,2026,2025,2024,2023,2022
//   DAL,Klayton Adams,Klayton Adams,Brian Schottenheimer,Brian Schottenheimer,Kellen Moore
//   NYG,Matt Nagy,Mike Kafka,Mike Kafka,Mike Kafka,Mike Kafka
//   ...
//
// Rules:
//   - Header row: first column header is anything ("Team" or "Abbr"); other
//     columns are 4-digit years.
//   - Each non-empty cell sets OC_DATA[year][team] = { name: "<value>" } and
//     strips any existing note/partial/playcaller metadata for that slot.
//     If you want metadata back, edit ocData.js directly afterwards.
//   - Empty cell = skip (existing entry preserved).
//   - "Vacant" / "Vacant*" → stored as { name: "Vacant" } (asterisks stripped).
//   - Teams not in the CSV stay untouched. Years not in the CSV stay untouched.
//   - New year columns are added in descending order (newest first).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OC_DATA_PATH = path.resolve(__dirname, "../src/lib/ocData.js");

// ── CSV parsing ──────────────────────────────────────────────────────────────
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV needs a header row plus at least one team row.");

  const header = splitRow(lines[0]);
  const yearCols = header.slice(1).map((h, i) => {
    const y = parseInt(h.trim(), 10);
    if (!Number.isFinite(y) || String(y).length !== 4) {
      throw new Error(`Header column ${i + 2} must be a 4-digit year, got "${h}".`);
    }
    return y;
  });

  const rows = lines.slice(1).map((line, idx) => {
    const cells = splitRow(line);
    if (cells.length !== header.length) {
      throw new Error(`Row ${idx + 2} has ${cells.length} cells, expected ${header.length}.`);
    }
    return { team: cells[0].trim().toUpperCase(), values: cells.slice(1).map((c) => c.trim()) };
  });

  return { yearCols, rows };
}

function splitRow(line) {
  // Tiny CSV splitter — supports double-quoted cells but not embedded newlines.
  const out = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuote = false;
      else cur += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

// ── Merge into existing OC_DATA ──────────────────────────────────────────────
async function loadExisting() {
  const mod = await import(OC_DATA_PATH);
  const validTeams = new Set(mod.NFL_TEAMS.map((t) => t.abbr));
  return { existing: mod.OC_DATA || {}, validTeams };
}

function normalizeName(raw) {
  // Trim trailing footnote markers like "Vacant*" → "Vacant".
  return raw.replace(/\*+$/, "").trim();
}

function mergeData(existing, csv, validTeams) {
  const next = { ...existing };
  // Ensure every CSV year exists as a target object.
  csv.yearCols.forEach((y) => { next[y] = { ...(existing[y] || {}) }; });

  const skipped = [];
  for (const row of csv.rows) {
    if (!validTeams.has(row.team)) {
      skipped.push(row.team);
      continue;
    }
    csv.yearCols.forEach((year, i) => {
      const raw = row.values[i] || "";
      const name = normalizeName(raw);
      if (!name) return; // empty = skip
      next[year][row.team] = { name };
    });
  }
  return { merged: next, skipped };
}

// ── Format and write ────────────────────────────────────────────────────────
function formatEntry(abbr, entry) {
  const parts = [`name: ${JSON.stringify(entry.name)}`];
  if (entry.partial)    parts.push("partial: true");
  if (entry.playcaller) parts.push(`playcaller: ${JSON.stringify(entry.playcaller)}`);
  if (entry.note)       parts.push(`note: ${JSON.stringify(entry.note)}`);
  const pad = abbr.length === 2 ? `${abbr} ` : abbr;
  return `    ${pad}: { ${parts.join(", ")} },`;
}

function formatYearBlock(year, byTeam, abbrs) {
  const lines = [`  ${year}: {`];
  abbrs.forEach((abbr) => { if (byTeam[abbr]) lines.push(formatEntry(abbr, byTeam[abbr])); });
  lines.push(`  },`);
  return lines.join("\n");
}

function formatOcData(merged, abbrs) {
  const years = Object.keys(merged).map(Number).sort((a, b) => b - a);
  const blocks = years.map((y) => formatYearBlock(y, merged[y], abbrs));
  return `export const OC_DATA = {\n${blocks.join("\n")}\n};`;
}

function rewriteOcData(formattedConst) {
  const src = fs.readFileSync(OC_DATA_PATH, "utf8");
  const re  = /export const OC_DATA = \{[\s\S]*?\n\};/;
  if (!re.test(src)) throw new Error("Could not locate OC_DATA constant in ocData.js");
  fs.writeFileSync(OC_DATA_PATH, src.replace(re, formattedConst), "utf8");
}

// ── Entry point ─────────────────────────────────────────────────────────────
async function readInput() {
  const argv = process.argv.slice(2);
  if (argv.includes("--stdin") || argv.length === 0) {
    return await new Promise((resolve, reject) => {
      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { buf += chunk; });
      process.stdin.on("end", () => resolve(buf));
      process.stdin.on("error", reject);
    });
  }
  return fs.readFileSync(argv[0], "utf8");
}

async function main() {
  const csvText = await readInput();
  if (!csvText.trim()) {
    console.error("No CSV content received. Pipe a CSV in or pass a file path.");
    process.exit(1);
  }
  const csv = parseCsv(csvText);
  const { existing, validTeams } = await loadExisting();
  const { merged, skipped } = mergeData(existing, csv, validTeams);

  const abbrs = [...validTeams].sort();
  const out   = formatOcData(merged, abbrs);
  rewriteOcData(out);

  const updates = csv.rows.length * csv.yearCols.length;
  console.error(`✓ updated ${csv.rows.length} teams across years: ${csv.yearCols.join(", ")}`);
  console.error(`  (${updates} cell-slots considered; empty cells skipped)`);
  if (skipped.length) console.error(`  skipped unknown team abbrs: ${skipped.join(", ")}`);
}

main().catch((err) => {
  console.error("FATAL:", err.message || err);
  process.exit(1);
});
