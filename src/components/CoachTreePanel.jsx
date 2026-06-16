import { useEffect, useMemo, useState } from "react";
import { fetchCoachSeasons, fetchSchemeSeasons } from "../lib/ocHistoryApi.js";
import {
  buildCoachTrees,
  getDiscipleTree,
  rankCoachTrees,
} from "../lib/coachTree.js";

// Coach-tree lineage view. Joins the pbp-derived head-coach history (coach_seasons,
// 1999+) with the app's OC map (OC_DATA) into mentor→disciple trees, each coach
// carrying the "scheme DNA" of their offenses (PROE / EPA / aDOT / pass rate).

const fmt = (v, d = 0) => (v == null || Number.isNaN(Number(v)) ? "—" : Number(v).toFixed(d));

function DnaChips({ dna }) {
  if (!dna) return <span className="text-[10px] text-slate-500">no scheme data</span>;
  const items = [
    ["PROE", fmt(dna.proe, 1)],
    ["EPA/play", fmt(dna.epa_play, 3)],
    ["aDOT", fmt(dna.adot, 1)],
    ["Pass%", dna.pass_rate == null ? "—" : `${Math.round(dna.pass_rate * 100)}`],
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(([k, v]) => (
        <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/70 border border-white/10 text-slate-300">
          <span className="text-slate-500">{k}</span> {v}
        </span>
      ))}
    </div>
  );
}

function stopsLabel(stops) {
  if (!stops?.length) return "";
  // Collapse consecutive seasons per team into "TEAM ’YY–’YY".
  const byTeam = new Map();
  for (const s of stops) {
    if (!byTeam.has(s.team)) byTeam.set(s.team, []);
    byTeam.get(s.team).push(s.season);
  }
  return [...byTeam.entries()]
    .map(([team, yrs]) => {
      const a = Math.min(...yrs), b = Math.max(...yrs);
      const range = a === b ? `'${String(a).slice(2)}` : `'${String(a).slice(2)}–'${String(b).slice(2)}`;
      return `${team} ${range}`;
    })
    .join(" · ");
}

function TreeNode({ node, depth }) {
  return (
    <div className={depth > 0 ? "ml-4 pl-3 border-l border-white/10" : ""}>
      <div className="py-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${node.isHeadCoach ? "text-emerald-300" : "text-slate-300"}`}>
            {node.name}
          </span>
          {node.isHeadCoach && (
            <span className="text-[9px] uppercase tracking-wider text-emerald-400/70 border border-emerald-400/30 rounded px-1">HC</span>
          )}
          {node.hcStops?.length > 0 && (
            <span className="text-[10px] text-slate-500">{stopsLabel(node.hcStops)}</span>
          )}
        </div>
        {node.isHeadCoach && <div className="mt-1"><DnaChips dna={node.schemeDNA} /></div>}
      </div>
      {node.disciples?.map((d) => (
        <TreeNode key={d.name} node={d} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function CoachTreePanel({ ocData }) {
  const [coachSeasons, setCoachSeasons] = useState(null);
  const [schemeSeasons, setSchemeSeasons] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cs, ss] = await Promise.all([fetchCoachSeasons(), fetchSchemeSeasons()]);
      if (cancelled) return;
      setCoachSeasons(cs);
      setSchemeSeasons(ss);
    })();
    return () => { cancelled = true; };
  }, []);

  const graph = useMemo(() => {
    if (!coachSeasons) return null;
    return buildCoachTrees({ coachSeasons, ocData, schemeSeasons });
  }, [coachSeasons, ocData, schemeSeasons]);

  const ranked = useMemo(() => (graph ? rankCoachTrees(graph) : []), [graph]);

  const filteredRanked = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? ranked.filter((r) => r.name.toLowerCase().includes(q)) : ranked;
    return list.slice(0, 40);
  }, [ranked, search]);

  const tree = useMemo(
    () => (graph && selected ? getDiscipleTree(selected, graph, 3) : null),
    [graph, selected],
  );

  if (!coachSeasons) {
    return <div className="text-sm text-slate-400 py-8">Loading coach history…</div>;
  }
  if (coachSeasons.length === 0) {
    return (
      <div className="rounded-xl border border-amber-400/20 bg-amber-500/5 p-4 text-sm text-amber-200/90">
        No coach history found. Publish it from the pipeline first:
        <code className="block mt-2 text-amber-100/80 text-xs">cd python &amp;&amp; python -m projections publish-oc --start 1999</code>
        and apply <code className="text-amber-100/80">docs/migrations/oc_history_schema.sql</code>.
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-[280px_1fr] gap-4">
      {/* Left: most influential trees */}
      <div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search a head coach…"
          className="w-full bg-slate-900 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-400 mb-2"
        />
        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5 px-1">
          Most influential trees
        </div>
        <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
          {filteredRanked.map((r) => (
            <button
              key={r.name}
              onClick={() => setSelected(r.name)}
              className={`w-full text-left px-2.5 py-1.5 rounded-md border text-xs flex items-center justify-between gap-2 ${
                selected === r.name
                  ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-100"
                  : "border-white/10 bg-slate-900/40 text-slate-300 hover:text-slate-100"
              }`}
            >
              <span className="font-semibold truncate">{r.name}</span>
              <span className="text-[10px] text-slate-500 shrink-0">
                {r.hcDisciples > 0 && <span className="text-emerald-400/80">{r.hcDisciples} HC </span>}
                {r.disciples} disc.
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Right: the selected coach's tree */}
      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4 min-h-[200px]">
        {!tree ? (
          <div className="text-sm text-slate-500 py-8 text-center">
            Select a head coach to see their coaching tree and scheme DNA.
          </div>
        ) : (
          <>
            <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
              Coaching tree · coordinators who served under {tree.name} (and theirs)
            </div>
            <TreeNode node={tree} depth={0} />
            {tree.disciples.length === 0 && (
              <div className="text-xs text-slate-500 mt-2">
                No coordinators recorded under {tree.name} yet (OC history covers recent seasons).
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
