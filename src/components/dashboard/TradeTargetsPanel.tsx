/**
 * TradeTargetsPanel.tsx
 *
 * Presentation layer for the Trade Targets feature. All filtering/ranking lives
 * in src/lib/tradeTargets.ts — this file only renders the typed model and owns
 * UI state (the strategy toggle and the active archetype tab).
 */
import { Component, useMemo, useState } from "react";
import { styles } from "../../styles";
import {
  buildTradeTargetsModel,
  resolveStrategy,
  type Strategy,
  type TradeArchetypeId,
  type TradeTarget,
  type ValueGap,
  type ArchetypeResult,
  type OcOutlook,
} from "../../lib/tradeTargets";

interface PanelProps {
  myRosterId: number | string;
  leagueTeams: any[] | null | undefined;
  leagueContext: any;
  tradeMarket: any;
}

const ACCENT = "#00f5a0";
const REBUILD = "#7b8cff";
const WARN = "#ff6b35";
const PHASE_COLOR: Record<string, string> = {
  contender: "#00f5a0",
  retool: "#ffd84d",
  rebuild: "#ff6b35",
};
const FAIRNESS_COLOR: Record<string, string> = {
  Fair: "#00f5a0",
  "Slight edge": "#ffd84d",
  Uneven: "#ff9f43",
  Lopsided: "#ff6b35",
  "Sell high": "#00f5a0",
  "Sell before decline": "#ffd84d",
  "Shop now": "#ffd84d",
};

// ---------------------------------------------------------------------------
// Small presentational atoms
// ---------------------------------------------------------------------------

function PhaseBadge({ phase }: { phase: string | null }) {
  if (!phase) return null;
  const c = PHASE_COLOR[phase] || "#a0a8c0";
  return (
    <span
      style={{
        fontSize: 9,
        letterSpacing: 1,
        padding: "1px 6px",
        borderRadius: 2,
        color: c,
        background: `${c}18`,
        border: `1px solid ${c}44`,
      }}
    >
      {phase}
    </span>
  );
}

function OcChip({ oc }: { oc: OcOutlook | null }) {
  if (!oc) return null;
  const pct = oc.multiplierPct;
  if (typeof pct !== "number" || !Number.isFinite(pct) || Math.abs(pct) < 1) return null;
  const up = pct > 0;
  const color = up ? ACCENT : WARN;
  const schemeText = oc.schemes?.length ? ` · ${oc.schemes.join("/")}` : "";
  return (
    <span
      title={`Year-1 environment under ${oc.ocName}${schemeText}`}
      style={{
        fontSize: 9,
        letterSpacing: 0.3,
        padding: "2px 7px",
        borderRadius: 2,
        color,
        background: `${color}14`,
        border: `1px solid ${color}38`,
        whiteSpace: "nowrap",
      }}
    >
      {oc.ocName}: {up ? "+" : ""}
      {pct.toFixed(1)}% Yr-1
      {oc.projectedPpg != null ? ` · ${oc.projectedPpg} proj PPG` : ""}
    </span>
  );
}

function AssetChip({ asset }: { asset: { type: string; label: string; value: number } }) {
  const isPick = asset.type === "pick";
  const color = isPick ? REBUILD : ACCENT;
  return (
    <span
      style={{
        fontSize: 11,
        padding: "3px 9px",
        borderRadius: 3,
        background: `${color}12`,
        color: "#e8e8f0",
        border: `1px solid ${color}33`,
        whiteSpace: "nowrap",
      }}
    >
      {asset.label}
      {asset.value ? <span style={{ color: "#808898", marginLeft: 6 }}>{asset.value}</span> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The "Value Gap" visualizer — Market (FC) vs. Production/Expected (RA)
// ---------------------------------------------------------------------------

function ValueGapBar({ gap }: { gap: ValueGap }) {
  const max = Math.max(gap.marketValue, gap.expectedValue, 1);
  const marketW = `${Math.round((gap.marketValue / max) * 100)}%`;
  const expectedW = `${Math.round((gap.expectedValue / max) * 100)}%`;
  const undervalued = gap.direction === "undervalued";
  const overvalued = gap.direction === "overvalued";
  const gapColor = undervalued ? ACCENT : overvalued ? WARN : "#808898";

  const Row = ({ label, width, color }: { label: string; width: string; color: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
      <span style={{ fontSize: 8, letterSpacing: 0.5, color: "#808898", width: 64, flexShrink: 0 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>
        <div style={{ width, height: "100%", background: color, borderRadius: 2 }} />
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: 9, letterSpacing: 1.5, color: "#94a3b8" }}>VALUE GAP</span>
        {gap.direction !== "fair" && (
          <span
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              padding: "2px 7px",
              borderRadius: 2,
              color: gapColor,
              background: `${gapColor}18`,
              border: `1px solid ${gapColor}44`,
            }}
          >
            {undervalued ? "↑" : "↓"} {Math.abs(gap.deltaPct)}% {undervalued ? "undervalued" : "overpriced"}
          </span>
        )}
      </div>
      <Row label={`MARKET ${gap.marketValue}`} width={marketW} color="#7b8cff" />
      <Row label={`PRODUCTION ${gap.expectedValue}`} width={expectedW} color={gapColor} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Target card
// ---------------------------------------------------------------------------

function TargetCard({ target }: { target: TradeTarget }) {
  const [open, setOpen] = useState(false);
  const p = target.player;
  const fairColor = FAIRNESS_COLOR[target.fairnessLabel] || "#a0a8c0";
  const isSell = target.archetype === "sell-high";

  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 5,
        marginBottom: 10,
        background: "rgba(255,255,255,0.02)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, color: "#e8e8f0", marginBottom: 3 }}>
            {p.name}{" "}
            <span style={{ fontSize: 10, color: "#808898" }}>
              {p.position}
              {p.age ? ` · ${p.age}yo` : ""}
              {p.archetype ? ` · ${p.archetype}` : ""}
            </span>
          </div>
          <div
            style={{
              fontSize: 10,
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <span>{isSell ? "on your roster" : `from ${target.owner.label}`}</span>
            {!isSell && <PhaseBadge phase={target.owner.phase} />}
            {!isSell && target.owner.matchScore >= 60 && (
              <span style={{ color: ACCENT }}>matchable partner</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 9,
              letterSpacing: 0.5,
              padding: "2px 7px",
              borderRadius: 2,
              color: fairColor,
              background: `${fairColor}18`,
              border: `1px solid ${fairColor}44`,
            }}
          >
            {target.fairnessLabel}
          </span>
          <span style={styles.tag(target.valueGap.marketValue >= 50 ? ACCENT : "#ffd84d")}>
            {isSell ? target.outgoingValue : target.incomingValue}
          </span>
          <span style={{ color: "#606878", fontSize: 14 }}>{open ? "−" : "+"}</span>
        </div>
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          {(p.ocOutlook || p.ppg) && (
            <div
              style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}
            >
              {p.ppg ? (
                <span style={{ fontSize: 10, color: "#94a3b8" }}>{p.ppg} PPG last season</span>
              ) : null}
              <OcChip oc={p.ocOutlook} />
            </div>
          )}

          <ValueGapBar gap={target.valueGap} />

          {!isSell && (
            <>
              <div style={{ fontSize: 9, color: ACCENT, letterSpacing: 1.5, marginBottom: 6 }}>
                YOU SEND — {target.outgoingValue} value
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 10 }}>
                {target.send.map((a, i) => (
                  <AssetChip key={`s-${i}`} asset={a} />
                ))}
              </div>
              <div style={{ fontSize: 9, color: REBUILD, letterSpacing: 1.5, marginBottom: 6 }}>
                YOU GET — {target.incomingValue} value
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
                {target.receive.map((a, i) => (
                  <AssetChip key={`r-${i}`} asset={a} />
                ))}
              </div>
            </>
          )}

          {target.rationale.positives.length > 0 && (
            <div style={{ marginBottom: target.rationale.concerns.length ? 8 : 0 }}>
              <div style={{ fontSize: 9, color: ACCENT, letterSpacing: 1.5, marginBottom: 4 }}>
                {isSell ? "WHY SELL NOW" : "WHY IT WORKS FOR YOU"}
              </div>
              {target.rationale.positives.map((line, i) => (
                <div
                  key={`p-${i}`}
                  style={{ fontSize: 10, color: "#d1d7ea", lineHeight: 1.55, marginBottom: 3 }}
                >
                  <span style={{ color: ACCENT, marginRight: 6 }}>+</span>
                  {line}
                </div>
              ))}
            </div>
          )}

          {target.rationale.concerns.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: WARN, letterSpacing: 1.5, marginBottom: 4 }}>
                WATCH OUT
              </div>
              {target.rationale.concerns.map((line, i) => (
                <div
                  key={`c-${i}`}
                  style={{ fontSize: 10, color: "#d1d7ea", lineHeight: 1.55, marginBottom: 3 }}
                >
                  <span style={{ color: WARN, marginRight: 6 }}>−</span>
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

function StrategyToggle({
  strategy,
  detected,
  onChange,
}: {
  strategy: Strategy;
  detected: Strategy;
  onChange: (s: Strategy) => void;
}) {
  const btn = (val: Strategy, label: string, color: string) => {
    const active = strategy === val;
    return (
      <button
        type="button"
        onClick={() => onChange(val)}
        style={{
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          padding: "7px 16px",
          border: `1px solid ${active ? color : "rgba(255,255,255,0.15)"}`,
          background: active ? `${color}1a` : "transparent",
          color: active ? color : "#c3c9dd",
          cursor: "pointer",
          borderRadius: 4,
          fontWeight: active ? 700 : 400,
        }}
      >
        {label}
        {detected === val && (
          <span style={{ fontSize: 8, opacity: 0.7, marginLeft: 6 }}>(detected)</span>
        )}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {btn("contender", "Contender", ACCENT)}
      {btn("rebuilder", "Rebuilder", REBUILD)}
    </div>
  );
}

function ArchetypeTabs({
  order,
  results,
  active,
  onChange,
}: {
  order: TradeArchetypeId[];
  results: Record<TradeArchetypeId, ArchetypeResult>;
  active: TradeArchetypeId;
  onChange: (a: TradeArchetypeId) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        borderBottom: "1px solid rgba(255,255,255,0.1)",
        marginBottom: 16,
      }}
    >
      {order.map((id) => {
        const r = results[id];
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            style={styles.tab(isActive)}
          >
            {r.title}
            <span style={{ marginLeft: 6, opacity: 0.6 }}>{r.targets.length}</span>
            {r.primary && (
              <span style={{ color: ACCENT, marginLeft: 5, fontSize: 8 }}>●</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function Loading() {
  return (
    <div style={{ ...styles.card }}>
      <div style={{ fontSize: 11, color: "#808898" }}>Loading league rosters…</div>
    </div>
  );
}

function EmptyArchetype({ blurb }: { blurb: string }) {
  return (
    <div
      style={{
        padding: "28px 18px",
        textAlign: "center",
        border: "1px dashed rgba(255,255,255,0.12)",
        borderRadius: 5,
      }}
    >
      <div style={{ fontSize: 12, color: "#c3c9dd", marginBottom: 6 }}>
        No clear targets in this lane right now.
      </div>
      <div style={{ fontSize: 10, color: "#808898", lineHeight: 1.5 }}>{blurb}</div>
    </div>
  );
}

class TradeTargetsErrorBoundary extends Component<{ children: any }, { error: Error | null }> {
  constructor(props: { children: any }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ ...styles.card, borderColor: `${WARN}44` }}>
          <div style={{ fontSize: 12, color: WARN, marginBottom: 4 }}>
            Trade Targets failed to render.
          </div>
          <div style={{ fontSize: 10, color: "#808898" }}>{String(this.state.error.message)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

function PanelInner({ myRosterId, leagueTeams, leagueContext, tradeMarket }: PanelProps) {
  const [strategyOverride, setStrategyOverride] = useState<Strategy | null>(null);
  const [active, setActive] = useState<TradeArchetypeId | null>(null);

  const detected: Strategy = useMemo(() => {
    const myTeam = leagueTeams?.find((t) => t.rosterId === myRosterId);
    return resolveStrategy(myTeam?.teamPhase?.phase ?? null);
  }, [leagueTeams, myRosterId]);

  const strategy = strategyOverride ?? detected;

  const model = useMemo(() => {
    const myTeam = leagueTeams?.find((t) => t.rosterId === myRosterId);
    return buildTradeTargetsModel(myTeam, leagueTeams, leagueContext, tradeMarket, strategy);
  }, [leagueTeams, myRosterId, leagueContext, tradeMarket, strategy]);

  if (!Array.isArray(leagueTeams)) return <Loading />;
  if (!model) return null;

  // Default to the first archetype that actually has targets so the user never
  // lands on an empty primary tab (e.g. a young rebuilder with no vets to insulate).
  const firstNonEmpty =
    model.order.find((id) => model.results[id].targets.length) ?? model.order[0];
  const activeId: TradeArchetypeId = active ?? firstNonEmpty;
  const activeResult = model.results[activeId];
  const totalTargets = model.order.reduce((n, id) => n + model.results[id].targets.length, 0);

  return (
    <div style={{ marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 14,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ ...styles.sectionLabel, marginBottom: 6 }}>Trade Targets</div>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6, maxWidth: 460 }}>
            Market-inefficiency buy/sell ideas with a fair package and a Market-vs-Production value
            gap. Flip the strategy to invert the recommendations.
          </div>
        </div>
        <StrategyToggle
          strategy={strategy}
          detected={detected}
          onChange={(s) => setStrategyOverride(s)}
        />
      </div>

      {totalTargets === 0 ? (
        <EmptyArchetype blurb="Your roster and the current market don't surface clear targets. Try flipping the strategy toggle." />
      ) : (
        <>
          <ArchetypeTabs
            order={model.order}
            results={model.results}
            active={activeId}
            onChange={setActive}
          />
          {activeResult.targets.length === 0 ? (
            <EmptyArchetype blurb={activeResult.blurb} />
          ) : (
            <>
              <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 12, lineHeight: 1.5 }}>
                {activeResult.blurb}
              </div>
              {activeResult.targets.map((t) => (
                <TargetCard key={t.id} target={t} />
              ))}
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function TradeTargetsPanel(props: PanelProps) {
  return (
    <TradeTargetsErrorBoundary>
      <PanelInner {...props} />
    </TradeTargetsErrorBoundary>
  );
}
