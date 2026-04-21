function S({ w, h, mb = 0, style = {} }) {
  return (
    <div
      className="dyn-skeleton"
      style={{ width: w, height: h, marginBottom: mb, flexShrink: 0, ...style }}
    />
  );
}

function SkeletonCard({ height = 140 }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 4,
        padding: "20px 24px",
        marginBottom: 16,
      }}
    >
      <S w={120} h={10} mb={18} />
      <S w="100%" h={height} style={{ borderRadius: 3 }} />
    </div>
  );
}

export default function DashboardSkeleton({ leagueName = "your league" }) {
  const tabs = [80, 60, 60, 72, 80, 118, 60, 70];

  return (
    <div>
      {/* Header */}
      <div
        style={{
          marginBottom: 36,
          borderBottom: "1px solid rgba(0,245,160,0.15)",
          paddingBottom: 24,
        }}
      >
        <div
          className="dyn-header-top-row"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 20,
          }}
        >
          <S w={200} h={10} />
          <div style={{ display: "flex", gap: 8 }}>
            <S w={96} h={28} style={{ borderRadius: 3 }} />
            <S w={108} h={28} style={{ borderRadius: 3 }} />
            <S w={72} h={28} style={{ borderRadius: 3 }} />
          </div>
        </div>
        <S w={220} h={26} mb={10} />
        <S w={300} h={12} />
      </div>

      {/* Tabs */}
      <div
        className="dyn-tabs-row"
        style={{
          display: "flex",
          gap: 24,
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          paddingBottom: 12,
          marginBottom: 32,
        }}
      >
        {tabs.map((w, i) => (
          <S key={i} w={w} h={12} style={{ borderRadius: 2 }} />
        ))}
      </div>

      {/* Loading label */}
      <div
        style={{
          fontSize: 10,
          letterSpacing: 2,
          color: "#4a5068",
          marginBottom: 24,
          textTransform: "uppercase",
        }}
      >
        Loading {leagueName}…
      </div>

      {/* Overview skeleton — phase card + 2-col grid + player list */}
      <div style={{ marginBottom: 16 }}>
        <S w="100%" h={90} style={{ borderRadius: 4, marginBottom: 16 }} />
      </div>

      <div
        className="dyn-grid-2"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}
      >
        <S w="100%" h={130} style={{ borderRadius: 4 }} />
        <S w="100%" h={130} style={{ borderRadius: 4 }} />
      </div>

      <SkeletonCard height={160} />
      <SkeletonCard height={100} />
    </div>
  );
}
