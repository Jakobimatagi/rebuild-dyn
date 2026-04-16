/**
 * TrendBadge — small inline badge showing dynasty-market trend direction.
 * Uses fantasyCalcTrend (30-day $ move) when available. Shows ↑/↓ + value.
 */
const THRESHOLD = 50; // Only show if abs(trend) > this

export default function TrendBadge({ player }) {
  const trend = Number(player?.fantasyCalcTrend || 0);
  if (Math.abs(trend) <= THRESHOLD) return null;

  const up = trend > 0;
  const color = up ? "#00f5a0" : "#ff6b35";
  const arrow = up ? "↑" : "↓";
  const display = up ? `+${trend}` : `${trend}`;

  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        color,
        marginLeft: 6,
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
      }}
    >
      {arrow} {display}
    </span>
  );
}
