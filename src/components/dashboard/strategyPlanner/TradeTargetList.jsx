import { styles } from "../../../styles";
import TrendBadge from "./TrendBadge";

const TIER_COLORS = {
  tier1: "#00f5a0",
  tier2: "#ffd84d",
  tier3: "#c084fc",
};

const TIER_LABELS = {
  tier1: "Tier 1 — Top Priority",
  tier2: "Tier 2 — Secondary",
  tier3: "Tier 3 — Depth Shots",
};

const DIFFICULTY_COLORS = {
  Easy: "#00f5a0",
  Moderate: "#ffd84d",
  Hard: "#ff6b35",
};

function TargetCard({ target }) {
  const p = target.player;
  return (
    <div
      style={{
        ...styles.card,
        background: "rgba(255,255,255,0.03)",
        marginBottom: 10,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 6,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{ fontSize: 15, color: "#fff", fontWeight: 700 }}
          >
            {p.name}<TrendBadge player={p} />
          </div>
          <div style={{ fontSize: 11, color: "#c8cfe3", marginTop: 2 }}>
            {p.position} · {p.team || "FA"} · {p.age}yo · value{" "}
            {Math.round(p.marketValue || 0)}
            {target.partnerTeam && (
              <>
                {" "}
                · from <em>{target.partnerTeam}</em>
              </>
            )}
          </div>
        </div>
        <span style={styles.tag(DIFFICULTY_COLORS[target.difficulty] || "#d1d7ea")}>
          {target.difficulty}
        </span>
      </div>

      {target.reason && (
        <div
          style={{
            fontSize: 11,
            color: "#d9deef",
            marginBottom: 8,
            lineHeight: 1.45,
          }}
        >
          {target.reason}
        </div>
      )}

      <div
        style={{
          fontSize: 10,
          color: "#c8cfe3",
          letterSpacing: 1,
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Suggested Package
      </div>
      <div style={{ fontSize: 12, color: "#e8e8f0", marginBottom: 6 }}>
        {(target.package || []).length > 0
          ? target.package.join(" + ")
          : "Package pending — check Trade tab"}
      </div>

      {target.recentComp && (
        <div
          style={{
            fontSize: 10,
            color: "#c8cfe3",
            marginTop: 4,
            fontStyle: "italic",
          }}
        >
          Recent comp: {target.recentComp.target} acquired for{" "}
          {target.recentComp.cost}
        </div>
      )}
    </div>
  );
}

function Tier({ tierKey, targets }) {
  if (!targets || targets.length === 0) return null;
  const color = TIER_COLORS[tierKey];
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          ...styles.sectionLabel,
          color,
          marginBottom: 8,
        }}
      >
        {TIER_LABELS[tierKey]}
      </div>
      {targets.map((t) => (
        <TargetCard key={`${t.player.id}-${t.partnerTeam}`} target={t} />
      ))}
    </div>
  );
}

export default function TradeTargetList({ tradeTargets }) {
  if (!tradeTargets) return null;
  const empty =
    tradeTargets.tier1.length === 0 &&
    tradeTargets.tier2.length === 0 &&
    tradeTargets.tier3.length === 0;

  return (
    <div>
      <div style={styles.sectionLabel}>2 — Trade Targets</div>
      {empty ? (
        <div
          style={{
            ...styles.card,
            fontSize: 12,
            color: "#d1d7ea",
          }}
        >
          No trade targets match this path's filter in the current league.
          {tradeTargets.totalConsidered > 0 && (
            <>
              {" "}
              {tradeTargets.totalConsidered} base suggestions were considered
              — none matched the path criteria.
            </>
          )}
        </div>
      ) : (
        <>
          <Tier tierKey="tier1" targets={tradeTargets.tier1} />
          <Tier tierKey="tier2" targets={tradeTargets.tier2} />
          <Tier tierKey="tier3" targets={tradeTargets.tier3} />
        </>
      )}
    </div>
  );
}
