import { styles } from "../../../styles";
import { getColor } from "../../../lib/analysis";

const BUCKET_META = {
  buildAround: { label: "Build Around", color: "#00f5a0" },
  sellNow: { label: "Sell Now", color: "#ff6b35" },
  holdReassess: { label: "Hold / Reassess", color: "#ffd84d" },
};

function TriagePlayerCard({ entry }) {
  const p = entry.player;
  return (
    <div
      style={{
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "8px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              color: "#e8e8f0",
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {p.name}
          </div>
          <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 2 }}>
            {p.position} · {p.team || "FA"} · {p.age}yo · score {p.score}
          </div>
        </div>
        <span style={styles.tag(getColor(p.verdict))}>{p.verdict}</span>
      </div>
      {entry.rationale && (
        <div
          style={{
            fontSize: 10,
            color: "#d9deef",
            marginTop: 4,
            fontStyle: "italic",
            lineHeight: 1.4,
          }}
        >
          {entry.rationale}
        </div>
      )}
    </div>
  );
}

function Column({ bucketKey, entries }) {
  const meta = BUCKET_META[bucketKey];
  return (
    <div
      style={{
        ...styles.card,
        borderColor: `${meta.color}40`,
        minHeight: 260,
        marginBottom: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            ...styles.sectionLabel,
            color: meta.color,
            marginBottom: 0,
          }}
        >
          {meta.label}
        </div>
        <span
          style={{
            fontSize: 10,
            color: "#c8cfe3",
            fontWeight: 700,
          }}
        >
          {entries.length}
        </span>
      </div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 11, color: "#d1d7ea", padding: "8px 0" }}>
          No players in this bucket.
        </div>
      ) : (
        entries.map((entry) => (
          <TriagePlayerCard key={entry.player.id} entry={entry} />
        ))
      )}
    </div>
  );
}

export default function RosterTriageGrid({ triage }) {
  if (!triage) return null;
  return (
    <div>
      <div style={styles.sectionLabel}>1 — Roster Triage</div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <Column bucketKey="buildAround" entries={triage.buildAround} />
        <Column bucketKey="sellNow" entries={triage.sellNow} />
        <Column bucketKey="holdReassess" entries={triage.holdReassess} />
      </div>
    </div>
  );
}
