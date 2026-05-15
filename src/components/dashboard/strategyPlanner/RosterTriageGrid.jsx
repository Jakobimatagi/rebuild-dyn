import { styles } from "../../../styles";
import { getColor } from "../../../lib/analysis";

const BUCKET_META = {
  buildAround: { label: "Build Around", color: "#00f5a0" },
  sellNow: { label: "Sell Now", color: "#ff6b35" },
  stashes: { label: "Stashes", color: "#06b6d4" },
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

function ColumnHeader({ color, label, count }) {
  return (
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
          color,
          marginBottom: 0,
        }}
      >
        {label}
      </div>
      <span
        style={{
          fontSize: 10,
          color: "#c8cfe3",
          fontWeight: 700,
        }}
      >
        {count}
      </span>
    </div>
  );
}

function EmptyMessage({ children }) {
  return (
    <div style={{ fontSize: 11, color: "#d1d7ea", padding: "8px 0" }}>
      {children}
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
      <ColumnHeader color={meta.color} label={meta.label} count={entries.length} />
      {entries.length === 0 ? (
        <EmptyMessage>No players in this bucket.</EmptyMessage>
      ) : (
        entries.map((entry) => (
          <TriagePlayerCard key={entry.player.id} entry={entry} />
        ))
      )}
    </div>
  );
}

function SubSectionHeader({ label, count, color }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: 12,
        marginBottom: 6,
        paddingBottom: 4,
        borderBottom: `1px solid ${color}30`,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <span style={{ fontSize: 10, color: "#c8cfe3", fontWeight: 700 }}>
        {count}
      </span>
    </div>
  );
}

function HoldColumn({ matched, fallthrough }) {
  const meta = BUCKET_META.holdReassess;
  const total = matched.length + fallthrough.length;
  const hasMatched = matched.length > 0;
  const hasFallthrough = fallthrough.length > 0;
  return (
    <div
      style={{
        ...styles.card,
        borderColor: `${meta.color}40`,
        minHeight: 260,
        marginBottom: 0,
      }}
    >
      <ColumnHeader color={meta.color} label={meta.label} count={total} />
      {!hasMatched && !hasFallthrough && (
        <EmptyMessage>No players in this bucket.</EmptyMessage>
      )}
      {hasMatched && (
        <>
          {hasFallthrough && (
            <SubSectionHeader
              label="Path Holds"
              count={matched.length}
              color={meta.color}
            />
          )}
          {matched.map((entry) => (
            <TriagePlayerCard key={entry.player.id} entry={entry} />
          ))}
        </>
      )}
      {hasFallthrough && (
        <>
          <SubSectionHeader
            label="Outside Path"
            count={fallthrough.length}
            color="#8a91a8"
          />
          {fallthrough.map((entry) => (
            <TriagePlayerCard key={entry.player.id} entry={entry} />
          ))}
        </>
      )}
    </div>
  );
}

export default function RosterTriageGrid({ triage }) {
  if (!triage) return null;
  // Backwards-compat: pre-split plans have no stashes/holdDefault fields.
  const stashes = triage.stashes || [];
  const holdDefault = triage.holdDefault || [];
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
        <Column bucketKey="stashes" entries={stashes} />
        <HoldColumn matched={triage.holdReassess} fallthrough={holdDefault} />
      </div>
    </div>
  );
}
