import { useEffect, useState } from "react";
import { fetchPublicRankingsData } from "../../lib/supabase.js";
import { TIER_RANK, computeGrade, dynastyScore, deriveTier } from "../../lib/prospectScoring.js";

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

function scoreProspect(p, ann) {
  const grade = computeGrade(
    { ...p, draftCapital: ann.draftCapital || p.draft_capital || "", athletic: p.athletic || {} },
  ).total;
  const suggestedTier = deriveTier(grade, ann.draftCapital || p.draft_capital || "");
  const tierLabel = ann.tier || suggestedTier || "";
  const ds = dynastyScore(grade, p.position, p.seasons);
  return { grade, tierLabel, ds };
}

export default function RookieRankingsTab() {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [view, setView]           = useState("consensus");
  const [posFilter, setPosFilter] = useState({ QB: true, RB: true, WR: true, TE: true });
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));

  const currentYear = new Date().getFullYear();
  const yearTabs    = [0, 1, 2].map((o) => String(currentYear + o));

  useEffect(() => {
    fetchPublicRankingsData()
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message || "Failed to load."); setLoading(false); });
  }, []);

  if (loading) return <div className="py-16 text-center text-slate-500 text-sm">Loading rookie rankings…</div>;
  if (error)   return <div className="py-16 text-center text-rose-400 text-sm">{error}</div>;

  const { prospects, annotations, byProspect, consensusMap, experts } = data;

  const filtered = prospects.filter((p) => {
    if (!posFilter[p.position]) return false;
    return String(p.projected_draft_year || currentYear) === yearFilter;
  });

  let rows = [];

  if (view === "consensus") {
    rows = filtered
      .map((p) => {
        const ann = annotations[p.id] || {};
        const c   = consensusMap[p.id];
        const { tierLabel, ds } = scoreProspect(p, ann);
        return { p, ann, avgRank: c?.avgRank ?? null, count: c?.count ?? 0, tierLabel, ds };
      })
      .sort((a, b) => {
        // Ranked prospects first, sorted by consensus avg rank
        if (a.avgRank != null && b.avgRank != null) return a.avgRank - b.avgRank;
        if (a.avgRank != null) return -1;
        if (b.avgRank != null) return 1;
        // Unranked: same order as Upcoming Draft tab — tier then dynastyScore
        const aTier = a.tierLabel ? (TIER_RANK[a.tierLabel] ?? 99) : 99;
        const bTier = b.tierLabel ? (TIER_RANK[b.tierLabel] ?? 99) : 99;
        if (aTier !== bTier) return aTier - bTier;
        return b.ds - a.ds;
      });
  } else {
    const allRankings  = Object.values(byProspect || {}).flat();
    const myRankings   = allRankings.filter((r) => r.user_id === view);
    const rankedIds    = new Set(myRankings.map((r) => r.prospect_id));
    const rankMap      = Object.fromEntries(myRankings.map((r) => [r.prospect_id, r]));

    rows = filtered
      .filter((p) => rankedIds.has(p.id))
      .map((p) => ({ p, ann: annotations[p.id] || {}, ...rankMap[p.id] }))
      .sort((a, b) => Number(a.rank_order) - Number(b.rank_order));
  }

  const expertName = view !== "consensus"
    ? (experts.find((e) => e.id === view)?.username || "Expert")
    : null;

  return (
    <div className="text-slate-100">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* View toggle */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setView("consensus")}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
              view === "consensus"
                ? "bg-emerald-500/20 border-emerald-400/60 text-emerald-200"
                : "border-white/10 text-slate-400 hover:text-slate-200"
            }`}
          >
            Consensus
          </button>
          {experts.map((e) => (
            <button
              key={e.id}
              onClick={() => setView(e.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
                view === e.id
                  ? "bg-sky-500/20 border-sky-400/60 text-sky-200"
                  : "border-white/10 text-slate-400 hover:text-slate-200"
              }`}
            >
              {e.username}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-white/10" />

        {/* Position filters */}
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

        <div className="w-px h-5 bg-white/10" />

        {/* Year filter */}
        <div className="flex items-center gap-1">
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

        <span className="text-xs text-slate-500 ml-auto">
          {view === "consensus"
            ? `${rows.filter((r) => r.avgRank != null).length} ranked · ${experts.length} analyst${experts.length !== 1 ? "s" : ""}`
            : `${expertName} · ${rows.length} prospects`}
        </span>
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <div className="text-slate-600 text-sm text-center py-16">
          {view === "consensus" ? "No prospects have been ranked yet." : "This analyst hasn't set any rankings yet."}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row, i) => {
            const { p, ann } = row;
            const displayTier = (view !== "consensus" ? row.tier : null) || ann.tier || row.tierLabel;
            const cap  = ann.draftCapital || p.draft_capital || "";
            const comp = p.comparable_player || "";

            return (
              <div key={p.id} className="rounded-xl border border-white/10 bg-slate-900/60 px-5 py-3 flex items-center gap-4">
                {/* Rank number */}
                <div className="w-8 text-center shrink-0">
                  <span className="text-lg font-bold text-slate-300">{i + 1}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-semibold text-slate-100">{p.name}</span>
                    <Pill pos={p.position} />
                    {displayTier && <TierBadge tier={displayTier} />}
                    {comp && (
                      <span className="text-[10px] text-violet-300 bg-violet-500/15 border border-violet-400/30 px-1.5 py-0.5 rounded">
                        Comp: {comp}
                      </span>
                    )}
                    {ann.declared && (
                      <span className="text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-400/40 px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                        ✓ Declared
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 flex gap-3 flex-wrap items-center">
                    {cap && <span className="capitalize"><span className="text-slate-600">NFL:</span> {cap.replace(/_/g, " ")}</span>}
                    {ann.landingSpot && (
                      <><span className="text-slate-700">·</span><span>{ann.landingSpot}</span></>
                    )}
                    {ann.rookieDraftAdp && (
                      <span className="text-[10px] text-sky-300 bg-sky-500/15 border border-sky-400/30 px-1.5 py-0.5 rounded font-semibold">
                        Rookie: {ann.rookieDraftAdp}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right-side stat */}
                {view === "consensus" && row.avgRank != null && (
                  <div className="text-right shrink-0 text-[10px] text-slate-600">
                    {row.count} analyst{row.count !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
