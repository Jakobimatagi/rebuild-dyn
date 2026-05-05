import { useState } from "react";
import { styles } from "../../styles";
import {
  formatPickValue,
  getPickValue,
  pickSlotLabel,
} from "../../lib/marketValue";
import TeamRecapModal from "./TeamRecapModal";

const POS_COLOR = {
  QB: "#ff6b6b",
  RB: "#00f5a0",
  WR: "#ffd84d",
  TE: "#4dd0ff",
  K: "#94a3b8",
  DEF: "#94a3b8",
};

const GRADE_COLOR = {
  A: "#00f5a0",
  B: "#7ee0b3",
  C: "#ffd84d",
  D: "#ff9f4d",
  F: "#ff6b6b",
};

function formatDelta(d) {
  const v = Math.round(d);
  if (v > 0) return `+${formatPickValue(v)}`;
  if (v < 0) return `−${formatPickValue(Math.abs(v))}`;
  return "0";
}

function deltaColor(d) {
  if (d > 100) return "#00f5a0";
  if (d > 0) return "#7ee0b3";
  if (d < -100) return "#ff6b6b";
  if (d < 0) return "#ff9f4d";
  return "#94a3b8";
}

export default function DraftRecapTab({
  draftRecap,
  allDraftRecaps = [],
  myRosterId,
  picksByYear,
  picks,
  leagueContext,
  tradeMarket,
  leagueTeams,
  raPickValues,
}) {
  const [activeRosterId, setActiveRosterId] = useState(null);

  // Use allDraftRecaps when available; fall back to single draftRecap for compat.
  const recaps = allDraftRecaps.length > 0 ? allDraftRecaps : (draftRecap ? [draftRecap] : []);
  const [activeSeason, setActiveSeason] = useState(() => recaps[0]?.season ?? null);

  // Recompute when recaps list changes (e.g. on league switch)
  const recap = recaps.find((r) => r.season === activeSeason) ?? recaps[0] ?? null;

  // Seasons that already have a completed draft — hide those from FuturePicks
  const draftedSeasons = new Set(recaps.map((r) => String(r.season)));

  if (!recap) {
    return (
      <div style={{ ...styles.card, color: "#d1d7ea", fontSize: 13 }}>
        No recently completed draft found for this league.
      </div>
    );
  }

  const { season, board, teams, topSteals, topReaches } = recap;
  const startDate = recap.startTime
    ? new Date(recap.startTime).toLocaleDateString()
    : "";
  const activeTeam =
    activeRosterId != null
      ? teams.find((t) => t.rosterId === activeRosterId)
      : null;

  return (
    <div>
      {activeTeam && (
        <TeamRecapModal
          team={activeTeam}
          totalTeams={teams.length}
          onClose={() => setActiveRosterId(null)}
        />
      )}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
          <div style={styles.sectionLabel}>
            {season} Rookie Draft Recap
          </div>
          {recaps.length > 1 && (
            <div style={{ display: "flex", gap: 6 }}>
              {recaps.map((r) => {
                const active = r.season === season;
                return (
                  <button
                    key={r.season}
                    type="button"
                    onClick={() => {
                      setActiveSeason(r.season);
                      setActiveRosterId(null);
                    }}
                    style={{
                      padding: "3px 10px",
                      borderRadius: 3,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 1,
                      border: "1px solid",
                      cursor: "pointer",
                      background: active ? "rgba(0,245,160,0.15)" : "rgba(255,255,255,0.06)",
                      color: active ? "#00f5a0" : "#7a819c",
                      borderColor: active ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.1)",
                    }}
                  >
                    {r.season}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {startDate && (
          <div style={{ fontSize: 10, color: "#94a3b8", letterSpacing: 1, marginTop: 4 }}>
            {startDate} · {recap.picks.length} picks
          </div>
        )}
      </div>

      {/* Your future picks — hide years where a draft already happened */}
      <FuturePicks
        picksByYear={picksByYear}
        picks={picks}
        leagueContext={leagueContext}
        tradeMarket={tradeMarket}
        leagueTeams={leagueTeams}
        myRosterId={myRosterId}
        raPickValues={raPickValues}
        draftedSeasons={draftedSeasons}
      />

      {/* Team grades */}
      <div style={{ ...styles.card, marginBottom: 24 }}>
        <div style={{ ...styles.sectionLabel, marginBottom: 12 }}>
          Team Grades
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {teams.map((t) => {
            const isMe = t.rosterId === myRosterId;
            return (
              <button
                key={t.rosterId}
                type="button"
                onClick={() => setActiveRosterId(t.rosterId)}
                aria-label={`Open recap for ${t.label}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 32px 1fr auto auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "8px 10px",
                  background: isMe
                    ? "rgba(0,245,160,0.06)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${
                    isMe ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.06)"
                  }`,
                  borderRadius: 2,
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                  color: "inherit",
                  width: "100%",
                }}
              >
                <span style={{ fontSize: 11, color: "#94a3b8" }}>
                  #{t.rank}
                </span>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: GRADE_COLOR[t.grade] || "#d9deef",
                    textAlign: "center",
                  }}
                >
                  {t.grade}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: isMe ? "#00f5a0" : "#e8e8f0",
                    fontWeight: isMe ? 600 : 400,
                  }}
                >
                  {t.label}
                  {isMe && (
                    <span
                      style={{
                        fontSize: 9,
                        color: "#00f5a0",
                        marginLeft: 6,
                        letterSpacing: 1,
                      }}
                    >
                      YOU
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>
                  {t.picks.length} pick{t.picks.length !== 1 ? "s" : ""}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: deltaColor(t.totalDelta),
                    minWidth: 56,
                    textAlign: "right",
                  }}
                >
                  {formatDelta(t.totalDelta)}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 10 }}>
          Click any team to see their pick-by-pick breakdown. Grade is based
          on gain/loss per pick (player value − slot value) using absolute
          thresholds: A ≥ +300/pick · B ≥ +50 · C ≥ −150 · D ≥ −400 · F &lt; −400.
          Teams are sorted by total gain/loss.
        </div>
      </div>

      {/* Highlights */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={{ ...styles.card }}>
          <div style={{ ...styles.sectionLabel, marginBottom: 10 }}>
            Top Steals
          </div>
          {topSteals.length === 0 && (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>—</div>
          )}
          {topSteals.map((p, i) => (
            <PickRow key={`steal-${i}`} pick={p} />
          ))}
        </div>
        <div style={{ ...styles.card }}>
          <div style={{ ...styles.sectionLabel, marginBottom: 10 }}>
            Top Reaches
          </div>
          {topReaches.length === 0 && (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>—</div>
          )}
          {topReaches.map((p, i) => (
            <PickRow key={`reach-${i}`} pick={p} />
          ))}
        </div>
      </div>

      {/* Board */}
      <div style={{ ...styles.card, padding: 12 }}>
        <div style={{ ...styles.sectionLabel, marginBottom: 10 }}>
          Draft Board
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `28px repeat(${recap.slots}, minmax(0, 1fr))`,
            gap: 3,
          }}
        >
          <div />
          {Array.from({ length: recap.slots }, (_, i) => (
            <div
              key={`hdr-${i}`}
              style={{
                fontSize: 8,
                color: "#94a3b8",
                textAlign: "center",
                letterSpacing: 0.5,
                padding: "2px 0",
              }}
            >
              {i + 1}
            </div>
          ))}

          {board.map((row, rIdx) => (
            <RoundRow
              key={`row-${rIdx}`}
              round={rIdx + 1}
              row={row}
              myRosterId={myRosterId}
              onPickTeamClick={setActiveRosterId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RoundRow({ round, row, myRosterId, onPickTeamClick }) {
  return (
    <>
      <div
        style={{
          fontSize: 10,
          color: "#00f5a0",
          letterSpacing: 1,
          alignSelf: "center",
          textAlign: "center",
        }}
      >
        R{round}
      </div>
      {row.map((cell, sIdx) => (
        <BoardCell
          key={`cell-${round}-${sIdx}`}
          pick={cell}
          myRosterId={myRosterId}
          onClick={onPickTeamClick}
        />
      ))}
    </>
  );
}

function BoardCell({ pick, myRosterId, onClick }) {
  if (!pick) {
    return (
      <div
        style={{
          padding: 4,
          minHeight: 56,
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.04)",
          borderRadius: 2,
        }}
      />
    );
  }
  const isMe = pick.rosterId === myRosterId;
  const posColor = POS_COLOR[pick.position] || "#d9deef";
  const lastName =
    pick.playerName.split(" ").slice(-1)[0] || pick.playerName;
  return (
    <button
      type="button"
      onClick={() => onClick && onClick(pick.rosterId)}
      title={`${pick.playerName} · ${pick.position}${pick.team ? " " + pick.team : ""} · ${pick.ownerLabel} · ${formatDelta(pick.delta)} — click for team recap`}
      style={{
        padding: 4,
        minHeight: 56,
        background: isMe ? "rgba(0,245,160,0.06)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${
          isMe ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.06)"
        }`,
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1,
        overflow: "hidden",
        cursor: "pointer",
        textAlign: "left",
        font: "inherit",
        color: "inherit",
      }}
    >
      <div
        style={{
          fontSize: 8,
          color: "#94a3b8",
          display: "flex",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <span>{pick.pickNo}</span>
        {pick.delta !== 0 && (
          <span
            style={{
              color: deltaColor(pick.delta),
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            {formatDelta(pick.delta)}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#e8e8f0",
          lineHeight: 1.15,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {lastName}
      </div>
      <div
        style={{
          fontSize: 8,
          color: posColor,
          fontWeight: 600,
        }}
      >
        {pick.position}
        {pick.team && (
          <span style={{ color: "#94a3b8", marginLeft: 4 }}>{pick.team}</span>
        )}
      </div>
      <div
        style={{
          fontSize: 8,
          color: "#94a3b8",
          marginTop: "auto",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {pick.ownerLabel}
      </div>
    </button>
  );
}

function PickRow({ pick }) {
  const posColor = POS_COLOR[pick.position] || "#d9deef";
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 8,
        padding: "6px 0",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 10, color: "#94a3b8" }}>
        {pick.round}.{String(pick.slot).padStart(2, "0")}
      </span>
      <span style={{ fontSize: 12, color: "#e8e8f0" }}>
        <span style={{ color: posColor, fontWeight: 600, marginRight: 6 }}>
          {pick.position}
        </span>
        {pick.playerName}
        <span
          style={{
            color: "#94a3b8",
            fontSize: 10,
            marginLeft: 6,
          }}
        >
          · {pick.ownerLabel}
        </span>
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: deltaColor(pick.delta),
        }}
      >
        {formatDelta(pick.delta)}
      </span>
    </div>
  );
}

function FuturePicks({
  picksByYear,
  picks,
  leagueContext,
  tradeMarket,
  leagueTeams,
  myRosterId,
  raPickValues,
  draftedSeasons = new Set(),
}) {
  if (!picks || picks.length === 0 || !picksByYear) return null;

  // Only show years that haven't had a completed draft yet
  const futureYears = Object.keys(picksByYear)
    .sort()
    .filter((yr) => !draftedSeasons.has(String(yr)));

  if (futureYears.length === 0) return null;

  const phaseByRosterId = new Map(
    (leagueTeams || []).map((t) => [
      t.rosterId,
      t.teamPhase?.phase || "retool",
    ]),
  );
  const myPhase = phaseByRosterId.get(myRosterId) || "retool";
  const hasRA = raPickValues && Object.keys(raPickValues).length > 0;

  return (
    <div style={{ ...styles.card, marginBottom: 24 }}>
      <div style={{ ...styles.sectionLabel, marginBottom: 10 }}>
        Your Future Picks
      </div>
      {futureYears.map((year) => (
          <div key={year} style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 11,
                color: "#00f5a0",
                letterSpacing: 2,
                marginBottom: 6,
              }}
            >
              {year}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                const ownerPhase = pick.isOwn
                  ? myPhase
                  : phaseByRosterId.get(pick.originalRosterId) || "retool";
                const posLabel = pickSlotLabel(pick.round, ownerPhase);
                const pickVal = getPickValue(
                  pick,
                  ownerPhase,
                  raPickValues,
                  leagueContext,
                  tradeMarket,
                );

                return (
                  <div
                    key={index}
                    style={{
                      padding: "6px 12px",
                      background: `${color}11`,
                      border: `1px solid ${color}44`,
                      borderRadius: 2,
                      fontSize: 11,
                      color,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span>
                      {posLabel && (
                        <span
                          style={{
                            fontSize: 8,
                            textTransform: "uppercase",
                            letterSpacing: 1,
                            opacity: 0.8,
                            marginRight: 4,
                          }}
                        >
                          {posLabel}
                        </span>
                      )}
                      {label}
                      {!pick.isOwn && (
                        <span
                          style={{
                            color: "#d1d7ea",
                            marginLeft: 4,
                            fontSize: 9,
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
                          color:
                            pickVal.source === "ra" ? "#00f5a0" : "#94a3b8",
                          borderLeft: "1px solid rgba(255,255,255,0.1)",
                          paddingLeft: 6,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {pickVal.source === "ra" ? "" : "~"}
                        {formatPickValue(pickVal.value)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      {!hasRA && (
        <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 4 }}>
          Values are estimates (~). RosterAudit pick values will appear when
          available.
        </div>
      )}
    </div>
  );
}
