import { useEffect, useMemo, useState } from "react";
import { NFL_TEAMS, overridesToCsv } from "../lib/ocData.js";
import { uniqueDcNames } from "../lib/dcData.js";

// ── DC Manager ────────────────────────────────────────────────────────────────
// Season management for the DC dataset — the DC twin of the OC editor tab in
// /admin/oc-rankings. Add a new year (e.g. going into 2026), bootstrap it by
// copying holdover coordinators from the previous season, then edit the teams
// that made a change. Edits persist to Supabase (dc_entries) via the parent's
// onSetOverride, with localStorage as the offline fallback. The Matchup Lab's
// continuity weighting and DC name chips pick changes up immediately.

export default function DcSeasonManager({
  seasons,
  effectiveDcData,
  overrides,
  onSetOverride,
  onBulkSet,
  onAddYear,
}) {
  const [year, setYear] = useState(seasons[0]);
  const [newYearInput, setNewYearInput] = useState("");
  const [copied, setCopied] = useState(false);

  // If the year we were editing disappears (shouldn't normally) snap to newest.
  useEffect(() => {
    if (!seasons.includes(year)) setYear(seasons[0]);
  }, [seasons, year]);

  const yearData = effectiveDcData[year] || {};
  const prevYear = seasons.find((y) => y < year) ?? null;
  const prevYearData = (prevYear && effectiveDcData[prevYear]) || {};
  const overrideKeys = new Set(Object.keys(overrides[year] || {}));
  const nameSuggestions = useMemo(() => uniqueDcNames(effectiveDcData), [effectiveDcData]);

  const filledCount = NFL_TEAMS.filter((t) => yearData[t.abbr]?.name).length;
  // Teams the previous season can bootstrap: known last year, still empty now.
  const copyable = prevYear
    ? NFL_TEAMS.filter((t) => prevYearData[t.abbr]?.name && !yearData[t.abbr]?.name)
    : [];

  function handleAddYear(e) {
    e.preventDefault();
    const n = parseInt(newYearInput, 10);
    if (!Number.isFinite(n) || n < 1990 || n > 2099) return;
    onAddYear(n);
    setYear(n);
    setNewYearInput("");
  }

  function handleCopyForward() {
    const entries = {};
    for (const t of copyable) {
      const prev = prevYearData[t.abbr];
      // Carry the name (and an HC-playcaller flag); drop season-specific
      // metadata like partial/note — those describe the OLD season.
      const entry = { name: prev.name };
      if (prev.playcaller) entry.playcaller = prev.playcaller;
      entries[t.abbr] = entry;
    }
    if (Object.keys(entries).length) onBulkSet(year, entries);
  }

  function handleExport() {
    const csv = overridesToCsv(overrides);
    if (!csv) return;
    navigator.clipboard.writeText(csv).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  }

  const hasAnyOverrides = Object.keys(overrides).length > 0;
  const suggestedYear = Math.max(...seasons) + 1;

  return (
    <div className="space-y-4">
      <datalist id="dc-name-suggestions">
        {nameSuggestions.map((n) => <option key={n} value={n} />)}
      </datalist>

      <div className="rounded-xl border border-white/10 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-500 mr-1">Year</span>
          {seasons.map((y) => (
            <button key={y} onClick={() => setYear(y)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                year === y
                  ? "border-lime-400/60 bg-lime-500/15 text-lime-200"
                  : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"
              }`}>
              {y}
            </button>
          ))}
          <form onSubmit={handleAddYear} className="flex items-center gap-1 ml-3">
            <input value={newYearInput} onChange={(e) => setNewYearInput(e.target.value)}
              placeholder={String(suggestedYear)}
              className="w-20 bg-slate-900 border border-white/10 rounded-md px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-lime-400" />
            <button type="submit"
              className="px-2 py-1.5 rounded-md text-xs font-semibold border border-lime-400/40 bg-lime-500/10 text-lime-300 hover:bg-lime-500/20">
              + Add Year
            </button>
          </form>
          <button onClick={handleExport}
            disabled={!hasAnyOverrides}
            className="ml-auto px-3 py-1.5 rounded-md text-xs font-semibold border border-sky-400/40 bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 disabled:opacity-30 disabled:cursor-not-allowed">
            {copied ? "✓ Copied CSV" : "Export overrides → CSV"}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <span className="text-xs text-slate-400">
            <span className="font-semibold text-slate-200">{filledCount}/32</span> teams filled for {year}
          </span>
          {copyable.length > 0 && (
            <button onClick={handleCopyForward}
              className="px-3 py-1.5 rounded-md text-xs font-semibold border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20">
              Copy {copyable.length} holdovers from {prevYear} →
            </button>
          )}
          {copyable.length > 0 && (
            <span className="text-[10px] text-slate-500">
              Fills only empty teams with last season's DC — then just edit the teams that hired a new one.
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-500 mt-2">
          Edits save to Supabase (and your browser as backup). To bake overrides into the seed file, use
          Export → paste into a CSV → run <code className="text-lime-300">npm run import:ocs -- --dc</code>.
          Teams marked <span className="text-amber-400">new DC</span> changed coordinator vs {prevYear ?? "the prior year"} —
          their past seasons count at 0.35× weight in the matchup multipliers.
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-slate-900/40 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/80 text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="text-left py-2.5 px-3 w-44">Team</th>
              <th className="text-left py-2.5 px-3">Defensive Coordinator ({year})</th>
              <th className="w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {NFL_TEAMS.map((t) => (
              <DcEditorRow key={t.abbr}
                team={t}
                entry={yearData[t.abbr] || {}}
                prevEntry={prevYearData[t.abbr] || null}
                hasOverride={overrideKeys.has(t.abbr)}
                onCommit={(entry) => {
                  if (!entry || !entry.name?.trim()) onSetOverride(year, t.abbr, null);
                  else onSetOverride(year, t.abbr, entry);
                }}
                onReset={() => onSetOverride(year, t.abbr, null)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DcEditorRow({ team, entry, prevEntry, hasOverride, onCommit, onReset }) {
  const [draftName, setDraftName]             = useState(entry.name || "");
  const [draftNote, setDraftNote]             = useState(entry.note || "");
  const [draftPartial, setDraftPartial]       = useState(!!entry.partial);
  const [draftPlaycaller, setDraftPlaycaller] = useState(entry.playcaller || "");
  const [expanded, setExpanded]               = useState(false);

  // Keep drafts in sync when year switches or an upstream reset happens.
  useEffect(() => {
    setDraftName(entry.name || "");
    setDraftNote(entry.note || "");
    setDraftPartial(!!entry.partial);
    setDraftPlaycaller(entry.playcaller || "");
    setExpanded(false);
  }, [entry, team.abbr]);

  function buildEntry() {
    const e = { name: draftName.trim() };
    if (draftPartial) e.partial = true;
    if (draftNote.trim()) e.note = draftNote.trim();
    if (draftPlaycaller.trim()) e.playcaller = draftPlaycaller.trim();
    return e;
  }

  function commitName() {
    const trimmed = draftName.trim();
    if (!trimmed) { onCommit(null); return; }
    // Only write if something actually changed.
    if (trimmed !== (entry.name || "") ||
        draftNote.trim() !== (entry.note || "") ||
        draftPartial !== !!entry.partial ||
        draftPlaycaller.trim() !== (entry.playcaller || "")) {
      onCommit(buildEntry());
    }
  }

  function commitMeta() {
    if (!draftName.trim()) return; // Don't save metadata with no name.
    onCommit(buildEntry());
  }

  const hasMetadata = entry.partial || entry.note || entry.playcaller;
  const isNewDc = !!(entry.name && prevEntry?.name &&
    entry.name.trim().toLowerCase() !== prevEntry.name.trim().toLowerCase());

  return (
    <>
      <tr className="hover:bg-slate-900/60">
        <td className="py-2 px-3">
          <div className="font-semibold text-slate-100">{team.name}</div>
          <div className="text-[10px] text-slate-500">{team.abbr} · {team.division}</div>
        </td>
        <td className="py-2 px-3">
          <div className="flex items-center gap-2">
            <input
              list="dc-name-suggestions"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.currentTarget.blur(); }
                if (e.key === "Escape") { setDraftName(entry.name || ""); e.currentTarget.blur(); }
              }}
              placeholder="Coordinator name…"
              className="w-full bg-slate-950 border border-white/10 rounded-md px-3 py-1.5 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-lime-400"
            />
            {isNewDc && (
              <span title={`Was ${prevEntry.name} last season`}
                className="text-[9px] font-semibold uppercase tracking-wide text-amber-300 border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 rounded shrink-0">
                new DC
              </span>
            )}
          </div>
        </td>
        <td className="py-2 px-3 text-right whitespace-nowrap">
          <div className="flex items-center justify-end gap-1.5">
            {hasMetadata && !expanded && (
              <span className="text-[9px] text-amber-400/70 border border-amber-400/30 px-1.5 py-0.5 rounded">has notes</span>
            )}
            <button onClick={() => setExpanded((v) => !v)} title="Edit notes / flags"
              className={`text-[10px] border px-2 py-1 rounded transition-colors ${
                expanded
                  ? "border-lime-400/40 text-lime-300 bg-lime-500/10"
                  : "border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20"
              }`}>
              {expanded ? "▴ less" : "▾ more"}
            </button>
            {hasOverride && (
              <button onClick={onReset} title="Reset to seed value"
                className="text-[10px] text-slate-500 hover:text-rose-300 border border-white/10 hover:border-rose-400/40 px-2 py-1 rounded">
                ↺ reset
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-900/80">
          <td />
          <td colSpan={2} className="px-3 pb-3 pt-1">
            <div className="flex flex-wrap gap-3 items-start">
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                <input type="checkbox" checked={draftPartial} onChange={(e) => { setDraftPartial(e.target.checked); }}
                  onBlur={commitMeta}
                  className="accent-amber-400 w-3 h-3" />
                Partial season
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
                <input type="checkbox" checked={draftPlaycaller === "HC"} onChange={(e) => { setDraftPlaycaller(e.target.checked ? "HC" : ""); }}
                  onBlur={commitMeta}
                  className="accent-sky-400 w-3 h-3" />
                HC runs the defense
              </label>
              <input
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                onBlur={commitMeta}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                placeholder="Note (e.g. Fired mid-season; X finished)"
                className="flex-1 min-w-48 bg-slate-950 border border-white/10 rounded-md px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-lime-400"
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
