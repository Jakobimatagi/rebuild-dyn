import { useState } from "react";
import { POSITION_PRIORITY } from "../../constants";
import { getColor, rankLabel } from "../../lib/analysis";
import { styles } from "../../styles";

const VERDICT_COLOR = {
  buy: "#00f5a0",
  hold: "#ffd84d",
  sell: "#ff6b35",
  cut: "#ff2d55",
};

function PositionGrades({ posRanks }) {
  return (
    <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
      {POSITION_PRIORITY.map((pos) => {
        const r = posRanks?.[pos];
        const color = r?.color || "#4a5068";
        return (
          <div
            key={pos}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              background: `${color}12`,
              border: `1px solid ${color}30`,
              borderRadius: 3,
              padding: "3px 7px",
              minWidth: 34,
            }}
          >
            <span style={{ fontSize: 8, letterSpacing: 1.5, color: "#9ca3b8", textTransform: "uppercase" }}>
              {pos}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color, lineHeight: 1.2 }}>
              {r ? rankLabel(r.rank) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function TeamRoster({ byPos }) {
  return (
    <div style={{ marginTop: 16 }}>
      {POSITION_PRIORITY.map((pos) => {
        const players = byPos[pos] || [];
        if (!players.length) return null;
        return (
          <div key={pos} style={{ marginBottom: 14 }}>
            <div style={{ ...styles.sectionLabel, marginBottom: 8 }}>{pos}</div>
            {players.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: VERDICT_COLOR[p.verdict] || "#555",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 13, color: "#e8e8f0" }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: "#6b7390" }}>
                    {p.age}yo
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      fontSize: 10,
                      color: "#7a819c",
                      letterSpacing: 0.5,
                    }}
                  >
                    {p.archetype}
                  </span>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: getColor(p.verdict),
                      minWidth: 24,
                      textAlign: "right",
                    }}
                  >
                    {p.score}
                  </span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function TeamPicks({ picks, numTeams }) {
  if (!picks || picks.length === 0) return null;
  const currentYear = String(new Date().getFullYear());
  const byYear = {};
  for (const pick of picks) {
    const yr = pick.season || "?";
    (byYear[yr] = byYear[yr] || []).push(pick);
  }
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ ...styles.sectionLabel, marginBottom: 8 }}>Draft Capital</div>
      {Object.keys(byYear).sort().map((year) => (
        <div key={year} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: "#00f5a0", letterSpacing: 2, marginBottom: 6 }}>{year}</div>
          {year > currentYear && (
            <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 4, fontStyle: "italic" }}>
              Projected
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {byYear[year].map((pick, i) => {
              const label = pick.round === 1 ? "1st" : pick.round === 2 ? "2nd" : pick.round === 3 ? "3rd" : `${pick.round}th`;
              const color = pick.round === 1 ? "#00f5a0" : pick.round === 2 ? "#ffd84d" : "#d9deef";
              return (
                <div
                  key={i}
                  style={{
                    padding: "4px 10px",
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
                  {pick.slotLabel ? (
                    <span style={{ fontWeight: 600 }}>{pick.slotLabel}</span>
                  ) : (
                    <span>{label} Rd</span>
                  )}
                  {!pick.isOwn && (
                    <span style={{ color: "#d1d7ea", fontSize: 9 }}>
                      via {pick.fromTeam || "trade"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const phaseColor = (phase) =>
  phase === "contender"
    ? "#00f5a0"
    : phase === "retool"
      ? "#ffd84d"
      : "#ff6b35";

function teamInitials(label) {
  if (!label) return "?";
  const words = String(label).trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return String(label).slice(0, 3).toUpperCase();
}

function TeamPhaseChart({ teams, myTeamLabel, expandedTeam, onPickTeam }) {
  const points = teams
    .map((t) => {
      const x = typeof t.avgScore === "string" ? parseFloat(t.avgScore) : t.avgScore || 0;
      const y = t.teamPhase?.starterPPG || 0;
      return { team: t, x, y };
    })
    .filter((p) => p.x > 0 && p.y > 0);

  if (points.length < 2) return null;

  const W = 720;
  const H = 320;
  const padL = 56;
  const padR = 16;
  const padT = 24;
  const padB = 36;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.1 || 1;
  const yPad = (yMax - yMin) * 0.1 || 1;
  const x0 = xMin - xPad;
  const x1 = xMax + xPad;
  const y0 = yMin - yPad;
  const y1 = yMax + yPad;

  const sx = (v) => padL + ((v - x0) / (x1 - x0)) * innerW;
  const sy = (v) => padT + (1 - (v - y0) / (y1 - y0)) * innerH;

  const median = (arr) => {
    const s = [...arr].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const xMid = median(xs);
  const yMid = median(ys);

  // Resolve overlapping dots: nudge each pair apart until they clear.
  // Original true position is preserved on hover via the line connector.
  const dotR = 11;
  const minDist = dotR * 2 + 3;
  const placed = points.map((p) => ({ ...p, cx: sx(p.x), cy: sy(p.y), ox: sx(p.x), oy: sy(p.y) }));
  for (let iter = 0; iter < 40; iter++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        let dx = b.cx - a.cx;
        let dy = b.cy - a.cy;
        let d = Math.hypot(dx, dy);
        if (d < minDist) {
          if (d === 0) {
            const angle = ((i + 1) * 2.39996) % (2 * Math.PI);
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            d = 1;
          }
          const push = (minDist - d) / 2;
          const ux = dx / d;
          const uy = dy / d;
          a.cx -= ux * push;
          a.cy -= uy * push;
          b.cx += ux * push;
          b.cy += uy * push;
          moved = true;
        }
      }
    }
    // Clamp inside plot area
    for (const p of placed) {
      p.cx = Math.min(padL + innerW - dotR, Math.max(padL + dotR, p.cx));
      p.cy = Math.min(padT + innerH - dotR, Math.max(padT + dotR, p.cy));
    }
    if (!moved) break;
  }

  const niceTicks = (lo, hi, count = 4) => {
    const range = hi - lo;
    const rough = range / count;
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const candidates = [1, 2, 2.5, 5, 10].map((m) => m * pow);
    const step = candidates.find((c) => range / c <= count + 1) || pow;
    const start = Math.ceil(lo / step) * step;
    const ticks = [];
    for (let v = start; v <= hi; v += step) ticks.push(Number(v.toFixed(6)));
    return ticks;
  };
  const xTicks = niceTicks(x0, x1, 4);
  const yTicks = niceTicks(y0, y1, 4);

  return (
    <div
      style={{
        ...styles.card,
        padding: "14px 16px 8px",
        marginBottom: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <div style={styles.sectionLabel}>Team Phase Map</div>
        <div style={{ display: "flex", gap: 12, fontSize: 9, color: "#9ca3b8", letterSpacing: 1 }}>
          {[
            ["contender", "Contender"],
            ["retool", "Retool"],
            ["rebuild", "Rebuild"],
          ].map(([p, label]) => (
            <span key={p} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: phaseColor(p),
                  display: "inline-block",
                }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        <rect
          x={padL}
          y={padT}
          width={innerW}
          height={innerH}
          fill="rgba(255,255,255,0.02)"
          stroke="rgba(255,255,255,0.08)"
        />
        {xTicks.map((t) => (
          <g key={`xt-${t}`}>
            <line
              x1={sx(t)}
              x2={sx(t)}
              y1={padT}
              y2={padT + innerH}
              stroke="rgba(255,255,255,0.04)"
            />
            <text
              x={sx(t)}
              y={padT + innerH + 14}
              fontSize="10"
              fill="#6b7390"
              textAnchor="middle"
            >
              {t}
            </text>
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={`yt-${t}`}>
            <line
              x1={padL}
              x2={padL + innerW}
              y1={sy(t)}
              y2={sy(t)}
              stroke="rgba(255,255,255,0.04)"
            />
            <text x={padL - 8} y={sy(t) + 3} fontSize="10" fill="#6b7390" textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        <line
          x1={sx(xMid)}
          x2={sx(xMid)}
          y1={padT}
          y2={padT + innerH}
          stroke="rgba(255,255,255,0.18)"
          strokeDasharray="4 4"
        />
        <line
          x1={padL}
          x2={padL + innerW}
          y1={sy(yMid)}
          y2={sy(yMid)}
          stroke="rgba(255,255,255,0.18)"
          strokeDasharray="4 4"
        />

        <text x={padL + 6} y={padT + 14} fontSize="10" fill="#7a819c" letterSpacing="1.5">
          WIN-NOW
        </text>
        <text
          x={padL + innerW - 6}
          y={padT + 14}
          fontSize="10"
          fill="#7a819c"
          letterSpacing="1.5"
          textAnchor="end"
        >
          ELITE
        </text>
        <text x={padL + 6} y={padT + innerH - 6} fontSize="10" fill="#7a819c" letterSpacing="1.5">
          BOTTOM
        </text>
        <text
          x={padL + innerW - 6}
          y={padT + innerH - 6}
          fontSize="10"
          fill="#7a819c"
          letterSpacing="1.5"
          textAnchor="end"
        >
          REBUILDING
        </text>

        <text
          x={padL + innerW / 2}
          y={H - 6}
          fontSize="10"
          fill="#9ca3b8"
          textAnchor="middle"
          letterSpacing="1"
        >
          Dynasty Value (avg roster score) →
        </text>
        <text
          x={14}
          y={padT + innerH / 2}
          fontSize="10"
          fill="#9ca3b8"
          textAnchor="middle"
          letterSpacing="1"
          transform={`rotate(-90 14 ${padT + innerH / 2})`}
        >
          Win-Now (starter PPG) →
        </text>

        {placed.map(({ team, x, y, cx, cy, ox, oy }) => {
          const isMe = team.label === myTeamLabel;
          const isExpanded = expandedTeam === team.rosterId;
          const color = phaseColor(team.teamPhase?.phase);
          const wasNudged = Math.hypot(cx - ox, cy - oy) > 0.5;
          return (
            <g
              key={team.rosterId}
              style={{ cursor: "pointer" }}
              onClick={() => onPickTeam(team.rosterId)}
            >
              <title>
                {`${team.label} — ${team.teamPhase?.phase || "?"} | starter PPG ${y.toFixed(1)} | dynasty ${x.toFixed(1)}`}
              </title>
              {wasNudged && (
                <>
                  <line
                    x1={ox}
                    y1={oy}
                    x2={cx}
                    y2={cy}
                    stroke={color}
                    strokeWidth="1"
                    opacity="0.45"
                  />
                  <circle cx={ox} cy={oy} r={1.5} fill={color} opacity="0.6" />
                </>
              )}
              {(isMe || isExpanded) && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={dotR + 4}
                  fill="none"
                  stroke={isMe ? "#00f5a0" : "#ffffff"}
                  strokeWidth={isMe ? 1.75 : 1}
                  opacity={0.8}
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={dotR}
                fill={color}
                stroke="rgba(0,0,0,0.55)"
                strokeWidth="1"
              />
              <text
                x={cx}
                y={cy + 3}
                fontSize="9"
                fill="#0b1020"
                textAnchor="middle"
                fontWeight={700}
                style={{ pointerEvents: "none" }}
              >
                {teamInitials(team.label)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function LeagueTab({ leagueTeams, myTeamLabel, isSuperflex }) {
  const [expandedTeam, setExpandedTeam] = useState(null);

  const sorted = [...leagueTeams].sort(
    (a, b) => (b.teamPhase?.score || 0) - (a.teamPhase?.score || 0),
  );

  return (
    <div>
      <TeamPhaseChart
        teams={leagueTeams}
        myTeamLabel={myTeamLabel}
        expandedTeam={expandedTeam}
        onPickTeam={(rid) => {
          setExpandedTeam(rid);
          requestAnimationFrame(() => {
            const el = document.getElementById(`league-team-row-${rid}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          });
        }}
      />
      <div style={styles.sectionLabel}>League Teams — {leagueTeams.length} Rosters</div>
      {sorted.map((team, i) => {
        const isMe = team.label === myTeamLabel;
        const isExpanded = expandedTeam === team.rosterId;
        const rank = i + 1;

        return (
          <div
            key={team.rosterId}
            id={`league-team-row-${team.rosterId}`}
            style={{
              ...styles.card,
              borderColor: isMe
                ? "rgba(0,245,160,0.35)"
                : "rgba(255,255,255,0.1)",
              padding: "8px 14px",
              marginBottom: 5,
              scrollMarginTop: 80,
            }}
          >
            <button
              onClick={() => setExpandedTeam(isExpanded ? null : team.rosterId)}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
                textAlign: "left",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span
                    style={{
                      fontSize: 11,
                      color: isMe ? "#00f5a0" : "#4a5068",
                      fontWeight: 700,
                      minWidth: 20,
                    }}
                  >
                    #{rank}
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isMe ? "#00f5a0" : "#e8e8f0",
                    }}
                  >
                    {team.label}
                    {isMe && (
                      <span
                        style={{
                          fontSize: 9,
                          letterSpacing: 1.5,
                          color: "#00f5a0",
                          marginLeft: 8,
                          opacity: 0.7,
                        }}
                      >
                        YOU
                      </span>
                    )}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <PositionGrades posRanks={team.posRanks} />
                  <div style={{ textAlign: "right", flexShrink: 0, minWidth: 38 }}>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: "#e8e8f0",
                        lineHeight: 1,
                      }}
                    >
                      {team.avgScore}
                    </div>
                    <div style={{ fontSize: 8, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
                      avg
                    </div>
                  </div>
                  <span style={{ fontSize: 12, color: "#4a5068" }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 4,
                  fontSize: 10,
                  color: "#6b7390",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {team.teamPhase && (
                  <span
                    style={{
                      ...styles.tag(phaseColor(team.teamPhase.phase)),
                      fontSize: 8,
                      padding: "1px 6px",
                    }}
                  >
                    {team.teamPhase.phase}
                  </span>
                )}
                {(team.wins > 0 || team.losses > 0) && (
                  <span>{team.wins}-{team.losses}{team.ties ? `-${team.ties}` : ""}</span>
                )}
                {team.pointsFor > 0 && (
                  <span>PF {team.pointsFor.toFixed(1)}</span>
                )}
                {team.teamPhase?.starterPPG > 0 && (
                  <span>PPG {team.teamPhase.starterPPG}</span>
                )}
                <span>Age {team.avgAge}</span>
                <span>{team.picks?.length ?? 0} picks</span>
              </div>
            </button>

            {isExpanded && (
              <>
                <TeamRoster byPos={team.byPos} />
                <TeamPicks picks={team.picks} numTeams={leagueTeams.length} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
