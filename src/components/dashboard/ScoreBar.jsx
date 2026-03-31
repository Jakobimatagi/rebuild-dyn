export default function ScoreBar({ label, value, color }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: "#d1d7ea",
          marginBottom: 3,
        }}
      >
        <span style={{ letterSpacing: 1 }}>{label}</span>
        <span style={{ color }}>{value}</span>
      </div>
      <div
        style={{
          height: 3,
          background: "rgba(255,255,255,0.06)",
          borderRadius: 2,
        }}
      >
        <div
          style={{
            height: 3,
            width: `${value}%`,
            background: color,
            borderRadius: 2,
            transition: "width 0.4s",
          }}
        />
      </div>
    </div>
  );
}
