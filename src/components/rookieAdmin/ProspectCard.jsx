import { useState } from "react";
import { deriveSchool } from "../../lib/prospectScoring.js";
import { computeCurrentDraftYear } from "./utils.js";
import { GradeBadge, Pill, TierSelect, CapitalSelect, StatBar } from "./Atoms.jsx";
import ProspectStats from "./ProspectStats.jsx";

export default function ProspectCard({
  p, rank, adp, grade, components, valueScore, delta, gold,
  annotation, onAnnotate, onDeclareYear, sleeperDeclared, onEdit,
}) {
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
