import { styles } from "../../styles";
import { estimatePickValue, pickSlotLabel } from "../../lib/marketValue";

// Phase → RA slot key
const PHASE_TO_SLOT = { rebuild: "early", retool: "mid", contender: "late" };

function getPickValue(pick, ownerPhase, raPickValues, leagueContext, tradeMarket) {
  // Prefer RosterAudit market value when available
  if (raPickValues && pick?.round) {
    // Try exact slot first (e.g., "2026-1-3" for pick 1.03)
    if (pick.slot != null) {
      const exactKey = `${pick.season}-${pick.round}-${pick.slot}`;
      const exactVal = raPickValues[exactKey];
      if (exactVal != null) return { value: exactVal, source: "ra" };
    }
    // Fall back to phase-based slot (early/mid/late)
    const slot = PHASE_TO_SLOT[ownerPhase] || "mid";
    const key = `${pick.season}-${pick.round}-${slot}`;
    const raVal = raPickValues[key];
    if (raVal != null) return { value: raVal, source: "ra" };
  }
  // Fallback to internal estimate
  if (leagueContext) {
    return { value: estimatePickValue(pick, leagueContext, tradeMarket), source: "est" };
  }
  return null;
}

function formatValue(val) {
  if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
  return String(val);
}

export default function PicksTab({ picksByYear, picks, leagueContext, tradeMarket, leagueTeams, myRosterId, raPickValues }) {
  // Build a map from rosterId → teamPhase so we can project pick position
  const phaseByRosterId = new Map(
    (leagueTeams || []).map((t) => [t.rosterId, t.teamPhase?.phase || "retool"]),
  );
  const myPhase = phaseByRosterId.get(myRosterId) || "retool";
  const hasRA = raPickValues && Object.keys(raPickValues).length > 0;
  const currentYear = String(new Date().getFullYear());

  return (
    <div>
      <div style={styles.sectionLabel}>Draft Capital by Year</div>
      {Object.keys(picksByYear)
        .sort()
        .map((year) => (
          <div key={year} style={{ marginBottom: 24 }}>
            <div
              style={{
                fontSize: 12,
                color: "#00f5a0",
                letterSpacing: 2,
                marginBottom: 10,
              }}
            >
              {year}
            </div>
            {year > currentYear && (
              <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 6, fontStyle: "italic" }}>
                Draft order predicted from team strength
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {picksByYear[year].map((pick, index) => {
                const label =
                  pick.round === 1
                    ? "1st"
                    : pick.round === 2
                      ? "2nd"
                      : pick.round === 3
                        ? "3rd"
                        : `${pick.round}th`;
                const color =
                  pick.round === 1
                    ? "#00f5a0"
                    : pick.round === 2
                      ? "#ffd84d"
                      : "#d9deef";

                // Project draft position from the original owner's team phase
                const ownerPhase = pick.isOwn
                  ? myPhase
                  : phaseByRosterId.get(pick.originalRosterId) || "retool";
                const posLabel = pickSlotLabel(pick.round, ownerPhase);

                // Pick value — prefer RosterAudit market data
                const pickVal = getPickValue(pick, ownerPhase, raPickValues, leagueContext, tradeMarket);

                return (
                  <div
                    key={index}
                    style={{
                      padding: "8px 16px",
                      background: `${color}11`,
                      border: `1px solid ${color}44`,
                      borderRadius: 2,
                      fontSize: 12,
                      color,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <span>
                      {pick.slotLabel ? (
                        <span style={{ fontWeight: 600 }}>{pick.slotLabel}</span>
                      ) : (
                        <>
                          {posLabel && (
                            <span
                              style={{
                                fontSize: 9,
                                textTransform: "uppercase",
                                letterSpacing: 1,
                                opacity: 0.8,
                                marginRight: 4,
                              }}
                            >
                              {posLabel}
                            </span>
                          )}
                          {label} Rd
                        </>
                      )}
                      {!pick.isOwn && (
                        <span
                          style={{
                            color: "#d1d7ea",
                            marginLeft: 6,
                            fontSize: 10,
                          }}
                        >
                          via {pick.fromTeam || "trade"}
                        </span>
                      )}
                    </span>
                    {pickVal != null && (
                      <span
                        style={{
                          fontSize: 9,
                          color: pickVal.source === "ra" ? "#00f5a0" : "#94a3b8",
                          borderLeft: "1px solid rgba(255,255,255,0.1)",
                          paddingLeft: 8,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {pickVal.source === "ra" ? "" : "~"}{formatValue(pickVal.value)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {picks.length === 0 && (
        <div style={{ ...styles.card, color: "#d1d7ea", fontSize: 13 }}>
          No future picks found.
        </div>
      )}

      {(leagueContext || hasRA) && picks.length > 0 && (
        <div style={{ ...styles.card, marginTop: 16, marginBottom: 8 }}>
          <div style={styles.sectionLabel}>Capital Summary</div>
          {hasRA && (
            <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 10 }}>
              Values from <span style={{ color: "#00f5a0" }}>RosterAudit</span> dynasty market data
            </div>
          )}
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            {Object.keys(picksByYear)
              .sort()
              .map((year) => {
                const yearPicks = picksByYear[year];
                const total = yearPicks.reduce((sum, pk) => {
                  const ownerPhase = pk.isOwn
                    ? myPhase
                    : phaseByRosterId.get(pk.originalRosterId) || "retool";
                  const pv = getPickValue({ ...pk, season: year }, ownerPhase, raPickValues, leagueContext, tradeMarket);
                  return sum + (pv?.value || 0);
                }, 0);
                return (
                  <div
                    key={year}
                    style={{
                      textAlign: "center",
                      padding: "8px 16px",
                      background: "rgba(255,255,255,0.03)",
                      borderRadius: 4,
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1, marginBottom: 4 }}>
                      {year}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "#e8e8f0" }}>
                      {hasRA ? "" : "~"}{formatValue(total)}
                    </div>
                    <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 2 }}>
                      {yearPicks.length} pick{yearPicks.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div
        style={{
          ...styles.card,
          marginTop: 24,
          borderColor: "rgba(255,211,77,0.2)",
        }}
      >
        <div style={styles.sectionLabel}>Pick Strategy Guide</div>
        <div style={{ fontSize: 12, color: "#d9deef", lineHeight: 1.8 }}>
          <div>
            ▸ <span style={{ color: "#00f5a0" }}>1st round picks</span> —
            franchise-altering. Never sell cheap.
          </div>
          <div>
            ▸ <span style={{ color: "#ffd84d" }}>2nd round picks</span> — strong
            currency. Use to fill positional holes.
          </div>
          <div>
            ▸ <span style={{ color: "#d9deef" }}>3rd+ picks</span> — sweeteners.
            Stack or combine for upgrades.
          </div>
        </div>
      </div>
    </div>
  );
}
