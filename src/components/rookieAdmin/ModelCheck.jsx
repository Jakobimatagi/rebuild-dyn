// ── Model Check (grade backtest) ─────────────────────────────────────────────
// Validates the prospect grader against reality. For declared past-class players
// (drafted/UDFA — imported with a draft-capital outcome), it computes a
// CAPITAL-FREE, stats-only grade (computeGrade ignoreCapital=true) and correlates
// it with the actual NFL draft capital. Non-circular: the prediction never sees
// the outcome. Surfaces a headline rank correlation, a calibration table by grade
// bucket, and the biggest over-/under-rated misses (the tape vs. stats gaps).

import { useMemo, useState } from "react";
import { computeGrade, CAPITAL_PROD_SCORES } from "../../lib/prospectScoring.js";
import { POS_COLORS } from "./constants.js";
import { normalizeName } from "./utils.js";

const POSITIONS = ["QB", "RB", "WR", "TE"];
const BUCKETS = [
  { label: "A (78+)",   min: 78, color: "text-emerald-300" },
  { label: "B (62–77)", min: 62, color: "text-sky-300" },
  { label: "C (46–61)", min: 46, color: "text-amber-300" },
  { label: "D (30–45)", min: 30, color: "text-orange-300" },
  { label: "F (<30)",   min: 0,  color: "text-rose-300" },
];
const bucketOf = (g) => BUCKETS.find((b) => g >= b.min) || BUCKETS[BUCKETS.length - 1];

// Tie-naive Spearman: Pearson over value ranks. Fine for a dashboard readout.
function spearman(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const rank = (arr) => {
    const order = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
    const r = Array(n);
    order.forEach(([, i], k) => { r[i] = k + 1; });
    return r;
  };
  const rx = rank(xs), ry = rank(ys);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(rx), my = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

const zscores = (vals) => {
  const m = vals.reduce((s, v) => s + v, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / vals.length) || 1;
  return vals.map((v) => (v - m) / sd);
};

// Sleeper rookie rank → 0–100 market value (same curve as the grade's market
// component, so it's comparable to a draft-capital score). Lower rank = higher value.
const sleeperValue = (rank) =>
  typeof rank === "number" ? Math.max(5, Math.round(100 - Math.log2(Math.max(1, rank)) * 10)) : null;

const corrLabel = (r) =>
  r == null ? "—"
  : r >= 0.7 ? "strong" : r >= 0.5 ? "moderate" : r >= 0.3 ? "weak" : "poor";
const corrColor = (r) =>
  r == null ? "text-slate-400"
  : r >= 0.7 ? "text-emerald-300" : r >= 0.5 ? "text-sky-300" : r >= 0.3 ? "text-amber-300" : "text-rose-300";

export default function ModelCheck({ prospects, annotations, sleeperByName = {} }) {
  const [positions, setPositions] = useState([...POSITIONS]);
  const [year, setYear] = useState("all");
  // Which "market" to grade the model against: where the NFL drafted them, or
  // where dynasty managers draft them (Sleeper rookie ADP).
  const [market, setMarket] = useState("nfl"); // "nfl" | "sleeper"

  // One row per player who has the selected market's signal. `mkt` is that
  // market's 0–100 value; `pred` is the stats-only grade (no capital, no Sleeper
  // — ignoreCapital=true and sleeperRank undefined — so the comparison isn't
  // self-fulfilling). Both raw signals are kept for display.
  const allRows = useMemo(() => {
    return prospects
      .map((p) => {
        const ann = annotations[p.id] || {};
        const cap = ann.draftCapital || p.draftCapital || p.draft_capital || "";
        const nflVal = cap in CAPITAL_PROD_SCORES ? CAPITAL_PROD_SCORES[cap] : null;
        const sRank = sleeperByName[normalizeName(p.name)]?.rank;
        const slpVal = sleeperValue(sRank);

        if (market === "nfl" && (!ann.declared || nflVal == null)) return null;
        if (market === "sleeper" && slpVal == null) return null;

        const pred = computeGrade(p, undefined, cap, true, ann.tier || "", true).total;
        return {
          p, cap, pred,
          mkt: market === "sleeper" ? slpVal : nflVal,
          nflVal, sRank, slpVal,
          position: p.position,
          year: String(p.projectedDraftYear || ""),
        };
      })
      .filter(Boolean);
  }, [prospects, annotations, sleeperByName, market]);

  const years = useMemo(
    () => [...new Set(allRows.map((r) => r.year).filter(Boolean))].sort((a, b) => Number(b) - Number(a)),
    [allRows],
  );

  const rows = allRows.filter(
    (r) => positions.includes(r.position) && (year === "all" || r.year === year),
  );

  const rho = spearman(rows.map((r) => r.pred), rows.map((r) => r.mkt));

  // Calibration: per grade bucket, where players landed in the selected market.
  // "Top"/"Bottom" thresholds adapt: NFL = R1–2 / UDFA, Sleeper = top-12 / outside-36.
  const hiLabel = market === "sleeper" ? "% top-12 ADP" : "% R1–2";
  const loLabel = market === "sleeper" ? "% past 36" : "% UDFA";
  const isHi = (r) => (market === "sleeper" ? r.sRank <= 12 : r.mkt >= 58);
  const isLo = (r) => (market === "sleeper" ? r.sRank > 36 : r.cap === "udfa");
  const calibration = BUCKETS.map((b) => {
    const inB = rows.filter((r) => bucketOf(r.pred).label === b.label);
    const n = inB.length;
    const avgOutcome = n ? Math.round(inB.reduce((s, r) => s + r.mkt, 0) / n) : null;
    const hi = n ? Math.round((inB.filter(isHi).length / n) * 100) : null;
    const lo = n ? Math.round((inB.filter(isLo).length / n) * 100) : null;
    return { ...b, n, avgOutcome, hi, lo };
  });

  // Steals & fades: standardized gap between the stats grade and the market.
  // Positive gap = model rates them above the market (steal); negative = market
  // rates them above their production (fade). Half-stdev threshold keeps it material.
  const { steals, fades } = useMemo(() => {
    if (rows.length < 4) return { steals: [], fades: [] };
    const pz = zscores(rows.map((r) => r.pred));
    const oz = zscores(rows.map((r) => r.mkt));
    const scored = rows.map((r, i) => ({ ...r, gap: pz[i] - oz[i] }));
    return {
      steals: scored.filter((r) => r.gap >= 0.4).sort((a, b) => b.gap - a.gap).slice(0, 8),
      fades:  scored.filter((r) => r.gap <= -0.4).sort((a, b) => a.gap - b.gap).slice(0, 8),
    };
  }, [rows]);

  const togglePos = (p) =>
    setPositions((ps) => (ps.includes(p) ? ps.filter((x) => x !== p) : [...ps, p]));

  return (
    <div className="max-w-4xl">
      <h2 className="text-lg font-bold text-slate-100 mb-1">Model Check — Grade Backtest</h2>
      <p className="text-sm text-slate-400 mb-5">
        Compares the stats-only grade against the market — where the <strong className="text-slate-300">NFL</strong> drafted
        them, or where <strong className="text-slate-300">dynasty managers</strong> draft them (Sleeper rookie ADP). Where
        they diverge are your <span className="text-emerald-300">steals</span> (the market is sleeping on the production)
        and <span className="text-rose-300">fades</span> (the market is paying up past the production).
      </p>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex gap-2">
          {POSITIONS.map((p) => (
            <button key={p} type="button" onClick={() => togglePos(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                positions.includes(p) ? POS_COLORS[p] : "border-white/10 text-slate-500 bg-slate-900/40"
              }`}>
              {p}
            </button>
          ))}
        </div>
        <select value={year} onChange={(e) => setYear(e.target.value)}
          className="bg-slate-800 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-sky-400">
          <option value="all">All years</option>
          {years.map((y) => <option key={y} value={y}>{y} class</option>)}
        </select>
        {/* Market toggle: grade the model against the NFL draft or dynasty ADP */}
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {[["nfl", "NFL Draft"], ["sleeper", "Sleeper ADP"]].map(([id, lbl]) => (
            <button key={id} type="button" onClick={() => setMarket(id)}
              className={`px-3 py-1.5 text-xs font-semibold ${
                market === id ? "bg-sky-500/20 text-sky-200" : "text-slate-400 hover:text-slate-200"
              }`}>
              {lbl}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto">{rows.length} graded vs. {market === "sleeper" ? "ADP" : "draft"}</span>
      </div>

      {rows.length < 3 ? (
        <div className="rounded-xl border border-white/10 bg-slate-900/40 p-10 text-center text-slate-500 text-sm">
          {market === "sleeper"
            ? "Need at least 3 players with a Sleeper rookie rank. Sleeper covers the current rookie class — import this year's college season, then switch here."
            : "Need at least 3 declared players with a draft-capital outcome. Import past classes from the Bulk Import tab — drafted/UDFA players carry the outcome the backtest needs."}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Headline correlation */}
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5 flex items-center gap-6">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Rank correlation (ρ)</div>
              <div className={`text-4xl font-bold ${corrColor(rho)}`}>{rho == null ? "—" : rho.toFixed(2)}</div>
            </div>
            <div className="text-sm text-slate-300">
              <span className={`font-semibold ${corrColor(rho)}`}>{corrLabel(rho)}</span> agreement between the
              stats-only grade and {market === "sleeper" ? "Sleeper rookie ADP" : "actual draft capital"} across {rows.length} players.
              <div className="text-xs text-slate-500 mt-1">
                1.0 = perfect ranking · 0 = no relationship. Higher means the model's college read tracks
                {market === "sleeper" ? " the dynasty rookie market" : " the NFL draft"}.
              </div>
            </div>
          </div>

          {/* Calibration table */}
          <div className="rounded-xl border border-white/10 bg-slate-900/60 p-5">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-3">Calibration by grade bucket</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-slate-500 text-left">
                  <th className="pb-2 font-medium">Grade</th>
                  <th className="pb-2 font-medium text-right">Players</th>
                  <th className="pb-2 font-medium text-right">Avg market value</th>
                  <th className="pb-2 font-medium text-right">{hiLabel}</th>
                  <th className="pb-2 font-medium text-right">{loLabel}</th>
                </tr>
              </thead>
              <tbody>
                {calibration.map((b) => (
                  <tr key={b.label} className="border-t border-white/5">
                    <td className={`py-2 font-semibold ${b.color}`}>{b.label}</td>
                    <td className="py-2 text-right text-slate-300">{b.n || "—"}</td>
                    <td className="py-2 text-right text-slate-300">{b.avgOutcome ?? "—"}</td>
                    <td className="py-2 text-right text-slate-300">{b.hi == null ? "—" : `${b.hi}%`}</td>
                    <td className="py-2 text-right text-slate-300">{b.lo == null ? "—" : `${b.lo}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-500 mt-2">
              Well-calibrated = avg market value falls monotonically A → F. Value is a 0–100 scale
              ({market === "sleeper" ? "Sleeper #1 ≈ 100 … #60 ≈ 40" : "early R1 ≈ 95 … UDFA = 15"}).
            </p>
          </div>

          {/* Steals & Fades */}
          {(steals.length > 0 || fades.length > 0) && (
            <div className="grid md:grid-cols-2 gap-4">
              <StealFadeList
                title="🟢 Steals" tone="steal" rows={steals} market={market}
                blurb={market === "sleeper"
                  ? "Stats grade well above their rookie ADP — going late in dynasty drafts. The ones you can actually get."
                  : "Stats grade well above their draft slot — production the draft slept on. Buy-low targets."}
                empty="No clear steals at this threshold."
              />
              <StealFadeList
                title="🔴 Fades" tone="fade" rows={fades} market={market}
                blurb={market === "sleeper"
                  ? "Going early in rookie drafts but thin college production — overpriced. Let someone else pay up."
                  : "Drafted above their college production — traits/tape picks. Let someone else pay up."}
                empty="No clear fades at this threshold."
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// One Steals (or Fades) column. `tone` drives the accent color; rows are sorted
// by how far the model diverges from the selected market. Each row shows the
// stats grade plus both market signals (draft capital and Sleeper ADP) when known.
function StealFadeList({ title, tone, rows, blurb, empty, market }) {
  const accent = tone === "steal" ? "text-emerald-300" : "text-rose-300";
  const border = tone === "steal" ? "border-emerald-400/20" : "border-rose-400/20";
  return (
    <div className={`rounded-xl border ${border} bg-slate-900/60 p-5`}>
      <div className={`text-sm font-bold mb-1 ${accent}`}>{title}</div>
      <p className="text-[10px] text-slate-500 mb-3 leading-snug">{blurb}</p>
      {rows.length === 0 ? (
        <div className="text-xs text-slate-600 py-4 text-center">{empty}</div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const adp = typeof r.sRank === "number" ? `ADP #${r.sRank}` : null;
            const cap = r.cap ? r.cap.replace(/_/g, " ") : null;
            // Lead with the selected market's signal; show the other as context.
            const signals = market === "sleeper" ? [adp, cap] : [cap, adp];
            return (
              <div key={r.p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-200 truncate">
                  {r.p.name} <span className="text-slate-500 text-xs">{r.position} · {r.year}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0 text-xs text-slate-400">
                  <span>grade {r.pred}</span>
                  <span className="text-slate-600">·</span>
                  <span className="capitalize">{signals.filter(Boolean).join(" · ") || "—"}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
