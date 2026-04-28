import { useState } from "react";
import { computeGrade } from "../../lib/prospectScoring.js";
import { POS_COLORS, SEASON_COLS, ATHLETIC_FIELDS } from "./constants.js";
import { computeCurrentDraftYear, blankSeason, normalizeName } from "./utils.js";
import { GradeBadge, CapitalSelect, CellInput } from "./Atoms.jsx";

export default function ProspectEditorTab({ prospects, sleeperByName, annotations, onProspectsChange }) {
  const [editorPos, setEditorPos]       = useState("WR");
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
          const { total: grade } = computeGrade(p, sleeperRank, capitalKey, ann.declared || false);
          const athOpen     = athleticOpen.has(p.id);

          return (
            <div key={p.id} className="rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden">
              {/* Player header row */}
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
                    className="text-slate-600 hover:text-rose-400 text-base px-1 transition-colors"
                    title="Remove player"
                    aria-label={`Remove ${p.name || "player"}`}>✕</button>
                </div>
              </div>

              {/* Athletic data (collapsible) */}
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

              {/* Season table */}
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
                            className="text-slate-700 hover:text-rose-400 transition-colors"
                            title="Remove season"
                            aria-label={`Remove season ${s.year || si + 1}`}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Add season footer */}
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
