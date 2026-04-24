// Renders recent FantasyCalc market comps for a sell-side player.
// Surfaces 2–3 one-liners like "Traded for Jonathan Taylor + 2026 3.04 (fair)".
// Returns null when the comps array is empty so callers can drop it in freely.

export default function MarketCompsBlock({ comps, label }) {
  if (!Array.isArray(comps) || comps.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: "1px dashed rgba(255,255,255,0.08)",
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: 2,
          color: "#8a91a8",
          textTransform: "uppercase",
          marginBottom: 4,
          fontWeight: 700,
        }}
      >
        {label || "Recent market comps"}
      </div>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
        }}
      >
        {comps.map((c) => (
          <li
            key={c.id}
            style={{
              fontSize: 10,
              color: "#c8cfe3",
              lineHeight: 1.4,
              paddingLeft: 10,
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                color: "#6c7590",
              }}
            >
              ·
            </span>
            {c.summary}
          </li>
        ))}
      </ul>
    </div>
  );
}
