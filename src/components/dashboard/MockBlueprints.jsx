// Mock Blueprints — a standalone sandbox (no live draft needed). Pick a slot and a
// blueprint; we simulate a full snake startup draft (your slot on-plan, the field
// best-available by ADP/value) and render the whole board so you can see the picks
// that happened around you — the context that forces each decision.

import { useEffect, useMemo, useState } from "react";
import {
  DRAFT_BLUEPRINTS,
  availableBlueprints,
  simulateMockDraft,
  trackAdherence,
  formatTags,
  reshapeForFormat,
  isUnsigned,
} from "../../lib/draftBlueprints";
import { fetchStartupAdp } from "../../lib/startupAdpApi";

const POS_COLOR = { QB: "#ff6b6b", RB: "#4ecdc4", WR: "#ffd166", TE: "#c084fc" };
const posColor = (p) => POS_COLOR[p] || "#d9deef";

const card = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: 16,
};
const selStyle = {
  background: "rgba(0,0,0,0.3)",
  color: "#e8e8f0",
  border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 6,
  padding: "6px 9px",
  fontSize: 13,
};

function Field({ label, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, letterSpacing: 1, color: "#7a819c", fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  );
}

export default function MockBlueprints({ pool = [], leagueContext = {} }) {
  const options = useMemo(() => availableBlueprints(leagueContext), [leagueContext]);
  const [blueprintId, setBlueprintId] = useState(options[0]?.id || "balanced");
  const [numTeams, setNumTeams] = useState(Number(leagueContext.numTeams) || 12);
  const [rounds, setRounds] = useState(16);
  const [slot, setSlot] = useState(1);
  const [strict, setStrict] = useState(false);
  const [adpMap, setAdpMap] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchStartupAdp(leagueContext)
      .then((m) => { if (alive) setAdpMap(m); })
      .catch(() => { if (alive) setAdpMap(new Map()); });
    return () => { alive = false; };
  }, [leagueContext]);

  // Merge community ADP rank into the pool, then reshape for league format (TE
  // premium lifts TE value), so the field drafts a format-accurate board.
  const enrichedPool = useMemo(
    () => reshapeForFormat(pool.map((p) => ({ ...p, adpRank: adpMap?.get(p.id)?.adpRank ?? null })), leagueContext),
    [pool, adpMap, leagueContext],
  );
  const tags = useMemo(() => formatTags(leagueContext), [leagueContext]);

  const blueprint = DRAFT_BLUEPRINTS[blueprintId] || null;
  const { board, myRoster } = useMemo(
    () =>
      blueprint && enrichedPool.length
        ? simulateMockDraft({ blueprint, pool: enrichedPool, slot, numTeams, rounds, strict, leagueContext })
        : { board: [], myRoster: [] },
    [blueprint, enrichedPool, slot, numTeams, rounds, strict, leagueContext],
  );

  const adherence = useMemo(
    () => (blueprint && myRoster.length ? trackAdherence(blueprint, myRoster) : null),
    [blueprint, myRoster],
  );
  const usingAdp = adpMap && adpMap.size > 0;

  const byCell = useMemo(() => {
    const m = new Map();
    for (const c of board) m.set(`${c.round}-${c.slot}`, c);
    return m;
  }, [board]);

  const myPicks = board.filter((c) => c.mine);

  if (!pool.length) {
    return (
      <div style={{ ...card, color: "#9097ad", fontSize: 13 }}>
        No player values loaded for this league yet, so there's nothing to mock-draft from.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Format tags — these reshape the board */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 10, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginRight: 2 }}>FORMAT</span>
        {tags.map((t) => (
          <span key={t.key} style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 10, background: "rgba(0,245,160,0.1)", border: "1px solid rgba(0,245,160,0.25)", color: "#00f5a0" }}>
            {t.label}
          </span>
        ))}
      </div>

      {/* Controls */}
      <div style={card}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <Field label="BLUEPRINT">
            <select value={blueprintId} onChange={(e) => setBlueprintId(e.target.value)} style={{ ...selStyle, minWidth: 200 }}>
              {options.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
          </Field>
          <Field label="YOUR SLOT">
            <select value={slot} onChange={(e) => setSlot(Number(e.target.value))} style={selStyle}>
              {Array.from({ length: numTeams }, (_, i) => i + 1).map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="TEAMS">
            <select value={numTeams} onChange={(e) => { const n = Number(e.target.value); setNumTeams(n); if (slot > n) setSlot(n); }} style={selStyle}>
              {[8, 10, 12, 14, 16].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="ROUNDS">
            <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))} style={selStyle}>
              {[12, 15, 16, 18, 20, 22, 25].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#cdd2e4", cursor: "pointer", paddingBottom: 6 }}>
            <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
            Strict on-plan
          </label>
        </div>
        <div style={{ fontSize: 11, color: "#7a819c", marginTop: 10 }}>
          {blueprint?.tagline}. The field drafts best-available by {usingAdp ? "community ADP" : "value rank (no ADP feed yet)"};
          your slot follows the plan. Illustrative — not an exact forecast.
        </div>
      </div>

      {/* Your team + blueprint match */}
      {adherence && (
        <div style={{ ...card, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: adherence.overall >= 70 ? "#00f5a0" : adherence.overall >= 45 ? "#ffd166" : "#ff6b6b" }}>
              {adherence.overall}
            </div>
            <div style={{ fontSize: 10, letterSpacing: 1, color: "#7a819c", fontWeight: 700 }}>BLUEPRINT MATCH</div>
          </div>
          <div style={{ flex: "1 1 260px", minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "#cdd2e4", marginBottom: 6 }}>
              Avg age <strong style={{ color: "#e8e8f0" }}>{adherence.avgAge.actual}</strong> / {adherence.avgAge.target}
              <span style={{ color: "#7a819c" }}> · on-plan picks </span>
              <strong style={{ color: "#e8e8f0" }}>{adherence.onPlanPickPct}%</strong>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {myPicks.map((c) => (
                <span key={c.pickNo} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "rgba(255,255,255,0.05)", color: "#e8e8f0" }}>
                  <span style={{ color: "#7a819c" }}>R{c.round}</span>{" "}
                  <span style={{ color: posColor(c.player.position), fontWeight: 700 }}>{c.player.position}</span>{" "}
                  {c.player.name}
                </span>
              ))}
            </div>
            {adherence.deviations.length > 0 && (
              <div style={{ fontSize: 11, color: "#ff9a76", marginTop: 6 }}>{adherence.deviations.join(" · ")}</div>
            )}
          </div>
        </div>
      )}

      {/* Full board */}
      <div style={card}>
        <div style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginBottom: 10 }}>
          MOCK DRAFT BOARD · YOUR SLOT HIGHLIGHTED
        </div>
        <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `34px repeat(${numTeams}, minmax(96px, 1fr))`, gap: 3, minWidth: numTeams * 99 }}>
            {/* header row */}
            <div />
            {Array.from({ length: numTeams }, (_, i) => i + 1).map((s) => (
              <div key={`h${s}`} style={{ fontSize: 10, textAlign: "center", fontWeight: 700, color: s === slot ? "#00f5a0" : "#7a819c", padding: "2px 0" }}>
                {s === slot ? "YOU" : s}
              </div>
            ))}
            {/* round rows */}
            {Array.from({ length: rounds }, (_, r) => r + 1).map((round) => (
              <Row key={round} round={round} numTeams={numTeams} slot={slot} byCell={byCell} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ round, numTeams, slot, byCell }) {
  return (
    <>
      <div style={{ fontSize: 10, color: "#7a819c", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
        R{round}
      </div>
      {Array.from({ length: numTeams }, (_, i) => i + 1).map((s) => {
        const c = byCell.get(`${round}-${s}`);
        const mine = s === slot;
        const color = c ? posColor(c.player.position) : "#3a4060";
        return (
          <div
            key={`${round}-${s}`}
            style={{
              minHeight: 34,
              borderRadius: 4,
              padding: "3px 5px",
              background: mine ? "rgba(0,245,160,0.1)" : "rgba(255,255,255,0.03)",
              borderTop: `1px solid ${mine ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.06)"}`,
              borderRight: `1px solid ${mine ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.06)"}`,
              borderBottom: `1px solid ${mine ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.06)"}`,
              borderLeft: `3px solid ${color}`,
              overflow: "hidden",
            }}
          >
            {c ? (
              <>
                <div style={{ fontSize: 11, color: "#e8e8f0", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.player.name}
                </div>
                <div style={{ fontSize: 9, color: "#7a819c" }}>
                  <span style={{ color, fontWeight: 700 }}>{c.player.position}</span>
                  {c.player.age ? ` · ${c.player.age}y` : ""}
                  {isUnsigned(c.player) && <span style={{ color: "#ff9a76", fontWeight: 700 }}> · FA</span>}
                </div>
              </>
            ) : null}
          </div>
        );
      })}
    </>
  );
}
