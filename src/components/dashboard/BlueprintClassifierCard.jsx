// Draft Blueprint — classification surface (Dashboard "Blueprint" tab).
// Reads each team's roster snapshot and reports the closest of the 8 draft
// archetypes for my team (in detail) plus every other league team (a label).

import { useMemo } from "react";
import { classifyDraftBlueprint } from "../../lib/draftBlueprints";

const card = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: 16,
};

function FitBar({ fit, color }) {
  return (
    <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${fit}%`, height: "100%", background: color, borderRadius: 3 }} />
    </div>
  );
}

export default function BlueprintClassifierCard({ analysis, leagueContext, leagueTeams = [] }) {
  // analysis IS my-team snapshot (App spreads ...myTeam into it).
  const mine = useMemo(
    () => classifyDraftBlueprint(analysis, leagueContext),
    [analysis, leagueContext],
  );

  const others = useMemo(
    () =>
      (leagueTeams || [])
        .filter((t) => t.rosterId !== analysis?.rosterId)
        .map((t) => ({
          rosterId: t.rosterId,
          label: t.label,
          ...classifyDraftBlueprint(t, leagueContext),
        })),
    [leagueTeams, leagueContext, analysis?.rosterId],
  );

  if (!mine.top) {
    return <div style={{ ...card, color: "#d1d7ea", fontSize: 13 }}>No roster to classify yet.</div>;
  }

  const top = mine.top;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* My team — headline + ranked alternatives */}
      <div style={card}>
        <div style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginBottom: 8 }}>
          {mine.isMature ? "YOUR ROSTER MOST RESEMBLES" : "YOUR DRAFT BLUEPRINT"}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: top.color }}>{top.label}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e8e8f0" }}>{top.fit}% fit</div>
        </div>
        <div style={{ fontSize: 13, color: "#aab0c6", margin: "4px 0 10px" }}>{top.tagline}</div>
        {top.signals.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {top.signals.map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 11,
                  padding: "2px 8px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.06)",
                  color: "#cdd2e4",
                }}
              >
                {s}
              </span>
            ))}
          </div>
        )}
        {mine.isMature && (
          <div style={{ fontSize: 11, color: "#7a819c", marginBottom: 12 }}>
            This is an established roster, so we classify by its current shape (positional mix,
            age, value gaps) rather than how it was drafted.
          </div>
        )}

        <div style={{ fontSize: 10, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginBottom: 6 }}>
          HOW IT RANKS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {mine.matches.slice(0, 5).map((m) => (
            <div key={m.id} style={{ display: "grid", gridTemplateColumns: "150px 1fr 36px", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: m.id === top.id ? m.color : "#cdd2e4" }}>{m.label}</span>
              <FitBar fit={m.fit} color={m.color} />
              <span style={{ fontSize: 11, color: "#7a819c", textAlign: "right" }}>{m.fit}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* League scouting */}
      {others.length > 0 && (
        <div style={card}>
          <div style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginBottom: 10 }}>
            LEAGUE SCOUTING
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 10,
            }}
          >
            {others.map((t) => (
              <div
                key={t.rosterId}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 6,
                  padding: "8px 10px",
                }}
              >
                <div style={{ fontSize: 12, color: "#e8e8f0", fontWeight: 600, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.top?.color || "#d9deef" }}>
                  {t.top?.label || "—"}
                </div>
                <div style={{ fontSize: 10, color: "#7a819c" }}>{t.top?.fit ?? 0}% fit</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
