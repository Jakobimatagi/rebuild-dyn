import { useState } from "react";
import { styles } from "../../styles";
import { scoreToGrade } from "../../lib/activityEngine";

function ScoreBar({ score, color }) {
  return (
    <div
      style={{
        height: 4,
        background: "rgba(255,255,255,0.08)",
        borderRadius: 2,
        overflow: "hidden",
        margin: "8px 0",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${score}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.4s ease",
        }}
      />
    </div>
  );
}

function GradeBadge({ grade, color, size = "md" }) {
  const fontSize = size === "lg" ? 48 : size === "sm" ? 14 : 20;
  const padding = size === "lg" ? "12px 28px" : size === "sm" ? "3px 9px" : "6px 14px";
  return (
    <div
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        background: `${color}14`,
        border: `1px solid ${color}35`,
        borderRadius: 4,
        padding,
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize, fontWeight: 800, color, lineHeight: 1 }}>{grade}</span>
    </div>
  );
}

function ComponentCard({ component }) {
  const grade = scoreToGrade(component.score);
  return (
    <div
      style={{
        ...styles.card,
        borderColor: `${grade.color}28`,
        padding: "14px 16px",
        marginBottom: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: 2,
              color: "#9ca3b8",
              textTransform: "uppercase",
              marginBottom: 4,
            }}
          >
            {component.label}
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: grade.color,
              lineHeight: 1,
            }}
          >
            {component.score}
          </div>
          <ScoreBar score={component.score} color={grade.color} />
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <GradeBadge grade={grade.grade} color={grade.color} size="sm" />
          <div style={{ fontSize: 9, color: "#6b7390", marginTop: 4 }}>
            {Math.round(component.weight * 100)}% weight
          </div>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#00f5a0", opacity: 0.8, marginTop: 2 }}>
        {component.statLine}
      </div>
      <div style={{ fontSize: 11, color: "#6b7390", marginTop: 4, lineHeight: 1.4 }}>
        {component.description}
      </div>
    </div>
  );
}

// League-wide trade matrix: every team on both axes, each cell = number of
// trades between that pair. Rows are ordered by total trade volume so the
// league's biggest market movers sit at the top.
function LeagueTradeMatrix({ teams, myTeamLabel }) {
  if (!teams || teams.length === 0) return null;

  // Order teams by total trade involvement (most active first).
  const ordered = [...teams].sort((a, b) => b.tradeCount - a.tradeCount);

  // Pairwise trade counts, pulled from each team's partner breakdown.
  const countMap = {};
  let max = 1;
  for (const t of teams) {
    for (const p of t.tradePartners || []) {
      countMap[`${t.rosterId}-${p.rosterId}`] = p.count;
      if (p.count > max) max = p.count;
    }
  }
  const get = (a, b) => countMap[`${a}-${b}`] || 0;

  const CELL = 42;
  const LABEL = 184;
  const TOTAL = 56;
  // Header holds full team names rotated vertically — size it to the longest name.
  const maxLabelLen = ordered.reduce(
    (m, t) => Math.max(m, String(t.label || "").length),
    0
  );
  const HEADER_H = Math.min(220, Math.max(96, maxLabelLen * 7 + 28));

  const cellBase = {
    width: CELL,
    minWidth: CELL,
    height: CELL,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 13,
    flexShrink: 0,
    borderRight: "1px solid rgba(255,255,255,0.05)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  };

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Color legend */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 12,
          fontSize: 10,
          color: "#7a819c",
        }}
      >
        <span style={{ letterSpacing: 1, textTransform: "uppercase" }}>Fewer trades</span>
        {[0.18, 0.4, 0.62, 0.84, 1].map((t) => (
          <span
            key={t}
            style={{
              width: 22,
              height: 14,
              borderRadius: 2,
              background: hexA("#c084fc", t),
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          />
        ))}
        <span style={{ letterSpacing: 1, textTransform: "uppercase" }}>More</span>
        <span style={{ marginLeft: 14, color: "#00f5a0", letterSpacing: 1, textTransform: "uppercase" }}>
          \u25a0 Your team
        </span>
      </div>

      <div style={{ overflowX: "auto", paddingBottom: 4 }}>
        <div
          style={{
            display: "inline-block",
            minWidth: "100%",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {/* Header row: corner + team abbreviation for each column */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.03)" }}>
            <div
              style={{
                width: LABEL,
                minWidth: LABEL,
                height: HEADER_H,
                flexShrink: 0,
                display: "flex",
                alignItems: "flex-end",
                padding: "0 8px 6px 10px",
                fontSize: 9,
                letterSpacing: 1.5,
                color: "#4a5068",
                textTransform: "uppercase",
                borderBottom: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              Team
            </div>
            {ordered.map((t) => {
              const isMe = t.label === myTeamLabel;
              return (
                <div
                  key={t.rosterId}
                  title={t.label}
                  style={{
                    ...cellBase,
                    height: HEADER_H,
                    alignItems: "flex-end",
                    padding: "8px 0 6px",
                    background: isMe ? "rgba(0,245,160,0.08)" : "transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.12)",
                  }}
                >
                  <span
                    style={{
                      writingMode: "vertical-rl",
                      transform: "rotate(180deg)",
                      whiteSpace: "nowrap",
                      maxHeight: HEADER_H - 18,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontSize: 11,
                      fontWeight: isMe ? 800 : 600,
                      color: isMe ? "#00f5a0" : "#c3c9dd",
                      lineHeight: 1,
                    }}
                  >
                    {t.label}
                  </span>
                </div>
              );
            })}
            <div
              style={{
                width: TOTAL,
                minWidth: TOTAL,
                height: HEADER_H,
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                paddingBottom: 6,
                fontSize: 9,
                letterSpacing: 1,
                color: "#4a5068",
                textTransform: "uppercase",
                flexShrink: 0,
                borderBottom: "1px solid rgba(255,255,255,0.12)",
              }}
            >
              Total
            </div>
          </div>

          {/* One row per team */}
          {ordered.map((rowTeam, i) => {
            const rowIsMe = rowTeam.label === myTeamLabel;
            // Zebra striping for easier horizontal tracking; my team gets a green tint.
            const rowBg = rowIsMe
              ? "rgba(0,245,160,0.07)"
              : i % 2 === 1
              ? "rgba(255,255,255,0.018)"
              : "transparent";
            return (
              <div key={rowTeam.rosterId} style={{ display: "flex", background: rowBg }}>
                {/* Row label: "n. Team Name" + abbreviation tag */}
                <div
                  style={{
                    width: LABEL,
                    minWidth: LABEL,
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "0 8px 0 10px",
                    fontSize: 12,
                    fontWeight: rowIsMe ? 600 : 400,
                    color: rowIsMe ? "#00f5a0" : "#e8e8f0",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    borderRight: "1px solid rgba(255,255,255,0.1)",
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                  title={rowTeam.label}
                >
                  <span
                    style={{
                      color: rowIsMe ? "#00f5a0" : "#4a5068",
                      fontWeight: 700,
                      minWidth: 16,
                      fontSize: 11,
                    }}
                  >
                    {i + 1}.
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    {rowTeam.label}
                  </span>
                </div>

                {/* Cells */}
                {ordered.map((colTeam) => {
                  const self = colTeam.rosterId === rowTeam.rosterId;
                  const count = self ? 0 : get(rowTeam.rosterId, colTeam.rosterId);
                  const isMeCell = rowIsMe || colTeam.label === myTeamLabel;
                  const accent = isMeCell ? "#00f5a0" : "#c084fc";
                  // Floor non-zero cells higher so even single trades read clearly.
                  const intensity = count > 0 ? 0.22 + 0.78 * (count / max) : 0;
                  return (
                    <div
                      key={colTeam.rosterId}
                      title={
                        self
                          ? rowTeam.label
                          : `${rowTeam.label} \u2194 ${colTeam.label}: ${count} trade${count !== 1 ? "s" : ""}`
                      }
                      style={{
                        ...cellBase,
                        background: self
                          ? "repeating-linear-gradient(45deg, rgba(255,255,255,0.04) 0 4px, transparent 4px 8px)"
                          : count > 0
                          ? hexA(accent, intensity)
                          : "transparent",
                        color: count > 0 ? "#ffffff" : "#3a4055",
                        fontWeight: count > 0 ? 700 : 400,
                      }}
                    >
                      {self ? "" : count > 0 ? count : ""}
                    </div>
                  );
                })}

                {/* Total */}
                <div
                  style={{
                    width: TOTAL,
                    minWidth: TOTAL,
                    height: CELL,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 800,
                    color: rowIsMe ? "#00f5a0" : "#e8e8f0",
                    flexShrink: 0,
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                  }}
                >
                  {rowTeam.tradeCount}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#7a819c", marginTop: 10, lineHeight: 1.5 }}>
        Read across a row to see who that team trades with. Column headers match the row
        team names; hover any cell for the exact pairing. Rows are ranked by total trades \u2014
        the teams up top are your league's biggest market movers.
      </div>
    </div>
  );
}

// Append an alpha byte to a #rrggbb color. Clamps alpha to [0,1].
function hexA(hex, alpha) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`;
}

// Horizontal bar chart of who a team trades with most \u2014 surfaces the
// league's main market movers from each team's perspective.
function TradePartnerChart({ partners, myTeamLabel }) {
  if (!partners || partners.length === 0) {
    return (
      <div style={{ padding: "12px 14px", fontSize: 12, color: "#4a5068" }}>
        No trade partners yet.
      </div>
    );
  }

  const max = Math.max(...partners.map((p) => p.count));

  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontSize: 9,
          letterSpacing: 1.5,
          color: "#4a5068",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Top Trade Partners
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {partners.map((p) => {
          const isMe = p.label === myTeamLabel;
          const accent = isMe ? "#00f5a0" : "#c084fc";
          const pct = max > 0 ? (p.count / max) * 100 : 0;
          return (
            <div
              key={p.rosterId}
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <div
                style={{
                  width: 130,
                  flexShrink: 0,
                  fontSize: 11,
                  color: isMe ? "#00f5a0" : "#c3c9dd",
                  fontWeight: isMe ? 600 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                title={p.label}
              >
                {p.label}
              </div>
              <div
                style={{
                  flex: 1,
                  height: 16,
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: 3,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${pct}%`,
                    minWidth: 2,
                    background: `${accent}bb`,
                    borderRadius: 3,
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
              <div
                style={{
                  width: 56,
                  flexShrink: 0,
                  textAlign: "right",
                  fontSize: 11,
                  fontWeight: 600,
                  color: accent,
                }}
              >
                {p.count} trade{p.count !== 1 ? "s" : ""}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const TYPE_ICON = { trade: "\u2194", waiver: "\u23F3", free_agent: "+" };

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "trade", label: "Trades", color: "#c084fc" },
  { key: "fa", label: "FA / Waivers", color: "#64b5f6" },
];

function TransactionFeed({ transactions, feedYears, tradeCardsById, rosterId, snapshotEarliestDate, valueSource }) {
  const [yearFilter, setYearFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const filtered = transactions.filter((t) => {
    if (yearFilter !== "all" && t.year !== yearFilter) return false;
    if (typeFilter === "trade" && t.type !== "trade") return false;
    if (typeFilter === "fa" && t.type === "trade") return false;
    return true;
  });

  return (
    <div style={{ marginTop: 10 }}>
      {/* Filter rows */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        {/* Year pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 9, letterSpacing: 1.5, color: "#4a5068", textTransform: "uppercase", marginRight: 2 }}>Year</span>
          <button
            onClick={() => setYearFilter("all")}
            style={pillActive("all", yearFilter)}
          >
            All
          </button>
          {feedYears.map((yr) => (
            <button key={yr} onClick={() => setYearFilter(yr)} style={pillActive(yr, yearFilter)}>
              {yr}
            </button>
          ))}
        </div>

        {/* Type pills */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 9, letterSpacing: 1.5, color: "#4a5068", textTransform: "uppercase", marginRight: 2 }}>Type</span>
          {TYPE_FILTERS.map((tf) => {
            const active = typeFilter === tf.key;
            const accent = tf.color || "#00f5a0";
            return (
              <button
                key={tf.key}
                onClick={() => setTypeFilter(tf.key)}
                style={{
                  ...pillStyle,
                  background: active ? `${accent}20` : "rgba(255,255,255,0.06)",
                  color: active ? accent : "#7a819c",
                  borderColor: active ? `${accent}50` : "rgba(255,255,255,0.1)",
                }}
              >
                {tf.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scrollable feed */}
      <div
        style={{
          maxHeight: 360,
          overflowY: "auto",
          borderRadius: 4,
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {filtered.length === 0 && (
          <div style={{ padding: "20px 14px", fontSize: 12, color: "#4a5068", textAlign: "center" }}>
            No {typeFilter === "trade" ? "trades" : typeFilter === "fa" ? "FA/waiver moves" : "transactions"}
            {yearFilter !== "all" ? ` in ${yearFilter}` : ""}.
          </div>
        )}
        {filtered.map((tx, i) => (
          <div
            key={tx.id + "-" + i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 14px",
              borderBottom:
                i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
            }}
          >
            {/* Type badge */}
            <div
              style={{
                minWidth: 48,
                textAlign: "center",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  padding: "2px 7px",
                  borderRadius: 2,
                  fontSize: 9,
                  letterSpacing: 1,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  background: `${tx.color}1a`,
                  color: tx.color,
                  border: `1px solid ${tx.color}40`,
                }}
              >
                {TYPE_ICON[tx.type] || ""} {tx.typeLabel}
              </span>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {tx.type === "trade" && tradeCardsById?.[tx.id] ? (
                /* Trade with a value report attached — who won, per-asset values,
                   picks resolved to the player drafted, value source. */
                <FeedTradeBody
                  card={tradeCardsById[tx.id]}
                  rosterId={rosterId}
                  earliestDate={snapshotEarliestDate}
                  valueSource={valueSource}
                />
              ) : tx.type === "trade" && !tx.isMultiTeam ? (
                /* Standard 2-team trade: compact view (no value data available) */
                <div>
                  <div style={{ fontSize: 12, color: "#e8e8f0", lineHeight: 1.5 }}>
                    <span style={{ color: "#ff6b35" }}>Sent</span>{" "}
                    {tx.sent.join(", ") || "—"}
                  </div>
                  <div style={{ fontSize: 12, color: "#e8e8f0", lineHeight: 1.5 }}>
                    <span style={{ color: "#00f5a0" }}>Got</span>{" "}
                    {tx.received.join(", ") || "—"}
                  </div>
                  {tx.partner && (
                    <div style={{ fontSize: 10, color: "#4a5068", marginTop: 2 }}>
                      with {tx.partner}
                    </div>
                  )}
                </div>
              ) : tx.type === "trade" && tx.isMultiTeam ? (
                /* Multi-team trade: per-partner leg breakdown */
                <div>
                  {tx.legs.map((leg) => (
                    <div
                      key={leg.partnerId}
                      style={{
                        padding: "5px 0",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          color: "#c084fc",
                          letterSpacing: 0.5,
                          marginBottom: 3,
                        }}
                      >
                        {leg.partnerLabel}
                      </div>
                      {leg.sent.length > 0 && (
                        <div style={{ fontSize: 12, color: "#e8e8f0", lineHeight: 1.5 }}>
                          <span style={{ color: "#ff6b35" }}>{"\u2192"}</span>{" "}
                          {leg.sent.join(", ")}
                        </div>
                      )}
                      {leg.received.length > 0 && (
                        <div style={{ fontSize: 12, color: "#e8e8f0", lineHeight: 1.5 }}>
                          <span style={{ color: "#00f5a0" }}>{"\u2190"}</span>{" "}
                          {leg.received.join(", ")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* FA / Waiver */
                <div style={{ fontSize: 12, color: "#e8e8f0", lineHeight: 1.5 }}>
                  {tx.received.length > 0 && (
                    <span>
                      <span style={{ color: "#00f5a0" }}>+</span> {tx.received.join(", ")}
                    </span>
                  )}
                  {tx.received.length > 0 && tx.sent.length > 0 && " · "}
                  {tx.sent.length > 0 && (
                    <span>
                      <span style={{ color: "#ff6b35" }}>-</span> {tx.sent.join(", ")}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Date + week */}
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: "#6b7390" }}>{tx.date}</div>
              {tx.week > 0 && (
                <div style={{ fontSize: 9, color: "#4a5068", marginTop: 1 }}>
                  Wk {tx.week}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const pillStyle = {
  padding: "4px 10px",
  borderRadius: 3,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 1,
  border: "1px solid",
  cursor: "pointer",
  textTransform: "uppercase",
};

function pillActive(value, current) {
  const active = value === current;
  return {
    ...pillStyle,
    background: active ? "rgba(0,245,160,0.15)" : "rgba(255,255,255,0.06)",
    color: active ? "#00f5a0" : "#7a819c",
    borderColor: active ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.1)",
  };
}

// --- Trade Report Card ------------------------------------------------------
// Scores every historical trade by what each side's haul is worth NOW (and, when
// we captured a value snapshot near the trade date, what it was worth THEN).
// Always labels where each number came from.

// Short label + tooltip for where a value-now number came from.
const SOURCE_META = {
  fc: { tag: "FC", title: "Value from FantasyCalc (live market)" },
  ra: { tag: "RA", title: "Value from RosterAudit (live market)" },
  oracle: { tag: "DO", title: "Value from Dynasty Oracle's own internal model" },
  pick_est: { tag: "est", title: "Estimated pick value — pick not yet used, no market feed" },
};

// Readable card-level summary of the value-now sources used.
function sourcesLabel(sources = []) {
  const names = { fc: "FantasyCalc", ra: "RosterAudit", oracle: "Dynasty Oracle", pick_est: "pick estimate" };
  return sources.map((s) => names[s] || s).join(" + ");
}

function SourceTag({ source }) {
  const meta = SOURCE_META[source];
  if (!meta) return null;
  return (
    <span
      title={meta.title}
      style={{
        flexShrink: 0, fontSize: 8, letterSpacing: 0.5, fontWeight: 700,
        color: "#6b7390", textTransform: "uppercase",
      }}
    >
      {meta.tag}
    </span>
  );
}

function AssetLine({ asset }) {
  const isPickUsed = asset.kind === "pick_used";
  const isFuture = asset.kind === "pick_future";
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 12, lineHeight: 1.5 }}>
      <span style={{ flex: 1, minWidth: 0, color: "#e8e8f0" }}>
        {isPickUsed ? (
          <>
            <span style={{ color: "#c084fc" }}>{asset.label}</span>
            <span style={{ color: "#4a5068" }}>{" → "}</span>
            <span>{asset.becameLabel}</span>
            {asset.pickNo ? (
              <span style={{ color: "#4a5068", fontSize: 10 }}> (#{asset.pickNo})</span>
            ) : null}
          </>
        ) : isFuture ? (
          <>
            <span style={{ color: "#c084fc" }}>{asset.label}</span>
            <span style={{ color: "#4a5068", fontSize: 10 }}> (unused pick)</span>
          </>
        ) : (
          <span>{asset.label}</span>
        )}
      </span>
      <span style={{ flexShrink: 0, fontWeight: 700, color: "#00f5a0", fontVariantNumeric: "tabular-nums" }}>
        {asset.valueNow}
      </span>
      <SourceTag source={asset.nowSource} />
      {asset.valueThen != null && (
        <span style={{ flexShrink: 0, fontSize: 10, color: "#6b7390", fontVariantNumeric: "tabular-nums" }}>
          (was {asset.valueThen})
        </span>
      )}
    </div>
  );
}

function ProvenanceTag({ provenance, snapDate, earliestDate }) {
  if (provenance === "snapshot") {
    return (
      <span title={`Values at trade time from a snapshot taken ${snapDate}`} style={{
        fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700,
        color: "#00f5a0", background: "rgba(0,245,160,0.12)", border: "1px solid rgba(0,245,160,0.3)",
        borderRadius: 3, padding: "2px 7px", whiteSpace: "nowrap",
      }}>
        {"📸"} Snapshot {snapDate}
      </span>
    );
  }
  return (
    <span title={earliestDate
      ? `This trade predates our first value snapshot (${earliestDate}), so we can only show what the assets are worth now.`
      : "We haven't captured value snapshots yet, so we can only show what the assets are worth now. Point-in-time values will appear for trades made from here on."}
      style={{
        fontSize: 9, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700,
        color: "#7a819c", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 3, padding: "2px 7px", whiteSpace: "nowrap",
      }}>
      Outside snapshot frame
    </span>
  );
}

// Value/winner breakdown attached to a single trade inside the team feed, framed
// from the expanded team's perspective ("Got" vs "Sent"). Multi-team trades show
// every side labeled. AssetLine carries per-asset value-now, pick→player, and
// "(was N)" when a snapshot priced the trade date.
function SideAssets({ side }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {side.assets.length === 0 ? (
        <span style={{ fontSize: 11, color: "#4a5068" }}>{"—"}</span>
      ) : (
        side.assets.map((a, idx) => <AssetLine key={idx} asset={a} />)
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 3, paddingTop: 4, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: 9, letterSpacing: 1, color: "#6b7390", textTransform: "uppercase", flex: 1 }}>Haul now</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: "#e8e8f0", fontVariantNumeric: "tabular-nums" }}>{side.totalNow}</span>
        {side.totalThen != null && (
          <span style={{ fontSize: 10, color: "#6b7390", fontVariantNumeric: "tabular-nums" }}>(was {side.totalThen})</span>
        )}
      </div>
    </div>
  );
}

function FeedTradeBody({ card, rosterId, earliestDate, valueSource = "fc" }) {
  const view = card.views?.[valueSource] || card.views?.fc;
  if (!view) return null;
  const mine = view.sides.find((s) => s.rosterId === rosterId) || view.sides[0];
  const others = view.sides.filter((s) => s.rosterId !== mine.rosterId);
  const twoTeam = view.sides.length === 2;
  const won = view.winnerNowRosterId === mine.rosterId;
  const winnerLabel = view.sides.find((s) => s.rosterId === view.winnerNowRosterId)?.label;

  const verdict = view.evenNow
    ? { text: `Even today (${view.marginNow} apart)`, color: "#7a819c" }
    : won
    ? { text: `You won, +${view.marginNow} today`, color: "#00f5a0" }
    : { text: `${winnerLabel} won, +${view.marginNow} today`, color: "#ff6b35" };

  return (
    <div>
      {/* Verdict + value source + provenance */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: verdict.color, textTransform: "uppercase" }}>
          {won ? "⚑ " : ""}{verdict.text}
        </span>
        {view.valueSources?.length > 0 && (
          <span style={{ fontSize: 9, color: "#4a5068", letterSpacing: 0.5 }}>
            via {sourcesLabel(view.valueSources)}
          </span>
        )}
        <div style={{ flex: 1 }} />
        <ProvenanceTag provenance={card.provenance} snapDate={card.snapDate} earliestDate={earliestDate} />
      </div>

      {twoTeam ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "#00f5a0", textTransform: "uppercase", marginBottom: 4 }}>Got</div>
            <SideAssets side={mine} />
          </div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: "#ff6b35", textTransform: "uppercase", marginBottom: 4 }}>
              Sent {others[0] ? `→ ${others[0].label}` : ""}
            </div>
            {others[0] && <SideAssets side={others[0]} />}
          </div>
        </div>
      ) : (
        /* Multi-team: every side, this team highlighted. */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          {view.sides.map((side) => {
            const isMine = side.rosterId === mine.rosterId;
            const isWinner = view.winnerNowRosterId === side.rosterId;
            return (
              <div key={side.rosterId} style={{
                border: `1px solid ${isWinner ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.08)"}`,
                borderRadius: 5, padding: "8px 10px",
                background: isWinner ? "rgba(0,245,160,0.04)" : "transparent",
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: isMine ? "#00f5a0" : "#c3c9dd", marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {side.label} got{isMine ? " (you)" : ""}
                </div>
                <SideAssets side={side} />
              </div>
            );
          })}
        </div>
      )}

      {card.winnerThenRosterId != null && card.winnerThenRosterId !== view.winnerNowRosterId && (
        <div style={{ fontSize: 10, color: "#c084fc", marginTop: 6 }}>
          At the time, {view.sides.find((s) => s.rosterId === card.winnerThenRosterId)?.label} had the edge — the value has since flipped.
        </div>
      )}
    </div>
  );
}

export default function LeagueActivityTab({ leagueActivity, tradeReview, myTeamLabel }) {
  const [expandedTeam, setExpandedTeam] = useState(null);
  // Which market prices the trades in the team feeds (FantasyCalc vs RosterAudit).
  const [valueSource, setValueSource] = useState("fc");

  if (!leagueActivity) {
    return (
      <div style={{ color: "#6b7390", fontSize: 13, padding: "24px 0" }}>
        No activity data available.
      </div>
    );
  }

  const { overallScore, overallGrade, components, stats, teams, summaryText } = leagueActivity;

  const componentList = [
    components.tradeVelocity,
    components.rosterMgmt,
    components.tradeBreadth,
    components.dynastyEngagement,
    components.consistency,
  ];

  return (
    <div>
      {/* Hero: League Grade */}
      <div
        style={{
          ...styles.card,
          borderColor: `${overallGrade.color}35`,
          padding: "24px 28px",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          gap: 28,
          flexWrap: "wrap",
        }}
      >
        <GradeBadge grade={overallGrade.grade} color={overallGrade.color} size="lg" />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={styles.sectionLabel}>League Activity Health</div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span
              style={{ fontSize: 32, fontWeight: 700, color: overallGrade.color }}
            >
              {overallScore}
            </span>
            <span style={{ fontSize: 14, color: "#6b7390" }}>/ 100</span>
            <span
              style={{
                ...styles.tag(overallGrade.color),
                fontSize: 10,
                marginLeft: 4,
              }}
            >
              {overallGrade.label}
            </span>
          </div>
          <p
            style={{
              fontSize: 13,
              color: "#c3c9dd",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {summaryText}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 20,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>
              {stats.totalTrades}
            </div>
            <div style={{ fontSize: 9, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
              total trades
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>
              {stats.tradesPerTeamPerSeason}
            </div>
            <div style={{ fontSize: 9, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
              trades/team/yr
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>
              {stats.activeTraderCount}/{stats.numTeams}
            </div>
            <div style={{ fontSize: 9, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
              teams trading
            </div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e8e8f0" }}>
              {stats.effectiveSeasons}
            </div>
            <div style={{ fontSize: 9, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
              seasons of data
            </div>
          </div>
        </div>
      </div>

      {/* Component Breakdown */}
      <div style={styles.sectionLabel}>Activity Breakdown</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
          gap: 10,
          marginBottom: 32,
        }}
      >
        {componentList.map((c) => (
          <ComponentCard key={c.label} component={c} />
        ))}
      </div>

      {/* League-wide trade matrix */}
      <div style={styles.sectionLabel}>League Trade Network</div>
      <LeagueTradeMatrix teams={teams} myTeamLabel={myTeamLabel} />

      {/* Per-Team Table */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ ...styles.sectionLabel, marginBottom: 0 }}>
          Team Activity — {teams.length} Teams
        </div>
        <div style={{ flex: 1 }} />
        {/* Value lens — reprices every trade in the feeds below. */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 9, letterSpacing: 1.5, color: "#4a5068", textTransform: "uppercase" }}>
            Value lens
          </span>
          {[
            { key: "fc", label: "FantasyCalc" },
            { key: "ra", label: "RosterAudit" },
            { key: "oracle", label: "Dynasty Oracle" },
          ].map((opt) => {
            const active = valueSource === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setValueSource(opt.key)}
                style={{
                  ...pillStyle,
                  background: active ? "rgba(0,245,160,0.15)" : "rgba(255,255,255,0.06)",
                  color: active ? "#00f5a0" : "#7a819c",
                  borderColor: active ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.1)",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ marginBottom: 4 }} />
      {teams.map((team, i) => {
        const isMe = team.label === myTeamLabel;
        const isExpanded = expandedTeam === team.rosterId;
        return (
          <div
            key={team.rosterId}
            style={{
              ...styles.card,
              borderColor: isMe ? "rgba(0,245,160,0.35)" : "rgba(255,255,255,0.1)",
              padding: "12px 18px",
              marginBottom: 8,
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
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                {/* Rank */}
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: isMe ? "#00f5a0" : "#4a5068",
                    minWidth: 22,
                    flexShrink: 0,
                  }}
                >
                  #{i + 1}
                </span>

                {/* Grade badge */}
                <GradeBadge
                  grade={team.grade.grade}
                  color={team.grade.color}
                  size="sm"
                />

                {/* Team name */}
                <div style={{ flex: 1, minWidth: 120 }}>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isMe ? "#00f5a0" : "#e8e8f0",
                    }}
                  >
                    {team.label}
                  </span>
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
                </div>

                {/* Stats */}
                <div
                  style={{
                    display: "flex",
                    gap: 20,
                    fontSize: 11,
                    color: "#7a819c",
                    flexShrink: 0,
                    flexWrap: "wrap",
                  }}
                >
                  <span>{team.tradeCount} trades</span>
                  {team.faAdds > 0 && <span>{team.faAdds} adds</span>}
                  <span>{team.uniquePartners} partner{team.uniquePartners !== 1 ? "s" : ""}</span>
                  <span>{team.futurePickTrades} pick trades</span>
                </div>

                {/* Score + expand arrow */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                  <div style={{ textAlign: "right", minWidth: 46 }}>
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 700,
                        color: team.grade.color,
                        lineHeight: 1,
                      }}
                    >
                      {team.teamActivityScore}
                    </div>
                    <div style={{ fontSize: 9, color: "#6b7390", letterSpacing: 1, marginTop: 2 }}>
                      activity
                    </div>
                  </div>
                  <span style={{ fontSize: 14, color: "#4a5068" }}>
                    {isExpanded ? "\u25B2" : "\u25BC"}
                  </span>
                </div>
              </div>

              {/* Mini score bar */}
              <ScoreBar score={team.teamActivityScore} color={team.grade.color} />
            </button>

            {/* Expanded: trade-partner chart + transaction feed */}
            {isExpanded && (
              <>
                <TradePartnerChart
                  partners={team.tradePartners}
                  myTeamLabel={myTeamLabel}
                />
                <TransactionFeed
                  transactions={team.transactions}
                  feedYears={team.feedYears}
                  tradeCardsById={tradeReview?.byId}
                  rosterId={team.rosterId}
                  snapshotEarliestDate={tradeReview?.snapshotCoverage?.earliestDate}
                  valueSource={valueSource}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
