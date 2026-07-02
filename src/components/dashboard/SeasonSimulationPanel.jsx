import { useEffect, useMemo, useState } from "react";
import { styles } from "../../styles";
import { useSeasonSimulation } from "../../lib/useSeasonSimulation";

const ACCENT = "#00f5a0";
const GOLD = "#fbbf24";
const BLUE = "#60a5fa";
const MUTED = "#94a3b8";
const TEXT = "#e2e8f0";

const SIM_COUNTS = [50, 100, 1000, 10000];
const SPEEDS = [
  { key: "slow", label: "🐢 Slow" },
  { key: "normal", label: "Normal" },
  { key: "fast", label: "⚡ Fast" },
];

const pct = (n) => (n == null || isNaN(n) ? "—" : `${(Number(n) * 100).toFixed(0)}%`);
const pct1 = (n) => (n == null || isNaN(n) ? "—" : `${(Number(n) * 100).toFixed(1)}%`);
const num = (n) => (n == null || isNaN(n) ? "—" : Number(n).toLocaleString());

/** Big live-counting stat readout. */
function StatReadout({ label, value, color }) {
  return (
    <div style={{ flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 9, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}

/** Histogram of the focus team's simulated final-win totals (0..weeks). */
function WinsHistogram({ histogram, weeks, avgWins }) {
  const W = 420;
  const H = 150;
  const padB = 22;
  const padT = 8;
  const total = histogram.reduce((a, b) => a + b, 0);
  const maxCount = Math.max(1, ...histogram);
  const bins = histogram.length; // weeks + 1
  const bw = W / bins;
  const modal = histogram.indexOf(maxCount);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Distribution of simulated win totals">
      {histogram.map((c, i) => {
        const h = total > 0 ? (c / maxCount) * (H - padB - padT) : 0;
        const x = i * bw + 2;
        const y = H - padB - h;
        const isMode = i === modal && total > 0;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={bw - 4}
              height={Math.max(0, h)}
              rx={2}
              fill={isMode ? ACCENT : "rgba(96,165,250,0.55)"}
              style={{ transition: "height 0.25s ease, y 0.25s ease" }}
            />
            {(i % 2 === 0 || bins <= 10) && (
              <text x={x + (bw - 4) / 2} y={H - 7} fill={MUTED} fontSize="9" textAnchor="middle">
                {i}
              </text>
            )}
          </g>
        );
      })}
      {avgWins > 0 && (
        <line
          x1={avgWins * bw + bw / 2}
          x2={avgWins * bw + bw / 2}
          y1={padT}
          y2={H - padB}
          stroke={GOLD}
          strokeWidth="1.5"
          strokeDasharray="3 3"
          style={{ transition: "x1 0.25s ease, x2 0.25s ease" }}
        />
      )}
    </svg>
  );
}

/** Sampled season "paths": cumulative wins by week, one faint line per sim. */
function SeasonPaths({ trajectories, weeks }) {
  const W = 420;
  const H = 170;
  const padL = 26;
  const padB = 20;
  const padT = 8;
  const plotW = W - padL - 6;
  const plotH = H - padB - padT;
  const xOf = (wk) => padL + (weeks > 0 ? (wk / weeks) * plotW : 0);
  const yOf = (w) => padT + plotH - (weeks > 0 ? (w / weeks) * plotH : 0);

  // Mean path across the sampled trajectories.
  const mean = useMemo(() => {
    if (!trajectories.length) return [];
    const acc = new Array(weeks).fill(0);
    for (const t of trajectories) for (let w = 0; w < weeks; w++) acc[w] += t.wins[w] || 0;
    return acc.map((s) => s / trajectories.length);
  }, [trajectories, weeks]);

  const pathFor = (wins) => {
    const pts = [`${xOf(0)},${yOf(0)}`];
    for (let w = 0; w < weeks; w++) pts.push(`${xOf(w + 1)},${yOf(wins[w] || 0)}`);
    return pts.join(" ");
  };

  const gridWins = [0, Math.round(weeks / 2), weeks];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Sampled season win paths">
      {gridWins.map((g) => (
        <g key={g}>
          <line x1={padL} x2={W - 6} y1={yOf(g)} y2={yOf(g)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          <text x={padL - 5} y={yOf(g) + 3} fill={MUTED} fontSize="9" textAnchor="end">{g}</text>
        </g>
      ))}
      {trajectories.map((t, i) => (
        <polyline
          key={i}
          points={pathFor(t.wins)}
          fill="none"
          stroke={t.champ ? GOLD : t.madePlayoffs ? ACCENT : MUTED}
          strokeWidth={t.champ ? 1.6 : 1}
          strokeOpacity={t.champ ? 0.9 : t.madePlayoffs ? 0.4 : 0.22}
          style={{ transition: "stroke-opacity 0.3s ease" }}
        />
      ))}
      {mean.length > 0 && (
        <polyline
          points={pathFor(mean)}
          fill="none"
          stroke={TEXT}
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}
      <text x={W - 6} y={H - 6} fill={MUTED} fontSize="9" textAnchor="end">week →</text>
    </svg>
  );
}

const RED = "#f87171";
/** Green when a clear favorite, gold near coin-flip, red when an underdog. */
const oddsColor = (o) => (o == null ? "rgba(255,255,255,0.18)" : o >= 0.58 ? ACCENT : o >= 0.45 ? GOLD : RED);

/**
 * Week-by-week deep dive: the focus team's win probability in each scheduled
 * matchup, as a bar chart the manager can step through (click / slider / prev-
 * next / auto-play). The 50% line splits favorites from underdogs — the shape
 * is the season's ups and downs.
 */
function WeekExplorer({ weekly }) {
  const weeksN = weekly.length;
  const [sel, setSel] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return undefined;
    const id = setInterval(() => {
      setSel((s) => {
        if (s >= weeksN - 1) { setPlaying(false); return s; }
        return s + 1;
      });
    }, 750);
    return () => clearInterval(id);
  }, [playing, weeksN]);

  if (weeksN === 0) return null;
  const idx = Math.min(sel, weeksN - 1);
  const cur = weekly[idx];

  const W = 640;
  const H = 148;
  const padT = 10;
  const padB = 18;
  const padX = 6;
  const plotH = H - padT - padB;
  const bw = (W - padX * 2) / weeksN;
  const yFor = (o) => H - padB - (o || 0) * plotH;

  const go = (i) => { setPlaying(false); setSel(Math.max(0, Math.min(weeksN - 1, i))); };

  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: 9, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>
          Week-by-week · your odds to win each matchup
        </div>
        <div style={{ fontSize: 10.5, color: MUTED }}>click a bar, drag the slider, or press play</div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", marginTop: 6 }} role="img" aria-label="Weekly win probability">
        {/* 50% reference line */}
        <line x1={padX} x2={W - padX} y1={yFor(0.5)} y2={yFor(0.5)} stroke="rgba(255,255,255,0.18)" strokeWidth="1" strokeDasharray="4 4" />
        <text x={padX} y={yFor(0.5) - 3} fill={MUTED} fontSize="8.5">coin flip</text>
        {weekly.map((wk, i) => {
          const o = wk.winOdds;
          const h = wk.bye ? 5 : Math.max(2, (o || 0) * plotH);
          const x = padX + i * bw;
          const y = H - padB - h;
          const isSel = i === idx;
          return (
            <g key={i} onClick={() => go(i)} style={{ cursor: "pointer" }}>
              {isSel && <rect x={x + 0.5} y={padT} width={bw - 1} height={plotH} fill="rgba(255,255,255,0.06)" rx={2} />}
              <rect
                x={x + 2}
                y={y}
                width={bw - 4}
                height={h}
                rx={2}
                fill={oddsColor(o)}
                opacity={wk.bye ? 0.5 : 1}
                stroke={isSel ? TEXT : "none"}
                strokeWidth={isSel ? 1 : 0}
                style={{ transition: "height 0.2s ease, y 0.2s ease" }}
              />
              <text x={x + bw / 2} y={H - 5} fill={isSel ? TEXT : MUTED} fontSize="8.5" textAnchor="middle" fontWeight={isSel ? 700 : 400}>
                {wk.week}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Stepper controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
        <button onClick={() => go(idx - 1)} disabled={idx === 0} style={stepBtn(idx === 0)}>◀</button>
        <input
          type="range"
          min={0}
          max={weeksN - 1}
          value={idx}
          onChange={(e) => go(Number(e.target.value))}
          style={{ flex: 1, accentColor: ACCENT, cursor: "pointer" }}
        />
        <button onClick={() => go(idx + 1)} disabled={idx === weeksN - 1} style={stepBtn(idx === weeksN - 1)}>▶</button>
        <button
          onClick={() => setPlaying((p) => !p)}
          style={{ ...stepBtn(false), color: playing ? GOLD : ACCENT, minWidth: 60 }}
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
      </div>

      {/* Selected-week detail */}
      <div style={{ marginTop: 10, padding: "12px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 5, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, letterSpacing: 1.5, color: MUTED, textTransform: "uppercase", minWidth: 54 }}>
          Week {cur.week}
        </div>
        {cur.bye ? (
          <div style={{ color: MUTED, fontStyle: "italic" }}>Bye week — no matchup.</div>
        ) : (
          <>
            <div style={{ color: TEXT, fontSize: 14 }}>
              vs <span style={{ fontWeight: 700 }}>{cur.opponentLabel}</span>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 9, letterSpacing: 1.5, color: MUTED, textTransform: "uppercase" }}>Win odds</span>
              <span style={{ fontSize: 26, fontWeight: 800, color: oddsColor(cur.winOdds), fontVariantNumeric: "tabular-nums" }}>
                {pct1(cur.winOdds)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function stepBtn(disabled) {
  return {
    padding: "5px 12px",
    borderRadius: 4,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    color: disabled ? "rgba(148,163,184,0.4)" : TEXT,
    fontWeight: 700,
    fontSize: 12,
    cursor: disabled ? "default" : "pointer",
    fontFamily: "inherit",
  };
}

/** Live league leaderboard, re-sorted by championship odds as sims accumulate. */
function Leaderboard({ results, myRosterId }) {
  const maxChamp = Math.max(0.001, ...results.map((r) => r.championOdds));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {results.map((r) => {
        const mine = String(r.rosterId) === String(myRosterId);
        return (
          <div key={r.rosterId} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 20, textAlign: "right", color: MUTED, fontSize: 11, fontWeight: 700 }}>
              {r.powerRank}
            </span>
            <span
              style={{
                width: 150,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: mine ? ACCENT : TEXT,
                fontWeight: mine ? 700 : 500,
                fontSize: 12,
              }}
            >
              {r.label}{mine ? " (you)" : ""}
            </span>
            <div style={{ flex: 1, height: 9, background: "rgba(255,255,255,0.06)", borderRadius: 5, overflow: "hidden" }}>
              <div
                style={{
                  width: `${(r.championOdds / maxChamp) * 100}%`,
                  height: "100%",
                  background: mine ? ACCENT : GOLD,
                  borderRadius: 5,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
            <span style={{ width: 46, textAlign: "right", color: mine ? ACCENT : GOLD, fontWeight: 700, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
              {pct1(r.championOdds)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function SeasonSimulationPanel({
  input = [],
  myRosterId,
  regWeeks = 14,
  playoffTeams = 6,
  hasProj = true,
}) {
  const { status, progress, total, snapshot, run } = useSeasonSimulation({
    input,
    weeks: regWeeks,
    playoffTeams,
    focusRosterId: myRosterId,
  });

  const [speed, setSpeed] = useState("slow");
  const running = status === "running";
  const focus = snapshot?.focus;
  const results = snapshot?.results || [];
  const hasMyTeam = input.some((t) => String(t.rosterId) === String(myRosterId));

  return (
    <div style={{ ...styles.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div style={styles.sectionLabel}>Season Simulations · Watch it play out</div>
        {snapshot && (
          <div style={{ fontSize: 11, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
            {num(snapshot.simsDone)}{total ? ` / ${num(total)}` : ""} sims
          </div>
        )}
      </div>

      <div style={{ color: MUTED, fontSize: 12.5, lineHeight: 1.6, margin: "2px 0 14px" }}>
        Run the season {hasProj ? "off the projection model" : "off realized scoring"} and watch your team's fortunes
        take shape — each path below is one simulated season. Pick a sample size:
      </div>

      {/* Control row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {SIM_COUNTS.map((c) => (
          <button
            key={c}
            onClick={() => run(c, speed)}
            disabled={running}
            style={{
              padding: "8px 16px",
              borderRadius: 5,
              border: `1px solid ${running ? "rgba(255,255,255,0.12)" : "rgba(0,245,160,0.35)"}`,
              background: running ? "rgba(255,255,255,0.03)" : "rgba(0,245,160,0.08)",
              color: running ? MUTED : ACCENT,
              fontWeight: 700,
              fontSize: 13,
              cursor: running ? "default" : "pointer",
              fontFamily: "inherit",
            }}
          >
            {num(c)}
          </button>
        ))}
        {running && <span className="dyn-live-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: ACCENT, display: "inline-block" }} />}
        {running && <span style={{ color: MUTED, fontSize: 12 }}>simulating…</span>}
      </div>

      {/* Speed control */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
        <span style={{ fontSize: 9, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>Speed</span>
        {SPEEDS.map((s) => {
          const on = speed === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setSpeed(s.key)}
              disabled={running}
              style={{
                padding: "5px 11px",
                borderRadius: 4,
                border: `1px solid ${on ? "rgba(0,245,160,0.45)" : "rgba(255,255,255,0.12)"}`,
                background: on ? "rgba(0,245,160,0.1)" : "transparent",
                color: on ? ACCENT : MUTED,
                fontWeight: on ? 700 : 500,
                fontSize: 11.5,
                cursor: running ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {s.label}
            </button>
          );
        })}
        <span style={{ fontSize: 11, color: MUTED }}>— slow lets you watch the odds settle</span>
      </div>

      {/* Progress bar */}
      {(running || (total > 0 && progress > 0)) && (
        <div style={{ height: 3, width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 2, overflow: "hidden", marginTop: 12 }}>
          <div style={{ height: "100%", width: `${progress * 100}%`, background: ACCENT, borderRadius: 2, transition: "width 0.3s ease" }} />
        </div>
      )}

      {!snapshot && (
        <div style={{ color: MUTED, fontSize: 13, textAlign: "center", padding: "28px 0 8px" }}>
          Pick a sample size above to watch your season play out.
        </div>
      )}

      {snapshot && (
        <div style={{ marginTop: 18 }}>
          {/* Your-team spotlight */}
          {hasMyTeam && focus ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 20 }}>
              <div>
                <div style={{ fontSize: 13, color: TEXT, fontWeight: 700, marginBottom: 10 }}>
                  {focus.label} <span style={{ color: MUTED, fontWeight: 400 }}>— your season</span>
                </div>
                <div style={{ display: "flex", gap: 14, marginBottom: 4 }}>
                  <StatReadout label="Playoffs" value={pct(focus.playoffOdds)} color={ACCENT} />
                  <StatReadout label="Champion" value={pct1(focus.championOdds)} color={GOLD} />
                  <StatReadout label="Avg wins" value={String(Math.round(focus.avgWins))} color={TEXT} />
                </div>
                <div style={{ fontSize: 9, letterSpacing: 2, color: MUTED, textTransform: "uppercase", margin: "14px 0 4px" }}>
                  Final record distribution
                </div>
                <WinsHistogram histogram={focus.winsHistogram} weeks={focus.weeks} avgWins={focus.avgWins} />
                <div style={{ fontSize: 10.5, color: MUTED, textAlign: "center" }}>simulated regular-season wins</div>
              </div>
              <div>
                <div style={{ fontSize: 9, letterSpacing: 2, color: MUTED, textTransform: "uppercase", marginBottom: 6 }}>
                  Season paths <span style={{ color: GOLD }}>● title</span> <span style={{ color: ACCENT }}>● playoffs</span> <span style={{ color: MUTED }}>● missed</span>
                </div>
                <SeasonPaths trajectories={focus.trajectories} weeks={focus.weeks} />
              </div>
              {/* Week-by-week explorer spans the full width below the two charts. */}
              {focus.weekly && focus.weekly.length > 0 && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <WeekExplorer weekly={focus.weekly} />
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: MUTED, fontSize: 12.5, marginBottom: 14 }}>
              {hasMyTeam ? "Crunching your team…" : "Your team isn't in this league view — showing the league race below."}
            </div>
          )}

          {/* League leaderboard */}
          <div style={{ marginTop: hasMyTeam && focus ? 22 : 0 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, color: MUTED, textTransform: "uppercase", marginBottom: 8 }}>
              League title race
            </div>
            <Leaderboard results={results} myRosterId={myRosterId} />
          </div>
        </div>
      )}
    </div>
  );
}
