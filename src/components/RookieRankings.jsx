import { useEffect, useMemo, useState } from "react";
import { fetchPublicRankingsData } from "../lib/supabase.js";
import { TIER_RANK, computeGrade, dynastyScore, deriveTier } from "../lib/prospectScoring.js";
import { buildCompIndex, findCompsByName, summarizeOutcome } from "../lib/historicalComps.js";
import RookieDeepDiveModal from "./dashboard/RookieDeepDiveModal.jsx";

const POS_COLORS = {
  QB: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  RB: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  WR: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  TE: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

const TIER_COLORS = {
  "Cornerstone":              "bg-yellow-400 text-yellow-950",
  "Foundational":             "bg-emerald-400 text-emerald-950",
  "Upside Shot":              "bg-purple-400 text-purple-950",
  "Mainstay":                 "bg-blue-400 text-blue-950",
  "Productive Vet":           "bg-green-300 text-green-950",
  "Short Term League Winner": "bg-orange-400 text-orange-950",
  "Short Term Production":    "bg-yellow-300 text-yellow-950",
  "Serviceable":              "bg-slate-300 text-slate-900",
  "JAG - Insurance":          "bg-slate-200 text-slate-900",
  "JAG - Developmental":      "bg-violet-400 text-violet-950",
  "Replaceable":              "bg-rose-500 text-rose-950",
};

function Pill({ pos }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${POS_COLORS[pos] || "border-white/10 text-slate-400"}`}>
      {pos}
    </span>
  );
}

function TierBadge({ tier }) {
  if (!tier) return null;
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${TIER_COLORS[tier] || "bg-slate-700 text-slate-300"}`}>
      {tier}
    </span>
  );
}

export default function RookieRankings() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [posFilter, setPosFilter] = useState({ QB: true, RB: true, WR: true, TE: true });
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [selectedProspect, setSelectedProspect] = useState(null);

  const currentYear = new Date().getFullYear();
  const yearTabs    = [0, 1, 2].map((o) => String(currentYear + o));

  useEffect(() => {
    fetchPublicRankingsData()
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message || "Failed to load rankings."); setLoading(false); });
  }, []);

  const compIndex = useMemo(
    () => (data?.historicalPlayers ? buildCompIndex(data.historicalPlayers) : null),
    [data?.historicalPlayers],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading rankings…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-rose-400 text-sm">{error}</div>
      </div>
    );
  }

  const { prospects, annotations, byProspect, experts, historicalPlayers } = data;

  const rows = prospects
    .filter((p) => {
      if (!posFilter[p.position]) return false;
      return String(p.projected_draft_year || currentYear) === yearFilter;
    })
    .map((p) => {
      const ann        = annotations[p.id] || {};
      const capitalKey = ann.draftCapital || p.draft_capital || "";
      const grade      = computeGrade(
        { ...p, draftCapital: capitalKey, athletic: p.athletic || {} },
        undefined,
        capitalKey,
        ann.declared || false,
        ann.tier || "",
      ).total;
      const tierLabel  = ann.tier || deriveTier(grade, capitalKey) || "";
      const ds         = dynastyScore(grade, p.position, p.seasons);
      return { p, ann, tierLabel, ds };
    })
    .sort((a, b) => {
      const aTier = a.tierLabel ? (TIER_RANK[a.tierLabel] ?? 99) : 99;
      const bTier = b.tierLabel ? (TIER_RANK[b.tierLabel] ?? 99) : 99;
      if (aTier !== bTier) return aTier - bTier;
      return b.ds - a.ds;
    });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur border-b border-white/10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-emerald-400">Dynasty Pre-Draft</div>
            <h1 className="text-xl font-bold">Rookie Rankings {yearFilter}</h1>
          </div>
          <a href="/" className="text-xs text-slate-400 hover:text-slate-200 border border-white/10 px-3 py-1.5 rounded-md">
            ← Back to App
          </a>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-6">
          {["QB", "RB", "WR", "TE"].map((pos) => (
            <button
              key={pos}
              onClick={() => setPosFilter((f) => ({ ...f, [pos]: !f[pos] }))}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                posFilter[pos] ? POS_COLORS[pos] : "border-white/10 text-slate-500 bg-slate-900/40"
              }`}
            >
              {pos}
            </button>
          ))}
          <div className="ml-2 flex items-center gap-1">
            {yearTabs.map((y) => (
              <button
                key={y}
                onClick={() => setYearFilter(y)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                  yearFilter === y
                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                    : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500 ml-auto">{rows.length} prospects</span>
        </div>

        {rows.length === 0 ? (
          <div className="text-slate-600 text-sm text-center py-16">No prospects added yet.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((row, i) => {
              const { p, ann, tierLabel } = row;
              const cap  = ann.draftCapital || p.draft_capital || "";
              const comp = p.comparable_player || "";

              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedProspect(p)}
                  className="w-full text-left rounded-xl border border-white/10 bg-slate-900/60 hover:bg-slate-900/80 hover:border-emerald-400/40 transition-colors px-5 py-4 flex items-center gap-4"
                >
                  <div className="w-10 text-center shrink-0">
                    <span className="text-xl font-bold text-slate-200">{i + 1}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-slate-100">{p.name}</span>
                      <Pill pos={p.position} />
                      {tierLabel && <TierBadge tier={tierLabel} />}
                      {comp && (() => {
                        const named = compIndex ? findCompsByName(compIndex.rows, comp)[0] : null;
                        const summary = summarizeOutcome(named);
                        return (
                          <span className="text-[10px] text-violet-300 bg-violet-500/15 border border-violet-400/30 px-1.5 py-0.5 rounded">
                            Comp: {comp}
                            {summary && <span className="text-violet-400/80"> · {summary}</span>}
                          </span>
                        );
                      })()}
                    </div>
                    <div className="text-xs text-slate-400 flex gap-3 flex-wrap items-center">
                      {cap && <span className="capitalize"><span className="text-slate-600">NFL:</span> {cap.replace(/_/g, " ")}</span>}
                      {ann.landingSpot && <><span className="text-slate-600">·</span><span>{ann.landingSpot}</span></>}
                      {ann.rookieDraftAdp && (
                        <span className="text-[10px] text-sky-300 bg-sky-500/15 border border-sky-400/30 px-1.5 py-0.5 rounded font-semibold">
                          Rookie: {ann.rookieDraftAdp}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {selectedProspect && (
        <RookieDeepDiveModal
          prospect={selectedProspect}
          annotation={annotations[selectedProspect.id] || {}}
          expertRankings={byProspect?.[selectedProspect.id] || []}
          experts={experts || []}
          compIndex={compIndex}
          onClose={() => setSelectedProspect(null)}
        />
      )}
    </div>
  );
}
