import { POS_COLORS, GRADE_COLORS, TIER_OPTIONS, CAPITAL_OPTIONS, SEASON_COLS } from "./constants.js";
import { gradeLetter } from "./utils.js";

export function Pill({ pos }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${POS_COLORS[pos] || "border-white/10 text-slate-400"}`}>
      {pos}
    </span>
  );
}

export function GradeBadge({ score }) {
  const letter = gradeLetter(score);
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-md text-sm font-bold ${GRADE_COLORS[letter]}`}>
      {letter}
    </span>
  );
}

export function TierSelect({ value, onChange }) {
  const active = TIER_OPTIONS.find((o) => o.value === value) || TIER_OPTIONS[0];
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}
      className={`text-xs font-semibold rounded px-2 py-1 outline-none cursor-pointer ${active.tw}`}>
      {TIER_OPTIONS.map((o) => (
        <option key={o.value} value={o.value} className="bg-slate-900 text-slate-100">{o.label}</option>
      ))}
    </select>
  );
}

export function CapitalSelect({ value, onChange, className = "" }) {
  const hasVal = value && value !== "";
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}
      className={`text-xs font-semibold rounded px-2 py-1 outline-none cursor-pointer border ${
        hasVal ? "bg-sky-500/20 border-sky-400/50 text-sky-200" : "bg-slate-800 text-slate-400 border-white/10"
      } ${className}`}>
      {CAPITAL_OPTIONS.map((o) => (
        <option key={o.value} value={o.value} className="bg-slate-900 text-slate-100">{o.label}</option>
      ))}
    </select>
  );
}

export function StatBar({ label, value }) {
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

export function CellInput({ value, onChange, placeholder, type = "text", style }) {
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

export function Pagination({ page, total, onChange }) {
  if (total <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 pt-4 pb-2">
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page === 1}
        className="px-3 py-1.5 rounded-md text-xs font-semibold border border-white/10 bg-slate-900/40 text-slate-300 disabled:opacity-30 hover:border-white/30">
        ← Prev
      </button>
      {Array.from({ length: total }, (_, i) => i + 1).map((p) => (
        <button key={p} onClick={() => onChange(p)}
          className={`w-8 h-8 rounded-md text-xs font-semibold border ${
            p === page
              ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
              : "border-white/10 bg-slate-900/40 text-slate-400 hover:text-slate-200"
          }`}>
          {p}
        </button>
      ))}
      <button onClick={() => onChange(Math.min(total, page + 1))} disabled={page === total}
        className="px-3 py-1.5 rounded-md text-xs font-semibold border border-white/10 bg-slate-900/40 text-slate-300 disabled:opacity-30 hover:border-white/30">
        Next →
      </button>
    </div>
  );
}

export function AddPlayerSeasonRow({ season, position, isFirst, onChange, onRemove }) {
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
        className="shrink-0 text-rose-400/60 hover:text-rose-400 disabled:opacity-0 text-xs px-1 py-1">
        ✕
      </button>
    </div>
  );
}
