import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SCORING_WEIGHTS } from "../../lib/analysis";

const FIELDS = [
  { key: "age", label: "Age" },
  { key: "prod", label: "Production" },
  { key: "avail", label: "Availability" },
  { key: "trend", label: "Trend" },
  { key: "situ", label: "Situation" },
];

export default function ScoreWeightsModal({
  initialWeights = DEFAULT_SCORING_WEIGHTS,
  onClose,
  onConfirm,
  isConfirming = false,
}) {
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const [draft, setDraft] = useState({
    age: Number(initialWeights.age ?? DEFAULT_SCORING_WEIGHTS.age),
    prod: Number(initialWeights.prod ?? DEFAULT_SCORING_WEIGHTS.prod),
    avail: Number(initialWeights.avail ?? DEFAULT_SCORING_WEIGHTS.avail),
    trend: Number(initialWeights.trend ?? DEFAULT_SCORING_WEIGHTS.trend),
    situ: Number(initialWeights.situ ?? DEFAULT_SCORING_WEIGHTS.situ),
  });

  const total = useMemo(
    () => draft.age + draft.prod + draft.avail + draft.trend + draft.situ,
    [draft],
  );

  const normalized = useMemo(() => {
    const t = Math.max(1, total);
    return {
      age: Math.round((draft.age / t) * 100),
      prod: Math.round((draft.prod / t) * 100),
      avail: Math.round((draft.avail / t) * 100),
      trend: Math.round((draft.trend / t) * 100),
      situ: Math.round((draft.situ / t) * 100),
    };
  }, [draft, total]);

  function handleChange(key, value) {
    setDraft((prev) => ({ ...prev, [key]: Number(value) }));
  }

  return (
    <div
      onClick={() => !isConfirming && onClose()}
      className="dyn-modal-backdrop"
      role="dialog"
      aria-label="Adjust scoring weights"
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
        onClick={(event) => event.stopPropagation()}
        className="dyn-modal"
        style={{
          background: "#0d0d16",
          border: "1px solid rgba(0,245,160,0.18)",
          borderRadius: 6,
          padding: 28,
          maxWidth: 560,
          width: "92%",
          position: "relative",
          maxHeight: "88vh",
          overflowY: "auto",
        }}
      >
        <button
          onClick={onClose}
          disabled={isConfirming}
          aria-label="Close scoring weights"
          style={{
            position: "absolute",
            top: 14,
            right: 14,
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
          style={{
            fontSize: 10,
            letterSpacing: 4,
            color: "#00f5a0",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          Scoring Weights
        </div>

        <div
          style={{
            fontSize: 12,
            color: "#d9deef",
            marginBottom: 18,
            lineHeight: 1.7,
          }}
        >
          Move sliders, then confirm to recalculate every player and trade
          suggestion. Values are auto-normalized to 100%.
        </div>

        {FIELDS.map((field) => (
          <div key={field.key} style={{ marginBottom: 16 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
                fontSize: 12,
                color: "#e8e8f0",
              }}
            >
              <span>{field.label}</span>
              <span style={{ color: "#c8cfe3" }}>
                {draft[field.key]}% raw · {normalized[field.key]}% applied
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={draft[field.key]}
              onChange={(event) => handleChange(field.key, event.target.value)}
              style={{ width: "100%" }}
            />
          </div>
        ))}

        <div style={{ fontSize: 11, color: "#c8cfe3", marginTop: 8 }}>
          Raw total: {total}%
        </div>

        <div
          style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}
        >
          <button
            className="dyn-btn-ghost"
            style={{
              background: "transparent",
              color: "#eef1ff",
              border: "1px solid rgba(255,255,255,0.24)",
              padding: "8px 14px",
              fontSize: 10,
              letterSpacing: 2,
              textTransform: "uppercase",
              borderRadius: 3,
            }}
            disabled={isConfirming}
            onClick={() => setDraft({ ...DEFAULT_SCORING_WEIGHTS })}
          >
            Reset
          </button>
          <button
            className="dyn-btn"
            style={{
              background: "#00f5a0",
              color: "#050508",
              border: "none",
              padding: "10px 18px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: "uppercase",
              borderRadius: 3,
            }}
            disabled={isConfirming}
            onClick={() => onConfirm(draft)}
          >
            {isConfirming ? (
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              >
                <span className="dyn-spinner" />
                Recalculating...
              </span>
            ) : (
              "Confirm & Recalculate"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
