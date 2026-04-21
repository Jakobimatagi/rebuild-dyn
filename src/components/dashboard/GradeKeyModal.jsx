import { ARCHETYPE_DESC, ARCHETYPE_META } from "../../constants";
import { useModalBehavior } from "../../lib/useModalBehavior";
import { styles } from "../../styles";

export default function GradeKeyModal({ onClose }) {
  const modalRef = useModalBehavior(onClose);

  return (
    <div
      onClick={onClose}
      className="dyn-modal-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.75)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="dyn-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grade-key-title"
        style={{
          background: "#0d0d16",
          border: "1px solid rgba(0,245,160,0.18)",
          borderRadius: 6,
          padding: 32,
          maxWidth: 520,
          width: "90%",
          position: "relative",
          maxHeight: "88vh",
          overflowY: "auto",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close grade key"
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            background: "transparent",
            border: "none",
            color: "#d1d7ea",
            fontSize: 18,
            cursor: "pointer",
            lineHeight: 1,
          }}
        >
          ✕
        </button>

        <div
          id="grade-key-title"
          style={{
            fontSize: 10,
            letterSpacing: 4,
            color: "#00f5a0",
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          Grade Key
        </div>

        <div
          style={{
            fontSize: 11,
            letterSpacing: 3,
            color: "#fff",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Position Room Rankings
        </div>
        <div
          style={{
            fontSize: 11,
            color: "#c8cfe3",
            marginBottom: 12,
            lineHeight: 1.4,
          }}
        >
          Every team's position rooms are ranked 1..N across the league. Room
          quality blends dynasty value with 2024 production (30/70), weighted
          near-flat across the starter+flex+depth pool. Production drives
          rank — youth/upside lives in team phase, not here.
        </div>
        {[
          {
            grade: "Top",
            color: "#00f5a0",
            label: "Top third",
            desc: "Best rooms in the league at this position",
          },
          {
            grade: "Mid",
            color: "#ffd84d",
            label: "Middle third",
            desc: "Average rooms — playable but not difference-makers",
          },
          {
            grade: "Bot",
            color: "#ff6b35",
            label: "Bottom third",
            desc: "Below-league rooms — upgrade target",
          },
        ].map(({ grade, color, label, desc }) => (
          <div
            key={grade}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: 44,
                height: 28,
                flexShrink: 0,
                borderRadius: 3,
                background: `${color}18`,
                border: `1px solid ${color}55`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: 11,
                color,
              }}
            >
              {grade}
            </div>
            <div>
              <div style={{ fontSize: 12, color: "#e8e8f0" }}>{label}</div>
              <div style={{ fontSize: 11, color: "#d1d7ea", marginTop: 2 }}>
                {desc}
              </div>
            </div>
          </div>
        ))}

        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            margin: "20px 0",
          }}
        />

        <div
          style={{
            fontSize: 11,
            letterSpacing: 3,
            color: "#fff",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Player Verdicts (composite 0–100)
        </div>
        {[
          {
            verdict: "buy",
            color: "#00f5a0",
            range: "≥ 72",
            desc: "Young, producing, healthy — priority to keep or acquire",
          },
          {
            verdict: "hold",
            color: "#ffd84d",
            range: "52–71",
            desc: "Solid contributor but some concern — monitor before trading",
          },
          {
            verdict: "sell",
            color: "#ff6b35",
            range: "35–51",
            desc: "Aging or declining — explore trade value now",
          },
          {
            verdict: "cut",
            color: "#ff2d55",
            range: "< 35",
            desc: "Low dynasty value — move on or use as trade throw-in",
          },
        ].map(({ verdict, color, range, desc }) => (
          <div
            key={verdict}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                padding: "3px 10px",
                borderRadius: 2,
                fontSize: 10,
                letterSpacing: 2,
                fontWeight: 700,
                textTransform: "uppercase",
                background: `${color}22`,
                color,
                border: `1px solid ${color}44`,
                flexShrink: 0,
                alignSelf: "flex-start",
              }}
            >
              {verdict}
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#fff" }}>{range}</div>
              <div style={{ fontSize: 11, color: "#fff", marginTop: 2 }}>
                {desc}
              </div>
            </div>
          </div>
        ))}

        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            margin: "20px 0",
          }}
        />

        <div
          style={{
            fontSize: 11,
            letterSpacing: 3,
            color: "#fff",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Player Archetypes
        </div>
        {Object.entries(ARCHETYPE_META).map(([name, { color }]) => (
          <div
            key={name}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              marginBottom: 9,
            }}
          >
            <span
              style={{
                ...styles.tag(color),
                fontSize: 8,
                flexShrink: 0,
                alignSelf: "flex-start",
                marginTop: 1,
              }}
            >
              {name}
            </span>
            <div style={{ fontSize: 11, color: "#d1d7ea", lineHeight: 1.4 }}>
              {ARCHETYPE_DESC[name]}
            </div>
          </div>
        ))}

        <div
          style={{
            height: 1,
            background: "rgba(255,255,255,0.06)",
            margin: "20px 0",
          }}
        />

        <div
          style={{
            fontSize: 11,
            letterSpacing: 3,
            color: "#fff",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Score Components
        </div>
        {[
          {
            label: "Age",
            color: "#7b8cff",
            pct: "35%",
            desc: "Dynasty  runway — position-adjusted peak/decline curves",
          },
          {
            label: "Production",
            color: "#00f5a0",
            pct: "30%",
            desc: "2024 PPR pts/game vs elite positional threshold",
          },
          {
            label: "Avail",
            color: "#ffd84d",
            pct: "15%",
            desc: "Games played out of 17 + injury status penalty",
          },
          {
            label: "Trend",
            color: "#ff6b35",
            pct: "10%",
            desc: "2024 vs 2023 PPG — rising or declining production",
          },
          {
            label: "Situation",
            color: "#c084fc",
            pct: "10%",
            desc: "Depth chart starter status and team/FA situation",
          },
        ].map(({ label, color, pct, desc }) => (
          <div
            key={label}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 14,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 28,
                flexShrink: 0,
                fontSize: 10,
                color,
                fontWeight: 700,
                paddingTop: 2,
              }}
            >
              {pct}
            </div>
            <div>
              <div style={{ fontSize: 12, color }}>{label}</div>
              <div style={{ fontSize: 11, color: "#fff", marginTop: 1 }}>
                {desc}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
