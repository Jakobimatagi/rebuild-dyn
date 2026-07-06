import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { POSITION_PRIORITY } from "../../constants";
import { evaluateTrade, evaluateThreeWayTrade, simulateTrade, buildTradeRationale, suggestBalancingAsset, getAssetTradeValue } from "../../lib/tradeEngine";
import { buildBlueprintImpact, compareBuildFit } from "../../lib/tradeBlueprintImpact";
import { buildFairPackages } from "../../lib/tradePackages";
import { pickSlotLabel } from "../../lib/marketValue";
import { rankLabel } from "../../lib/playerGrading";
import { ConvictionChip, ConvictionLegend } from "./OverviewTab";
import TradeTargetsPanel from "./TradeTargetsPanel";
import TradeFinderPanel from "./TradeFinderPanel";
import { styles } from "../../styles";

// ---------------------------------------------------------------------------
// Shared combobox — searchable drop-down for any list of options
// ---------------------------------------------------------------------------

const COMBO_INPUT = {
  width: "100%",
  background: "rgba(0,245,160,0.04)",
  border: "1px solid rgba(0,245,160,0.18)",
  color: "#e8e8f0",
  padding: "8px 12px",
  fontSize: 12,
  borderRadius: 3,
  outline: "none",
  boxSizing: "border-box",
};

const COMBO_LIST = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  background: "#0d0d18",
  border: "1px solid rgba(0,245,160,0.22)",
  borderRadius: 4,
  zIndex: 50,
  maxHeight: 260,
  overflowY: "auto",
  boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
};

function ComboBox({ options, onSelect, placeholder, accent = "#00f5a0" }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.searchText.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => { setCursor(0); }, [filtered]);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const commit = (opt) => {
    onSelect(opt);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, filtered.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter" && filtered[cursor]) { e.preventDefault(); commit(filtered[cursor]); }
    if (e.key === "Escape") { setOpen(false); setQuery(""); }
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder={placeholder}
        style={{ ...COMBO_INPUT, borderColor: open ? `${accent}55` : "rgba(0,245,160,0.18)" }}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onKeyDown={onKey}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div style={COMBO_LIST}>
          {filtered.map((opt, i) => (
            <div
              key={opt.key}
              onMouseDown={(e) => { e.preventDefault(); commit(opt); }}
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
        <div style={{ ...COMBO_LIST, padding: "10px 12px" }}>
          <span style={{ fontSize: 11, color: "#606878" }}>No matches</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Positional shift badges — shows what each team is doing at each position
// ---------------------------------------------------------------------------

const SHIFT_CONFIG = {
  upgrade:   { label: "↑", color: "#00f5a0", suffix: "upgrade" },
  downgrade: { label: "↓", color: "#ff6b35", suffix: "tier-down" },
  buy:       { label: "+", color: "#7b8cff", suffix: "buy" },
  sell:      { label: "−", color: "#ffd84d", suffix: "sell" },
  lateral:   { label: "↔", color: "#94a3b8", suffix: "swap" },
};

function PositionalShiftBadges({ shifts, label, accent }) {
  if (!shifts?.length) return <div />;
  // Always show premium-position moves (QB, WR, TE in relevant leagues) even when lateral —
  // a QB-for-QB swap is meaningful context even if the scores are close.
  const notable = shifts.filter((s) => s.direction !== "lateral" || s.premium);
  if (!notable.length) return <div />;

  return (
    <div>
      <div style={{ fontSize: 9, color: accent, letterSpacing: 1.5, marginBottom: 5 }}>
        {label.toUpperCase()}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {notable.map((s) => {
          const cfg = SHIFT_CONFIG[s.direction] || SHIFT_CONFIG.lateral;
          return (
            <span
              key={s.position}
              style={{
                fontSize: 10,
                padding: "2px 7px",
                borderRadius: 2,
                background: `${cfg.color}12`,
                color: cfg.color,
                border: `1px solid ${cfg.color}35`,
                letterSpacing: 0.3,
              }}
            >
              {s.position} {cfg.label} {cfg.suffix}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Three-way trade UI primitives
// ---------------------------------------------------------------------------

const TRI_ACCENTS = ["#ffd84d", "#00f5a0", "#7b8cff"];

const PHASE_BADGE_COLOR = { contender: "#00f5a0", retool: "#ffd84d", rebuild: "#ff6b35" };

function PhaseBadge({ phase }) {
  const c = PHASE_BADGE_COLOR[phase] || "#a0a8c0";
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

function ModeToggle({ mode, onChange }) {
  const btn = (val, label) => {
    const active = mode === val;
    return (
      <button
        type="button"
        onClick={() => onChange(val)}
        style={{
          fontSize: 9,
          letterSpacing: 1.5,
          padding: "5px 12px",
          cursor: "pointer",
          textTransform: "uppercase",
          fontWeight: 700,
          background: active ? "rgba(0,245,160,0.14)" : "transparent",
          color: active ? "#00f5a0" : "#808898",
          border: `1px solid ${active ? "rgba(0,245,160,0.4)" : "rgba(255,255,255,0.12)"}`,
          borderRadius: 3,
        }}
      >
        {label}
      </button>
    );
  };
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {btn("two", "2-Team")}
      {btn("three", "3-Team")}
    </div>
  );
}

function AnonymizeToggle({ anonymize, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!anonymize)}
      title="Replace team names with Team 1/2/3 — safe for screenshots"
      style={{
        fontSize: 9,
        letterSpacing: 1.5,
        padding: "5px 12px",
        cursor: "pointer",
        textTransform: "uppercase",
        fontWeight: 700,
        background: anonymize ? "rgba(123,140,255,0.16)" : "transparent",
        color: anonymize ? "#7b8cff" : "#808898",
        border: `1px solid ${anonymize ? "rgba(123,140,255,0.45)" : "rgba(255,255,255,0.12)"}`,
        borderRadius: 3,
      }}
    >
      {anonymize ? "Names Hidden" : "Hide Names"}
    </button>
  );
}

function TriEmptyHint({ text }) {
  return (
    <div style={{ fontSize: 9, color: "#606878", fontStyle: "italic", padding: "2px 0" }}>
      {text}
    </div>
  );
}

function TriSendChip({ asset, accent, destinations, onRetarget, onRemove }) {
  const name = asset.type === "pick" ? asset.label : asset.name;
  const sub = asset.type === "pick" ? "pick" : asset.position;
  return (
    <div
      style={{
        background: `${accent}12`,
        border: `1px solid ${accent}33`,
        borderRadius: 3,
        padding: "6px 8px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, color: "#e8e8f0" }}>
          {name} <span style={{ color: "#94a3b8", fontSize: 9 }}>{sub}</span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          style={{ background: "none", border: "none", color: "#ff6b35", fontSize: 12, padding: 0, cursor: "pointer", lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
        <span style={{ fontSize: 9, color: "#606878" }}>→</span>
        {destinations.map((d) => {
          const active = asset.to === d.id;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onRetarget(d.id)}
              style={{
                fontSize: 9,
                padding: "2px 7px",
                borderRadius: 2,
                cursor: "pointer",
                background: active ? `${d.accent}22` : "transparent",
                color: active ? d.accent : "#808898",
                border: `1px solid ${active ? `${d.accent}66` : "rgba(255,255,255,0.12)"}`,
              }}
            >
              {d.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TriReceiveChip({ asset, fromLabel, fromAccent }) {
  const name = asset.type === "pick" ? asset.label : asset.name;
  const sub = asset.type === "pick" ? "pick" : asset.position;
  return (
    <div
      style={{
        background: "rgba(123,140,255,0.08)",
        border: "1px solid rgba(123,140,255,0.22)",
        borderRadius: 3,
        padding: "6px 8px",
      }}
    >
      <div style={{ fontSize: 11, color: "#e8e8f0" }}>
        {name} <span style={{ color: "#94a3b8", fontSize: 9 }}>{sub}</span>
      </div>
      <div style={{ fontSize: 9, color: fromAccent, marginTop: 2 }}>from {fromLabel}</div>
    </div>
  );
}

function ThreeWayTeamCard({ team, accent }) {
  const net = team.netValue;
  const hasShifts = team.shifts?.some((s) => s.direction !== "lateral" || s.premium);
  return (
    <div
      style={{
        border: `1px solid ${accent}28`,
        background: `${accent}08`,
        borderRadius: 4,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: accent, fontWeight: 700 }}>{team.label}</span>
        <PhaseBadge phase={team.phase} />
      </div>
      <div style={{ fontSize: 11, color: "#d9deef", marginBottom: 3 }}>
        Gets <strong style={{ color: "#fff" }}>{team.valueReceived}</strong>
        {" · "}Sends <strong style={{ color: "#fff" }}>{team.valueSent}</strong> pts
      </div>
      <div style={{ fontSize: 11, color: "#d9deef" }}>
        Net (phase-adjusted):{" "}
        <span style={{ color: net >= 0 ? "#00f5a0" : "#ff6b35" }}>
          {net >= 0 ? "+" : ""}{net}
        </span>
      </div>
      <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 4 }}>
        Phase bonus: {team.phaseAdj >= 0 ? "+" : ""}{team.phaseAdj} ({team.phase})
      </div>
      {team.consolidationDiscount && (
        <div style={{ fontSize: 9, color: "#606878", marginTop: 3 }}>
          {Math.round((1 - team.consolidationDiscount) * 100)}% package discount on incoming
        </div>
      )}
      {hasShifts && (
        <div style={{ marginTop: 8 }}>
          <PositionalShiftBadges shifts={team.shifts} label="moves" accent={accent} />
        </div>
      )}
    </div>
  );
}

function ThreeWayVerdict({ result, accents }) {
  const fairnessColor = {
    Fair: "#00f5a0",
    "Slight edge": "#ffd84d",
    Uneven: "#ff6b35",
    Lopsided: "#ff2d55",
  };
  return (
    <div
      style={{
        background: "rgba(0,245,160,0.04)",
        border: "1px solid rgba(0,245,160,0.15)",
        borderRadius: 4,
        padding: 16,
        marginTop: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>Verdict</div>
        <span style={styles.tag(fairnessColor[result.fairnessLabel] || "#d9deef")}>
          {result.fairnessLabel}
        </span>
      </div>
      <div
        className="dyn-grid-3"
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}
      >
        {result.teams.map((t, i) => (
          <ThreeWayTeamCard key={t.id} team={t} accent={accents[i]} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trade Calculator component
// ---------------------------------------------------------------------------

function TradeCalculator({ leagueTeams, leagueContext, tradeMarket, teamPhase }) {
  const [mode, setMode] = useState("two");
  // When on, every displayed team name becomes "Team 1/2/3" — screenshot-safe.
  const [anonymize, setAnonymize] = useState(false);
  const [teamAId, setTeamAId] = useState("");
  const [teamBId, setTeamBId] = useState("");
  const [sideA, setSideA] = useState([]);
  const [sideB, setSideB] = useState([]);

  // Three-way trade — slot-indexed (0,1,2). triSends[i] is the list of assets
  // team i sends; each asset carries `to` = destination team's rosterId.
  const [triIds, setTriIds] = useState(["", "", ""]);
  const [triSends, setTriSends] = useState([[], [], []]);

  // Package Architect — anchor one asset, get fair blueprint-aware packages.
  const [pbDirection, setPbDirection] = useState("acquire");
  const [pbAnchor, setPbAnchor] = useState(null);
  useEffect(() => setPbAnchor(null), [teamAId, teamBId]);

  const playerMarketMap = useMemo(
    () =>
      new Map(
        (leagueTeams || []).flatMap((t) =>
          t.enriched.map((p) => [String(p.id), p]),
        ),
      ),
    [leagueTeams],
  );

  // Selected-team objects carry an anonymized `label` when the toggle is on, so
  // every downstream render and engine call inherits the masked name. Roster
  // data (rosterId, enriched, picks, teamPhase) is preserved by the spread.
  const teamA = useMemo(() => {
    const t = leagueTeams?.find((x) => String(x.rosterId) === teamAId);
    return t && anonymize ? { ...t, label: "Team 1" } : t;
  }, [leagueTeams, teamAId, anonymize]);
  const teamB = useMemo(() => {
    const t = leagueTeams?.find((x) => String(x.rosterId) === teamBId);
    return t && anonymize ? { ...t, label: "Team 2" } : t;
  }, [leagueTeams, teamBId, anonymize]);

  const addAsset = useCallback(
    (side, asset) => {
      const setter = side === "A" ? setSideA : setSideB;
      setter((prev) => {
        const key = asset.type === "pick" ? asset.label : asset.id;
        if (prev.some((a) => (a.type === "pick" ? a.label : a.id) === key))
          return prev;
        return [...prev, asset];
      });
    },
    [],
  );

  const removeAsset = useCallback((side, index) => {
    const setter = side === "A" ? setSideA : setSideB;
    setter((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // Team combobox options
  const teamOptions = useMemo(
    () =>
      leagueTeams.map((t) => ({
        key: String(t.rosterId),
        searchText: t.label,
        render: () => (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#e8e8f0" }}>{t.label}</span>
            {t.teamPhase?.phase && (
              <span style={{
                fontSize: 9, letterSpacing: 1, padding: "1px 6px", borderRadius: 2,
                color: t.teamPhase.phase === "contender" ? "#00f5a0" : t.teamPhase.phase === "rebuild" ? "#ff6b35" : "#ffd84d",
                background: t.teamPhase.phase === "contender" ? "#00f5a018" : t.teamPhase.phase === "rebuild" ? "#ff6b3518" : "#ffd84d18",
                border: `1px solid ${t.teamPhase.phase === "contender" ? "#00f5a044" : t.teamPhase.phase === "rebuild" ? "#ff6b3544" : "#ffd84d44"}`,
              }}>
                {t.teamPhase.phase}
              </span>
            )}
          </div>
        ),
        data: t,
      })),
    [leagueTeams],
  );

  // Build a rosterId → teamPhase map for quick originating-team lookups
  const rosterPhaseMap = useMemo(
    () => new Map(leagueTeams.map((t) => [String(t.rosterId), t.teamPhase?.phase ?? null])),
    [leagueTeams],
  );

  // Asset combobox options per team
  const buildAssetOptions = useCallback(
    (team) => {
      if (!team) return [];

      const PICK_ROUND_COLOR = { 1: "#00f5a0", 2: "#ffd84d", 3: "#c8cfe3", 4: "#808898" };

      const playerOpts = [...(team.enriched || [])]
        .sort((a, b) => b.score - a.score)
        .map((p) => {
          // Market trade value alongside the internal grade — the grade is
          // trailing production, but the pts are what the verdict trades on
          // (a 95-grade RB can be a 34-pt asset in a superflex market).
          const val = getAssetTradeValue(
            { ...p, type: "player" },
            playerMarketMap,
            leagueContext,
            tradeMarket,
          );
          return {
            key: `player|${p.id}`,
            searchText: `${p.name} ${p.position}`,
            render: () => (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 12, color: "#e8e8f0" }}>{p.name}</span>
                  <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 8 }}>
                    {p.position} · {p.age}yo
                  </span>
                </div>
                <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>
                  ~{val} pts
                  <span style={{ fontSize: 11, color: p.score >= 70 ? "#00f5a0" : "#94a3b8", marginLeft: 8 }}>
                    {p.score}
                  </span>
                </span>
              </div>
            ),
            asset: { ...p, type: "player" },
          };
        });

      const pickOpts = (team.picks || [])
        .filter((p) => p.round <= 4)
        .map((p) => {
          // For acquired picks, value/slot reflects the *originating* team's phase,
          // not the holding team's — "2027 2nd via Shadow Lord" is valued based on
          // where Shadow Lord is projected to pick, not who currently holds it.
          const originPhase = p.isOwn
            ? (team.teamPhase?.phase ?? null)
            : (rosterPhaseMap.get(String(p.originalRosterId)) ?? null);

          // Value on the same trade scale the verdict uses (FC-aware via
          // pickFcValue), so the dropdown hint matches the calculated trade.
          const val = getAssetTradeValue(
            { ...p, type: "pick", ownerPhase: originPhase },
            playerMarketMap,
            leagueContext,
            tradeMarket,
          );
          const roundColor = PICK_ROUND_COLOR[p.round] || "#808898";

          // slotLabel is pre-stamped by assignDraftSlots ("2.04", "1.08", etc.)
          // Fall back to early/mid/late for round-1 when slot isn't known
          const slotDisplay = p.slotLabel
            ? `slot ${p.slotLabel}`
            : (p.round === 1 ? pickSlotLabel(p.round, originPhase) : null);

          return {
            key: `pick|${p.label}`,
            searchText: p.label,
            render: () => (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 12, color: roundColor }}>{p.label}</span>
                  {slotDisplay && (
                    <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 8 }}>
                      {slotDisplay}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0 }}>~{val} pts</span>
              </div>
            ),
            asset: { ...p, type: "pick", ownerPhase: originPhase, value: val },
          };
        });

      return [
        { key: "__h_players", searchText: "", render: () => <span style={{ fontSize: 9, color: "#606878", letterSpacing: 1.5 }}>PLAYERS</span>, isHeader: true },
        ...playerOpts,
        { key: "__h_picks", searchText: "", render: () => <span style={{ fontSize: 9, color: "#606878", letterSpacing: 1.5 }}>PICKS</span>, isHeader: true },
        ...pickOpts,
      ].filter((o) => !o.isHeader || (o.isHeader && (o.key === "__h_players" ? playerOpts.length : pickOpts.length) > 0));
    },
    [leagueContext, tradeMarket, rosterPhaseMap, playerMarketMap],
  );

  const assetOptsA = useMemo(() => buildAssetOptions(teamA), [buildAssetOptions, teamA]);
  const assetOptsB = useMemo(() => buildAssetOptions(teamB), [buildAssetOptions, teamB]);

  const result = useMemo(() => {
    if (!sideA.length || !sideB.length) return null;
    return evaluateTrade(
      sideA,
      sideB,
      teamA?.teamPhase?.phase || teamPhase?.phase || "retool",
      teamB?.teamPhase?.phase || "retool",
      playerMarketMap,
      leagueContext,
      tradeMarket,
    );
  }, [sideA, sideB, teamA, teamB, teamPhase, playerMarketMap, leagueContext, tradeMarket]);

  const rationaleA = useMemo(() => {
    if (!sideA.length || !sideB.length || !teamA || !teamB) return null;
    return buildTradeRationale({
      ownTeam: teamA,
      partnerTeam: teamB,
      outgoing: sideA,
      incoming: sideB,
      leagueContext,
    });
  }, [sideA, sideB, teamA, teamB, leagueContext]);

  const rationaleB = useMemo(() => {
    if (!sideA.length || !sideB.length || !teamA || !teamB) return null;
    return buildTradeRationale({
      ownTeam: teamB,
      partnerTeam: teamA,
      outgoing: sideB,
      incoming: sideA,
      leagueContext,
    });
  }, [sideA, sideB, teamA, teamB, leagueContext]);

  const balance = useMemo(() => {
    if (!result || !sideA.length || !sideB.length) return null;
    return suggestBalancingAsset({
      sideA,
      sideB,
      teamA,
      teamB,
      valueA: result.sideAValue,
      valueB: result.sideBValue,
      leagueContext,
      tradeMarket,
      playerMarketMap,
    });
  }, [result, sideA, sideB, teamA, teamB, leagueContext, tradeMarket, playerMarketMap]);

  const simulation = useMemo(() => {
    if (!sideA.length || !sideB.length || !teamA || !teamB) return null;
    if (!leagueTeams?.length) return null;
    try {
      return simulateTrade(
        teamA,
        teamB,
        sideA,
        sideB,
        leagueTeams,
        leagueContext,
        playerMarketMap,
      );
    } catch (err) {
      console.error("simulateTrade failed", err);
      return null;
    }
  }, [sideA, sideB, teamA, teamB, leagueTeams, leagueContext, playerMarketMap]);

  const pbPackages = useMemo(() => {
    if (!pbAnchor || !teamA || !teamB) return null;
    try {
      return buildFairPackages({
        direction: pbDirection,
        anchor: pbAnchor,
        myTeam: teamA,
        partnerTeam: teamB,
        leagueContext,
        tradeMarket,
        playerMarketMap,
        rosterPhaseMap,
        limit: 4,
      });
    } catch (err) {
      console.error("buildFairPackages failed", err);
      return null;
    }
  }, [pbAnchor, pbDirection, teamA, teamB, leagueContext, tradeMarket, playerMarketMap, rosterPhaseMap]);

  const loadPackage = useCallback(
    (pkg) => {
      // pkg.get is always [anchor]; pkg.give is the paying side's package.
      if (pbDirection === "acquire") {
        setSideA(pkg.give);
        setSideB(pkg.get);
      } else {
        setSideA(pkg.get);
        setSideB(pkg.give);
      }
    },
    [pbDirection],
  );

  const blueprintImpact = useMemo(() => {
    if (!sideA.length || !sideB.length || !teamA || !teamB) return null;
    try {
      return {
        teamA: buildBlueprintImpact({
          team: teamA,
          outgoing: sideA,
          incoming: sideB,
          leagueContext,
          playerMarketMap,
          netValue: result?.teamA?.netValue ?? null,
        }),
        teamB: buildBlueprintImpact({
          team: teamB,
          outgoing: sideB,
          incoming: sideA,
          leagueContext,
          playerMarketMap,
          netValue: result?.teamB?.netValue ?? null,
        }),
      };
    } catch (err) {
      console.error("blueprintImpact failed", err);
      return null;
    }
  }, [sideA, sideB, teamA, teamB, leagueContext, playerMarketMap, result]);

  // --- Three-way derived state ---------------------------------------------
  const triTeams = useMemo(
    () =>
      triIds.map((id, i) => {
        const t = leagueTeams?.find((x) => String(x.rosterId) === id);
        if (!t) return null;
        return anonymize ? { ...t, label: `Team ${i + 1}` } : t;
      }),
    [leagueTeams, triIds, anonymize],
  );
  const allTriSelected = triTeams.every(Boolean);

  const triAssetOpts = useMemo(
    () => triTeams.map((t) => (t ? buildAssetOptions(t) : [])),
    [triTeams, buildAssetOptions],
  );

  // For each slot, the assets routed *into* it from the other two slots.
  const triReceives = useMemo(() => {
    const buckets = [[], [], []];
    triSends.forEach((sends, fromSlot) => {
      sends.forEach((asset) => {
        const toSlot = triIds.indexOf(asset.to);
        if (toSlot >= 0 && toSlot !== fromSlot) {
          buckets[toSlot].push({ ...asset, fromSlot });
        }
      });
    });
    return buckets;
  }, [triSends, triIds]);

  const triResult = useMemo(() => {
    if (!allTriSelected) return null;
    if (triSends.reduce((n, s) => n + s.length, 0) === 0) return null;
    const legs = triTeams.map((t, i) => ({
      id: String(t.rosterId),
      label: t.label,
      phase: t.teamPhase?.phase || "retool",
      sends: triSends[i],
    }));
    return evaluateThreeWayTrade(
      legs,
      playerMarketMap,
      leagueContext,
      tradeMarket,
    );
  }, [allTriSelected, triTeams, triSends, playerMarketMap, leagueContext, tradeMarket]);

  // Changing a participant invalidates all routing — reset the sent assets.
  const selectTriTeam = useCallback((slot, rosterId) => {
    setTriIds((prev) => {
      const next = [...prev];
      next[slot] = rosterId;
      return next;
    });
    setTriSends([[], [], []]);
  }, []);

  const addTriAsset = useCallback(
    (slot, asset) => {
      setTriSends((prev) => {
        const key = asset.type === "pick" ? asset.label : asset.id;
        if (
          prev[slot].some((a) => (a.type === "pick" ? a.label : a.id) === key)
        )
          return prev;
        const next = prev.map((s) => [...s]);
        next[slot].push({ ...asset, to: triIds[(slot + 1) % 3] });
        return next;
      });
    },
    [triIds],
  );

  const removeTriAsset = useCallback((slot, idx) => {
    setTriSends((prev) => {
      const next = prev.map((s) => [...s]);
      next[slot].splice(idx, 1);
      return next;
    });
  }, []);

  const retargetTriAsset = useCallback((slot, idx, toId) => {
    setTriSends((prev) => {
      const next = prev.map((s) => [...s]);
      next[slot][idx] = { ...next[slot][idx], to: toId };
      return next;
    });
  }, []);

  if (!leagueTeams?.length) return null;

  const chipStyle = (color = "#d9deef") => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 3,
    fontSize: 11,
    background: `${color}15`,
    color,
    border: `1px solid ${color}30`,
    marginRight: 6,
    marginBottom: 6,
  });

  const PHASE_COLOR = { contender: "#00f5a0", retool: "#ffd84d", rebuild: "#ff6b35" };

  const fairnessColor = {
    Fair: "#00f5a0",
    "Slight edge": "#ffd84d",
    Uneven: "#ff6b35",
    Lopsided: "#ff2d55",
  };

  const renderSidePanel = (team, side, assets, assetOpts, accent) => (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* Team header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, letterSpacing: 2, color: accent }}>{team.label.toUpperCase()} SENDS</span>
        {team.teamPhase?.phase && (
          <span style={{
            fontSize: 9, letterSpacing: 1, padding: "1px 6px", borderRadius: 2,
            color: PHASE_COLOR[team.teamPhase.phase] || "#a0a8c0",
            background: `${PHASE_COLOR[team.teamPhase.phase] || "#888"}18`,
            border: `1px solid ${PHASE_COLOR[team.teamPhase.phase] || "#888"}44`,
          }}>
            {team.teamPhase.phase}
          </span>
        )}
      </div>

      {/* Asset search */}
      <div style={{ marginBottom: 10 }}>
        <ComboBox
          key={team.rosterId}
          options={assetOpts.filter((o) => !o.isHeader)}
          onSelect={(opt) => opt.asset && addAsset(side, opt.asset)}
          placeholder="Search players or picks..."
          accent={accent}
        />
      </div>

      {/* Selected asset chips — each shows its market trade value so the
          currency the verdict uses is visible per-asset, not just in totals */}
      <div style={{ minHeight: 32 }}>
        {assets.map((asset, i) => (
          <span
            key={asset.type === "pick" ? asset.label : asset.id}
            style={chipStyle(accent)}
          >
            {asset.type === "pick" ? asset.label : `${asset.name} (${asset.position})`}
            <span style={{ color: "#808898", fontSize: 10 }}>
              {getAssetTradeValue(asset, playerMarketMap, leagueContext, tradeMarket)} pts
            </span>
            <button
              type="button"
              onClick={() => removeAsset(side, i)}
              style={{ background: "none", border: "none", color: "#ff6b35", fontSize: 12, padding: 0, cursor: "pointer", lineHeight: 1 }}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </div>
  );

  // --- Three-way render helpers --------------------------------------------
  const renderTriSelector = (slot) => {
    const accent = TRI_ACCENTS[slot];
    const team = triTeams[slot];
    const takenElsewhere = triIds.filter((_, i) => i !== slot);
    return (
      <div key={slot}>
        <div style={{ fontSize: 10, color: "#c8cfe3", marginBottom: 4, letterSpacing: 1 }}>
          TEAM {slot + 1}
        </div>
        <ComboBox
          options={teamOptions.filter(
            (o) => !takenElsewhere.includes(String(o.data.rosterId)),
          )}
          onSelect={(opt) => selectTriTeam(slot, opt.key)}
          placeholder={team ? team.label : "Search team..."}
          accent={accent}
        />
      </div>
    );
  };

  const renderTriPanel = (slot) => {
    const team = triTeams[slot];
    const accent = TRI_ACCENTS[slot];
    const sends = triSends[slot];
    const receives = triReceives[slot];
    const opts = triAssetOpts[slot] || [];
    const otherSlots = [(slot + 1) % 3, (slot + 2) % 3];
    return (
      <div
        key={slot}
        style={{
          border: `1px solid ${accent}28`,
          background: `${accent}08`,
          borderRadius: 4,
          padding: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: accent, fontWeight: 700 }}>
            {team.label}
          </span>
          {team.teamPhase?.phase && <PhaseBadge phase={team.teamPhase.phase} />}
        </div>

        <div style={{ fontSize: 9, color: accent, letterSpacing: 1.5, marginBottom: 6 }}>
          SENDS
        </div>
        <ComboBox
          key={team.rosterId}
          options={opts.filter((o) => !o.isHeader)}
          onSelect={(opt) => opt.asset && addTriAsset(slot, opt.asset)}
          placeholder="Search players or picks..."
          accent={accent}
        />
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {sends.map((asset, i) => (
            <TriSendChip
              key={asset.type === "pick" ? asset.label : asset.id}
              asset={asset}
              accent={accent}
              destinations={otherSlots.map((os) => ({
                id: triIds[os],
                label: triTeams[os].label,
                accent: TRI_ACCENTS[os],
              }))}
              onRetarget={(toId) => retargetTriAsset(slot, i, toId)}
              onRemove={() => removeTriAsset(slot, i)}
            />
          ))}
          {!sends.length && <TriEmptyHint text="No assets sent yet" />}
        </div>

        <div style={{ fontSize: 9, color: "#7b8cff", letterSpacing: 1.5, margin: "12px 0 6px" }}>
          RECEIVES
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {receives.map((asset) => (
            <TriReceiveChip
              key={`${asset.fromSlot}-${asset.type === "pick" ? asset.label : asset.id}`}
              asset={asset}
              fromLabel={triTeams[asset.fromSlot].label}
              fromAccent={TRI_ACCENTS[asset.fromSlot]}
            />
          ))}
          {!receives.length && <TriEmptyHint text="Nothing incoming" />}
        </div>
      </div>
    );
  };

  return (
    <div style={{ ...styles.card, borderColor: "rgba(0,245,160,0.22)", marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ ...styles.sectionLabel, marginBottom: 0 }}>
          Trade Calculator
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AnonymizeToggle anonymize={anonymize} onChange={setAnonymize} />
          <ModeToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      {mode === "two" && (
      <>
      {/* Team selectors */}
      <div
        className="dyn-grid-2"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}
      >
        <div>
          <div style={{ fontSize: 10, color: "#c8cfe3", marginBottom: 4, letterSpacing: 1 }}>TEAM A</div>
          <ComboBox
            options={teamOptions.filter((o) => String(o.data.rosterId) !== teamBId)}
            onSelect={(opt) => { setTeamAId(opt.key); setSideA([]); }}
            placeholder={teamA ? teamA.label : "Search team..."}
            accent="#ffd84d"
          />
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#c8cfe3", marginBottom: 4, letterSpacing: 1 }}>TEAM B</div>
          <ComboBox
            options={teamOptions.filter((o) => String(o.data.rosterId) !== teamAId)}
            onSelect={(opt) => { setTeamBId(opt.key); setSideB([]); }}
            placeholder={teamB ? teamB.label : "Search team..."}
            accent="#00f5a0"
          />
        </div>
      </div>

      {/* Asset pickers — only shown once both teams are selected */}
      {teamA && teamB && (
        <div
          className="dyn-grid-2"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}
        >
          {renderSidePanel(teamA, "A", sideA, assetOptsA, "#ffd84d")}
          {renderSidePanel(teamB, "B", sideB, assetOptsB, "#00f5a0")}
        </div>
      )}

      {/* Verdict */}
      {result && (
        <div
          style={{
            background: "rgba(0,245,160,0.04)",
            border: "1px solid rgba(0,245,160,0.15)",
            borderRadius: 4,
            padding: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "#fff", fontWeight: 600 }}>Verdict</div>
            <span style={styles.tag(fairnessColor[result.fairnessLabel] || "#d9deef")}>
              {result.fairnessLabel}
            </span>
          </div>

          <FairnessBars result={result} blueprintImpact={blueprintImpact} teamA={teamA} teamB={teamB} />

          {/* Positional shift badges */}
          {(result.shiftsA?.length > 0 || result.shiftsB?.length > 0 || result.consolidationDiscount) && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <PositionalShiftBadges shifts={result.shiftsA} label={teamA.label} accent="#ffd84d" />
              <PositionalShiftBadges shifts={result.shiftsB} label={teamB.label} accent="#00f5a0" />
            </div>
          )}
          {result.consolidationDiscount && (
            <div style={{ fontSize: 10, color: "#606878", marginBottom: 10, letterSpacing: 0.3 }}>
              {Math.round((1 - result.consolidationDiscount) * 100)}% package discount applied to larger side · adjusted gap {result.adjustedGap} pts
            </div>
          )}

          <div className="dyn-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: "#ffd84d", marginBottom: 4 }}>
                {teamA.label} sends {result.sideAValue} pts
              </div>
              <div style={{ fontSize: 11, color: "#d9deef" }}>
                Net value (phase-adjusted):{" "}
                <span style={{ color: result.teamA.netValue >= 0 ? "#00f5a0" : "#ff6b35" }}>
                  {result.teamA.netValue >= 0 ? "+" : ""}{result.teamA.netValue}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 4 }}>
                Phase bonus: {result.teamA.phaseAdj >= 0 ? "+" : ""}{result.teamA.phaseAdj} ({teamA.teamPhase?.phase})
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#00f5a0", marginBottom: 4 }}>
                {teamB.label} sends {result.sideBValue} pts
              </div>
              <div style={{ fontSize: 11, color: "#d9deef" }}>
                Net value (phase-adjusted):{" "}
                <span style={{ color: result.teamB.netValue >= 0 ? "#00f5a0" : "#ff6b35" }}>
                  {result.teamB.netValue >= 0 ? "+" : ""}{result.teamB.netValue}
                </span>
              </div>
              <div style={{ fontSize: 10, color: "#c8cfe3", marginTop: 4 }}>
                Phase bonus: {result.teamB.phaseAdj >= 0 ? "+" : ""}{result.teamB.phaseAdj} ({teamB.teamPhase?.phase})
              </div>
            </div>
          </div>
        </div>
      )}

      {blueprintImpact && (blueprintImpact.teamA || blueprintImpact.teamB) && (
        <BlueprintImpactPanel impact={blueprintImpact} teamA={teamA} teamB={teamB} />
      )}

      {(rationaleA || rationaleB) && (
        <TradeRationale teamA={teamA} teamB={teamB} rationaleA={rationaleA} rationaleB={rationaleB} />
      )}

      {balance && <BalanceSuggestion balance={balance} />}

      {simulation && <PostTradeImpact simulation={simulation} />}

      {teamA && teamB && (
        <PackageArchitect
          teamA={teamA}
          teamB={teamB}
          direction={pbDirection}
          setDirection={(d) => {
            setPbDirection(d);
            setPbAnchor(null);
          }}
          anchor={pbAnchor}
          setAnchor={setPbAnchor}
          anchorOpts={pbDirection === "acquire" ? assetOptsB : assetOptsA}
          packages={pbPackages}
          onLoad={loadPackage}
        />
      )}
      </>
      )}

      {mode === "three" && (
        <>
          <div
            className="dyn-grid-3"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}
          >
            {[0, 1, 2].map(renderTriSelector)}
          </div>

          {allTriSelected ? (
            <div
              className="dyn-grid-3"
              style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}
            >
              {[0, 1, 2].map(renderTriPanel)}
            </div>
          ) : (
            <div style={{ fontSize: 11, color: "#808898", textAlign: "center", padding: "10px 0" }}>
              Select all three teams to start building the trade.
            </div>
          )}

          {triResult && <ThreeWayVerdict result={triResult} accents={TRI_ACCENTS} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-side rationale — what's good/bad for each team given their phase, the
// archetypes involved, PPG, OC outlook, and roster needs.
// ---------------------------------------------------------------------------

function PHASE_TONE(phase) {
  return phase === "contender"
    ? "#00f5a0"
    : phase === "rebuild"
    ? "#ff6b35"
    : "#ffd84d";
}

function RationaleColumn({ team, rationale, accent }) {
  if (!rationale) return null;
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: accent,
            fontWeight: 700,
            letterSpacing: 0.3,
          }}
        >
          {team?.label}
        </span>
        <span
          style={{
            fontSize: 9,
            letterSpacing: 1.5,
            padding: "1px 7px",
            borderRadius: 2,
            color: PHASE_TONE(rationale.ownPhase),
            background: `${PHASE_TONE(rationale.ownPhase)}18`,
            border: `1px solid ${PHASE_TONE(rationale.ownPhase)}44`,
          }}
        >
          {rationale.ownPhase}
        </span>
      </div>

      {rationale.positives.length > 0 && (
        <div style={{ marginBottom: rationale.concerns.length ? 8 : 0 }}>
          <div style={{ fontSize: 9, color: "#00f5a0", letterSpacing: 1.5, marginBottom: 4 }}>
            WHY IT WORKS
          </div>
          {rationale.positives.map((line, i) => (
            <div
              key={`pos-${i}`}
              style={{ fontSize: 10, color: "#d1d7ea", lineHeight: 1.55, marginBottom: 3 }}
            >
              <span style={{ color: "#00f5a0", marginRight: 6 }}>+</span>
              {line}
            </div>
          ))}
        </div>
      )}

      {rationale.concerns.length > 0 && (
        <div>
          <div style={{ fontSize: 9, color: "#ff6b35", letterSpacing: 1.5, marginBottom: 4 }}>
            WATCH OUT
          </div>
          {rationale.concerns.map((line, i) => (
            <div
              key={`con-${i}`}
              style={{ fontSize: 10, color: "#d1d7ea", lineHeight: 1.55, marginBottom: 3 }}
            >
              <span style={{ color: "#ff6b35", marginRight: 6 }}>−</span>
              {line}
            </div>
          ))}
        </div>
      )}

      {rationale.positives.length === 0 && rationale.concerns.length === 0 && (
        <div style={{ fontSize: 10, color: "#808898", lineHeight: 1.5 }}>
          Neutral on both sides — neither phase nor positional fit moves the needle.
        </div>
      )}
    </div>
  );
}

function TradeRationale({ teamA, teamB, rationaleA, rationaleB }) {
  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 2.5,
          color: "#c0c8e0",
          textTransform: "uppercase",
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        Why each side might want this
      </div>
      <div
        className="dyn-grid-2"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
      >
        <RationaleColumn team={teamA} rationale={rationaleA} accent="#ffd84d" />
        <RationaleColumn team={teamB} rationale={rationaleB} accent="#00f5a0" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suggested balancing add — closes the fairness gap with the cleanest single
// asset (player or pick) the underpaying side could throw in.
// ---------------------------------------------------------------------------

function BalanceSuggestion({ balance }) {
  const sign = balance.gap > 0 ? "" : "";
  return (
    <div
      style={{
        marginTop: 14,
        padding: 14,
        background: "rgba(255,216,77,0.05)",
        border: "1px solid rgba(255,216,77,0.20)",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 2.5,
          color: "#ffd84d",
          textTransform: "uppercase",
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        Balance the trade
      </div>
      <div style={{ fontSize: 11, color: "#d1d7ea", marginBottom: 10, lineHeight: 1.5 }}>
        Value gap of <strong style={{ color: "#ffd84d" }}>{Math.abs(balance.gap)}</strong>{" "}
        favors <strong style={{ color: "#fff" }}>{balance.receivingTeam}</strong>.{" "}
        <strong style={{ color: "#fff" }}>{balance.addingTeam}</strong> could add one of:
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {balance.options.map((opt, i) => {
          const tone = opt.partnerFit ? "#00f5a0" : "#c0c8e0";
          return (
            <div
              key={`${opt.type}-${i}-${opt.label}`}
              style={{
                padding: "8px 12px",
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${tone}33`,
                borderRadius: 3,
                minWidth: 180,
              }}
            >
              <div style={{ fontSize: 10, color: tone, fontWeight: 700 }}>
                {opt.label}
              </div>
              <div style={{ fontSize: 9, color: "#a0a8c0", marginTop: 4, letterSpacing: 0.3 }}>
                worth ~{opt.value} pts
                {opt.partnerFit && (
                  <span style={{ color: "#00f5a0", marginLeft: 6 }}>· fits their need</span>
                )}
              </div>
              <div style={{ fontSize: 9, color: "#808898", marginTop: 2 }}>
                new gap: {opt.newAbsGap}
              </div>
            </div>
          );
        })}
        {!balance.options.length && (
          <div style={{ fontSize: 10, color: "#808898" }}>
            No clean single-asset balance found — consider restructuring the package.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post-Trade Impact — shows what a proposed trade does to each team's phase,
// position-room ranks, and roster needs/surplus.
// ---------------------------------------------------------------------------

function PhaseDeltaCard({ side }) {
  const before = side.teamPhase.before;
  const after = side.teamPhase.after;
  const scoreDelta = side.teamPhase.scoreDelta;
  const ppgDelta = side.teamPhase.starterPpgDelta;
  const phaseChanged = side.teamPhase.phaseChanged;

  const PHASE_COLOR = {
    contender: "#00f5a0",
    retool:    "#ffd84d",
    rebuild:   "#ff6b35",
  };

  const sign = (n) => (n > 0 ? "+" : "");

  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: "#c8cfe3",
          letterSpacing: 1.5,
          marginBottom: 8,
          fontWeight: 600,
        }}
      >
        {side.label.toUpperCase()}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 2,
            color: PHASE_COLOR[before?.phase] || "#a0a8c0",
            background: `${PHASE_COLOR[before?.phase] || "#888"}18`,
            border: `1px solid ${PHASE_COLOR[before?.phase] || "#888"}44`,
            letterSpacing: 1,
          }}
        >
          {before?.phase || "—"} {before?.score ?? "—"}
        </span>
        <span style={{ fontSize: 11, color: "#606878" }}>→</span>
        <span
          style={{
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 2,
            color: PHASE_COLOR[after?.phase] || "#a0a8c0",
            background: `${PHASE_COLOR[after?.phase] || "#888"}18`,
            border: `1px solid ${PHASE_COLOR[after?.phase] || "#888"}44`,
            letterSpacing: 1,
            fontWeight: phaseChanged ? 700 : 400,
          }}
        >
          {after?.phase || "—"} {after?.score ?? "—"}
        </span>
        {phaseChanged && (
          <span style={{ fontSize: 9, color: "#ffd84d", letterSpacing: 1 }}>PHASE SHIFT</span>
        )}
      </div>

      <div style={{ fontSize: 10, color: "#a0a8c0" }}>
        Phase score:{" "}
        <span style={{ color: scoreDelta > 0 ? "#00f5a0" : scoreDelta < 0 ? "#ff6b35" : "#a0a8c0" }}>
          {sign(scoreDelta)}{scoreDelta.toFixed(0)}
        </span>
        {Number.isFinite(ppgDelta) && Math.abs(ppgDelta) >= 0.05 && (
          <>
            {" · Starter PPG: "}
            <span style={{ color: ppgDelta > 0 ? "#00f5a0" : "#ff6b35" }}>
              {sign(ppgDelta)}{ppgDelta.toFixed(1)}
            </span>
          </>
        )}
        {" · Avg score: "}
        <span style={{ color: side.avgScore.delta > 0 ? "#00f5a0" : side.avgScore.delta < 0 ? "#ff6b35" : "#a0a8c0" }}>
          {sign(side.avgScore.delta)}{side.avgScore.delta.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function PosRankDeltaRow({ side }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 6,
      }}
    >
      {["QB", "RB", "WR", "TE"].map((pos) => {
        const r = side.posRanks[pos];
        const before = r.before;
        const after = r.after;
        const delta = r.delta;
        const tone =
          delta == null ? "#606878" :
          delta > 0 ? "#00f5a0" :
          delta < 0 ? "#ff6b35" :
          "#a0a8c0";
        return (
          <div
            key={pos}
            style={{
              textAlign: "center",
              padding: "6px 4px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 3,
            }}
          >
            <div style={{ fontSize: 9, color: "#606878", letterSpacing: 1 }}>{pos}</div>
            <div style={{ fontSize: 11, color: "#d1d7ea", marginTop: 2 }}>
              {before != null ? rankLabel(before) : "—"} → {after != null ? rankLabel(after) : "—"}
            </div>
            <div style={{ fontSize: 10, color: tone, marginTop: 2 }}>
              {delta == null
                ? "—"
                : delta === 0
                ? "no change"
                : delta > 0
                ? `▲ ${delta}`
                : `▼ ${Math.abs(delta)}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NeedSurplusDelta({ side }) {
  const lines = [];
  if (side.needs.resolved.length) {
    lines.push({
      label: "Needs resolved",
      items: side.needs.resolved,
      color: "#00f5a0",
    });
  }
  if (side.needs.opened.length) {
    lines.push({
      label: "New holes",
      items: side.needs.opened,
      color: "#ff6b35",
    });
  }
  if (side.weakRooms.opened.length) {
    lines.push({
      label: "Rooms now weak",
      items: side.weakRooms.opened,
      color: "#ff6b35",
    });
  }
  if (side.weakRooms.resolved.length) {
    lines.push({
      label: "Rooms patched",
      items: side.weakRooms.resolved,
      color: "#00f5a0",
    });
  }
  if (!lines.length) return null;

  return (
    <div style={{ marginTop: 8, fontSize: 10, color: "#a0a8c0", lineHeight: 1.6 }}>
      {lines.map(({ label, items, color }) => (
        <div key={label}>
          <span style={{ color }}>{label}: </span>
          {items.join(", ")}
        </div>
      ))}
    </div>
  );
}

function PostTradeImpact({ simulation }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        background: "rgba(123,140,255,0.04)",
        border: "1px solid rgba(123,140,255,0.18)",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 2.5,
          color: "#7b8cff",
          textTransform: "uppercase",
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        What If? — Post-Trade Impact
      </div>

      <div
        className="dyn-grid-2"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}
      >
        <PhaseDeltaCard side={simulation.teamA} />
        <PhaseDeltaCard side={simulation.teamB} />
      </div>

      <div style={{ fontSize: 9, color: "#606878", letterSpacing: 1.5, marginBottom: 6 }}>
        POSITION ROOM RANKS · LEAGUE
      </div>
      <div className="dyn-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: "#ffd84d", marginBottom: 4 }}>
            {simulation.teamA.label}
          </div>
          <PosRankDeltaRow side={simulation.teamA} />
          <NeedSurplusDelta side={simulation.teamA} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#00f5a0", marginBottom: 4 }}>
            {simulation.teamB.label}
          </div>
          <PosRankDeltaRow side={simulation.teamB} />
          <NeedSurplusDelta side={simulation.teamB} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Fairness bars — two readings: market value + blueprint/build fit.
// Each bar is a proportional split: team A's share (yellow, from the left)
// against team B's (green). A 50/50 split at the center tick = perfectly
// fair; a 73/27 split is visibly lopsided at a glance.
// ---------------------------------------------------------------------------

function SplitBar({ label, shareA, verdictText, textColor }) {
  const pct = Math.max(2, Math.min(98, shareA * 100));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "64px 1fr 170px", gap: 10, alignItems: "center" }}>
      <div style={{ fontSize: 9, color: "#808898", letterSpacing: 1.5 }}>{label}</div>
      <div style={{ position: "relative", height: 10, borderRadius: 5, overflow: "hidden", background: "rgba(255,255,255,0.06)" }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${pct}%`, background: "#ffd84d", opacity: 0.8 }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pct}%`, right: 0, background: "#00f5a0", opacity: 0.8 }} />
        {/* split divider */}
        <div style={{ position: "absolute", top: 0, bottom: 0, left: `calc(${pct}% - 1px)`, width: 2, background: "#0d0d18" }} />
        {/* fair line — dead center */}
        <div style={{ position: "absolute", top: -1, bottom: -1, left: "50%", width: 2, background: "rgba(255,255,255,0.85)" }} />
      </div>
      <div style={{ fontSize: 10, color: textColor, textAlign: "right" }}>{verdictText}</div>
    </div>
  );
}

function FairnessBars({ result, blueprintImpact, teamA, teamB }) {
  // Value reading: each side's share of the total value changing hands.
  // Team A receives sideBValue, team B receives sideAValue.
  const totalVal = result.sideAValue + result.sideBValue;
  const valueShareA = totalVal > 0 ? result.sideBValue / totalVal : 0.5;
  const valuePct = Math.round(valueShareA * 100);
  const valueEven = Math.abs(valueShareA - 0.5) <= 0.035;
  const valueText = valueEven
    ? "even value"
    : `${valueShareA > 0.5 ? teamA.label : teamB.label} gets ${Math.max(valuePct, 100 - valuePct)}% of the value`;
  const valueColor = valueEven ? "#94a3b8" : valueShareA > 0.5 ? "#ffd84d" : "#00f5a0";

  const build = compareBuildFit(blueprintImpact?.teamA, blueprintImpact?.teamB);
  const buildShareA = build ? 0.5 + build.lean / 2 : 0.5;
  const buildText = build
    ? build.tilt === "even"
      ? "fits both builds evenly"
      : `${build.strength === "strong" ? "strongly " : ""}fits ${
          build.tilt === "A" ? teamA.label : teamB.label
        } (${build.deltaA >= 0 ? "+" : ""}${build.deltaA} / ${build.deltaB >= 0 ? "+" : ""}${build.deltaB})`
    : null;
  const buildColor = build && build.tilt !== "even" ? (build.tilt === "A" ? "#ffd84d" : "#00f5a0") : "#94a3b8";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "64px 1fr 170px", gap: 10 }}>
        <span />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9 }}>
          <span style={{ color: "#ffd84d" }}>◂ {teamA.label}</span>
          <span style={{ color: "#00f5a0" }}>{teamB.label} ▸</span>
        </div>
        <span />
      </div>
      <SplitBar label="VALUE" shareA={valueShareA} verdictText={valueText} textColor={valueColor} />
      {build && <SplitBar label="BUILD FIT" shareA={buildShareA} verdictText={buildText} textColor={buildColor} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blueprint Impact — what the trade does to each team's archetype identity
// ---------------------------------------------------------------------------

const ALIGN_TAG_COLOR = { core: "#00f5a0", fit: "#94a3b8", off: "#ff6b35" };

function BlueprintChip({ match, bold }) {
  if (!match) return <span style={{ fontSize: 10, color: "#606878" }}>—</span>;
  return (
    <span
      style={{
        fontSize: 10,
        padding: "2px 8px",
        borderRadius: 2,
        color: match.color || "#a0a8c0",
        background: `${match.color || "#888"}18`,
        border: `1px solid ${match.color || "#888"}44`,
        letterSpacing: 1,
        fontWeight: bold ? 700 : 400,
      }}
    >
      {match.label} {match.fit}%
    </span>
  );
}

function BlueprintImpactCard({ impact, label, accent }) {
  if (!impact) return null;
  const { before, after, fitDelta, archetypeChanged, leaningToward, moveType, signalsGained, signalsLost, incomingAlignment, outgoingStarters } = impact;
  const afterOfBefore = after.matches.find((m) => m.id === before.top.id);
  const deltaTone = fitDelta > 0 ? "#00f5a0" : fitDelta < 0 ? "#ff6b35" : "#a0a8c0";

  return (
    <div
      style={{
        padding: 12,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 3,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8 }}>
        <div style={{ fontSize: 10, color: accent, letterSpacing: 1.5, fontWeight: 600 }}>
          {label.toUpperCase()}
        </div>
        <span style={styles.tag(moveType.color)}>{moveType.label}</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <BlueprintChip match={before.top} />
        <span style={{ fontSize: 11, color: "#606878" }}>→</span>
        <BlueprintChip match={archetypeChanged ? after.top : afterOfBefore} bold={archetypeChanged} />
        {archetypeChanged && (
          <span style={{ fontSize: 9, color: "#ffd84d", letterSpacing: 1 }}>IDENTITY SHIFT</span>
        )}
        {fitDelta !== 0 && (
          <span style={{ fontSize: 10, color: deltaTone }}>
            {fitDelta > 0 ? `▲ ${fitDelta}` : `▼ ${Math.abs(fitDelta)}`} {before.top.label} fit
          </span>
        )}
        {leaningToward && (
          <span style={{ fontSize: 9, color: "#808898" }}>
            leaning {leaningToward.label} {leaningToward.fit}%
          </span>
        )}
      </div>

      <div style={{ fontSize: 10, color: moveType.color, marginBottom: 6 }}>{moveType.detail}</div>

      {(signalsGained.length > 0 || signalsLost.length > 0) && (
        <div style={{ fontSize: 10, color: "#a0a8c0", lineHeight: 1.6, marginBottom: 6 }}>
          {signalsGained.slice(0, 2).map((s) => (
            <div key={s} style={{ color: "#00f5a0" }}>+ {s}</div>
          ))}
          {signalsLost.slice(0, 2).map((s) => (
            <div key={s} style={{ color: "#ff6b35" }}>− {s}</div>
          ))}
        </div>
      )}

      {incomingAlignment.length > 0 && (
        <div style={{ fontSize: 10, color: "#a0a8c0", lineHeight: 1.7 }}>
          {incomingAlignment.map(({ player, tag, reason, fillsNeed, roleNote, roleTone }) => (
            <div key={player.id} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ color: "#d1d7ea" }}>{player.name}</span>
              <span style={styles.tag(ALIGN_TAG_COLOR[tag] || "#94a3b8")}>{tag}</span>
              {roleNote && (
                <span style={{ color: roleTone === "good" ? "#00f5a0" : "#ff9f6b" }}>{roleNote}</span>
              )}
              {reason && <span style={{ color: "#606878" }}>{reason}</span>}
              {fillsNeed && <span style={{ color: "#00f5a0" }}>fills a {player.position} need</span>}
              {player.dynastyValue?.tier && (
                <span style={{ color: "#7b8cff" }}>
                  {player.dynastyValue.tier}
                  {player.dynastyValue.confidence ? ` · ${player.dynastyValue.confidence} conf` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {outgoingStarters?.length > 0 && (
        <div style={{ fontSize: 10, color: "#ff9f6b", marginTop: 6 }}>
          Sends away {outgoingStarters.length > 1 ? "starters" : "a starter"}:{" "}
          {outgoingStarters.map((x) => `${x.player.name} (${x.role.slot})`).join(", ")}
        </div>
      )}

      {before.isMature && (
        <div style={{ fontSize: 9, color: "#606878", marginTop: 8, letterSpacing: 0.3 }}>
          Established roster — archetype read is directional, not a draft plan.
        </div>
      )}
    </div>
  );
}

function BlueprintImpactPanel({ impact, teamA, teamB }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        background: "rgba(255,216,77,0.04)",
        border: "1px solid rgba(255,216,77,0.18)",
        borderRadius: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 2.5,
          color: "#ffd84d",
          textTransform: "uppercase",
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        Blueprint Impact — What This Move Means
      </div>
      <div className="dyn-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <BlueprintImpactCard impact={impact.teamA} label={teamA.label} accent="#ffd84d" />
        <BlueprintImpactCard impact={impact.teamB} label={teamB.label} accent="#00f5a0" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Package Architect — anchor one asset, get fair blueprint-aware packages
// ---------------------------------------------------------------------------

const TRADE_TYPE_COLOR = {
  tierDown: "#ffd84d",
  tierUp: "#ffd84d",
  lateralPivot: "#7b8cff",
  vetForPick: "#ff9f6b",
  pickForVet: "#00f5a0",
  rookieFever: "#c084fc",
  timeArbitrage: "#c084fc",
  twoForOne: "#64b5f6",
  oneForTwo: "#64b5f6",
  handcuff: "#7fff7f",
  pickAccumulation: "#ff9f6b",
  winNowPush: "#00f5a0",
  youthPivot: "#ff9f6b",
  valueSwap: "#94a3b8",
};

function PackageAssetChip({ asset, tv, notes }) {
  const name = asset.type === "pick" ? asset.label : asset.name;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 10 }}>
      <span style={{ color: "#d1d7ea" }}>{name}</span>
      {tv != null && <span style={{ color: "#606878" }}>~{Math.round(tv)} pts</span>}
      {notes.map(({ text, color }) => (
        <span key={text} style={{ color }}>{text}</span>
      ))}
    </div>
  );
}

function PackageCard({ pkg, direction, teamB, onLoad }) {
  const color = TRADE_TYPE_COLOR[pkg.tradeType.id] || "#94a3b8";
  // In acquire mode the package pieces flow to the PARTNER; in ship mode they
  // flow to YOU — the fit annotations change owner accordingly.
  const receiverIsMe = direction === "ship";
  const who = receiverIsMe ? "your" : "their";
  const pieceNotes = (piece) => {
    const notes = [];
    if (piece.asset.type !== "player") return notes;
    if (piece.nflBackup) notes.push({ text: "NFL backup", color: "#ff9f6b" });
    else if (piece.startsForReceiver) notes.push({ text: `starts for ${receiverIsMe ? "you" : "them"}`, color: "#00f5a0" });
    if (piece.recvTag === "off") notes.push({ text: `off-plan for ${receiverIsMe ? "you" : "them"}`, color: "#ff9f6b" });
    else if (piece.recvTag === "core") notes.push({ text: `${who} blueprint core`, color: "#00f5a0" });
    if (piece.fillsNeed) notes.push({ text: `fills ${who} ${piece.asset.position} need`, color: "#00f5a0" });
    if (piece.giveTag === "off") notes.push({ text: receiverIsMe ? "their sell candidate" : "your sell candidate", color: "#7b8cff" });
    return notes;
  };
  const youSend = direction === "acquire" ? pkg.pieces : null;
  const youGet = direction === "acquire" ? pkg.get : pkg.pieces;

  return (
    <div
      style={{
        padding: 12,
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 3,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={styles.tag(color)}>{pkg.tradeType.label}</span>
        <span style={styles.tag(pkg.fairness === "Fair" ? "#00f5a0" : pkg.fairness === "Slight edge" ? "#ffd84d" : "#ff9f6b")}>
          {pkg.fairness}
        </span>
      </div>
      <div style={{ fontSize: 9, color: "#808898", marginBottom: 8 }}>
        {pkg.tradeType.meta?.objective} · best time: {pkg.tradeType.meta?.bestTime}
      </div>

      <div className="dyn-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 9, color: "#ffd84d", letterSpacing: 1.5, marginBottom: 4 }}>YOU SEND</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {(youSend || pkg.get.map((a) => ({ asset: a, tv: null }))).map((piece) => (
              <PackageAssetChip
                key={piece.asset.type === "pick" ? piece.asset.label : piece.asset.id}
                asset={piece.asset}
                tv={piece.tv}
                notes={youSend ? pieceNotes(piece) : []}
              />
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#00f5a0", letterSpacing: 1.5, marginBottom: 4 }}>YOU GET</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {(direction === "acquire" ? pkg.get.map((a) => ({ asset: a, tv: null })) : youGet).map((piece) => (
              <PackageAssetChip
                key={piece.asset.type === "pick" ? piece.asset.label : piece.asset.id}
                asset={piece.asset}
                tv={piece.tv}
                notes={direction === "acquire" ? [] : pieceNotes(piece)}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <div style={{ fontSize: 10, color: "#a0a8c0" }}>
          Your net:{" "}
          <span style={{ color: pkg.myNet >= 0 ? "#00f5a0" : "#ff6b35" }}>
            {pkg.myNet >= 0 ? "+" : ""}{pkg.myNet}
          </span>
          {" · "}{teamB.label}:{" "}
          <span style={{ color: pkg.partnerNet >= 0 ? "#00f5a0" : "#ff6b35" }}>
            {pkg.partnerNet >= 0 ? "+" : ""}{pkg.partnerNet}
          </span>
        </div>
        <button
          type="button"
          onClick={onLoad}
          style={{
            background: "rgba(0,245,160,0.08)",
            border: "1px solid rgba(0,245,160,0.35)",
            color: "#00f5a0",
            fontSize: 10,
            letterSpacing: 1,
            padding: "4px 10px",
            borderRadius: 3,
            cursor: "pointer",
          }}
        >
          LOAD TRADE →
        </button>
      </div>
    </div>
  );
}

function PackageArchitect({ teamA, teamB, direction, setDirection, anchor, setAnchor, anchorOpts, packages, onLoad }) {
  const anchorName = anchor ? (anchor.type === "pick" ? anchor.label : anchor.name) : null;
  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        background: "rgba(0,245,160,0.03)",
        border: "1px solid rgba(0,245,160,0.15)",
        borderRadius: 4,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: 2.5, color: "#00f5a0", textTransform: "uppercase", marginBottom: 4, fontWeight: 600 }}>
        Package Architect — Fair Trade Builder
      </div>
      <div style={{ fontSize: 10, color: "#808898", marginBottom: 10 }}>
        Anchor one asset and get fair, blueprint-aware packages — every suggestion is priced by the
        same engine as the verdict above and labeled with its dynasty trade type.
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        {[
          { id: "acquire", label: `TARGET ON ${teamB.label.toUpperCase()}` },
          { id: "ship", label: `SHIP FROM ${teamA.label.toUpperCase()}` },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setDirection(m.id)}
            style={{
              background: direction === m.id ? "rgba(0,245,160,0.12)" : "transparent",
              border: `1px solid ${direction === m.id ? "rgba(0,245,160,0.45)" : "rgba(255,255,255,0.12)"}`,
              color: direction === m.id ? "#00f5a0" : "#808898",
              fontSize: 10,
              letterSpacing: 1,
              padding: "5px 10px",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            {m.label}
          </button>
        ))}
        <div style={{ flex: 1, minWidth: 220 }}>
          <ComboBox
            options={anchorOpts.filter((o) => !o.isHeader)}
            onSelect={(opt) => opt.asset && setAnchor(opt.asset)}
            placeholder={
              anchorName ||
              (direction === "acquire"
                ? `Who do you want from ${teamB.label}?`
                : `Who are you shopping from ${teamA.label}?`)
            }
            accent="#00f5a0"
          />
        </div>
      </div>

      {anchor && packages && packages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {packages.map((pkg, i) => (
            <PackageCard key={i} pkg={pkg} direction={direction} teamB={teamB} onLoad={() => onLoad(pkg)} />
          ))}
        </div>
      )}
      {anchor && packages && packages.length === 0 && (
        <div style={{ fontSize: 10, color: "#808898" }}>
          No fair package found for {anchorName} — the value gap is too wide for a 1–3 piece deal.
        </div>
      )}
    </div>
  );
}

function TradeCalcKey() {
  return (
    <div
      className="dyn-help-wrap"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      <button
        type="button"
        className="dyn-grade-help dyn-help-trigger"
        title="Trade calculation key"
        aria-label="Show trade calculation key"
        style={{
          width: 17,
          height: 17,
          borderRadius: "50%",
          background: "transparent",
          border: "1px solid rgba(0,245,160,0.28)",
          color: "#00f5a0",
          fontSize: 9,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          lineHeight: 1,
        }}
      >
        ?
      </button>

      <div
        className="dyn-help-tooltip"
        style={{
          position: "absolute",
          top: 24,
          right: 0,
          width: 320,
          maxWidth: "calc(100vw - 32px)",
          background: "#0d0d16",
          border: "1px solid rgba(0,245,160,0.2)",
          borderRadius: 6,
          padding: 14,
          zIndex: 20,
          boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: 2,
            color: "#00f5a0",
            marginBottom: 10,
          }}
        >
          TRADE KEY
        </div>
        {[
          [
            "Adjusted trade value",
            "Blend of internal dynasty scoring, league format adjustments, FantasyCalc market data when available, and Sleeper trade-market multipliers.",
          ],
          [
            "Fit score",
            "Higher when the target solves one of your weak rooms, the other team needs what you are sending, and the value gap is tight.",
          ],
          [
            "Market multipliers",
            "Built from clean Sleeper trades only. Large messy package deals are filtered out so the room is not skewed by noise.",
          ],
          [
            "Tiers",
            "Balanced = close value. Aggressive = stronger push for a core asset. Blockbuster = premium asset requiring multiple meaningful pieces.",
          ],
          [
            "Hard guards",
            "Young superflex QBs and other premium assets require anchor pieces and meaningful picks/players. Late junk picks do not count.",
          ],
        ].map(([label, desc]) => (
          <div key={label} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: "#fff", marginBottom: 2 }}>
              {label}
            </div>
            <div style={{ fontSize: 11, color: "#d1d7ea", lineHeight: 1.55 }}>
              {desc}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PickChip({ pick }) {
  const color =
    pick.round === 1 ? "#00f5a0" : pick.round === 2 ? "#ffd84d" : "#d9deef";

  return (
    <span
      style={{
        ...styles.tag(color),
        marginRight: 8,
        marginBottom: 8,
        display: "inline-block",
      }}
    >
      {pick.label}
    </span>
  );
}

export default function TradeTab({
  weakRooms,
  surplusPositions,
  tradeBlock,
  picks,
  leagueContext,
  tradeMarket,
  fantasyCalcSource,
  leagueTeams,
  teamPhase,
  posRanks,
  myRosterId,
}) {
  return (
    <div>
      <TradeCalculator
        leagueTeams={leagueTeams}
        leagueContext={leagueContext}
        tradeMarket={tradeMarket}
        teamPhase={teamPhase}
      />
      <TradeFinderPanel
        myRosterId={myRosterId}
        leagueTeams={leagueTeams}
        leagueContext={leagueContext}
        tradeMarket={tradeMarket}
      />
      <TradeTargetsPanel
        myRosterId={myRosterId}
        leagueTeams={leagueTeams}
        leagueContext={leagueContext}
        tradeMarket={tradeMarket}
      />
      <div
        style={{
          ...styles.card,
          marginBottom: 24,
          borderColor: "rgba(0,245,160,0.22)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{ ...styles.sectionLabel, marginBottom: 0 }}>
            League Market Context
          </div>
          <TradeCalcKey />
        </div>
        <div style={{ fontSize: 12, color: "#d9deef", lineHeight: 1.7 }}>
          {leagueContext?.formatLabel || "League settings unavailable."}
        </div>
        <div style={{ fontSize: 11, color: "#c8cfe3", marginTop: 10 }}>
          Based on {tradeMarket?.sampleCount || 0} recent clean Sleeper trades.
          QB market: x
          {tradeMarket?.positionMultipliers?.QB?.toFixed(2) || "1.00"} · WR
          market: x{tradeMarket?.positionMultipliers?.WR?.toFixed(2) || "1.00"}{" "}
          · RB market: x
          {tradeMarket?.positionMultipliers?.RB?.toFixed(2) || "1.00"} · TE
          market: x{tradeMarket?.positionMultipliers?.TE?.toFixed(2) || "1.00"}
        </div>
        {fantasyCalcSource?.enabled && (
          <div
            style={{
              fontSize: 11,
              color: "#c8cfe3",
              marginTop: 10,
              lineHeight: 1.6,
            }}
          >
            Includes player market data from{" "}
            <a
              href={fantasyCalcSource.url}
              target="_blank"
              rel="noreferrer"
              style={{ color: "#00f5a0", textDecoration: "none" }}
            >
              FantasyCalc
            </a>{" "}
            across {fantasyCalcSource.totalPlayers} players.
          </div>
        )}
      </div>

      <div
        className="dyn-grid-2"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div style={styles.card}>
          <div style={styles.sectionLabel}>Need Rooms</div>
          {(() => {
            const set = new Set(weakRooms);
            if (posRanks) {
              for (const pos of POSITION_PRIORITY) {
                const r = posRanks[pos];
                if (r && r.rank > (r.of * 2) / 3) set.add(pos);
              }
            }
            const displayRooms = POSITION_PRIORITY.filter((pos) => set.has(pos));
            return displayRooms.length ? (
              displayRooms.map((pos) => {
                const r = posRanks?.[pos];
                return (
                  <div
                    key={pos}
                    style={{ fontSize: 12, color: "#d9deef", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                  >
                    <span><span style={{ color: "#ff6b35" }}>▸ </span>{pos}</span>
                    {r && (
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>
                        {r.rank} of {r.of}
                      </span>
                    )}
                  </div>
                );
              })
            ) : (
              <div style={{ fontSize: 12, color: "#d1d7ea" }}>
                No urgent holes. Focus on insulation upgrades.
              </div>
            );
          })()}
        </div>

        <div style={styles.card}>
          <div style={styles.sectionLabel}>Move From Strength</div>
          {(() => {
            const myTeam = leagueTeams?.find((t) => t.rosterId === myRosterId);
            const displaySurplus = posRanks
              ? POSITION_PRIORITY.filter((pos) => {
                  const r = posRanks[pos];
                  return r && r.rank <= Math.ceil(r.of / 3);
                })
              : surplusPositions;
            return displaySurplus.length ? (
              displaySurplus.map((pos) => {
                const r = posRanks?.[pos];
                const topPlayers = (myTeam?.enriched || [])
                  .filter((p) => p.position === pos)
                  .sort((a, b) => b.score - a.score)
                  .slice(0, 3);
                return (
                  <div key={pos} style={{ marginBottom: 12 }}>
                    <div
                      style={{ fontSize: 12, color: "#d9deef", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}
                    >
                      <span><span style={{ color: "#00f5a0" }}>▸ </span>{pos}</span>
                      {r && (
                        <span style={{ fontSize: 10, color: "#94a3b8" }}>
                          {r.rank} of {r.of}
                        </span>
                      )}
                    </div>
                    {topPlayers.map((p) => (
                      <div
                        key={p.id}
                        style={{ fontSize: 11, color: "#c8cfe3", marginLeft: 14, marginBottom: 2 }}
                      >
                        {p.name}{" "}
                        <span style={{ color: p.score >= 70 ? "#00f5a0" : "#94a3b8" }}>
                          ({p.score})
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })
            ) : (
              <div style={{ fontSize: 12, color: "#d1d7ea" }}>
                Lean on picks and secondary pieces more than core starters.
              </div>
            );
          })()}
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.sectionLabel}>Best Trade Chips</div>
        {tradeBlock.some(
          (p) => p.convictionTier === "high" || p.convictionTier === "speculative",
        ) && <ConvictionLegend />}
        {tradeBlock.length ? (
          [...tradeBlock]
            .sort((a, b) => {
              const order = { high: 0, standard: 1, speculative: 2 };
              const ta = order[a.convictionTier] ?? 1;
              const tb = order[b.convictionTier] ?? 1;
              if (ta !== tb) return ta - tb;
              return b.score - a.score;
            })
            .map((player) => (
              <div key={player.id} style={styles.playerRow}>
                <div>
                  <div style={{ fontSize: 13, color: "#e8e8f0" }}>
                    {player.name}
                  </div>
                  <div style={{ fontSize: 11, color: "#d1d7ea" }}>
                    {player.position} · {player.age}yo · {player.archetype}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ConvictionChip
                    tier={player.convictionTier}
                    confidence={player.confidence}
                  />
                  <span
                    style={styles.tag(
                      player.verdict === "buy" ? "#00f5a0" : "#ffd84d",
                    )}
                  >
                    {player.score}
                  </span>
                </div>
              </div>
            ))
        ) : (
          <div style={{ fontSize: 12, color: "#d1d7ea" }}>
            No obvious player chips. Use picks as the primary sweetener.
          </div>
        )}

        {!!picks.length && (
          <div style={{ marginTop: 14 }}>
            <div
              style={{
                fontSize: 10,
                color: "#c8cfe3",
                marginBottom: 8,
                letterSpacing: 2,
              }}
            >
              FLEXIBLE PICKS
            </div>
            <div>
              {picks.slice(0, 6).map((pick) => (
                <PickChip
                  key={`${pick.season}-${pick.round}-${pick.fromTeam || "own"}`}
                  pick={pick}
                />
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
