import { useState, useMemo } from "react";
import { buildMarketPulse } from "../../lib/marketPulse";
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

  const pulse = useMemo(() => buildMarketPulse(rankings), [rankings]);

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

      {pulse && <MarketPulsePanel pulse={pulse} />}

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

// ---------------------------------------------------------------------------
// Market Pulse panel — value-weighted position/tier deltas + biggest movers
// ---------------------------------------------------------------------------

function fmtSigned(n, decimals = 1) {
  const v = Number(n) || 0;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(decimals)}`;
}

function pulseTone(v) {
  if (v >= 1) return "#00f5a0";
  if (v >= 0.25) return "#7ed56f";
  if (v <= -1) return "#ff6b35";
  if (v <= -0.25) return "#ffd84d";
  return "#a8aec7";
}

function PulseDelta({ value, suffix = "" }) {
  const tone = pulseTone(value);
  const arrow = value > 0.05 ? "▲" : value < -0.05 ? "▼" : "•";
  return (
    <span style={{ color: tone, fontWeight: 700, fontSize: 12 }}>
      {arrow} {fmtSigned(value)}
      {suffix && <span style={{ fontSize: 9, color: "#8a91a8", marginLeft: 2 }}>{suffix}</span>}
    </span>
  );
}

function PositionPulseCard({ pos, data }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 6,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <div style={{ fontSize: 12, color: "#fff", fontWeight: 700, letterSpacing: 1 }}>
          {pos}
        </div>
        <div style={{ fontSize: 9, color: "#8a91a8" }}>{data.count} players</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#8a91a8" }}>7d trend</span>
          <PulseDelta value={data.avg7d} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#8a91a8" }}>30d trend</span>
          <PulseDelta value={data.avg30d} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 10, color: "#8a91a8" }}>Up / down</span>
          <span style={{ fontSize: 11, color: "#d9deef" }}>
            <span style={{ color: "#00f5a0" }}>{data.upShare}%</span>
            <span style={{ color: "#5a6280", margin: "0 4px" }}>/</span>
            <span style={{ color: "#ff6b35" }}>{data.downShare}%</span>
          </span>
        </div>
      </div>

      {data.risers30d?.[0] && (
        <div style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: "#00f5a0", letterSpacing: 1.2, marginRight: 4 }}>↑</span>
          <span style={{ fontSize: 10, color: "#d9deef" }}>{data.risers30d[0].name}</span>
          <span style={{ fontSize: 9, color: "#00f5a0", marginLeft: 4 }}>
            {fmtSigned(data.risers30d[0].trend30d, 0)}
          </span>
        </div>
      )}
      {data.fallers30d?.[0] && (
        <div>
          <span style={{ fontSize: 9, color: "#ff6b35", letterSpacing: 1.2, marginRight: 4 }}>↓</span>
          <span style={{ fontSize: 10, color: "#d9deef" }}>{data.fallers30d[0].name}</span>
          <span style={{ fontSize: 9, color: "#ff6b35", marginLeft: 4 }}>
            {fmtSigned(data.fallers30d[0].trend30d, 0)}
          </span>
        </div>
      )}
    </div>
  );
}

function MoverList({ title, items, accent }) {
  if (!items?.length) {
    return (
      <div
        style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 6,
          padding: 12,
        }}
      >
        <div style={{ fontSize: 10, color: accent, letterSpacing: 1.5, marginBottom: 6, fontWeight: 700 }}>
          {title}
        </div>
        <div style={{ fontSize: 11, color: "#8a91a8" }}>No notable moves.</div>
      </div>
    );
  }
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 6,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 10, color: accent, letterSpacing: 1.5, marginBottom: 8, fontWeight: 700 }}>
        {title}
      </div>
      {items.slice(0, 5).map((m, i) => (
        <div
          key={`${m.name}-${i}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 11,
            padding: "3px 0",
            borderTop: i === 0 ? "none" : "1px solid rgba(255,255,255,0.04)",
          }}
        >
          <span style={{ color: "#e8e8f0" }}>
            {m.name}
            <span style={{ color: "#8a91a8", marginLeft: 6, fontSize: 9 }}>
              {m.position}
              {m.team ? ` · ${m.team}` : ""}
            </span>
          </span>
          <span style={{ color: accent, fontWeight: 700, fontSize: 11 }}>
            {fmtSigned(m.trend7d, 0)}
            <span style={{ fontSize: 9, color: "#8a91a8", marginLeft: 4 }}>
              7d · {fmtSigned(m.trend30d, 0)} 30d
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function MarketPulsePanel({ pulse }) {
  const positions = Object.entries(pulse.positions || {});
  if (!positions.length) return null;

  return (
    <div
      style={{
        ...styles.card,
        marginBottom: 18,
        borderColor: "rgba(6,182,212,0.22)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div>
          <div style={styles.sectionLabel}>📊 Market Pulse</div>
          <div style={{ fontSize: 11, color: "#94a3b8" }}>
            Value-weighted RA trend deltas across {pulse.summary?.sampleSize || 0} players. Movers
            filtered to meaningful-value assets only.
          </div>
        </div>
      </div>

      <div
        className="dyn-grid-4"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 14,
        }}
      >
        {positions.map(([pos, data]) => (
          <PositionPulseCard key={pos} pos={pos} data={data} />
        ))}
      </div>

      <div
        className="dyn-grid-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 10,
        }}
      >
        <MoverList title="🔥 BIGGEST RISERS (7d)" items={pulse.risers7d} accent="#00f5a0" />
        <MoverList title="🧊 BIGGEST FALLERS (7d)" items={pulse.fallers7d} accent="#ff6b35" />
      </div>
    </div>
  );
}
