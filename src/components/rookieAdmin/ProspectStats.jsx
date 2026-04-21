export default function ProspectStats({ p }) {
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
