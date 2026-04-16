import { useState, useMemo } from "react";
import { styles } from "../../styles";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"];

const TIER_COLORS = {
  "1": "#00f5a0",
  "2": "#38e8c6",
  "3": "#ffd84d",
  "4": "#ff9f43",
  "5": "#ff6b35",
  "6": "#ff4757",
  "7": "#8a91a8",
};

function TrendChip({ value }) {
  const v = Number(value || 0);
  if (v === 0) return <span style={{ color: "#8a91a8" }}>—</span>;
  const color = v > 0 ? "#00f5a0" : "#ff6b35";
  const arrow = v > 0 ? "↑" : "↓";
  return (
    <span style={{ color, fontWeight: 700, fontSize: 11 }}>
      {arrow} {v > 0 ? `+${v}` : v}
    </span>
  );
}

function FlagBadge({ label, color }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        color: "#0d1117",
        background: color,
        borderRadius: 3,
        padding: "1px 5px",
        marginLeft: 4,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

export default function RankingsTab({ rosterAuditSource }) {
  const [posFilter, setPosFilter] = useState("ALL");
  const rankings = rosterAuditSource?.rankings || [];

  const filtered = useMemo(() => {
    const list =
      posFilter === "ALL"
        ? rankings
        : rankings.filter((p) => p.position === posFilter);
    return list.slice(0, 200);
  }, [rankings, posFilter]);

  if (!rosterAuditSource?.enabled || rankings.length === 0) {
    return (
      <div style={{ ...styles.card, textAlign: "center", padding: 40, color: "#8a91a8" }}>
        RosterAudit data is not available. Rankings will appear once the API responds.
      </div>
    );
  }

  return (
    <div>
      <div style={styles.sectionLabel}>Dynasty Rankings</div>
      <div
        style={{
          fontSize: 11,
          color: "#8a91a8",
          marginBottom: 12,
          marginTop: -8,
        }}
      >
        Powered by{" "}
        <a
          href={rosterAuditSource.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#06b6d4", textDecoration: "none" }}
        >
          {rosterAuditSource.attribution}
        </a>
        {" "}· {rosterAuditSource.totalPlayers} players
      </div>

      {/* Position filter */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {POSITIONS.map((pos) => (
          <button
            key={pos}
            onClick={() => setPosFilter(pos)}
            style={{
              padding: "5px 14px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1,
              border: "1px solid",
              borderColor:
                posFilter === pos ? "#06b6d4" : "rgba(255,255,255,0.1)",
              borderRadius: 6,
              background:
                posFilter === pos ? "rgba(6,182,212,0.15)" : "transparent",
              color: posFilter === pos ? "#06b6d4" : "#c8cfe3",
              cursor: "pointer",
              textTransform: "uppercase",
            }}
          >
            {pos}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            color: "#d9deef",
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: "1px solid rgba(255,255,255,0.1)",
                textAlign: "left",
              }}
            >
              <th style={thStyle}>#</th>
              <th style={thStyle}>Player</th>
              <th style={thStyle}>Pos</th>
              <th style={thStyle}>Team</th>
              <th style={thStyle}>Age</th>
              <th style={thStyle}>Tier</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Value</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Pos Rank</th>
              <th style={{ ...thStyle, textAlign: "right" }}>7d Trend</th>
              <th style={{ ...thStyle, textAlign: "right" }}>30d Trend</th>
              <th style={thStyle}>Flags</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              const tierColor = TIER_COLORS[p.tier] || "#8a91a8";
              return (
                <tr
                  key={p.sleeper_id || i}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    transition: "background 0.15s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.03)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <td style={tdStyle}>
                    <span style={{ color: "#8a91a8" }}>{p.rank_overall}</span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 700, color: "#fff" }}>
                    {p.name}
                  </td>
                  <td style={tdStyle}>{p.position}</td>
                  <td style={tdStyle}>{p.team || "FA"}</td>
                  <td style={tdStyle}>{p.age}</td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        color: tierColor,
                        fontWeight: 700,
                        fontSize: 11,
                      }}
                    >
                      T{p.tier}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>
                    {Number(p.value || 0).toLocaleString()}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      color: "#c8cfe3",
                    }}
                  >
                    {p.position}{p.rank_pos}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <TrendChip value={p.trend_7d} />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    <TrendChip value={p.trend_30d} />
                  </td>
                  <td style={tdStyle}>
                    {p.buy_low === "1" && (
                      <FlagBadge label="Buy Low" color="#00f5a0" />
                    )}
                    {p.sell_high === "1" && (
                      <FlagBadge label="Sell High" color="#ff6b35" />
                    )}
                    {p.breakout === "1" && (
                      <FlagBadge label="Breakout" color="#ffd84d" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {filtered.length >= 200 && (
        <div
          style={{
            fontSize: 11,
            color: "#8a91a8",
            textAlign: "center",
            marginTop: 12,
          }}
        >
          Showing top 200 · filter by position to see more
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: "8px 10px",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#8a91a8",
  whiteSpace: "nowrap",
};

const tdStyle = {
  padding: "8px 10px",
  whiteSpace: "nowrap",
};
