import { styles } from "../../styles";

function TradeCalcKey() {
  return (
    <div
      className="dyn-help-wrap"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <button
        type="button"
        className="dyn-grade-help dyn-help-trigger"
        title="Trade calculation key"
        aria-label="Show trade calculation key"
        style={{
          width: 17,
          height: 17,
          borderRadius: "50%",
          background: "transparent",
          border: "1px solid rgba(0,245,160,0.28)",
          color: "#00f5a0",
          fontSize: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        ?
      </button>

      <div
        className="dyn-help-tooltip"
        style={{
          position: "absolute",
          top: 24,
          right: 0,
          width: 320,
          maxWidth: "calc(100vw - 32px)",
          background: "#0d0d16",
          border: "1px solid rgba(0,245,160,0.2)",
          borderRadius: 6,
          padding: 14,
          zIndex: 20,
          boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 2,
            color: "#00f5a0",
            marginBottom: 10,
          }}
        >
          TRADE KEY
        </div>
        {[
          [
            "Adjusted trade value",
            "Blend of internal dynasty scoring, league format adjustments, FantasyCalc market data when available, and Sleeper trade-market multipliers.",
          ],
          [
            "Fit score",
            "Higher when the target solves one of your weak rooms, the other team needs what you are sending, and the value gap is tight.",
          ],
          [
            "Market multipliers",
            "Built from clean Sleeper trades only. Large messy package deals are filtered out so the room is not skewed by noise.",
          ],
          [
            "Tiers",
            "Balanced = close value. Aggressive = stronger push for a core asset. Blockbuster = premium asset requiring multiple meaningful pieces.",
          ],
          [
            "Hard guards",
            "Young superflex QBs and other premium assets require anchor pieces and meaningful picks/players. Late junk picks do not count.",
          ],
        ].map(([label, desc]) => (
          <div key={label} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#fff", marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 11, color: "#d1d7ea", lineHeight: 1.55 }}>
              {desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PickChip({ pick }) {
  const color =
    pick.round === 1 ? "#00f5a0" : pick.round === 2 ? "#ffd84d" : "#d9deef";

  return (
    <span
      style={{
        ...styles.tag(color),
        marginRight: 8,
        marginBottom: 8,
        display: "inline-block",
      }}
    >
      {pick.label}
    </span>
  );
}

export default function TradeTab({
  tradeSuggestions,
  weakRooms,
  surplusPositions,
  tradeBlock,
  picks,
  leagueContext,
  tradeMarket,
  fantasyCalcSource,
}) {
  return (
    <div>
      <div
        style={{
          ...styles.card,
          marginBottom: 24,
          borderColor: "rgba(0,245,160,0.22)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ ...styles.sectionLabel, marginBottom: 0 }}>
            League Market Context
          </div>
          <TradeCalcKey />
        </div>
        <div style={{ fontSize: 12, color: "#d9deef", lineHeight: 1.7 }}>
          {leagueContext?.formatLabel || "League settings unavailable."}
        </div>
        <div style={{ fontSize: 11, color: "#c8cfe3", marginTop: 10 }}>
          Based on {tradeMarket?.sampleCount || 0} recent clean Sleeper trades.
          QB market: x
          {tradeMarket?.positionMultipliers?.QB?.toFixed(2) || "1.00"} · WR
          market: x{tradeMarket?.positionMultipliers?.WR?.toFixed(2) || "1.00"}{" "}
          · RB market: x
          {tradeMarket?.positionMultipliers?.RB?.toFixed(2) || "1.00"} · TE
          market: x{tradeMarket?.positionMultipliers?.TE?.toFixed(2) || "1.00"}
        </div>
        {fantasyCalcSource?.enabled && (
          <div
            style={{
              fontSize: 11,
              color: "#c8cfe3",
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            Includes player market data from{" "}
            <a
              href={fantasyCalcSource.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#00f5a0", textDecoration: "none" }}
            >
              FantasyCalc
            </a>{" "}
            across {fantasyCalcSource.totalPlayers} players.
          </div>
        )}
      </div>

      <div
        className="dyn-grid-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={styles.card}>
          <div style={styles.sectionLabel}>Need Rooms</div>
          {weakRooms.length ? (
            weakRooms.map((pos) => (
              <div
                key={pos}
                style={{ fontSize: 12, color: "#d9deef", marginBottom: 8 }}
              >
                <span style={{ color: "#ff6b35" }}>▸ </span>
                {pos}
              </div>
            ))
          ) : (
            <div style={{ fontSize: 12, color: "#d1d7ea" }}>
              No urgent holes. Focus on insulation upgrades.
            </div>
          )}
        </div>

        <div style={styles.card}>
          <div style={styles.sectionLabel}>Move From Strength</div>
          {surplusPositions.length ? (
            surplusPositions.map((pos) => (
              <div
                key={pos}
                style={{ fontSize: 12, color: "#d9deef", marginBottom: 8 }}
              >
                <span style={{ color: "#00f5a0" }}>▸ </span>
                {pos}
              </div>
            ))
          ) : (
            <div style={{ fontSize: 12, color: "#d1d7ea" }}>
              Lean on picks and secondary pieces more than core starters.
            </div>
          )}
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.sectionLabel}>Best Trade Chips</div>
        {tradeBlock.length ? (
          tradeBlock.map((player) => (
            <div key={player.id} style={styles.playerRow}>
              <div>
                <div style={{ fontSize: 13, color: "#e8e8f0" }}>
                  {player.name}
                </div>
                <div style={{ fontSize: 11, color: "#d1d7ea" }}>
                  {player.position} · {player.age}yo · {player.archetype}
                </div>
              </div>
              <span
                style={styles.tag(
                  player.verdict === "buy" ? "#00f5a0" : "#ffd84d",
                )}
              >
                {player.score}
              </span>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: "#d1d7ea" }}>
            No obvious player chips. Use picks as the primary sweetener.
          </div>
        )}

        {!!picks.length && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontSize: 10,
                color: "#c8cfe3",
                marginBottom: 8,
                letterSpacing: 2,
              }}
            >
              FLEXIBLE PICKS
            </div>
            <div>
              {picks.slice(0, 6).map((pick) => (
                <PickChip
                  key={`${pick.season}-${pick.round}-${pick.fromTeam || "own"}`}
                  pick={pick}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{ ...styles.card, borderColor: "rgba(0,245,160,0.2)" }}>
        <div style={styles.sectionLabel}>Suggested Trade Paths</div>
        {tradeSuggestions.length ? (
          tradeSuggestions.map((suggestion, index) => (
            <div
              key={`${suggestion.partnerTeam}-${suggestion.targetPlayer.id}`}
              style={{
                padding: "16px 0",
                borderBottom:
                  index === tradeSuggestions.length - 1
                    ? "none"
                    : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  alignItems: "flex-start",
                  marginBottom: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, color: "#fff", marginBottom: 4 }}>
                    {suggestion.partnerTeam}
                  </div>
                  <div style={{ fontSize: 11, color: "#d1d7ea" }}>
                    Targeting {suggestion.targetPlayer.position} help ·{" "}
                    {suggestion.tier}
                  </div>
                </div>
                <span style={styles.tag("#00f5a0")}>
                  fit {Math.max(1, Math.round(suggestion.fitScore))}
                </span>
              </div>

              <div
                className="dyn-grid-2"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 2,
                      color: "#00f5a0",
                      marginBottom: 8,
                    }}
                  >
                    RECEIVE
                  </div>
                  {suggestion.receive.map((item) => (
                    <div
                      key={item.label}
                      style={{
                        fontSize: 12,
                        color: "#e8e8f0",
                        marginBottom: 6,
                      }}
                    >
                      ▸ {item.label}
                    </div>
                  ))}
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      letterSpacing: 2,
                      color: "#ffd84d",
                      marginBottom: 8,
                    }}
                  >
                    SEND
                  </div>
                  {suggestion.send.map((item) => (
                    <div
                      key={item}
                      style={{
                        fontSize: 12,
                        color: "#d9deef",
                        marginBottom: 6,
                      }}
                    >
                      ▸ {item}
                    </div>
                  ))}
                </div>
              </div>

              <div
                style={{
                  fontSize: 12,
                  color: "#d9deef",
                  marginTop: 12,
                  lineHeight: 1.7,
                }}
              >
                {suggestion.summary}
              </div>
              <div style={{ fontSize: 11, color: "#c8cfe3", marginTop: 8 }}>
                {suggestion.marketNote}
              </div>
              <div style={{ marginTop: 10 }}>
                {suggestion.rationale.map((line) => (
                  <div
                    key={line}
                    style={{ fontSize: 11, color: "#c8cfe3", marginBottom: 6 }}
                  >
                    <span style={{ color: "#00f5a0" }}>▸ </span>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div style={{ fontSize: 12, color: "#d1d7ea" }}>
            No clean trade matches found yet. This usually means your roster
            lacks easy surplus or the league is balanced.
          </div>
        )}
      </div>
    </div>
  );
}
