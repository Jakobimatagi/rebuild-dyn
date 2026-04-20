import { useEffect, useRef, useState, useCallback } from "react";
import { verifyLogin, fetchAllData, upsertProspect, deleteProspect, upsertAnnotation, fetchMyRankings, upsertExpertRanking, deleteExpertRanking } from "../lib/supabase.js";
import { BLUE_BLOOD_TEAMS, P5_TEAMS, CAPITAL_PROD_SCORES, CONFERENCE_SCORES, TIER_RANK, deriveSchool, computeGrade, deriveTier, dynastyScore } from "../lib/prospectScoring.js";

const POS_COLORS = {
  QB: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  RB: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  WR: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  TE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const GRADE_COLORS = {
  A: "bg-emerald-500 text-emerald-950",
  B: "bg-lime-400 text-lime-950",
  C: "bg-amber-400 text-amber-950",
  D: "bg-orange-500 text-orange-950",
  F: "bg-rose-500 text-rose-950",
};


const CAPITAL_OPTIONS = [
  { value: "", label: "Capital" },
  { value: "early_1", label: "Early 1st" },
  { value: "mid_1",   label: "Mid 1st"   },
  { value: "late_1",  label: "Late 1st"  },
  { value: "early_2", label: "Early 2nd" },
  { value: "mid_2",   label: "Mid 2nd"   },
  { value: "late_2",  label: "Late 2nd"  },
  { value: "early_3", label: "Early 3rd" },
  { value: "late_3",  label: "Late 3rd"  },
  { value: "day3",    label: "Day 3+"    },
  { value: "udfa",    label: "UDFA"      },
];

const TIER_OPTIONS = [
  { value: "",                         label: "Tier",                       tw: "bg-slate-800 text-slate-400 border border-white/10" },
  { value: "Cornerstone",              label: "Cornerstone",                tw: "bg-yellow-400 text-yellow-950" },
  { value: "Foundational",             label: "Foundational",               tw: "bg-emerald-400 text-emerald-950" },
  { value: "Upside Shot",              label: "Upside Shot",                tw: "bg-purple-400 text-purple-950" },
  { value: "Mainstay",                 label: "Mainstay",                   tw: "bg-blue-400 text-blue-950" },
  { value: "Productive Vet",           label: "Productive Vet",             tw: "bg-green-300 text-green-950" },
  { value: "Short Term League Winner", label: "Short Term League Winner",   tw: "bg-orange-400 text-orange-950" },
  { value: "Short Term Production",    label: "Short Term Production",      tw: "bg-yellow-300 text-yellow-950" },
  { value: "Serviceable",              label: "Serviceable",                tw: "bg-slate-300 text-slate-900" },
  { value: "JAG - Insurance",          label: "JAG - Insurance",            tw: "bg-slate-200 text-slate-900" },
  { value: "JAG - Developmental",      label: "JAG - Developmental",        tw: "bg-violet-400 text-violet-950" },
  { value: "Replaceable",              label: "Replaceable",                tw: "bg-rose-500 text-rose-950" },
];


// Per-position season table column definitions
const SEASON_COLS = {
  QB: [
    { key: "season_year",        label: "Year",  w: 52  },
    { key: "age",                label: "Age",   w: 40  },
    { key: "school",             label: "School",w: 110 },
    { key: "games",              label: "Gms",   w: 40  },
    { key: "pass_attempts",      label: "Att",   w: 48  },
    { key: "passing_yards",      label: "PYds",  w: 56  },
    { key: "yards_per_attempt",  label: "YPA",   w: 46  },
    { key: "completion_pct",     label: "CP%",   w: 46  },
    { key: "passing_tds",        label: "TDs",   w: 40  },
    { key: "interceptions",      label: "INTs",  w: 40  },
    { key: "rushing_yards",      label: "RYds",  w: 52  },
    { key: "rushing_tds",        label: "RTDs",  w: 44  },
  ],
  RB: [
    { key: "season_year",        label: "Year",  w: 52  },
    { key: "age",                label: "Age",   w: 40  },
    { key: "school",             label: "School",w: 110 },
    { key: "games",              label: "Gms",   w: 40  },
    { key: "rush_attempts",      label: "Att",   w: 44  },
    { key: "rushing_yards",      label: "RYds",  w: 56  },
    { key: "yards_per_carry",    label: "YPC",   w: 46  },
    { key: "total_tds",          label: "TDs",   w: 40  },
    { key: "receptions",         label: "Rec",   w: 40  },
    { key: "receiving_yards",    label: "RecYds",w: 60  },
    { key: "target_share_pct",   label: "TS%",   w: 46  },
  ],
  WR: [
    { key: "season_year",        label: "Year",  w: 52  },
    { key: "age",                label: "Age",   w: 40  },
    { key: "school",             label: "School",w: 110 },
    { key: "games",              label: "Gms",   w: 40  },
    { key: "receptions",         label: "Rec",   w: 40  },
    { key: "receiving_yards",    label: "Yds",   w: 52  },
    { key: "yards_per_reception",label: "YPR",   w: 46  },
    { key: "target_share_pct",   label: "TS%",   w: 46  },
    { key: "catch_rate_pct",     label: "CR%",   w: 46  },
    { key: "receiving_tds",      label: "TDs",   w: 40  },
    { key: "special_teams_yards",label: "STYds", w: 54  },
  ],
  TE: [
    { key: "season_year",        label: "Year",  w: 52  },
    { key: "age",                label: "Age",   w: 40  },
    { key: "school",             label: "School",w: 110 },
    { key: "games",              label: "Gms",   w: 40  },
    { key: "receptions",         label: "Rec",   w: 40  },
    { key: "receiving_yards",    label: "Yds",   w: 52  },
    { key: "yards_per_reception",label: "YPR",   w: 46  },
    { key: "target_share_pct",   label: "TS%",   w: 46  },
    { key: "catch_rate_pct",     label: "CR%",   w: 46  },
    { key: "receiving_tds",      label: "TDs",   w: 40  },
    { key: "special_teams_yards",label: "STYds", w: 54  },
  ],
};

const ATHLETIC_FIELDS = [
  { key: "fortyYardDash", label: "40-Yd Dash",  placeholder: "4.38" },
  { key: "speedScore",    label: "Speed Score",  placeholder: "110"  },
  { key: "burstScore",    label: "Burst Score",  placeholder: "115"  },
  { key: "agilityScore",  label: "Agility",      placeholder: "106"  },
  { key: "catchRadius",   label: "Catch Radius", placeholder: "8.2"  },
  { key: "heightIn",      label: "Height (in)",  placeholder: "74"   },
  { key: "weightLbs",     label: "Weight (lbs)", placeholder: "190"  },
  { key: "armLengthIn",   label: "Arm (in)",     placeholder: "32.5" },
];

const PAGE_SIZE = 25;
const SESSION_KEY = "rp_session";

function loadSession()        { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
function saveSession(user)    { try { localStorage.setItem(SESSION_KEY, JSON.stringify(user)); } catch {} }
function clearSession()       { try { localStorage.removeItem(SESSION_KEY); } catch {} }

// ── Utils ─────────────────────────────────────────────────────────────────────

function normalizeName(s) {
  return (s || "").toLowerCase().replace(/[^a-z]/g, "");
}
function computeCurrentDraftYear() {
  const n = new Date();
  return n.getMonth() >= 4 ? n.getFullYear() + 1 : n.getFullYear();
}
function schoolTier(team) {
  if (!team) return 2;
  if (BLUE_BLOOD_TEAMS.has(team)) return 5;
  if (P5_TEAMS.has(team)) return 3;
  return 2;
}
function gradeLetter(score) {
  if (score >= 72) return "A";
  if (score >= 55) return "B";
  if (score >= 40) return "C";
  if (score >= 25) return "D";
  return "F";
}

// Returns a blank season object with all fields for the given position.
function blankSeason(position) {
  const base = { season_year: "", age: "", school: "", games: "" };
  if (position === "QB") return { ...base, pass_attempts: "", passing_yards: "", yards_per_attempt: "", completion_pct: "", passing_tds: "", interceptions: "", rushing_yards: "", rushing_tds: "" };
  if (position === "RB") return { ...base, rush_attempts: "", rushing_yards: "", yards_per_carry: "", total_tds: "", receptions: "", receiving_yards: "", target_share_pct: "" };
  return { ...base, receptions: "", receiving_yards: "", yards_per_reception: "", target_share_pct: "", catch_rate_pct: "", receiving_tds: "", special_teams_yards: "" };
}

function initAddForm(position = "WR") {
  return {
    id: null,
    position,
    name: "",
    projectedDraftYear: String(computeCurrentDraftYear()),
    draftCapital: "",
    comparablePlayer: "",
    declared: false,
    rookieDraftAdp: "",
    landingSpot: "",
    tier: "",
    athletic: {},
    seasons: [blankSeason(position)],
  };
}

// ── Comps / similarity ────────────────────────────────────────────────────────

function computeValueScore(p, grade, sleeperRank, rosterData) {
  const ds = dynastyScore(grade, p.position, p.seasons);
  const sleeperBonus = typeof sleeperRank === "number" ? Math.max(0, (50 - sleeperRank) * 0.3) : 0;
  const tradeValue = rosterData?.tradeValues?.[p.name] ?? grade * 0.8;
  return Math.round((ds + sleeperBonus + tradeValue * 0.05) * 10) / 10;
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}
function splitCsvRow(row) {
  const out = []; let cur = ""; let inQ = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQ) { if (ch === '"' && row[i+1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
    else { if (ch === '"') inQ = true; else if (ch === ",") { out.push(cur); cur = ""; } else cur += ch; }
  }
  return [...out, cur];
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvRow(lines[0]).map((h) => h.trim().toLowerCase().replace(/ /g, "_"));
  return lines.slice(1).map((line) => {
    const fields = splitCsvRow(line);
    const obj = {};
    header.forEach((h, i) => { obj[h] = (fields[i] ?? "").trim(); });
    return obj;
  });
}

// Builds prospects array from raw CSV rows (one row per season).
function buildProspects(csvRows) {
  const byId = new Map();
  csvRows.forEach((r) => {
    const id  = (r.player_id || "").trim();
    const nm  = (r.name || "").trim();
    const pos = (r.position || "").toUpperCase().trim();
    if (!id || !nm || !["QB","RB","WR","TE"].includes(pos)) return;
    if (!byId.has(id)) byId.set(id, { id, name: nm, position: pos, seasons: [], draftCapital: "", comparablePlayer: "", athletic: {} });
    const p = byId.get(id);
    if (r.projected_draft_year) p.projectedDraftYear = Number(r.projected_draft_year);
    if (r.draft_capital)        p.draftCapital        = r.draft_capital.trim();
    if (r.comparable_player)    p.comparablePlayer    = r.comparable_player.trim();
    const n = (k) => parseFloat(r[k]) || 0;
    if (n("speed_score"))     p.athletic.speedScore    = n("speed_score");
    if (n("burst_score"))     p.athletic.burstScore    = n("burst_score");
    if (n("agility_score"))   p.athletic.agilityScore  = n("agility_score");
    if (n("forty_yard_dash")) p.athletic.fortyYardDash = n("forty_yard_dash");
    if (n("catch_radius"))    p.athletic.catchRadius   = n("catch_radius");
    if (n("height_in"))       p.athletic.heightIn      = n("height_in");
    if (n("weight_lbs"))      p.athletic.weightLbs     = n("weight_lbs");
    if (n("arm_length_in"))   p.athletic.armLengthIn   = n("arm_length_in");
    if (r.season_year) p.seasons.push(r);
  });
  return Array.from(byId.values())
    .filter((p) => p.seasons.length > 0)
    .map((p) => ({ ...p, projectedDraftYear: p.projectedDraftYear || computeCurrentDraftYear(), school: deriveSchool(p) }));
}

function buildFullCsv(prospects, annotations, sleeperByName) {
  const header = [
    "player_id","name","position","projected_draft_year","draft_capital","comparable_player",
    "speed_score","burst_score","agility_score","forty_yard_dash","catch_radius","height_in","weight_lbs","arm_length_in",
    "declared","tier","landing_spot",
    "season_year","age","school","games",
    "pass_attempts","passing_yards","yards_per_attempt","completion_pct","passing_tds","interceptions","rushing_yards","rushing_tds",
    "rush_attempts","yards_per_carry","total_tds","receptions","receiving_yards","yards_per_reception","target_share_pct","catch_rate_pct","receiving_tds","special_teams_yards",
  ].join(",");

  const rows = [];
  prospects.forEach((p) => {
    const ann = annotations[p.id] || {};
    const ath = p.athletic || {};
    const base = [
      p.id, p.name, p.position, p.projectedDraftYear || "",
      ann.draftCapital || p.draftCapital || "", p.comparablePlayer || "",
      ath.speedScore ?? "", ath.burstScore ?? "", ath.agilityScore ?? "", ath.fortyYardDash ?? "",
      ath.catchRadius ?? "", ath.heightIn ?? "", ath.weightLbs ?? "", ath.armLengthIn ?? "",
      ann.declared ? "yes" : "", ann.tier || "", ann.landingSpot || "",
    ];
    const seasons = p.seasons.length > 0 ? p.seasons : [{}];
    seasons.forEach((s) => {
      rows.push([
        ...base,
        s.season_year ?? "", s.age ?? "", s.school ?? "", s.games ?? "",
        s.pass_attempts ?? "", s.passing_yards ?? "", s.yards_per_attempt ?? "", s.completion_pct ?? "",
        s.passing_tds ?? "", s.interceptions ?? "", s.rushing_yards ?? "", s.rushing_tds ?? "",
        s.rush_attempts ?? "", s.yards_per_carry ?? "", s.total_tds ?? "",
        s.receptions ?? "", s.receiving_yards ?? "", s.yards_per_reception ?? "",
        s.target_share_pct ?? "", s.catch_rate_pct ?? "", s.receiving_tds ?? "", s.special_teams_yards ?? "",
      ].map(csvEscape).join(","));
    });
  });
  return `${header}\n${rows.join("\n")}\n`;
}

// ── Add-player season row ─────────────────────────────────────────────────────

function AddPlayerSeasonRow({ season, position, isFirst, onChange, onRemove }) {
  const cols = SEASON_COLS[position] || SEASON_COLS.WR;
  return (
    <div className="flex gap-1.5 items-end">
      {cols.map((col) => (
        <div key={col.key} style={{ width: col.w }}>
          {isFirst && <div className="text-[9px] text-slate-600 mb-0.5 truncate">{col.label}</div>}
          <input
            value={season[col.key] || ""}
            onChange={(e) => onChange(col.key, e.target.value)}
            className="w-full bg-slate-900 border border-white/10 rounded px-1.5 py-1 text-xs text-slate-200 outline-none focus:border-emerald-400/60"
            placeholder={col.label}
          />
        </div>
      ))}
      <button onClick={onRemove} disabled={!onRemove}
        className="shrink-0 text-rose-400/60 hover:text-rose-400 disabled:opacity-0 text-xs px-1 py-1">✕</button>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function Pill({ pos }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${POS_COLORS[pos] || "border-white/10 text-slate-400"}`}>{pos}</span>;
}

function GradeBadge({ score }) {
  const letter = gradeLetter(score);
  return <span className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-sm font-bold ${GRADE_COLORS[letter]}`}>{letter}</span>;
}

function TierSelect({ value, onChange }) {
  const active = TIER_OPTIONS.find((o) => o.value === value) || TIER_OPTIONS[0];
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}
      className={`text-xs font-semibold rounded px-2 py-1 outline-none cursor-pointer ${active.tw}`}>
      {TIER_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-slate-900 text-slate-100">{o.label}</option>)}
    </select>
  );
}

function CapitalSelect({ value, onChange, className = "" }) {
  const hasVal = value && value !== "";
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}
      className={`text-xs font-semibold rounded px-2 py-1 outline-none cursor-pointer border ${
        hasVal ? "bg-sky-500/20 border-sky-400/50 text-sky-200" : "bg-slate-800 text-slate-400 border-white/10"
      } ${className}`}>
      {CAPITAL_OPTIONS.map((o) => <option key={o.value} value={o.value} className="bg-slate-900 text-slate-100">{o.label}</option>)}
    </select>
  );
}

function StatBar({ label, value }) {
  const pct   = Math.min(100, Math.max(0, Math.round(value)));
  const color = pct >= 75 ? "bg-emerald-400" : pct >= 50 ? "bg-sky-400" : pct >= 30 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-14 text-slate-500 shrink-0 text-right">{label}</span>
      <div className="flex-1 bg-slate-800 rounded-full h-1.5">
        <div className={`${color} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 text-right text-slate-300 font-mono tabular-nums">{pct}</span>
    </div>
  );
}

function ProspectStats({ p }) {
  const sorted = [...(p.seasons || [])].sort((a, b) => Number(a.season_year) - Number(b.season_year));
  const r = sorted[sorted.length - 1];
  if (!r) return null;
  const n = (k) => parseFloat(r[k]) || 0;
  const fmt = (v, d = 1) => v ? v.toFixed(d) : "—";
  if (p.position === "WR" || p.position === "TE") return (
    <div className="flex gap-4 text-xs text-slate-400 mt-1 flex-wrap">
      <span>TS: <span className="text-sky-300 font-semibold">{fmt(n("target_share_pct"))}%</span></span>
      <span>CR: <span className="text-slate-200">{fmt(n("catch_rate_pct"))}%</span></span>
      <span>YPR: <span className="text-slate-200">{fmt(n("yards_per_reception"))}</span></span>
      <span>TDs: <span className="text-slate-200">{n("receiving_tds") || "—"}</span></span>
      <span>Gms: <span className="text-slate-200">{n("games") || "—"}</span></span>
    </div>
  );
  if (p.position === "QB") return (
    <div className="flex gap-4 text-xs text-slate-400 mt-1 flex-wrap">
      <span>CP: <span className="text-sky-300 font-semibold">{fmt(n("completion_pct"))}%</span></span>
      <span>YPA: <span className="text-slate-200">{fmt(n("yards_per_attempt"))}</span></span>
      <span>TDs: <span className="text-slate-200">{n("passing_tds") || "—"}</span></span>
      <span>INTs: <span className="text-rose-300">{n("interceptions") || "—"}</span></span>
    </div>
  );
  if (p.position === "RB") return (
    <div className="flex gap-4 text-xs text-slate-400 mt-1 flex-wrap">
      <span>YPC: <span className="text-sky-300 font-semibold">{fmt(n("yards_per_carry"))}</span></span>
      <span>TS: <span className="text-slate-200">{fmt(n("target_share_pct"))}%</span></span>
      <span>TDs: <span className="text-slate-200">{n("total_tds") || "—"}</span></span>
      <span>Rec: <span className="text-slate-200">{n("receptions") || "—"}</span></span>
    </div>
  );
  return null;
}

function Pagination({ page, total, onChange }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-4 pb-2">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
        className="px-3 py-1.5 rounded-md text-xs font-semibold border border-white/10 bg-slate-900/40 text-slate-300 disabled:opacity-30 hover:border-white/30">← Prev</button>
      {Array.from({ length: total }, (_, i) => i + 1).map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={`w-8 h-8 rounded-md text-xs font-semibold border ${p === page ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" : "border-white/10 bg-slate-900/40 text-slate-400 hover:text-slate-200"}`}>
          {p}
        </button>
      ))}
      <button onClick={() => onChange(Math.min(total, page + 1))} disabled={page === total}
        className="px-3 py-1.5 rounded-md text-xs font-semibold border border-white/10 bg-slate-900/40 text-slate-300 disabled:opacity-30 hover:border-white/30">Next →</button>
    </div>
  );
}

function ProspectCard({ p, rank, adp, grade, components, valueScore, delta, gold, annotation, onAnnotate, onDeclareYear, sleeperDeclared, onEdit }) {
  const [expanded, setExpanded]       = useState(false);
  const [pickingYear, setPickingYear] = useState(false);
  const seasons = [...(p.seasons || [])].sort((a, b) => Number(a.season_year) - Number(b.season_year));
  const curYear = computeCurrentDraftYear();

  return (
    <div className={`rounded-xl border bg-slate-900/60 p-4 ${gold ? "border-amber-400/60 shadow-[0_0_0_1px_rgba(251,191,36,0.25)]" : "border-white/10"}`}>
      <div className="flex items-center gap-4">
        <div className="w-8 text-center shrink-0">
          <div className="text-2xl font-bold text-slate-200">{rank}</div>
        </div>
        <GradeBadge score={grade} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-slate-100 font-semibold">{p.name}</span>
            <Pill pos={p.position} />
            {annotation.declared
              ? <span className="text-[10px] uppercase tracking-wide text-emerald-300 bg-emerald-500/15 border border-emerald-400/40 px-1.5 py-0.5 rounded font-bold">✓ Declared {p.projectedDraftYear}</span>
              : sleeperDeclared
              ? <span className="text-[10px] uppercase tracking-wide text-sky-300 bg-sky-500/15 border border-sky-400/40 px-1.5 py-0.5 rounded font-bold">Sleeper</span>
              : <span className="text-[10px] uppercase tracking-wide text-slate-400 border border-white/10 px-1.5 py-0.5 rounded">{p.projectedDraftYear} Draft</span>
            }
            {p.comparablePlayer && (
              <span className="text-[10px] text-violet-300 bg-violet-500/15 border border-violet-400/30 px-1.5 py-0.5 rounded">Comp: {p.comparablePlayer}</span>
            )}
          </div>
          <div className="text-xs text-slate-400 flex gap-3 flex-wrap">
            <span>{deriveSchool(p) || "—"}</span>
            <span className="text-slate-500">•</span>
            <span>{p.seasons.length} season{p.seasons.length !== 1 ? "s" : ""}</span>
            {typeof adp === "number" && <><span className="text-slate-500">•</span><span>Sleeper #{adp}</span></>}
          </div>
          <ProspectStats p={p} />
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {onEdit && (
              <button onClick={onEdit}
                className="text-xs text-slate-400 hover:text-slate-200 border border-white/10 hover:border-sky-400/40 px-2 py-1 rounded">
                Edit
              </button>
            )}
            {!sleeperDeclared && annotation.declared && (
              <button onClick={() => onAnnotate({ declared: false })}
                className="text-xs font-semibold px-2 py-1 rounded border bg-emerald-500 text-emerald-950 border-emerald-400">
                ✓ Declared
              </button>
            )}
            {!sleeperDeclared && !annotation.declared && !pickingYear && (
              <button onClick={() => setPickingYear(true)}
                className="text-xs font-semibold px-2 py-1 rounded border bg-slate-800 text-slate-500 border-white/10 hover:text-slate-200 hover:border-white/30">
                Declare?
              </button>
            )}
            {!sleeperDeclared && !annotation.declared && pickingYear && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500">Year:</span>
                {[curYear, curYear + 1, curYear + 2].map((y) => (
                  <button key={y} onClick={() => { onDeclareYear(y); setPickingYear(false); }}
                    className="text-xs font-semibold px-2 py-1 rounded border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
                    {y}
                  </button>
                ))}
                <button onClick={() => setPickingYear(false)}
                  className="text-[10px] text-slate-600 hover:text-slate-400 px-1">✕</button>
              </div>
            )}
            <button onClick={() => setExpanded((v) => !v)}
              className="text-xs text-slate-500 hover:text-slate-200 border border-white/10 hover:border-white/30 px-2 py-1 rounded">
              {expanded ? "▲" : "▼"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <TierSelect value={annotation.tier || ""} onChange={(v) => onAnnotate({ tier: v })} />
            <CapitalSelect value={annotation.draftCapital || p.draftCapital || ""} onChange={(v) => onAnnotate({ draftCapital: v })} />
          </div>
          <div className="flex items-center gap-2">
            <input value={annotation.landingSpot || ""} onChange={(e) => onAnnotate({ landingSpot: e.target.value })}
              placeholder="Landing spot…"
              className="bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-emerald-400 w-36" />
            {typeof valueScore === "number" && (
              <div className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${gold ? "bg-amber-400 text-amber-950" : "bg-slate-700 text-slate-100"}`}>{valueScore}</span>
                {delta !== 0 && <span className={`text-xs font-semibold ${delta > 0 ? "text-emerald-400" : "text-rose-400"}`}>{delta > 0 ? "▲" : "▼"}{Math.abs(delta)}</span>}
              </div>
            )}
          </div>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/10 grid md:grid-cols-2 gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Grade Breakdown</div>
            <div className="space-y-1.5">
              <StatBar label="Age"    value={components?.age   ?? 0} />
              <StatBar label="Prod"   value={components?.prod  ?? 0} />
              <StatBar label="Avail"  value={components?.avail ?? 0} />
              <StatBar label="Trend"  value={components?.trend ?? 0} />
              <StatBar label="Situ"   value={components?.situ  ?? 0} />
              {(components?.athletic ?? 0) > 0 && <div className="text-xs text-violet-300">+{components.athletic} athletic bonus</div>}
              {components?.mkt != null && <StatBar label="Market" value={components.mkt} />}
            </div>
            {p.athletic && Object.values(p.athletic).some(Boolean) && (
              <div className="mt-3 text-xs text-slate-400 grid grid-cols-2 gap-x-4 gap-y-1">
                {p.athletic.fortyYardDash > 0 && <span>40-yd: <span className="text-slate-200">{p.athletic.fortyYardDash}s</span></span>}
                {p.athletic.speedScore    > 0 && <span>Speed: <span className="text-slate-200">{p.athletic.speedScore}</span></span>}
                {p.athletic.burstScore    > 0 && <span>Burst: <span className="text-slate-200">{p.athletic.burstScore}</span></span>}
                {p.athletic.agilityScore  > 0 && <span>Agility: <span className="text-slate-200">{p.athletic.agilityScore}</span></span>}
                {p.athletic.heightIn      > 0 && <span>Height: <span className="text-slate-200">{Math.floor(p.athletic.heightIn/12)}'{p.athletic.heightIn%12}"</span></span>}
                {p.athletic.weightLbs     > 0 && <span>Weight: <span className="text-slate-200">{p.athletic.weightLbs} lbs</span></span>}
              </div>
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Season Log</div>
            <div className="space-y-1">
              {seasons.map((s, i) => {
                const n = (k) => parseFloat(s[k]) || 0;
                let line = "";
                if (p.position === "WR" || p.position === "TE") line = `${n("receptions")} rec · ${n("receiving_yards")} yds · ${n("target_share_pct")}% TS · ${n("receiving_tds")} TDs`;
                else if (p.position === "QB") line = `${n("completion_pct")}% CP · ${n("yards_per_attempt")} YPA · ${n("passing_tds")} TDs · ${n("interceptions")} INTs`;
                else if (p.position === "RB") line = `${n("yards_per_carry")} YPC · ${n("total_tds")} TDs · ${n("receptions")} rec · ${n("target_share_pct")}% TS`;
                return (
                  <div key={i} className="text-xs flex gap-2">
                    <span className="text-emerald-400 font-semibold w-10 shrink-0">{s.season_year}</span>
                    <span className="text-slate-400">{s.school || deriveSchool(p)} · {n("games")} gms</span>
                    <span className="text-slate-300 truncate">{line}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── In-page editor ────────────────────────────────────────────────────────────

function CellInput({ value, onChange, placeholder, type = "text", style }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={style}
      className="w-full bg-transparent text-slate-200 text-xs outline-none placeholder-slate-700 focus:bg-slate-800/80 rounded px-1 py-0.5 transition-colors"
    />
  );
}

function ProspectEditorTab({ prospects, sleeperByName, annotations, onProspectsChange }) {
  const [editorPos, setEditorPos]     = useState("WR");
  const [athleticOpen, setAthleticOpen] = useState(() => new Set());

  const posProspects = prospects.filter((p) => p.position === editorPos);
  const cols         = SEASON_COLS[editorPos];

  function addPlayer() {
    const id = `${editorPos.toLowerCase()}-${Date.now().toString(36)}`;
    onProspectsChange([...prospects, {
      id, name: "", position: editorPos, school: "",
      projectedDraftYear: computeCurrentDraftYear(),
      draftCapital: "", comparablePlayer: "",
      seasons: [blankSeason(editorPos)],
      athletic: {},
    }]);
  }

  function removePlayer(id) {
    onProspectsChange(prospects.filter((p) => p.id !== id));
  }

  function updatePlayer(id, field, value) {
    onProspectsChange(prospects.map((p) => p.id === id ? { ...p, [field]: value } : p));
  }

  function updateAthletic(id, field, value) {
    onProspectsChange(prospects.map((p) =>
      p.id === id ? { ...p, athletic: { ...p.athletic, [field]: value } } : p,
    ));
  }

  function addSeason(id) {
    onProspectsChange(prospects.map((p) =>
      p.id === id ? { ...p, seasons: [...p.seasons, blankSeason(p.position)] } : p,
    ));
  }

  function removeSeason(id, si) {
    onProspectsChange(prospects.map((p) =>
      p.id === id ? { ...p, seasons: p.seasons.filter((_, i) => i !== si) } : p,
    ));
  }

  function updateSeason(id, si, field, value) {
    onProspectsChange(prospects.map((p) => {
      if (p.id !== id) return p;
      const seasons = p.seasons.map((s, i) => i === si ? { ...s, [field]: value } : s);
      return { ...p, seasons };
    }));
  }

  function toggleAthletic(id) {
    setAthleticOpen((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* Position sub-tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["QB", "RB", "WR", "TE"].map((pos) => (
          <button key={pos} onClick={() => setEditorPos(pos)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              editorPos === pos ? POS_COLORS[pos] : "border-white/10 text-slate-400 hover:text-slate-200"
            }`}>
            {pos}
            <span className="ml-1.5 text-[10px] opacity-60">({prospects.filter((p) => p.position === pos).length})</span>
          </button>
        ))}
      </div>

      {/* Player cards */}
      <div className="space-y-4">
        {posProspects.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/10 p-10 text-center text-slate-500 text-sm">
            No {editorPos}s added yet.
          </div>
        )}

        {posProspects.map((p) => {
          const sleeperRank = sleeperByName[normalizeName(p.name)]?.rank;
          const ann         = annotations[p.id] || {};
          const capitalKey  = ann.draftCapital || p.draftCapital || "";
          const { total: grade } = computeGrade(p, sleeperRank, capitalKey);
          const athOpen     = athleticOpen.has(p.id);

          return (
            <div key={p.id} className="rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden">
              {/* ── Player header row ── */}
              <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-800/40 border-b border-white/10 flex-wrap">
                <GradeBadge score={grade} />
                <input
                  value={p.name}
                  onChange={(e) => updatePlayer(p.id, "name", e.target.value)}
                  placeholder="Player name"
                  className="font-semibold text-slate-100 bg-transparent outline-none focus:bg-slate-700/50 rounded px-1 py-0.5 min-w-0 w-40 text-sm"
                />
                <span className="text-slate-600 text-xs">{editorPos}</span>
                <input
                  type="number"
                  value={p.projectedDraftYear || ""}
                  onChange={(e) => updatePlayer(p.id, "projectedDraftYear", Number(e.target.value))}
                  placeholder="Draft yr"
                  className="text-xs text-slate-300 bg-slate-800 border border-white/10 rounded px-2 py-1 outline-none focus:border-emerald-400 w-20"
                />
                <CapitalSelect
                  value={p.draftCapital || ""}
                  onChange={(v) => updatePlayer(p.id, "draftCapital", v)}
                />
                <input
                  value={p.comparablePlayer || ""}
                  onChange={(e) => updatePlayer(p.id, "comparablePlayer", e.target.value)}
                  placeholder="Site comp…"
                  className="text-xs text-violet-300 bg-violet-500/10 border border-violet-400/20 rounded px-2 py-1 outline-none focus:border-violet-400/50 w-36"
                />
                <div className="ml-auto flex items-center gap-2">
                  <button onClick={() => toggleAthletic(p.id)}
                    className="text-xs text-slate-500 hover:text-slate-200 border border-white/10 hover:border-white/30 px-2 py-1 rounded transition-colors">
                    Athletics {athOpen ? "▲" : "▾"}
                  </button>
                  <button onClick={() => removePlayer(p.id)}
                    className="text-slate-600 hover:text-rose-400 text-base px-1 transition-colors" title="Remove player">✕</button>
                </div>
              </div>

              {/* ── Athletic data (collapsible) ── */}
              {athOpen && (
                <div className="px-4 py-3 bg-slate-800/20 border-b border-white/10 grid grid-cols-4 gap-3">
                  {ATHLETIC_FIELDS.map(({ key, label, placeholder }) => (
                    <div key={key}>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
                      <input
                        type="number"
                        value={p.athletic?.[key] || ""}
                        onChange={(e) => updateAthletic(p.id, key, e.target.value)}
                        placeholder={placeholder}
                        className="w-full bg-slate-800 border border-white/10 rounded px-2 py-1 text-xs text-slate-200 outline-none focus:border-emerald-400"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* ── Season table ── */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs min-w-max">
                  <thead>
                    <tr className="border-b border-white/5">
                      {cols.map((col) => (
                        <th key={col.key} style={{ minWidth: col.w }} className="text-left text-[10px] uppercase tracking-wider text-slate-500 font-medium px-2 py-2 whitespace-nowrap">
                          {col.label}
                        </th>
                      ))}
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {p.seasons.map((s, si) => (
                      <tr key={si} className="border-b border-white/5 hover:bg-white/[0.02]">
                        {cols.map((col) => (
                          <td key={col.key} style={{ minWidth: col.w }} className="px-2 py-1">
                            <CellInput
                              value={s[col.key] || ""}
                              onChange={(v) => updateSeason(p.id, si, col.key, v)}
                              placeholder="—"
                            />
                          </td>
                        ))}
                        <td className="px-1 py-1">
                          <button onClick={() => removeSeason(p.id, si)}
                            className="text-slate-700 hover:text-rose-400 transition-colors" title="Remove season">✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Add season footer ── */}
              <div className="px-3 py-2 border-t border-white/5">
                <button onClick={() => addSeason(p.id)}
                  className="text-xs text-slate-500 hover:text-emerald-300 transition-colors font-medium">
                  + Add Season
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add player CTA */}
      <button onClick={addPlayer}
        className={`mt-4 w-full py-3 rounded-xl border border-dashed text-sm font-semibold transition-colors hover:bg-white/5 ${POS_COLORS[editorPos]}`}>
        + Add {editorPos}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RookieProspector({ rosterData: rosterDataProp, onLogout }) {
  const [state, setState] = useState({
    unlocked: false,
    initLoading: true,   // true while we check for a persisted session on mount
    user: null,          // { id, username, role }
    usernameInput: "",
    passInput: "",
    gateError: "",
    dbLoading: false,
    tab: "board",
    filters: { QB: true, RB: true, WR: true, TE: true },
    yearFilter: String(computeCurrentDraftYear()),
    prospects: [],
    sleeperByName: {},
    sleeperLoading: false,
    sleeperError: "",
    annotations: {},
    expertRankings: {}, // { [prospect_id]: { rankOrder, tier, notes } }
    page: 1,
    listSearch: "",
    search: "",
    rosterJson: "",
    rosterData: rosterDataProp || null,
    rosterParseError: "",
  });

  const update = (patch) => setState((s) => ({ ...s, ...patch }));
  const annInputRef = useRef(null);
  const [addForm, setAddForm]           = useState(() => initAddForm());
  const [addFormError, setAddFormError] = useState("");
  const [addFormSaving, setAddFormSaving] = useState(false);

  function setAnnotation(id, patch) {
    setState((s) => {
      const merged = { ...(s.annotations[id] || {}), ...patch };
      const next   = { ...s.annotations, [id]: merged };
      upsertAnnotation(id, merged).catch(console.error);
      return { ...s, annotations: next };
    });
  }

  // ── Session restore on mount ──────────────────────────────────────────────────
  useEffect(() => {
    const session = loadSession();
    if (!session) { update({ initLoading: false }); return; }
    Promise.all([fetchAllData(), fetchMyRankings(session.id)])
      .then(([{ prospects, annotations }, expertRankings]) => {
        update({
          unlocked: true, initLoading: false,
          user: session, prospects, annotations, expertRankings,
          tab: prospects.length === 0 ? "add" : "board",
        });
      })
      .catch(() => {
        clearSession();
        update({ initLoading: false });
      });
  }, []);

  async function setExpertRanking(prospectId, rankOrder) {
    if (!state.user) return;
    const next = { ...state.expertRankings };
    if (!rankOrder) {
      delete next[prospectId];
      deleteExpertRanking(state.user.id, prospectId).catch(console.error);
    } else {
      next[prospectId] = { rankOrder, tier: "", notes: "" };
      upsertExpertRanking(state.user.id, prospectId, rankOrder).catch(console.error);
    }
    update({ expertRankings: next });
  }

  async function autoRankUpcoming() {
    if (!state.user || upcomingAll.length === 0) return;
    const next = { ...state.expertRankings };
    await Promise.all(
      upcomingAll.map((x, i) => {
        const rankOrder = i + 1;
        next[x.p.id] = { rankOrder, tier: "", notes: "" };
        return upsertExpertRanking(state.user.id, x.p.id, rankOrder).catch(console.error);
      })
    );
    update({ expertRankings: next });
  }

  function setFormField(field, value) {
    setAddForm((f) => ({ ...f, [field]: value }));
  }

  function updateFormSeason(si, field, value) {
    setAddForm((f) => {
      const seasons = f.seasons.map((s, i) => i === si ? { ...s, [field]: value } : s);
      if (si === 0 && (field === "season_year" || field === "age")) {
        const baseYear = parseInt(seasons[0].season_year) || 0;
        const baseAge  = parseFloat(seasons[0].age) || 0;
        return {
          ...f,
          seasons: seasons.map((s, i) => i === 0 ? s : {
            ...s,
            ...(field === "season_year" && baseYear ? { season_year: String(baseYear + i) } : {}),
            ...(field === "age" && baseAge ? { age: String(parseFloat(baseAge) + i) } : {}),
          }),
        };
      }
      return { ...f, seasons };
    });
  }

  function addFormSeasonRow() {
    setAddForm((f) => {
      const last  = f.seasons[f.seasons.length - 1];
      const blank = blankSeason(f.position);
      const prevYear = parseInt(last?.season_year) || 0;
      const prevAge  = parseFloat(last?.age) || 0;
      return {
        ...f,
        seasons: [...f.seasons, {
          ...blank,
          season_year: prevYear ? String(prevYear + 1) : "",
          age:         prevAge  ? String(prevAge + 1)  : "",
          school:      last?.school || "",
        }],
      };
    });
  }

  function removeFormSeason(si) {
    setAddForm((f) => ({ ...f, seasons: f.seasons.filter((_, i) => i !== si) }));
  }

  async function handleSubmitPlayer() {
    if (!addForm.name.trim()) { setAddFormError("Player name is required."); return; }
    setAddFormSaving(true);
    setAddFormError("");
    try {
      const id = addForm.id || `${addForm.position.toLowerCase()}-${Date.now().toString(36)}`;
      const prospect = {
        id,
        name:               addForm.name.trim(),
        position:           addForm.position,
        projectedDraftYear: parseInt(addForm.projectedDraftYear) || computeCurrentDraftYear(),
        draftCapital:       addForm.draftCapital,
        comparablePlayer:   addForm.comparablePlayer.trim(),
        athletic:           addForm.athletic || {},
        seasons:            addForm.seasons.filter((s) => s.season_year),
      };
      await upsertProspect(prospect);
      const ann = {
        tier:           addForm.tier           || "",
        draftCapital:   addForm.draftCapital   || "",
        landingSpot:    addForm.landingSpot    || "",
        declared:       addForm.declared       || false,
        rookieDraftAdp: addForm.rookieDraftAdp || "",
      };
      await upsertAnnotation(id, ann);
      setState((s) => {
        const existingIdx = s.prospects.findIndex((p) => p.id === id);
        const nextProspects = existingIdx >= 0
          ? s.prospects.map((p) => p.id === id ? prospect : p)
          : [...s.prospects, prospect];
        return { ...s, prospects: nextProspects, annotations: { ...s.annotations, [id]: ann } };
      });
      setAddForm(initAddForm(addForm.position));
      setAddFormSaving(false);
    } catch (err) {
      setAddFormError("Save failed: " + (err.message || err));
      setAddFormSaving(false);
      console.error(err);
    }
  }

  function handleEditProspect(p) {
    const ann = state.annotations[p.id] || {};
    setAddForm({
      ...initAddForm(p.position),
      id:                 p.id,
      name:               p.name,
      projectedDraftYear: String(p.projectedDraftYear || computeCurrentDraftYear()),
      draftCapital:       ann.draftCapital   || p.draftCapital   || "",
      comparablePlayer:   p.comparablePlayer || "",
      declared:           ann.declared       || false,
      rookieDraftAdp:     ann.rookieDraftAdp || "",
      landingSpot:        ann.landingSpot    || "",
      tier:               ann.tier           || "",
      athletic:           p.athletic         || {},
      seasons:            p.seasons.length > 0 ? p.seasons : [blankSeason(p.position)],
    });
    update({ tab: "add" });
  }

  async function moveRank(prospectId, direction) {
    if (!state.user) return;
    const sorted = Object.entries(state.expertRankings)
      .sort(([, a], [, b]) => a.rankOrder - b.rankOrder);
    const idx = sorted.findIndex(([id]) => id === prospectId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const [aId, aData] = sorted[idx];
    const [bId, bData] = sorted[swapIdx];
    const next = {
      ...state.expertRankings,
      [aId]: { ...aData, rankOrder: bData.rankOrder },
      [bId]: { ...bData, rankOrder: aData.rankOrder },
    };
    update({ expertRankings: next });
    await Promise.all([
      upsertExpertRanking(state.user.id, aId, bData.rankOrder).catch(console.error),
      upsertExpertRanking(state.user.id, bId, aData.rankOrder).catch(console.error),
    ]);
  }

  function declareWithYear(prospectId, year) {
    setAnnotation(prospectId, { declared: true });
    setState((s) => {
      const nextProspects = s.prospects.map((p) => {
        if (p.id !== prospectId) return p;
        const updated = { ...p, projectedDraftYear: year };
        upsertProspect(updated).catch(console.error);
        return updated;
      });
      return { ...s, prospects: nextProspects };
    });
  }

  // Called by the editor whenever any prospect data changes — syncs to state + Supabase.
  const handleProspectsChange = useCallback((newProspects) => {
    const normalized = newProspects.map((p) => ({ ...p, school: deriveSchool(p) }));
    update({ prospects: normalized });
    // Persist each changed prospect (fire-and-forget with error log)
    normalized.forEach((p) => upsertProspect(p).catch(console.error));
  }, []);

  // ── Sleeper fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!state.unlocked) return;
    let cancelled = false;
    update({ sleeperLoading: true });
    fetch("https://api.sleeper.app/v1/players/nfl")
      .then((r) => r.json())
      .then((all) => {
        if (cancelled) return;
        const map = {};
        Object.values(all || {}).forEach((pl) => {
          if (!pl?.full_name || typeof pl.search_rank !== "number") return;
          if (pl.years_exp !== 0 && !(pl.years_exp == null && !pl.team)) return;
          map[normalizeName(pl.full_name)] = { rank: pl.search_rank, college: pl.college || null };
        });
        update({ sleeperByName: map, sleeperLoading: false });
      })
      .catch((e) => { if (!cancelled) update({ sleeperError: e.message || "Sleeper failed", sleeperLoading: false }); });
    return () => { cancelled = true; };
  }, [state.unlocked]);

  async function handleUnlock(e) {
    e.preventDefault();
    if (!state.usernameInput.trim()) { update({ gateError: "Enter your username." }); return; }
    update({ dbLoading: true, gateError: "" });
    try {
      const result = await verifyLogin(state.usernameInput.trim(), state.passInput);
      if (!result?.ok) { update({ dbLoading: false, gateError: "Invalid username or passkey." }); return; }
      const user = { id: result.id, username: result.username, role: result.role };
      saveSession(user);
      const [{ prospects, annotations }, expertRankings] = await Promise.all([
        fetchAllData(), fetchMyRankings(user.id),
      ]);
      update({
        unlocked: true, dbLoading: false,
        user, prospects, annotations, expertRankings,
        tab: prospects.length === 0 ? "add" : "board",
      });
    } catch (err) {
      update({ dbLoading: false, gateError: "Connection error — check Supabase config." });
      console.error(err);
    }
  }

  function handleRosterPaste() {
    try { update({ rosterData: JSON.parse(state.rosterJson), rosterParseError: "" }); }
    catch { update({ rosterParseError: "Invalid JSON." }); }
  }

  // Full CSV import — prospects + seasons + annotations
  function handleImportCsv(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const rows = parseCsv(String(e.target?.result || ""));
      const prospects = buildProspects(rows);
      if (prospects.length === 0) { alert("No valid prospect rows found. Check the CSV format."); return; }

      // Extract annotations from same rows (one entry per player_id)
      const annMap = {};
      rows.forEach((r) => {
        const id = (r.player_id || "").trim();
        if (!id) return;
        annMap[id] = {
          tier:         r.tier          || "",
          draftCapital: r.draft_capital  || "",
          landingSpot:  r.landing_spot   || "",
          declared:     (r.declared || "").toLowerCase() === "yes",
        };
      });

      update({ dbLoading: true });
      try {
        await Promise.all(prospects.map((p) => upsertProspect(p)));
        await Promise.all(Object.entries(annMap).map(([id, ann]) => upsertAnnotation(id, ann)));

        // Auto-rank imported prospects by tier → dynastyScore and save to expert_rankings
        let nextExpertRankings = {};
        if (state.user) {
          const ranked = prospects.map((p) => {
            const ann = annMap[p.id] || {};
            const capitalKey = ann.draftCapital || p.draftCapital || "";
            const { total: grade } = computeGrade(p, undefined, capitalKey);
            const tierLabel = ann.tier || deriveTier(grade, capitalKey) || "";
            const ds = dynastyScore(grade, p.position, p.seasons);
            return { p, tierLabel, ds };
          }).sort((a, b) => {
            const aTier = a.tierLabel ? (TIER_RANK[a.tierLabel] ?? 99) : 99;
            const bTier = b.tierLabel ? (TIER_RANK[b.tierLabel] ?? 99) : 99;
            if (aTier !== bTier) return aTier - bTier;
            return b.ds - a.ds;
          });

          await Promise.all(ranked.map((item, i) => {
            const rankOrder = i + 1;
            nextExpertRankings[item.p.id] = { rankOrder, tier: "", notes: "" };
            return upsertExpertRanking(state.user.id, item.p.id, rankOrder);
          }));
        }

        setState((s) => {
          const existingById = new Map(s.prospects.map((p) => [p.id, p]));
          prospects.forEach((p) => existingById.set(p.id, p));
          const nextAnnotations = { ...s.annotations };
          Object.entries(annMap).forEach(([id, ann]) => { nextAnnotations[id] = ann; });
          return {
            ...s, dbLoading: false,
            prospects: Array.from(existingById.values()),
            annotations: nextAnnotations,
            expertRankings: { ...s.expertRankings, ...nextExpertRankings },
          };
        });
      } catch (err) {
        update({ dbLoading: false });
        alert("Import failed: " + (err.message || err));
        console.error(err);
      }
    };
    reader.readAsText(file);
  }

  // Legacy: annotations-only CSV import
  function handleImportAnnotations(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const rows        = parseCsv(String(e.target?.result || ""));
      const tierMap     = new Map(TIER_OPTIONS.map((o) => [o.value.toLowerCase().trim(), o.value]));
      const validCaps   = new Set(CAPITAL_OPTIONS.map((o) => o.value));
      setState((s) => {
        const next = { ...s.annotations };
        const validIds   = new Set(s.prospects.map((p) => String(p.id)));
        const byNormName = new Map(s.prospects.map((p) => [normalizeName(p.name), String(p.id)]));
        rows.forEach((r) => {
          const id = (r.player_id && validIds.has(r.player_id)) ? r.player_id : byNormName.get(normalizeName(r.name));
          if (!id) return;
          const patch = {};
          const tier = tierMap.get((r.tier || "").toLowerCase().trim()) ?? "";
          if (tier) patch.tier = tier;
          if (validCaps.has(r.draft_capital)) patch.draftCapital = r.draft_capital;
          if (r.landing_spot != null) patch.landingSpot = r.landing_spot.trim();
          if (r.declared != null)     patch.declared    = r.declared.toLowerCase() === "yes";
          if (Object.keys(patch).length) next[id] = { ...(next[id] || {}), ...patch };
        });
        Object.entries(next).forEach(([id, ann]) => upsertAnnotation(id, ann).catch(console.error));
        return { ...s, annotations: next };
      });
    };
    reader.readAsText(file);
  }

  // ── Gate ──────────────────────────────────────────────────────────────────────
  if (state.initLoading) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!state.unlocked) {
    return (
      <div className="fixed inset-0 bg-slate-950 flex items-center justify-center p-6">
        <form onSubmit={handleUnlock} className="w-full max-w-sm bg-slate-900/80 border border-white/10 rounded-2xl p-8">
          <div className="text-emerald-400 text-xs uppercase tracking-widest mb-2">Dynasty Pre-Draft Prospector</div>
          <h1 className="text-slate-100 text-2xl font-bold mb-6">Sign In</h1>
          <input type="text" autoFocus value={state.usernameInput} onChange={(e) => update({ usernameInput: e.target.value })}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-slate-100 focus:border-emerald-400 outline-none mb-3" placeholder="Username" />
          <input type="password" value={state.passInput} onChange={(e) => update({ passInput: e.target.value })}
            className="w-full bg-slate-950 border border-white/10 rounded-lg px-4 py-3 text-slate-100 focus:border-emerald-400 outline-none" placeholder="Passkey" />
          {state.gateError && <div className="text-rose-400 text-sm mt-3">{state.gateError}</div>}
          <button type="submit" disabled={state.dbLoading}
            className="mt-6 w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-emerald-950 font-semibold py-3 rounded-lg">
            {state.dbLoading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────────
  const currentDraftYear = computeCurrentDraftYear();
  const draftYearTabs    = [0, 1, 2, 3].map((o) => currentDraftYear + o);

  const isSleeperDeclared = (p) =>
    !!state.sleeperByName[normalizeName(p.name)] &&
    p.projectedDraftYear >= currentDraftYear &&
    p.projectedDraftYear <= currentDraftYear + 1;

  const filtered = state.prospects.filter((p) => {
    if (!state.filters[p.position]) return false;
    if (p.projectedDraftYear < currentDraftYear) return false;
    const ann = state.annotations[p.id] || {};
    if (ann.declared || isSleeperDeclared(p)) return state.yearFilter === String(currentDraftYear);
    return String(p.projectedDraftYear) === state.yearFilter;
  });

  const withGrade = filtered.map((p) => {
    const sleeperRank = state.sleeperByName[normalizeName(p.name)]?.rank;
    const ann         = state.annotations[p.id] || {};
    const capitalKey  = ann.draftCapital || p.draftCapital || "";
    const { total: grade, components } = computeGrade(p, sleeperRank, capitalKey);
    return { p, grade, components, sleeperRank, ann, sleeperDeclared: isSleeperDeclared(p) };
  });

  const listQ   = state.listSearch.trim().toLowerCase();
  const byGrade = [...withGrade]
    .sort((a, b) => b.grade - a.grade)
    .filter((x) => !listQ || x.p.name.toLowerCase().includes(listQ) || deriveSchool(x.p).toLowerCase().includes(listQ));
  const byGradeRank = new Map(byGrade.map((x, i) => [x.p.id, i + 1]));
  const withValue   = withGrade.map((x) => ({ ...x, value: computeValueScore(x.p, x.grade, x.sleeperRank, state.rosterData) }));
  const byValue     = [...withValue].sort((a, b) => b.value - a.value);

  const upcomingAll = state.prospects
    .filter((p) => {
      if (p.projectedDraftYear < currentDraftYear) return false;
      const ann = state.annotations[p.id] || {};
      return ann.declared || isSleeperDeclared(p);
    })
    .map((p) => {
      const sleeperRank = state.sleeperByName[normalizeName(p.name)]?.rank;
      const ann         = state.annotations[p.id] || {};
      const capitalKey  = ann.draftCapital || p.draftCapital || "";
      const { total: grade, components } = computeGrade(p, sleeperRank, capitalKey);
      const suggestedTier = deriveTier(grade, capitalKey);
      const value = computeValueScore(p, grade, sleeperRank, state.rosterData);
      return { p, grade, components, sleeperRank, ann, sleeperDeclared: isSleeperDeclared(p), suggestedTier, value };
    })
    .filter((x) => state.filters[x.p.position])
    .filter((x) => !listQ || x.p.name.toLowerCase().includes(listQ) || deriveSchool(x.p).toLowerCase().includes(listQ))
    .sort((a, b) => {
      const aTierLabel = a.ann.tier || a.suggestedTier || "";
      const bTierLabel = b.ann.tier || b.suggestedTier || "";
      const aTier = aTierLabel ? (TIER_RANK[aTierLabel] ?? 99) : 99;
      const bTier = bTierLabel ? (TIER_RANK[bTierLabel] ?? 99) : 99;
      if (aTier !== bTier) return aTier - bTier;
      const aDs = dynastyScore(a.grade, a.p.position, a.p.seasons);
      const bDs = dynastyScore(b.grade, b.p.position, b.p.seasons);
      return bDs - aDs;
    });

  const exportRows = state.prospects.map((p) => {
    const sleeperRank = state.sleeperByName[normalizeName(p.name)]?.rank;
    const ann         = state.annotations[p.id] || {};
    const capitalKey  = ann.draftCapital || p.draftCapital || "";
    const { total: grade } = computeGrade(p, sleeperRank, capitalKey);
    return {
      id: p.id, name: p.name, position: p.position, school: deriveSchool(p),
      projectedDraftYear: p.projectedDraftYear, declared: !!ann.declared,
      grade, sleeperRank,
      tier: ann.tier || "", draftCapital: capitalKey, landingSpot: ann.landingSpot || "",
    };
  });

  // Expert-rank-sorted list of all filtered prospects (for My Value tab)
  const rankedAll = [...withGrade]
    .filter((x) => !listQ || x.p.name.toLowerCase().includes(listQ) || deriveSchool(x.p).toLowerCase().includes(listQ))
    .sort((a, b) => {
      const aRank = state.expertRankings[a.p.id]?.rankOrder;
      const bRank = state.expertRankings[b.p.id]?.rankOrder;
      if (aRank != null && bRank != null) return aRank - bRank;
      if (aRank != null) return -1;
      if (bRank != null) return 1;
      return b.grade - a.grade;
    });
  const rankedAllPages = Math.ceil(rankedAll.length / PAGE_SIZE);

  // Archive: declared prospects whose draft year has already passed
  const archiveProspects = state.prospects
    .filter((p) => {
      if (!state.filters[p.position]) return false;
      if (p.projectedDraftYear >= currentDraftYear) return false;
      return !!(state.annotations[p.id]?.declared);
    })
    .map((p) => {
      const ann        = state.annotations[p.id] || {};
      const capitalKey = ann.draftCapital || p.draftCapital || "";
      const { total: grade, components } = computeGrade(p, undefined, capitalKey);
      const tierLabel  = ann.tier || deriveTier(grade, capitalKey) || "";
      return { p, ann, grade, components, tierLabel };
    })
    .sort((a, b) => {
      if (b.p.projectedDraftYear !== a.p.projectedDraftYear)
        return b.p.projectedDraftYear - a.p.projectedDraftYear;
      const aTier = a.tierLabel ? (TIER_RANK[a.tierLabel] ?? 99) : 99;
      const bTier = b.tierLabel ? (TIER_RANK[b.tierLabel] ?? 99) : 99;
      if (aTier !== bTier) return aTier - bTier;
      return b.grade - a.grade;
    });

  const maxListPages  = Math.max(Math.ceil(byGrade.length / PAGE_SIZE), rankedAllPages, 1);
  const page          = Math.min(state.page, maxListPages);
  const totalPages    = Math.ceil(byGrade.length / PAGE_SIZE);
  const pagedBoard    = byGrade.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedUpcoming = upcomingAll.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedRankedAll = rankedAll.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const upcomingPages = Math.ceil(upcomingAll.length / PAGE_SIZE);

  const TABS = [
    { id: "add",      label: "Add Player" },
    { id: "upcoming", label: "Upcoming Draft" },
    { id: "board",    label: "Prospect Board" },
    { id: "value",    label: "My Value" },
    { id: "archive",  label: "Archive" },
  ];

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="text-[10px] uppercase tracking-widest text-emerald-400">Admin</div>
              <a href="/" className="text-[10px] text-slate-500 hover:text-slate-300 border border-white/5 px-2 py-0.5 rounded">← Dashboard</a>
            </div>
            <h1 className="text-xl font-bold">Dynasty Pre-Draft Prospector</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs ${Object.keys(state.sleeperByName).length ? "text-emerald-400" : "text-slate-600"}`}>
              {state.sleeperLoading ? "Sleeper…" : state.sleeperError ? "Sleeper error" : Object.keys(state.sleeperByName).length ? `Sleeper ✓` : "Sleeper —"}
            </span>
            {state.user && (
              <span className="text-xs text-slate-400 border border-white/10 px-3 py-1.5 rounded-md">
                {state.user.username} <span className="text-slate-600">·</span> <span className="text-slate-500">{state.user.role}</span>
              </span>
            )}
            <button onClick={() => { clearSession(); update({ unlocked: false, user: null, usernameInput: "", passInput: "", prospects: [], annotations: {} }); if (onLogout) onLogout(); }}
              className="text-xs text-slate-400 hover:text-slate-100 border border-white/10 px-3 py-1.5 rounded-md">Logout</button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 flex gap-6 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => update({ tab: t.id, page: 1 })}
              className={`py-3 text-sm font-semibold border-b-2 whitespace-nowrap ${state.tab === t.id ? "border-emerald-400 text-slate-100" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Add Player tab */}
        {state.tab === "add" && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-100">
                  {addForm.id ? `Editing: ${addForm.name || "Player"}` : "Add Player"}
                </h2>
                {addForm.id && (
                  <button onClick={() => setAddForm(initAddForm())}
                    className="text-xs text-slate-400 hover:text-slate-200 mt-0.5">
                    ← New player
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { downloadCsv(buildFullCsv(state.prospects, state.annotations, state.sleeperByName), `prospects_${computeCurrentDraftYear()}.csv`); }}
                  className="text-xs font-semibold border border-white/10 hover:border-sky-400/60 text-slate-200 px-2.5 py-1.5 rounded-md bg-slate-900/40">
                  Export CSV
                </button>
                <button onClick={() => annInputRef.current?.click()}
                  className="text-xs font-semibold border border-white/10 hover:border-sky-400/60 text-slate-200 px-2.5 py-1.5 rounded-md bg-slate-900/40">
                  {state.dbLoading ? "Importing…" : "Import CSV"}
                </button>
                <input ref={annInputRef} type="file" accept=".csv,text/csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportCsv(f); e.target.value = ""; }} />
                {state.prospects.length > 0 && (
                  <button onClick={async () => { if (confirm("Clear all prospects from the database?")) { await Promise.all(state.prospects.map((p) => deleteProspect(p.id).catch(console.error))); update({ prospects: [], tab: "add" }); } }}
                    className="text-xs font-semibold border border-rose-500/30 hover:border-rose-400/60 text-rose-400 px-2.5 py-1.5 rounded-md bg-slate-900/40">
                    Clear All
                  </button>
                )}
              </div>
            </div>

            {/* Position selector */}
            <div className="flex gap-2 mb-5">
              {["QB","RB","WR","TE"].map((pos) => (
                <button key={pos}
                  onClick={() => setAddForm((f) => ({ ...f, position: pos }))}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    addForm.position === pos ? POS_COLORS[pos] : "border-white/10 text-slate-400 hover:text-slate-200"
                  }`}>
                  {pos}
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 space-y-4">
              {/* Row 1: Name, Draft Year, Capital, Comp */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[160px]">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Player Name</label>
                  <input value={addForm.name} onChange={(e) => setFormField("name", e.target.value)}
                    placeholder="e.g. Travis Hunter"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Draft Year</label>
                  <input type="number" value={addForm.projectedDraftYear}
                    onChange={(e) => setFormField("projectedDraftYear", e.target.value)}
                    className="w-24 bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-400" />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">NFL Capital</label>
                  <CapitalSelect value={addForm.draftCapital} onChange={(v) => setFormField("draftCapital", v)} />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Comparable Player</label>
                  <input value={addForm.comparablePlayer} onChange={(e) => setFormField("comparablePlayer", e.target.value)}
                    placeholder="e.g. Stefon Diggs"
                    className="w-full bg-violet-500/10 border border-violet-400/20 rounded-lg px-3 py-2 text-sm text-violet-300 outline-none focus:border-violet-400/50" />
                </div>
              </div>

              {/* Row 2: Tier, Landing Spot, Rookie ADP, Declared */}
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Tier</label>
                  <TierSelect value={addForm.tier} onChange={(v) => setFormField("tier", v)} />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Landing Spot</label>
                  <input value={addForm.landingSpot} onChange={(e) => setFormField("landingSpot", e.target.value)}
                    placeholder="e.g. Dallas Cowboys"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-400" />
                </div>
                <div className="w-36">
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">Rookie Draft ADP</label>
                  <input value={addForm.rookieDraftAdp} onChange={(e) => setFormField("rookieDraftAdp", e.target.value)}
                    placeholder="e.g. 1.01"
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-400" />
                </div>
                <div className="flex items-center gap-2 pb-2">
                  <input type="checkbox" id="form-declared" checked={addForm.declared}
                    onChange={(e) => setFormField("declared", e.target.checked)}
                    className="w-4 h-4 accent-emerald-400" />
                  <label htmlFor="form-declared" className="text-sm text-slate-300 cursor-pointer">Declared</label>
                </div>
              </div>

              {/* Season rows */}
              <div>
                <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-2">Season Stats</label>
                <div className="space-y-2 overflow-x-auto pb-1">
                  {addForm.seasons.map((season, si) => (
                    <AddPlayerSeasonRow
                      key={si}
                      season={season}
                      position={addForm.position}
                      isFirst={si === 0}
                      onChange={(field, value) => updateFormSeason(si, field, value)}
                      onRemove={addForm.seasons.length > 1 ? () => removeFormSeason(si) : null}
                    />
                  ))}
                </div>
                <button onClick={addFormSeasonRow}
                  className="mt-2 text-xs text-slate-500 hover:text-emerald-300 transition-colors font-medium">
                  + Add Season
                </button>
              </div>

              {addFormError && <div className="text-rose-400 text-sm">{addFormError}</div>}
              <div className="flex items-center gap-3">
                <button onClick={handleSubmitPlayer} disabled={addFormSaving}
                  className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-emerald-950 font-semibold px-6 py-2 rounded-lg text-sm">
                  {addFormSaving ? "Saving…" : addForm.id ? "Update Player" : "Add Player"}
                </button>
                {addForm.id && (
                  <button onClick={() => setAddForm(initAddForm())}
                    className="text-sm text-slate-400 hover:text-slate-200 border border-white/10 px-4 py-2 rounded-lg">
                    Cancel Edit
                  </button>
                )}
                <span className="text-xs text-slate-500 ml-auto">{state.prospects.length} prospects in DB</span>
              </div>
            </div>
          </div>
        )}

        {/* Board / Value / Upcoming share the filter bar */}
        {state.tab !== "add" && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {["QB","RB","WR","TE"].map((pos) => (
              <button key={pos} onClick={() => update({ filters: { ...state.filters, [pos]: !state.filters[pos] } })}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${state.filters[pos] ? POS_COLORS[pos] : "border-white/10 text-slate-500 bg-slate-900/40"}`}>
                {pos}
              </button>
            ))}
            <div className="flex items-center gap-1">
              {draftYearTabs.map((y) => (
                <button key={y} onClick={() => update({ yearFilter: String(y), page: 1 })}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${state.yearFilter === String(y) ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200" : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"}`}>
                  {y}
                </button>
              ))}
            </div>
            <input value={state.listSearch} onChange={(e) => update({ listSearch: e.target.value, page: 1 })}
              placeholder="Search…"
              className="bg-slate-900 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 w-44" />
            <span className="text-xs text-slate-500 ml-auto">{filtered.length} / {state.prospects.length} prospects</span>
          </div>
        )}

        {/* Upcoming Draft — model rankings (tier → dynasty value) */}
        {state.tab === "upcoming" && (
          <div className="space-y-2">
            {upcomingAll.length > 0 && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">{upcomingAll.length} declared · sorted by tier → dynasty value</span>
              </div>
            )}
            {upcomingAll.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-6 text-center text-slate-400 text-sm">
                No declared players yet. Sleeper-matched prospects appear here automatically, or click "Declare?" on any prospect card.
              </div>
            )}
            {pagedUpcoming.map((x, i) => (
              <ProspectCard key={x.p.id} p={x.p} rank={(page-1)*PAGE_SIZE+i+1} adp={x.sleeperRank} grade={x.grade} components={x.components}
                annotation={{ ...x.ann, tier: x.ann.tier || x.suggestedTier }}
                onAnnotate={(patch) => setAnnotation(x.p.id, patch)}
                onDeclareYear={(y) => declareWithYear(x.p.id, y)}
                sleeperDeclared={x.sleeperDeclared}
                onEdit={() => handleEditProspect(x.p)} />
            ))}
            <Pagination page={page} total={upcomingPages} onChange={(p) => update({ page: p })} />
          </div>
        )}

        {/* Prospect Board */}
        {state.tab === "board" && (
          <div className="space-y-2">
            {state.prospects.length === 0 && (
              <div className="rounded-xl border border-violet-400/20 bg-violet-500/5 p-6 text-center text-sm">
                <div className="text-violet-300 font-semibold mb-1">No prospects yet</div>
                <p className="text-slate-400">Head to the <button onClick={() => update({ tab: "add" })} className="text-emerald-400 underline">Add Player</button> tab to add your first player.</p>
              </div>
            )}
            {pagedBoard.map((x, i) => (
              <ProspectCard key={x.p.id} p={x.p} rank={(page-1)*PAGE_SIZE+i+1} adp={x.sleeperRank} grade={x.grade} components={x.components}
                annotation={x.ann} onAnnotate={(patch) => setAnnotation(x.p.id, patch)}
                onDeclareYear={(y) => declareWithYear(x.p.id, y)}
                sleeperDeclared={x.sleeperDeclared}
                onEdit={() => handleEditProspect(x.p)} />
            ))}
            <Pagination page={page} total={totalPages} onChange={(p) => update({ page: p })} />
          </div>
        )}

        {/* My Value — expert rankings with reorder arrows */}
        {state.tab === "value" && (
          <div className="space-y-2">
            {rankedAll.length > 0 && (
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-500">{rankedAll.length} prospects · use ▲▼ to set your rankings</span>
                <button onClick={autoRankUpcoming}
                  className="text-xs font-semibold px-3 py-1.5 rounded-md border border-sky-400/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-colors">
                  Sync to model order
                </button>
              </div>
            )}
            {pagedRankedAll.map((x, i) => {
              const globalIdx = (page - 1) * PAGE_SIZE + i;
              const hasRank   = state.expertRankings[x.p.id] != null;
              return (
                <div key={x.p.id} className="flex gap-1 items-start">
                  <div className="flex flex-col gap-0.5 pt-5 shrink-0">
                    <button onClick={() => moveRank(x.p.id, "up")}
                      disabled={globalIdx === 0 || !hasRank}
                      className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[10px] leading-none px-1 py-0.5">▲</button>
                    <button onClick={() => moveRank(x.p.id, "down")}
                      disabled={globalIdx === rankedAll.length - 1 || !hasRank}
                      className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[10px] leading-none px-1 py-0.5">▼</button>
                  </div>
                  <div className="flex-1">
                    <ProspectCard p={x.p} rank={globalIdx + 1} adp={x.sleeperRank} grade={x.grade} components={x.components}
                      annotation={x.ann} onAnnotate={(patch) => setAnnotation(x.p.id, patch)}
                      onDeclareYear={(y) => declareWithYear(x.p.id, y)}
                      sleeperDeclared={x.sleeperDeclared}
                      onEdit={() => handleEditProspect(x.p)} />
                  </div>
                </div>
              );
            })}
            <Pagination page={page} total={rankedAllPages} onChange={(p) => update({ page: p })} />
          </div>
        )}

        {/* Archive — declared prospects from past draft classes */}
        {state.tab === "archive" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-slate-500">{archiveProspects.length} archived prospects</span>
            </div>
            {archiveProspects.length === 0 && (
              <div className="rounded-xl border border-white/10 bg-slate-900/40 p-10 text-center text-slate-500 text-sm">
                No archived prospects yet. Players declared for a past draft year will appear here.
              </div>
            )}
            {archiveProspects.length > 0 && (() => {
              const byYear = {};
              archiveProspects.forEach((x) => {
                const y = x.p.projectedDraftYear || "Unknown";
                (byYear[y] ??= []).push(x);
              });
              return Object.keys(byYear).sort((a, b) => Number(b) - Number(a)).map((year) => (
                <div key={year} className="mb-6">
                  <div className="text-xs uppercase tracking-widest text-slate-500 mb-2 font-semibold">{year} Draft Class</div>
                  <div className="space-y-2">
                    {byYear[year].map((x, i) => {
                      const cap  = x.ann.draftCapital || x.p.draft_capital || "";
                      const comp = x.p.comparablePlayer || "";
                      return (
                        <div key={x.p.id} className="rounded-xl border border-white/10 bg-slate-900/60 px-5 py-3 flex items-center gap-4">
                          <div className="w-6 text-center shrink-0">
                            <span className="text-sm font-bold text-slate-500">{i + 1}</span>
                          </div>
                          <GradeBadge score={x.grade} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <span className="font-semibold text-slate-100">{x.p.name}</span>
                              <Pill pos={x.p.position} />
                              {x.tierLabel && (
                                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                  x.ann.tier ? "bg-slate-700 text-slate-200" : "bg-slate-800 text-slate-400"
                                }`}>{x.tierLabel}</span>
                              )}
                              {comp && <span className="text-[10px] text-violet-300 bg-violet-500/15 border border-violet-400/30 px-1.5 py-0.5 rounded">Comp: {comp}</span>}
                            </div>
                            <div className="text-xs text-slate-500 flex gap-3 flex-wrap">
                              {cap && <span className="capitalize"><span className="text-slate-600">NFL:</span> {cap.replace(/_/g, " ")}</span>}
                              {x.ann.landingSpot && <><span className="text-slate-700">·</span><span>{x.ann.landingSpot}</span></>}
                            </div>
                          </div>
                          <button onClick={() => handleEditProspect(x.p)}
                            className="text-xs text-slate-400 hover:text-slate-200 border border-white/10 hover:border-sky-400/40 px-2 py-1 rounded shrink-0">
                            Edit
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        )}

      </main>
    </div>
  );
}
