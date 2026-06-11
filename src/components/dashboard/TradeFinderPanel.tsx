/**
 * TradeFinderPanel.tsx
 *
 * "Find Trades" — the directed counterpart to Trade Targets. You hand-pick the
 * assets you want to ship from your own roster, hit Find Trades, and the panel
 * surfaces league partners who need what's going out plus the fair return each
 * would send back, shaped by your strategy.
 *
 * All filtering / valuation / ranking lives in src/lib/tradeFinder.ts — this
 * file owns UI state (the send list, the strategy toggle, the results) and
 * renders the typed result.
 */
import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { styles } from "../../styles";
import { getAssetTradeValue } from "../../lib/tradeEngine";
import {
  findTrades,
  resolveStrategy,
  type Strategy,
  type SendAsset,
  type FindTradesResult,
  type TradeIdea,
  type ReturnAsset,
} from "../../lib/tradeFinder";

interface PanelProps {
  myRosterId: number | string;
  leagueTeams: any[] | null | undefined;
  leagueContext: any;
  tradeMarket: any;
}

const ACCENT = "#00f5a0";
const REBUILD = "#7b8cff";
const WARN = "#ff6b35";
const GOLD = "#ffd84d";

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
};

// ---------------------------------------------------------------------------
// Searchable picker (self-contained — adds an asset to the send list)
// ---------------------------------------------------------------------------

interface Opt {
  key: string;
  searchText: string;
  asset: SendAsset;
  render: () => JSX.Element;
}

function AssetPicker({
  options,
  onPick,
  disabledKeys,
}: {
  options: Opt[];
  onPick: (a: SendAsset) => void;
  disabledKeys: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const pool = options.filter((o) => !disabledKeys.has(o.key));
    if (!query.trim()) return pool;
    const q = query.toLowerCase();
    return pool.filter((o) => o.searchText.toLowerCase().includes(q));
  }, [options, query, disabledKeys]);

  useEffect(() => setCursor(0), [filtered]);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const commit = (opt: Opt) => {
    onPick(opt.asset);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={query}
        placeholder="Add a player or pick to send…"
        autoComplete="off"
        style={{
          width: "100%",
          background: "rgba(0,245,160,0.04)",
          border: `1px solid ${open ? `${ACCENT}55` : "rgba(0,245,160,0.18)"}`,
          color: "#e8e8f0",
          padding: "9px 12px",
          fontSize: 12,
          borderRadius: 3,
          outline: "none",
          boxSizing: "border-box",
        }}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter" && filtered[cursor]) {
            e.preventDefault();
            commit(filtered[cursor]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#0d0d18",
            border: "1px solid rgba(0,245,160,0.22)",
            borderRadius: 4,
            zIndex: 50,
            maxHeight: 280,
            overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
          }}
        >
          {filtered.map((opt, i) => (
            <div
              key={opt.key}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(opt);
              }}
              onMouseEnter={() => setCursor(i)}
              style={{
                padding: "8px 12px",
                background: i === cursor ? "rgba(0,245,160,0.08)" : "transparent",
                cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {opt.render()}
            </div>
          ))}
        </div>
      )}
      {open && query && filtered.length === 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "#0d0d18",
            border: "1px solid rgba(0,245,160,0.22)",
            borderRadius: 4,
            zIndex: 50,
            padding: "10px 12px",
          }}
        >
          <span style={{ fontSize: 11, color: "#606878" }}>No matches</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Atoms
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

function ReturnChip({ asset }: { asset: ReturnAsset }) {
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
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {asset.label}
      {asset.value ? <span style={{ color: "#808898" }}>{asset.value}</span> : null}
      {asset.note ? (
        <span style={{ color, fontSize: 9, letterSpacing: 0.3 }}>· {asset.note}</span>
      ) : null}
    </span>
  );
}

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

// ---------------------------------------------------------------------------
// Result card
// ---------------------------------------------------------------------------

function IdeaCard({ idea }: { idea: TradeIdea }) {
  const [open, setOpen] = useState(false);
  const fairColor = FAIRNESS_COLOR[idea.fairnessLabel] || "#a0a8c0";
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
          <div
            style={{
              fontSize: 13,
              color: "#e8e8f0",
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {idea.partner.label}
            <PhaseBadge phase={idea.partner.phase} />
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8" }}>
            {idea.matchedNeeds.length > 0 ? (
              <>
                needs{" "}
                <span style={{ color: WARN }}>{idea.matchedNeeds.join(" / ")}</span>
              </>
            ) : (
              "open to capital"
            )}
            {" · you get "}
            {idea.youGet.map((a) => a.label.split(" (")[0]).join(", ")}
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
            {idea.fairnessLabel}
          </span>
          <span style={{ color: "#606878", fontSize: 14 }}>{open ? "−" : "+"}</span>
        </div>
      </button>

      {open && (
        <div style={{ padding: "0 14px 14px" }}>
          <div
            className="dyn-grid-2"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 12 }}
          >
            <div>
              <div style={{ fontSize: 9, color: GOLD, letterSpacing: 1.5, marginBottom: 6 }}>
                YOU SEND — {idea.outgoingValue} value
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {idea.youSend.map((a, i) => (
                  <ReturnChip key={`s-${i}`} asset={a} />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 9, color: REBUILD, letterSpacing: 1.5, marginBottom: 6 }}>
                YOU GET — {idea.incomingValue} value
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {idea.youGet.map((a, i) => (
                  <ReturnChip key={`r-${i}`} asset={a} />
                ))}
              </div>
            </div>
          </div>

          {idea.rationale.positives.length > 0 && (
            <div style={{ marginBottom: idea.rationale.concerns.length ? 8 : 0 }}>
              <div style={{ fontSize: 9, color: ACCENT, letterSpacing: 1.5, marginBottom: 4 }}>
                WHY IT WORKS
              </div>
              {idea.rationale.positives.map((line, i) => (
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

          {idea.rationale.concerns.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: WARN, letterSpacing: 1.5, marginBottom: 4 }}>
                WATCH OUT
              </div>
              {idea.rationale.concerns.map((line, i) => (
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
// Panel
// ---------------------------------------------------------------------------

function PanelInner({ myRosterId, leagueTeams, leagueContext, tradeMarket }: PanelProps) {
  const myTeam = useMemo(
    () => leagueTeams?.find((t) => String(t.rosterId) === String(myRosterId)),
    [leagueTeams, myRosterId],
  );

  const detected: Strategy = useMemo(
    () => resolveStrategy(myTeam?.teamPhase?.phase ?? null),
    [myTeam],
  );
  const [strategyOverride, setStrategyOverride] = useState<Strategy | null>(null);
  const strategy = strategyOverride ?? detected;

  const [send, setSend] = useState<SendAsset[]>([]);
  const [result, setResult] = useState<FindTradesResult | null>(null);
  const [searched, setSearched] = useState(false);

  // Build the pick-from-your-roster options (players first, then near-term picks).
  const options = useMemo<Opt[]>(() => {
    if (!myTeam) return [];
    const myPhase = myTeam.teamPhase?.phase ?? null;
    const currentYear = new Date().getFullYear();

    const playerOpts: Opt[] = [...(myTeam.enriched || [])]
      .sort((a: any, b: any) => b.score - a.score)
      .map((p: any) => ({
        key: `player|${p.id}`,
        searchText: `${p.name} ${p.position}`,
        asset: { ...p, type: "player" } as SendAsset,
        render: () => (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <span style={{ fontSize: 12, color: "#e8e8f0" }}>{p.name}</span>
              <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 8 }}>
                {p.position} · {p.age}yo
              </span>
            </div>
            <span style={{ fontSize: 11, color: p.score >= 70 ? ACCENT : "#94a3b8" }}>{p.score}</span>
          </div>
        ),
      }));

    const emptyMarket = new Map();
    const pickOpts: Opt[] = (myTeam.picks || [])
      .filter((pk: any) => pk.round <= 4 && Number(pk.season) <= currentYear + 2)
      .map((pk: any) => {
        // Value on the same trade scale the results use (FC-aware via pickFcValue).
        const val = getAssetTradeValue(
          { ...pk, type: "pick", ownerPhase: myPhase },
          emptyMarket,
          leagueContext,
          tradeMarket,
        );
        const roundColor = pk.round === 1 ? ACCENT : pk.round === 2 ? GOLD : "#c8cfe3";
        return {
          key: `pick|${pk.label}`,
          searchText: pk.label,
          asset: { ...pk, type: "pick", ownerPhase: myPhase, value: val } as SendAsset,
          render: () => (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12, color: roundColor }}>{pk.label}</span>
              <span style={{ fontSize: 10, color: "#94a3b8" }}>~{val} pts</span>
            </div>
          ),
        };
      });

    return [...playerOpts, ...pickOpts];
  }, [myTeam, leagueContext, tradeMarket]);

  const sendKeys = useMemo(
    () => new Set(send.map((a) => (a.type === "pick" ? `pick|${a.label}` : `player|${a.id}`))),
    [send],
  );

  const addAsset = (a: SendAsset) =>
    setSend((prev) => {
      const key = a.type === "pick" ? `pick|${a.label}` : `player|${a.id}`;
      if (prev.some((x) => (x.type === "pick" ? `pick|${x.label}` : `player|${x.id}`) === key))
        return prev;
      return [...prev, a];
    });

  const removeAsset = (idx: number) => setSend((prev) => prev.filter((_, i) => i !== idx));

  const runSearch = () => {
    setSearched(true);
    setResult(findTrades(myTeam, leagueTeams, send, strategy, leagueContext, tradeMarket));
  };

  // A fresh search is needed whenever the inputs change — clear stale results so
  // the button is the single source of truth for "these results match my inputs".
  useEffect(() => {
    setResult(null);
    setSearched(false);
  }, [send, strategy]);

  if (!Array.isArray(leagueTeams)) {
    return (
      <div style={styles.card}>
        <div style={{ fontSize: 11, color: "#808898" }}>Loading league rosters…</div>
      </div>
    );
  }
  if (!myTeam) return null;

  return (
    <div style={{ ...styles.card, borderColor: "rgba(0,245,160,0.22)", marginBottom: 24 }}>
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
          <div style={{ ...styles.sectionLabel, marginBottom: 6 }}>Find Trades</div>
          <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6, maxWidth: 520 }}>
            Add the players or picks you'd ship, then find the partners who need them — each idea
            comes back with a fair return tuned to your strategy.{" "}
            <span style={{ color: REBUILD }}>Rebuilder</span> chases early picks and young upside;{" "}
            <span style={{ color: ACCENT }}>Contender</span> chases proven production.
          </div>
        </div>
        <StrategyToggle
          strategy={strategy}
          detected={detected}
          onChange={(s) => setStrategyOverride(s)}
        />
      </div>

      <AssetPicker options={options} onPick={addAsset} disabledKeys={sendKeys} />

      {/* Selected send chips */}
      <div style={{ marginTop: 12, minHeight: 30, display: "flex", flexWrap: "wrap", gap: 7 }}>
        {send.length === 0 ? (
          <span style={{ fontSize: 11, color: "#606878", fontStyle: "italic" }}>
            Nothing selected yet — add the assets you're offering.
          </span>
        ) : (
          send.map((a, i) => (
            <span
              key={a.type === "pick" ? `pick|${a.label}` : `player|${a.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px",
                borderRadius: 3,
                fontSize: 11,
                background: `${GOLD}15`,
                color: GOLD,
                border: `1px solid ${GOLD}30`,
              }}
            >
              {a.type === "pick" ? a.label : `${a.name} (${a.position})`}
              <button
                type="button"
                onClick={() => removeAsset(i)}
                style={{
                  background: "none",
                  border: "none",
                  color: WARN,
                  fontSize: 12,
                  padding: 0,
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button"
          onClick={runSearch}
          disabled={!send.length}
          style={{
            fontSize: 11,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            fontWeight: 700,
            padding: "9px 22px",
            borderRadius: 4,
            cursor: send.length ? "pointer" : "not-allowed",
            background: send.length ? `${ACCENT}1a` : "transparent",
            color: send.length ? ACCENT : "#606878",
            border: `1px solid ${send.length ? `${ACCENT}55` : "rgba(255,255,255,0.12)"}`,
          }}
        >
          Find Trades
        </button>
        {send.length > 0 && (
          <button
            type="button"
            onClick={() => setSend([])}
            style={{
              fontSize: 10,
              letterSpacing: 1,
              textTransform: "uppercase",
              padding: "8px 14px",
              borderRadius: 4,
              cursor: "pointer",
              background: "transparent",
              color: "#808898",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Results */}
      {searched && result && (
        <div style={{ marginTop: 18 }}>
          {result.ideas.length === 0 ? (
            <div
              style={{
                padding: "24px 18px",
                textAlign: "center",
                border: "1px dashed rgba(255,255,255,0.12)",
                borderRadius: 5,
              }}
            >
              <div style={{ fontSize: 12, color: "#c3c9dd", marginBottom: 6 }}>
                No partner in the league clearly needs what you're sending.
              </div>
              <div style={{ fontSize: 10, color: "#808898", lineHeight: 1.5 }}>
                Try adding a different position, flipping the strategy toggle, or including a pick.
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 12, lineHeight: 1.5 }}>
                {result.ideas.length} partner{result.ideas.length === 1 ? "" : "s"} fit your{" "}
                <strong style={{ color: "#e8e8f0" }}>{result.sendValue}</strong>-value package
                {result.sentPositions.length > 0 && (
                  <>
                    {" "}
                    at <span style={{ color: WARN }}>{result.sentPositions.join(" / ")}</span>
                  </>
                )}
                .
              </div>
              {result.ideas.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

class TradeFinderErrorBoundary extends Component<{ children: any }, { error: Error | null }> {
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
            Find Trades failed to render.
          </div>
          <div style={{ fontSize: 10, color: "#808898" }}>{String(this.state.error.message)}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function TradeFinderPanel(props: PanelProps) {
  return (
    <TradeFinderErrorBoundary>
      <PanelInner {...props} />
    </TradeFinderErrorBoundary>
  );
}
