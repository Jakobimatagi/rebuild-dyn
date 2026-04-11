import { useState, useMemo, useCallback } from "react";
import { evaluateTrade } from "../../lib/tradeEngine";
import { estimatePickValue } from "../../lib/marketValue";
import { styles } from "../../styles";

// ---------------------------------------------------------------------------
// Trade Calculator component
// ---------------------------------------------------------------------------

function TradeCalculator({ leagueTeams, leagueContext, tradeMarket, teamPhase }) {
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [sideA, setSideA] = useState([]);
  const [sideB, setSideB] = useState([]);

  const playerMarketMap = useMemo(
    () =>
      new Map(
        (leagueTeams || []).flatMap((t) =>
          t.enriched.map((p) => [String(p.id), p]),
        ),
      ),
    [leagueTeams],
  );

  const teamA = useMemo(
    () => leagueTeams?.find((t) => String(t.rosterId) === teamAId),
    [leagueTeams, teamAId],
  );
  const teamB = useMemo(
    () => leagueTeams?.find((t) => String(t.rosterId) === teamBId),
    [leagueTeams, teamBId],
  );

  const addAsset = useCallback(
    (side, asset) => {
      const setter = side === "A" ? setSideA : setSideB;
      setter((prev) => {
        const key = asset.type === "pick" ? asset.label : asset.id;
        if (prev.some((a) => (a.type === "pick" ? a.label : a.id) === key))
          return prev;
        return [...prev, asset];
      });
    },
    [],
  );

  const removeAsset = useCallback((side, index) => {
    const setter = side === "A" ? setSideA : setSideB;
    setter((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const result = useMemo(() => {
    if (!sideA.length || !sideB.length) return null;
    return evaluateTrade(
      sideA,
      sideB,
      teamA?.teamPhase?.phase || teamPhase?.phase || "retool",
      teamB?.teamPhase?.phase || "retool",
      playerMarketMap,
      leagueContext,
      tradeMarket,
    );
  }, [sideA, sideB, teamA, teamB, teamPhase, playerMarketMap, leagueContext, tradeMarket]);

  if (!leagueTeams?.length) return null;

  const selectStyle = {
    background: "rgba(0,245,160,0.04)",
    border: "1px solid rgba(0,245,160,0.18)",
    color: "#e8e8f0",
    padding: "8px 12px",
    fontSize: 12,
    borderRadius: 3,
    width: "100%",
  };

  const chipStyle = (color = "#d9deef") => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 3,
    fontSize: 11,
    background: `${color}15`,
    color,
    border: `1px solid ${color}30`,
    marginRight: 6,
    marginBottom: 6,
  });

  const renderTeamSide = (label, team, side, assets) => (
    <div style={{ flex: 1 }}>
      <div
        style={{
          fontSize: 10,
          letterSpacing: 2,
          color: side === "A" ? "#ffd84d" : "#00f5a0",
          marginBottom: 8,
        }}
      >
        {label} SENDS
        {team?.teamPhase && (
          <span style={{ marginLeft: 8, opacity: 0.7, letterSpacing: 1 }}>
            ({team.teamPhase.phase})
          </span>
        )}
      </div>
      <select
        style={{ ...selectStyle, marginBottom: 8 }}
        value=""
        onChange={(e) => {
          if (!e.target.value) return;
          const [type, key] = e.target.value.split("|");
          if (type === "player") {
            const p = team.enriched.find((p) => String(p.id) === key);
            if (p) addAsset(side, { ...p, type: "player" });
          } else {
            const pick = team.picks.find((p) => p.label === key);
            if (pick)
              addAsset(side, {
                ...pick,
                type: "pick",
                value: estimatePickValue(pick, leagueContext, tradeMarket),
              });
          }
        }}
      >
        <option value="">+ Add player or pick...</option>
        <optgroup label="Players">
          {(team?.enriched || [])
            .sort((a, b) => b.score - a.score)
            .map((p) => (
              <option key={p.id} value={`player|${p.id}`}>
                {p.name} ({p.position}, {p.score})
              </option>
            ))}
        </optgroup>
        <optgroup label="Picks">
          {(team?.picks || [])
            .filter((p) => p.round <= 4)
            .map((p) => (
              <option key={p.label} value={`pick|${p.label}`}>
                {p.label}
              </option>
            ))}
        </optgroup>
      </select>

      <div style={{ minHeight: 32 }}>
        {assets.map((asset, i) => (
          <span
            key={asset.type === "pick" ? asset.label : asset.id}
            style={chipStyle(side === "A" ? "#ffd84d" : "#00f5a0")}
          >
            {asset.type === "pick" ? asset.label : `${asset.name} (${asset.position})`}
            <button
              type="button"
              onClick={() => removeAsset(side, i)}
              style={{
                background: "none",
                border: "none",
                color: "#ff6b35",
                fontSize: 12,
                padding: 0,
                cursor: "pointer",
                lineHeight: 1,
              }}
            >
              x
            </button>
          </span>
        ))}
      </div>
    </div>
  );

  const fairnessColor = {
    Fair: "#00f5a0",
    "Slight edge": "#ffd84d",
    Uneven: "#ff6b35",
    Lopsided: "#ff2d55",
  };

  return (
    <div style={{ ...styles.card, borderColor: "rgba(0,245,160,0.22)", marginBottom: 24 }}>
      <div style={styles.sectionLabel}>Trade Calculator</div>

      <div
        className="dyn-grid-2"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}
      >
        <div>
          <div style={{ fontSize: 10, color: "#c8cfe3", marginBottom: 4, letterSpacing: 1 }}>
            TEAM A
          </div>
          <select
            style={selectStyle}
            value={teamAId}
            onChange={(e) => {
              setTeamAId(e.target.value);
              setSideA([]);
            }}
          >
            <option value="">Select team...</option>
            {leagueTeams.map((t) => (
              <option key={t.rosterId} value={String(t.rosterId)}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#c8cfe3", marginBottom: 4, letterSpacing: 1 }}>
            TEAM B
          </div>
          <select
            style={selectStyle}
            value={teamBId}
            onChange={(e) => {
              setTeamBId(e.target.value);
              setSideB([]);
            }}
          >
            <option value="">Select team...</option>
            {leagueTeams
              .filter((t) => String(t.rosterId) !== teamAId)
              .map((t) => (
                <option key={t.rosterId} value={String(t.rosterId)}>
                  {t.label}
                </option>
              ))}
          </select>
        </div>
      </div>

      {teamA && teamB && (
        <div
          className="dyn-grid-2"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}
        >
          {renderTeamSide(teamA.label, teamA, "A", sideA)}
          {renderTeamSide(teamB.label, teamB, "B", sideB)}
        </div>
      )}

      {result && (
        <div
          style={{
            background: "rgba(0,245,160,0.04)",
            border: "1px solid rgba(0,245,160,0.15)",
            borderRadius: 4,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>
              Verdict
            </div>
            <span style={styles.tag(fairnessColor[result.fairnessLabel] || "#d9deef")}>
              {result.fairnessLabel}
            </span>
          </div>

          <div
            className="dyn-grid-2"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
          >
            <div>
              <div style={{ fontSize: 11, color: "#ffd84d", marginBottom: 4 }}>
                {teamA.label} sends {result.sideAValue} pts
              </div>
              <div style={{ fontSize: 11, color: "#d9deef" }}>
                Net value (phase-adjusted):{" "}
                <span style={{ color: result.teamA.netValue >= 0 ? "#00f5a0" : "#ff6b35" }}>
                  {result.teamA.netValue >= 0 ? "+" : ""}
                  {result.teamA.netValue}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 4 }}>
                Phase bonus: {result.teamA.phaseAdj >= 0 ? "+" : ""}{result.teamA.phaseAdj} ({teamA.teamPhase?.phase})
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#00f5a0", marginBottom: 4 }}>
                {teamB.label} sends {result.sideBValue} pts
              </div>
              <div style={{ fontSize: 11, color: "#d9deef" }}>
                Net value (phase-adjusted):{" "}
                <span style={{ color: result.teamB.netValue >= 0 ? "#00f5a0" : "#ff6b35" }}>
                  {result.teamB.netValue >= 0 ? "+" : ""}
                  {result.teamB.netValue}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 4 }}>
                Phase bonus: {result.teamB.phaseAdj >= 0 ? "+" : ""}{result.teamB.phaseAdj} ({teamB.teamPhase?.phase})
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

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
  leagueTeams,
  teamPhase,
}) {
  return (
    <div>
      <TradeCalculator
        leagueTeams={leagueTeams}
        leagueContext={leagueContext}
        tradeMarket={tradeMarket}
        teamPhase={teamPhase}
      />
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
