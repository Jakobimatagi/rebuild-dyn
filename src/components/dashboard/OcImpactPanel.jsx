import { useState } from "react";
import { styles } from "../../styles";
import { SCHEMES } from "../../lib/ocSchemes";
import { buildRosterOcImpact, ocImpactVerdict, ocSign } from "../../lib/rosterOcImpact";

const POS_COLOR = { QB: "#ff6b35", RB: "#00f5a0", WR: "#4da6ff", TE: "#c084fc" };

// Muted inline label for the play-caller / scheme metadata rows in cluster cards.
const FIELD_LABEL = {
  fontSize: 8,
  letterSpacing: 1,
  color: "#606878",
  minWidth: 44,
  flexShrink: 0,
};

function moverTone(delta) {
  if (delta >= 0.04 || delta > 0) return "#00f5a0";
  if (delta <= -0.04 || delta < 0) return "#ff6b35";
  return "#ffd84d";
}

function SchemeChips({ schemes }) {
  return (schemes || []).map((key) => {
    const meta = SCHEMES[key];
    if (!meta) return null;
    return (
      <span
        key={key}
        title={meta.desc}
        style={{
          fontSize: 8,
          letterSpacing: 1,
          padding: "1px 6px",
          borderRadius: 2,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          color: "#c0c8e0",
        }}
      >
        {meta.short || meta.label}
      </span>
    );
  });
}

function MoverRow({ m }) {
  const tone = moverTone(m.delta);
  const arrow = m.delta > 0 ? "▲" : m.delta < 0 ? "▼" : "•";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        padding: "6px 0",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            letterSpacing: 0.5,
            color: POS_COLOR[m.pos] || "#888",
            flexShrink: 0,
          }}
        >
          {m.pos}
        </span>
        <span
          style={{
            fontSize: 11,
            color: "#e0e5f7",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {m.name}
        </span>
        <span style={{ fontSize: 9, color: "#707890", flexShrink: 0 }}>
          {m.team} · {m.ocName}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 9, color: "#909ab0" }}>
          {m.baselinePpg.toFixed(1)}→{m.projectedPpg.toFixed(1)}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: tone, minWidth: 56, textAlign: "right" }}>
          {arrow} {ocSign(m.delta)}{m.delta.toFixed(1)} PPG
        </span>
      </div>
    </div>
  );
}

export default function OcImpactPanel({ byPos }) {
  const [open, setOpen] = useState(false);
  const impact = buildRosterOcImpact(byPos);
  if (!impact) return null;

  const verdict = ocImpactVerdict(impact);
  const { netDelta, netPct, counts, tailwinds, headwinds, envOnly, clusters, risks } = impact;
  const netTone = moverTone(netDelta);

  return (
    <div
      style={{
        ...styles.card,
        padding: "16px 20px",
        borderLeft: `3px solid ${verdict.tone}`,
        marginBottom: 28,
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "transparent",
          border: "none",
          padding: 0,
          width: "100%",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ ...styles.sectionLabel, marginBottom: 0 }}>OC Impact on Your Roster</div>
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: verdict.tone,
            background: `${verdict.tone}1a`,
            border: `1px solid ${verdict.tone}44`,
            borderRadius: 2,
            padding: "2px 8px",
          }}
        >
          {verdict.label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: netTone, marginLeft: "auto" }}>
          {ocSign(netDelta)}{netDelta.toFixed(1)} PPG
          {netPct != null && (
            <span style={{ fontSize: 10, color: "#808898", marginLeft: 6 }}>
              ({ocSign(netPct * 100)}{(netPct * 100).toFixed(1)}%)
            </span>
          )}
        </span>
        <span
          style={{
            fontSize: 9,
            color: "#c8cfe3",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)",
            transition: "transform 0.2s",
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <>
          {/* Summary line */}
          <div style={{ fontSize: 10, color: "#808898", marginTop: 8, marginBottom: 14, lineHeight: 1.5 }}>
            Year-1 coordinator + scheme outlook across {impact.covered} rostered{" "}
            {impact.covered === 1 ? "player" : "players"} ({impact.withBaseline} with a PPG baseline).{" "}
            <span style={{ color: "#00f5a0" }}>{counts.helped} helped</span> ·{" "}
            <span style={{ color: "#ff6b35" }}>{counts.hurt} hurt</span> ·{" "}
            <span style={{ color: "#909ab0" }}>{counts.neutral} neutral</span>
          </div>

          {/* Tailwinds / headwinds */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 20,
              marginBottom: clusters.length ? 16 : 0,
            }}
          >
            <div>
              <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#00f5a0", marginBottom: 4, opacity: 0.8 }}>
                ▲ TAILWINDS
              </div>
              {tailwinds.length ? (
                tailwinds.slice(0, 6).map((m) => <MoverRow key={m.id} m={m} />)
              ) : (
                <div style={{ fontSize: 10, color: "#707890", padding: "6px 0" }}>None</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#ff6b35", marginBottom: 4, opacity: 0.8 }}>
                ▼ HEADWINDS
              </div>
              {headwinds.length ? (
                headwinds.slice(0, 6).map((m) => <MoverRow key={m.id} m={m} />)
              ) : (
                <div style={{ fontSize: 10, color: "#707890", padding: "6px 0" }}>None</div>
              )}
            </div>
          </div>

          {/* NFL-offense clusters (only where you have 2+ players) */}
          {clusters.filter((c) => c.players.length >= 2).length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#c8cfe3", marginBottom: 8, opacity: 0.8 }}>
                OFFENSE CONCENTRATION
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {clusters
                  .filter((c) => c.players.length >= 2)
                  .map((c) => {
                    const tone = moverTone(c.delta);
                    return (
                      <div
                        key={c.team}
                        style={{
                          border: `1px solid ${tone}33`,
                          background: `${tone}10`,
                          borderRadius: 4,
                          padding: "8px 10px",
                          minWidth: 150,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{c.team}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, color: tone }}>
                            {ocSign(c.delta)}{c.delta.toFixed(1)}
                          </span>
                        </div>
                        {/* Active play-caller (granular name) — kept distinct from the
                            scheme/tree row below so coordinator names and system tags
                            never share a column. */}
                        <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginBottom: 3 }}>
                          <span style={FIELD_LABEL}>CALLER</span>
                          <span style={{ fontSize: 10, color: "#c0c8e0" }}>
                            {c.ocName}
                            {c.isFirstYearOC && " · 1st-yr"}
                            {c.ocPartial && " · partial"}
                          </span>
                        </div>
                        {/* System / coaching tree (broad) — chips, or an explicit
                            Untagged state so an unmapped OC doesn't render an empty,
                            visually-different card. */}
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 5, flexWrap: "wrap" }}>
                          <span style={FIELD_LABEL}>SCHEME</span>
                          {c.schemes && c.schemes.length > 0 ? (
                            <SchemeChips schemes={c.schemes} />
                          ) : (
                            <span style={{ fontSize: 9, color: "#707890", fontStyle: "italic" }}>Untagged</span>
                          )}
                        </div>
                        <div style={{ fontSize: 9, color: "#c0c8e0" }}>
                          {c.players.map((p) => p.name).join(", ")}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Rookie / no-baseline environment signals */}
          {envOnly.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, color: "#c8cfe3", marginBottom: 6, opacity: 0.8 }}>
                ENVIRONMENT ONLY (no PPG baseline)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {envOnly.map((p) => {
                  const tone = moverTone(p.multiplierPct / 100);
                  return (
                    <span
                      key={p.id}
                      title={`${p.ocName} — ${p.team}`}
                      style={{
                        fontSize: 9,
                        padding: "2px 8px",
                        borderRadius: 2,
                        background: `${tone}12`,
                        border: `1px solid ${tone}30`,
                        color: tone,
                      }}
                    >
                      {p.name}
                      {p.ocName && (
                        <span style={{ opacity: 0.7 }}> · {p.ocName}</span>
                      )}
                      {" "}{ocSign(p.multiplierPct)}{p.multiplierPct.toFixed(1)}%
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Projection-confidence risk flags */}
          {(risks.firstYearOc.length > 0 || risks.partialOc.length > 0) && (
            <div
              style={{
                fontSize: 9,
                color: "#909ab0",
                lineHeight: 1.6,
                borderTop: "1px solid rgba(255,255,255,0.06)",
                paddingTop: 10,
              }}
            >
              <span style={{ color: "#ffd84d", letterSpacing: 1 }}>LOWER CONFIDENCE</span> — projections
              lean on scheme tags / carry a discount where coordinators lack a full track record:
              {risks.firstYearOc.length > 0 && (
                <div>
                  · 1st-year OC: {risks.firstYearOc.map((r) => `${r.ocName} (${r.players.join(", ")})`).join("; ")}
                </div>
              )}
              {risks.partialOc.length > 0 && (
                <div>
                  · Mid-season/partial: {risks.partialOc.map((r) => `${r.ocName} (${r.players.join(", ")})`).join("; ")}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
