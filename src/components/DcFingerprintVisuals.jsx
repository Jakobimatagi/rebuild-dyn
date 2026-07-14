// Visual building blocks for DC defensive fingerprints, shared by the admin
// DC page (table cell, career modal, coordinators list) and DcShareModal's
// 1080px share card. Every metric is drawn against its season's league:
// quality metrics as a percentile bar (fill = better defense), funnel metrics
// as a diverging bar around the league median (sky = pass side, amber = run
// side — identity, not quality). `size` switches between the compact page
// scale ("sm") and the share-card scale ("lg").

import {
  DC_METRIC_GROUPS,
  metricDisplay,
  defenseRank,
  ordinal,
} from "../lib/dcFingerprint.js";

// Good → neutral → bad thirds. Rank text beside each bar carries the same
// information, so color is never the only channel.
function tierBarClass(pct) {
  if (pct == null) return "bg-slate-600";
  if (pct >= 2 / 3) return "bg-emerald-400";
  if (pct >= 1 / 3) return "bg-slate-400";
  return "bg-rose-400";
}

function tierBadgeClass(pct) {
  if (pct == null) return "border-white/10 bg-slate-800/70 text-slate-400";
  if (pct >= 2 / 3) return "border-emerald-400/40 bg-emerald-500/10 text-emerald-300";
  if (pct >= 1 / 3) return "border-white/15 bg-slate-800/70 text-slate-300";
  return "border-rose-400/40 bg-rose-500/10 text-rose-300";
}

const SIZES = {
  sm: {
    label: "text-[10px] w-24", bar: "h-1.5", value: "text-[11px] w-14", side: "text-[9px] w-16",
    group: "text-[9px]", rowGap: "gap-y-1",
  },
  lg: {
    label: "text-sm w-40", bar: "h-2.5", value: "text-base w-20", side: "text-xs w-24",
    group: "text-xs", rowGap: "gap-y-2",
  },
};

// ── Bars ─────────────────────────────────────────────────────────────────────

function QualityBar({ pct, size }) {
  const s = SIZES[size];
  return (
    <div className={`${s.bar} rounded-full bg-slate-800 overflow-hidden`}>
      {pct != null && (
        <div
          className={`h-full rounded-full ${tierBarClass(pct)}`}
          style={{ width: `${Math.max(pct * 100, 3)}%` }}
        />
      )}
    </div>
  );
}

function DivergingBar({ offset, size }) {
  const s = SIZES[size];
  const w = offset == null ? 0 : Math.min(Math.abs(offset), 0.5) * 100;
  return (
    <div className={`relative ${s.bar} rounded-full bg-slate-800`}>
      {offset != null && (
        <div
          className={`absolute inset-y-0 ${offset >= 0 ? "bg-sky-400 rounded-r-full" : "bg-amber-400 rounded-l-full"}`}
          style={offset >= 0
            ? { left: "50%", width: `${Math.max(w, 1.5)}%` }
            : { right: "50%", width: `${Math.max(w, 1.5)}%` }}
        />
      )}
      <div className="absolute inset-y-0 left-1/2 w-px bg-slate-500/80" />
    </div>
  );
}

// One metric line: label · bar · value · league rank (or funnel note).
function MetricRow({ d, size }) {
  const s = SIZES[size];
  if (!d) return null;
  const isFunnel = d.kind === "funnel";
  return (
    <div className="flex items-center gap-2">
      <span className={`${s.label} shrink-0 truncate text-slate-500`}>{d.metric.label}</span>
      <div className="flex-1 min-w-0">
        {isFunnel ? <DivergingBar offset={d.offset} size={size} /> : <QualityBar pct={d.pct} size={size} />}
      </div>
      <span className={`${s.value} shrink-0 text-right tabular-nums text-slate-200`}>{d.text}</span>
      <span className={`${s.side} shrink-0 text-right text-slate-500`}>
        {isFunnel
          ? (d.note ? <span className={d.offset >= 0 ? "text-sky-300/90" : "text-amber-300/90"}>{d.note}</span> : "")
          : d.rank ? `${ordinal(d.rank.rank)} of ${d.rank.of}` : ""}
      </span>
    </div>
  );
}

function MetricGroup({ group, rows, fp, size }) {
  const s = SIZES[size];
  const displays = group.metrics.map((m) => metricDisplay(rows, fp, m.key)).filter(Boolean);
  if (displays.length === 0) return null;
  return (
    <div>
      <div className={`${s.group} uppercase tracking-widest text-slate-500 font-semibold mb-1.5`}>
        {group.label}
      </div>
      <div className={`flex flex-col ${s.rowGap}`}>
        {displays.map((d) => <MetricRow key={d.metric.key} d={d} size={size} />)}
      </div>
    </div>
  );
}

// ── Headline rank badge — EPA/play allowed vs the season's league ────────────
export function DefenseRankBadge({ rows, fp, size = "sm" }) {
  const rank = defenseRank(rows, fp);
  if (!rank) return null;
  const pct = 1 - (rank.rank - 1) / Math.max(rank.of - 1, 1);
  const cls = size === "lg" ? "text-sm px-2.5 py-1" : "text-[10px] px-1.5 py-0.5";
  return (
    <span
      className={`${cls} rounded font-bold border ${tierBadgeClass(pct)}`}
      title={`EPA/play allowed: ${ordinal(rank.rank)} of ${rank.of} defenses`}
    >
      #{rank.rank} defense
    </span>
  );
}

// ── Full fingerprint panel for one (team, season) ────────────────────────────
// Both columns read against the same season's 32-team league; the funnel
// group rides below the havoc group so the panel stays two columns.
export function StintFingerprint({ rows, fp, season, size = "sm" }) {
  if (!fp) return <span className="text-slate-700 text-xs">no pbp fingerprint</span>;
  const stale = fp.season != null && season != null && Number(fp.season) !== Number(season);
  const [efficiency, havoc, funnel] = DC_METRIC_GROUPS;
  return (
    <div>
      {stale && (
        <div className="text-[10px] text-amber-400/80 mb-1.5">
          showing {fp.season} pbp — no fingerprint published for {season}
        </div>
      )}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${size === "lg" ? "gap-x-10 gap-y-4" : "gap-x-6 gap-y-3"}`}>
        <MetricGroup group={efficiency} rows={rows} fp={fp} size={size} />
        <div className={`flex flex-col ${size === "lg" ? "gap-4" : "gap-3"}`}>
          <MetricGroup group={havoc} rows={rows} fp={fp} size={size} />
          <MetricGroup group={funnel} rows={rows} fp={fp} size={size} />
        </div>
      </div>
    </div>
  );
}

// ── Career trend — one column per season, height/color = defense percentile ──
export function CareerTrendChart({ points, size = "sm" }) {
  if (!points || points.length === 0) return null;
  const lg = size === "lg";
  const H = lg ? 88 : 44;
  return (
    <div className={`flex items-end gap-2 overflow-x-auto pb-0.5 ${lg ? "w-full" : ""}`}>
      {points.map((p) => (
        <div
          key={`${p.year}-${p.team}`}
          className={`flex flex-col items-center gap-1 ${lg ? "flex-1 max-w-20 min-w-0" : "shrink-0"}`}
        >
          <div className={`flex items-end`} style={{ height: H }}>
            <div
              className={`${lg ? "w-7" : "w-4"} rounded-t ${tierBarClass(p.pct)}`}
              style={{ height: Math.max((p.pct ?? 0) * H, 4) }}
              title={`${p.year} ${p.team} — ${p.rank ? `${ordinal(p.rank.rank)} of ${p.rank.of}` : "unranked"} (EPA/play allowed)`}
            />
          </div>
          <div className={`${lg ? "text-[11px]" : "text-[8px]"} leading-tight text-slate-500 text-center`}>
            '{String(p.year).slice(-2)}
            <div className={`${lg ? "text-[10px]" : "text-[7px]"} text-slate-600`}>{p.team}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Compact table cell — rank badge + five mini percentile meters ────────────
const CELL_METRICS = ["epa_play_allowed", "sack_rate", "int_rate", "proe_faced", "deep_rate_allowed"];
const CELL_LABEL = {
  epa_play_allowed: "EPA", sack_rate: "Sack", int_rate: "INT",
  proe_faced: "PROE", deep_rate_allowed: "Deep",
};

export function DefenseSchemeCell({ rows, fp, season }) {
  if (!fp) return <span className="text-slate-700 text-xs">—</span>;
  const stale = fp.season != null && Number(fp.season) !== Number(season);
  return (
    <div className="flex items-start gap-2.5">
      <DefenseRankBadge rows={rows} fp={fp} />
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {CELL_METRICS.map((key) => {
          const d = metricDisplay(rows, fp, key);
          if (!d) return null;
          const title = d.kind === "funnel"
            ? `${d.metric.label} ${d.text}${d.note ? ` — ${d.note}` : ""}`
            : `${d.metric.label} ${d.text}${d.rank ? ` — ${ordinal(d.rank.rank)} of ${d.rank.of}` : ""}`;
          return (
            <div key={key} className="w-16" title={title}>
              <div className="flex items-baseline justify-between text-[9px] leading-tight">
                <span className="text-slate-500">{CELL_LABEL[key]}</span>
                <span className="text-slate-200 tabular-nums">{d.text}</span>
              </div>
              <div className="mt-0.5">
                {d.kind === "funnel"
                  ? <DivergingBar offset={d.offset} size="sm" />
                  : <QualityBar pct={d.pct} size="sm" />}
              </div>
            </div>
          );
        })}
        {stale && <span className="text-[9px] text-slate-600 self-end">({fp.season} pbp)</span>}
      </div>
    </div>
  );
}
