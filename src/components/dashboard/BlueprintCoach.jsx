// Blueprint Coach — makes a blueprint actionable for an established (post-draft)
// team. Pick the archetype you want to be; the coach shows your fit, the gap to
// close, which rostered players work against the plan (sell candidates), and real
// buy targets from the league that advance it.

import { useMemo, useState } from "react";
import {
  DRAFT_BLUEPRINTS,
  availableBlueprints,
  classifyDraftBlueprint,
  coachActiveTeam,
} from "../../lib/draftBlueprints";

const POS_COLOR = { QB: "#ff6b6b", RB: "#4ecdc4", WR: "#ffd166", TE: "#c084fc" };
const posColor = (p) => POS_COLOR[p] || "#d9deef";
const card = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: 16,
};

function GapBar({ actual, target, color }) {
  const max = Math.max(actual, target, 1);
  return (
    <div style={{ position: "relative", height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4 }}>
      <div style={{ width: `${(actual / max) * 100}%`, height: "100%", background: color, borderRadius: 4 }} />
      {/* target marker */}
      <div style={{ position: "absolute", top: -2, left: `calc(${(target / max) * 100}% - 1px)`, width: 2, height: 12, background: "#e8e8f0" }} />
    </div>
  );
}

export default function BlueprintCoach({ analysis, leagueContext = {}, tradeSuggestions = [] }) {
  const options = useMemo(() => availableBlueprints(leagueContext), [leagueContext]);
  const detected = useMemo(
    () => classifyDraftBlueprint(analysis, leagueContext)?.top?.id,
    [analysis, leagueContext],
  );
  const [targetId, setTargetId] = useState(null);
  const activeId = targetId || detected || options[0]?.id;
  const blueprint = activeId ? DRAFT_BLUEPRINTS[activeId] : null;

  const coach = useMemo(
    () => (blueprint ? coachActiveTeam({ snapshot: analysis, blueprint, leagueContext, tradeSuggestions }) : null),
    [blueprint, analysis, leagueContext, tradeSuggestions],
  );

  if (!coach) {
    return <div style={{ ...card, color: "#9097ad", fontSize: 13 }}>No roster to coach yet.</div>;
  }

  const ageOff = +(coach.avgAge - coach.targetAge).toFixed(1);
  const fitColor = coach.fit >= 70 ? "#00f5a0" : coach.fit >= 45 ? "#ffd166" : "#ff6b6b";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Target selector + fit */}
      <div style={card}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700 }}>COACH MY TEAM TOWARD</span>
            <select
              value={activeId || ""}
              onChange={(e) => setTargetId(e.target.value)}
              style={{ background: "rgba(0,0,0,0.3)", color: "#e8e8f0", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, padding: "6px 10px", fontSize: 13, minWidth: 210 }}
            >
              {options.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.label}{b.id === detected ? " (current identity)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{ fontSize: 24, fontWeight: 800, color: fitColor }}>{coach.fit}</span>
            <span style={{ fontSize: 11, color: "#7a819c" }}> / 100 fit</span>
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#aab0c6", marginTop: 8 }}>{blueprint.tagline}</div>
      </div>

      {/* Gap to close */}
      <div style={card}>
        <div style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginBottom: 10 }}>GAP TO CLOSE</div>
        <div style={{ fontSize: 13, color: "#cdd2e4", marginBottom: 12 }}>
          Avg age <strong style={{ color: Math.abs(ageOff) <= 1 ? "#00f5a0" : "#ffd166" }}>{coach.avgAge.toFixed(1)}</strong>
          <span style={{ color: "#7a819c" }}> vs {coach.targetAge} target</span>
          {Math.abs(ageOff) > 1 && (
            <span style={{ color: "#ff9a76" }}> — {ageOff > 0 ? `${ageOff}y too old` : `${-ageOff}y younger than plan`}</span>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "30px 1fr 70px", gap: 8, rowGap: 7, alignItems: "center" }}>
          {coach.positions.map((p) => (
            <FragmentRow key={p.pos} p={p} />
          ))}
        </div>
        <div style={{ fontSize: 10, color: "#7a819c", marginTop: 8 }}>
          Bar = your roster share · marker = blueprint target. {coach.wantedPositions.length > 0 && (
            <>Lean into <strong style={{ color: "#e8e8f0" }}>{coach.wantedPositions.join(" / ")}</strong>.</>
          )}
        </div>
      </div>

      {/* Off-plan sell candidates */}
      <div style={card}>
        <div style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginBottom: 10 }}>
          WORKS AGAINST THE PLAN · SELL CANDIDATES
        </div>
        {coach.sells.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9097ad" }}>Your roster has no obvious off-plan pieces — nicely aligned.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {coach.sells.slice(0, 8).map(({ player, reason }) => (
              <div key={player.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "7px 10px", background: "rgba(255,107,107,0.06)", border: "1px solid rgba(255,107,107,0.18)", borderRadius: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#e8e8f0", fontWeight: 600 }}>
                    <span style={{ color: posColor(player.position), fontWeight: 700, marginRight: 5 }}>{player.position}</span>
                    {player.name}<span style={{ color: "#7a819c", fontWeight: 400 }}> · {player.age}y</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#ff9a76", marginTop: 1 }}>{reason}</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#cdd2e4", textAlign: "right" }}>
                  {Math.round(player.dynastyValue?.value ?? player.marketValue ?? player.score ?? 0)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Acquire targets (real trade suggestions, plan-fitting first) */}
      <div style={card}>
        <div style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginBottom: 10 }}>BUY TARGETS THAT ADVANCE THE PLAN</div>
        {coach.acquireTargets.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9097ad" }}>No trade fits surfaced right now.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
            {coach.acquireTargets.map((s, i) => {
              const t = s.targetPlayer;
              return (
                <div key={`${t.id}-${i}`} style={{ padding: "10px 12px", borderRadius: 6, background: s.fitsPlan ? "rgba(0,245,160,0.06)" : "rgba(255,255,255,0.03)", border: `1px solid ${s.fitsPlan ? "rgba(0,245,160,0.22)" : "rgba(255,255,255,0.07)"}` }}>
                  <div style={{ fontSize: 13, color: "#e8e8f0", fontWeight: 600 }}>
                    <span style={{ color: posColor(t.position), fontWeight: 700, marginRight: 5 }}>{t.position}</span>
                    {t.name}<span style={{ color: "#7a819c", fontWeight: 400 }}> · {t.age}y</span>
                  </div>
                  <div style={{ fontSize: 11, color: "#7a819c", margin: "2px 0 6px" }}>from {s.partnerTeam}</div>
                  {s.fitReason && <div style={{ fontSize: 11, color: "#00f5a0", marginBottom: 4 }}>✓ {s.fitReason}</div>}
                  <div style={{ fontSize: 11, color: "#aab0c6" }}>Send: {(s.send || []).join(" + ") || "package"}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FragmentRow({ p }) {
  return (
    <>
      <span style={{ fontSize: 12, fontWeight: 700, color: posColor(p.pos) }}>{p.pos}</span>
      <GapBar actual={p.actual} target={p.target} color={posColor(p.pos)} />
      <span style={{ fontSize: 11, color: "#7a819c", textAlign: "right" }}>
        {p.actual}% <span style={{ color: "#5a6075" }}>/ {p.target}%</span>
      </span>
    </>
  );
}
