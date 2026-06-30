// Draft Blueprint — live startup-draft assistant (a view inside LiveDraftTab).
// Pick a target archetype → see the best player to take at your next pick to stay
// on plan, plus a tracker of how well your build is adhering to the blueprint.

import { useMemo } from "react";
import {
  DRAFT_BLUEPRINTS,
  availableBlueprints,
  recommendNextPick,
  trackAdherence,
  detectBlueprintFromPicks,
  projectPickImpact,
  adherenceTrajectory,
  projectLeagueOutlook,
  simulateExampleDraft,
  formatTags,
  reshapeForFormat,
} from "../../lib/draftBlueprints";

const POS_COLOR = { QB: "#ff6b6b", RB: "#4ecdc4", WR: "#ffd166", TE: "#c084fc" };
const posColor = (p) => POS_COLOR[p] || "#d9deef";

const card = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 8,
  padding: 16,
};

function AdherenceRing({ value, color }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const off = c * (1 - value / 100);
  return (
    <svg width="64" height="64" viewBox="0 0 64 64">
      <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" fontSize="16" fontWeight="700" fill="#e8e8f0">
        {value}
      </text>
    </svg>
  );
}

function DeltaPill({ delta }) {
  const up = delta > 0;
  const flat = delta === 0;
  const color = flat ? "#7a819c" : up ? "#00f5a0" : "#ff6b6b";
  return (
    <span style={{ color, fontWeight: 700 }}>
      {flat ? "±0" : `${up ? "▲" : "▼"}${Math.abs(delta)}`}
    </span>
  );
}

function RecRow({ rec, rank, impact }) {
  const p = rec.player;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "22px 1fr auto auto",
        gap: 10,
        alignItems: "center",
        padding: "8px 10px",
        background: rank === 1 ? "rgba(0,245,160,0.08)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${rank === 1 ? "rgba(0,245,160,0.25)" : "rgba(255,255,255,0.06)"}`,
        borderRadius: 6,
      }}
    >
      <span style={{ fontSize: 12, color: "#7a819c", fontWeight: 700 }}>{rank}</span>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, color: "#e8e8f0", fontWeight: 600 }}>
          <span style={{ color: posColor(p.position), fontWeight: 700, marginRight: 6 }}>{p.position}</span>
          {p.name}
          {p.team ? <span style={{ color: "#7a819c", fontWeight: 400 }}> · {p.team}</span> : null}
          <span style={{ color: "#7a819c", fontWeight: 400 }}> · {p.age}y</span>
        </div>
        {rec.reasons.length > 0 && (
          <div style={{ fontSize: 11, color: "#9097ad", marginTop: 2 }}>{rec.reasons.slice(0, 2).join(" · ")}</div>
        )}
      </div>
      {/* How this pick moves your blueprint match */}
      {impact && (
        <div style={{ textAlign: "right", minWidth: 70 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#e8e8f0" }}>
            {impact.after}% <DeltaPill delta={impact.delta} />
          </div>
          <div style={{ fontSize: 10, color: "#7a819c" }}>match after</div>
        </div>
      )}
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#00f5a0" }}>{rec.valueScore}</div>
        <div style={{ fontSize: 10, color: "#7a819c" }}>value</div>
      </div>
    </div>
  );
}

// Sparkline of blueprint match over picks made, with a dashed projected next point.
function MatchTrajectory({ history, projected }) {
  const pts = [...history];
  if (projected != null) pts.push(projected);
  if (pts.length === 0) return null;
  const W = 260, H = 56, pad = 6;
  const n = pts.length;
  const x = (i) => (n === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (n - 1));
  const y = (v) => H - pad - (v / 100) * (H - 2 * pad);
  const solidPts = history.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const lastHist = history.length - 1;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <line x1={pad} y1={y(50)} x2={W - pad} y2={y(50)} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 3" />
      {history.length > 1 && <polyline points={solidPts} fill="none" stroke="#00f5a0" strokeWidth="2" />}
      {projected != null && history.length > 0 && (
        <line
          x1={x(lastHist)} y1={y(history[lastHist])}
          x2={x(lastHist + 1)} y2={y(projected)}
          stroke="#ffd166" strokeWidth="2" strokeDasharray="3 3"
        />
      )}
      {history.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r="2.5" fill="#00f5a0" />
      ))}
      {projected != null && (
        <circle cx={x(n - 1)} cy={y(projected)} r="3.5" fill="#ffd166" stroke="#1a1a2e" strokeWidth="1" />
      )}
    </svg>
  );
}

export default function DraftBlueprintPanel({
  blueprintId,
  setBlueprintId,
  strict,
  setStrict,
  round,
  pool = [],
  myDrafted = [],
  outlookTeams = [],
  remainingPicks = [],
  mySlot = null,
  leagueContext = {},
}) {
  const options = useMemo(() => availableBlueprints(leagueContext), [leagueContext]);

  // Auto-detect the closest blueprint to the draft so far (this feature shipped
  // mid-draft for some leagues, so we infer the plan they're already running).
  const detected = useMemo(
    () => detectBlueprintFromPicks(myDrafted, leagueContext),
    [myDrafted, leagueContext],
  );

  // Active target = the user's explicit pick, else the detected match. So opening
  // the view mid-draft immediately shows recommendations to continue that plan.
  const activeId = blueprintId || detected.top?.id || null;
  const blueprint = activeId ? DRAFT_BLUEPRINTS[activeId] : null;
  const isAutoDetected = !blueprintId && !!detected.top;

  // My next *owned* pick (trade-aware). When I've used or traded away every pick,
  // the draft is complete for me → show a final team view instead of recommendations.
  const myRemaining = (remainingPicks || []).filter((p) => p.mine);
  const myNextRound = myRemaining[0]?.round ?? (remainingPicks.length === 0 ? round : null);
  const isComplete = remainingPicks.length > 0 && myRemaining.length === 0;

  // League-format chips + a TE-premium-reshaped pool (FantasyCalc values already bake
  // in PPR + Superflex; TE premium is applied here). All sims draft off this pool.
  const tags = useMemo(() => formatTags(leagueContext), [leagueContext]);
  const fmtPool = useMemo(() => reshapeForFormat(pool, leagueContext), [pool, leagueContext]);

  const recs = useMemo(() => {
    if (!blueprint || myNextRound == null) return [];
    const ranked = recommendNextPick({
      blueprint,
      round: myNextRound,
      pool: fmtPool,
      myRoster: myDrafted,
      leagueContext,
      opts: { strict, limit: 12 },
    });
    // Project how each candidate moves the blueprint match (on the live value scale).
    return ranked.map((r) => ({
      ...r,
      impact: projectPickImpact(blueprint, myDrafted, {
        position: r.player.position,
        age: r.player.age,
        round: myNextRound,
        value: r.player.liveValue ?? r.player.dynastyValue?.value ?? 0,
      }),
    }));
  }, [blueprint, myNextRound, fmtPool, myDrafted, strict, leagueContext]);

  const adherence = useMemo(
    () => (blueprint ? trackAdherence(blueprint, myDrafted) : null),
    [blueprint, myDrafted],
  );

  // Match-over-time trajectory + the dashed projection from the top recommendation.
  const trajectory = useMemo(
    () => (blueprint ? adherenceTrajectory(blueprint, myDrafted) : []),
    [blueprint, myDrafted],
  );
  const projectedNext = recs[0]?.impact?.after ?? null;

  // League outlook: projected forward dynasty strength vs the field, following the
  // plan. Uses real (trade-adjusted) remaining-pick ownership.
  const outlook = useMemo(
    () =>
      blueprint && outlookTeams.length
        ? projectLeagueOutlook({ teams: outlookTeams, pool: fmtPool, blueprint, remainingPicks, leagueContext })
        : [],
    [blueprint, outlookTeams, fmtPool, remainingPicks, leagueContext],
  );
  const baselineRank = useMemo(() => {
    if (!blueprint || !outlookTeams.length) return null;
    const b = projectLeagueOutlook({ teams: outlookTeams, pool: fmtPool, blueprint, remainingPicks, baseline: true, leagueContext });
    return b.find((t) => t.isMe)?.projRank ?? null;
  }, [blueprint, outlookTeams, fmtPool, remainingPicks, leagueContext]);
  const myOutlook = outlook.find((t) => t.isMe);
  const maxProj = outlook.length ? Math.max(...outlook.map((t) => t.proj)) : 1;

  // Round-by-round example/your build: picks so far + projected on-plan remainder
  // for the picks you actually own (none → complete final team).
  const example = useMemo(
    () =>
      blueprint
        ? simulateExampleDraft({ blueprint, pool: fmtPool, remainingPicks, myDrafted, leagueContext }).picks
        : [],
    [blueprint, fmtPool, remainingPicks, myDrafted, leagueContext],
  );

  const ringColor = adherence
    ? adherence.overall >= 70 ? "#00f5a0" : adherence.overall >= 45 ? "#ffd166" : "#ff6b6b"
    : "#7a819c";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Target selector */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          <div style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700 }}>
            TARGET BLUEPRINT
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {tags.map((t) => (
              <span key={t.key} style={{ fontSize: 10, fontWeight: 600, padding: "1px 7px", borderRadius: 9, background: "rgba(0,245,160,0.1)", border: "1px solid rgba(0,245,160,0.22)", color: "#00f5a0" }}>
                {t.label}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={activeId || ""}
            onChange={(e) => setBlueprintId(e.target.value || null)}
            style={{
              background: "rgba(0,0,0,0.3)",
              color: "#e8e8f0",
              border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: 6,
              padding: "7px 10px",
              fontSize: 13,
              minWidth: 220,
            }}
          >
            <option value="">Choose a strategy…</option>
            {options.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
          {blueprint && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#cdd2e4", cursor: "pointer" }}>
              <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
              Strict on-plan
            </label>
          )}
        </div>
        {blueprint && <div style={{ fontSize: 12, color: "#aab0c6", marginTop: 8 }}>{blueprint.tagline}</div>}

        {detected.top && detected.pickCount > 0 && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontSize: 12, color: "#cdd2e4" }}>
              Through <strong>{detected.pickCount}</strong> pick{detected.pickCount === 1 ? "" : "s"},
              your draft most resembles{" "}
              <strong style={{ color: detected.top.color }}>{detected.top.label}</strong>{" "}
              <span style={{ color: "#7a819c" }}>({detected.top.fit}% match)</span>.
              {isAutoDetected
                ? " Set as your target — change it above to plan a different finish."
                : null}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {detected.matches.slice(0, 3).map((m) => (
                <span
                  key={m.id}
                  style={{
                    fontSize: 11,
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: m.id === activeId ? "rgba(0,245,160,0.12)" : "rgba(255,255,255,0.05)",
                    border: `1px solid ${m.id === activeId ? "rgba(0,245,160,0.3)" : "rgba(255,255,255,0.08)"}`,
                    color: m.id === activeId ? "#00f5a0" : "#aab0c6",
                  }}
                >
                  {m.label} {m.fit}%
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {!blueprint && (
        <div style={{ ...card, color: "#9097ad", fontSize: 13 }}>
          Pick a target strategy above and we'll recommend who to draft next to stay on plan,
          and track how well your build is adhering. Once you've made a pick or two, we'll also
          auto-detect the blueprint your draft is already closest to.
        </div>
      )}

      {blueprint && (
        <>
          {isComplete && (
            <div style={{ ...card, borderColor: "rgba(0,245,160,0.25)", background: "rgba(0,245,160,0.06)" }}>
              <div style={{ fontSize: 13, color: "#e8e8f0", fontWeight: 600 }}>
                ✓ Your draft is complete — no remaining picks.
              </div>
              <div style={{ fontSize: 12, color: "#9097ad", marginTop: 3 }}>
                Here's your final team and how it landed against <strong style={{ color: blueprint.color }}>{blueprint.label}</strong>.
              </div>
            </div>
          )}

          {/* Adherence */}
          <div style={{ ...card, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <AdherenceRing value={adherence.overall} color={ringColor} />
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginBottom: 6 }}>
                {isComplete ? "FINAL BLUEPRINT MATCH" : "PLAN ADHERENCE"}
              </div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12 }}>
                <div>
                  <span style={{ color: "#7a819c" }}>Avg age </span>
                  <span style={{ color: adherence.avgAge.ok ? "#00f5a0" : "#ffd166", fontWeight: 700 }}>
                    {adherence.avgAge.actual || "—"}
                  </span>
                  <span style={{ color: "#7a819c" }}> / {adherence.avgAge.target}</span>
                </div>
                <div>
                  <span style={{ color: "#7a819c" }}>On-plan picks </span>
                  <span style={{ color: "#e8e8f0", fontWeight: 700 }}>{adherence.onPlanPickPct}%</span>
                </div>
              </div>
              {adherence.deviations.length > 0 && (
                <div style={{ fontSize: 11, color: "#ff9a76", marginTop: 6 }}>
                  {adherence.deviations.join(" · ")}
                </div>
              )}
            </div>

            {/* Future trajectory — how the plan has tracked + where the next pick takes it */}
            {trajectory.length > 0 && (
              <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginBottom: 4 }}>
                  <span>MATCH TRAJECTORY</span>
                  {projectedNext != null && (
                    <span style={{ color: "#ffd166" }}>
                      next pick → {projectedNext}%
                    </span>
                  )}
                </div>
                <MatchTrajectory history={trajectory} projected={projectedNext} />
                <div style={{ fontSize: 10, color: "#7a819c", marginTop: 2 }}>
                  <span style={{ color: "#00f5a0" }}>● </span>match so far
                  {projectedNext != null && (
                    <>
                      <span style={{ color: "#ffd166", marginLeft: 8 }}>● </span>if you take #1
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Recommendations — hidden once the draft is complete for this manager */}
          {!isComplete && (
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700 }}>
                  TARGET AT YOUR NEXT PICK {myNextRound ? `· ROUND ${myNextRound}` : ""}
                </div>
                <div style={{ fontSize: 10, color: "#7a819c" }}>{strict ? "strict on-plan" : "value-blended"}</div>
              </div>
              {recs.length === 0 ? (
                <div style={{ fontSize: 13, color: "#9097ad" }}>No undrafted players available to recommend.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {recs.map((r, i) => (
                    <RecRow key={r.player.id} rec={r} rank={i + 1} impact={r.impact} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* League outlook — projected forward strength vs the field */}
          {outlook.length > 1 && myOutlook && (
            <div style={card}>
              <div style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginBottom: 4 }}>
                LEAGUE OUTLOOK · PROJECTED DYNASTY STRENGTH
              </div>
              <div style={{ fontSize: 13, color: "#cdd2e4", marginBottom: 12 }}>
                Following <strong style={{ color: blueprint.color }}>{blueprint.label}</strong>, you project to finish{" "}
                <strong style={{ color: "#00f5a0" }}>#{myOutlook.projRank}</strong> of {outlook.length}
                {myOutlook.projRank !== myOutlook.nowRank && (
                  <span style={{ color: "#7a819c" }}> (now #{myOutlook.nowRank})</span>
                )}
                {baselineRank != null && baselineRank !== myOutlook.projRank && (
                  <span style={{ color: "#7a819c" }}> — best-available would finish #{baselineRank}</span>
                )}
                .
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {outlook.map((t) => {
                  const move = t.nowRank - t.projRank; // + = climbing the ranks
                  return (
                    <div key={t.rosterId} style={{ display: "grid", gridTemplateColumns: "18px 120px 1fr 44px", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: t.isMe ? "#00f5a0" : "#7a819c", fontWeight: 700 }}>{t.projRank}</span>
                      <span style={{ fontSize: 12, color: t.isMe ? "#00f5a0" : "#cdd2e4", fontWeight: t.isMe ? 700 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.isMe ? "Your team" : t.label}
                      </span>
                      <div style={{ height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(2, (t.proj / maxProj) * 100)}%`, height: "100%", background: t.isMe ? "#00f5a0" : "rgba(255,255,255,0.22)", borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 10, color: move > 0 ? "#00f5a0" : move < 0 ? "#ff6b6b" : "#7a819c", textAlign: "right" }}>
                        {move === 0 ? "–" : move > 0 ? `▲${move}` : `▼${Math.abs(move)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: "#7a819c", marginTop: 8 }}>
                Projection simulates the remaining draft (you on-plan, the field best-available) and values
                each roster by age-adjusted forward value — dynasty strength, not win-now points.
              </div>
            </div>
          )}

          {/* Example build — round-by-round draft following this blueprint (or the final team) */}
          {example.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 11, letterSpacing: 1, color: "#7a819c", fontWeight: 700, marginBottom: 4 }}>
                {isComplete ? "YOUR FINAL TEAM" : "EXAMPLE BUILD"} · {blueprint.label.toUpperCase()}
                {!isComplete && mySlot ? ` · FROM SLOT ${mySlot}` : ""}
              </div>
              <div style={{ fontSize: 12, color: "#9097ad", marginBottom: 12 }}>
                {isComplete
                  ? "Every pick you made, round by round — this is the roster being graded above."
                  : "What this strategy looks like round by round — your picks so far, then the on-plan player likely to be there at each pick you own."}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                {example.map((e) => {
                  const p = e.player;
                  return (
                    <div
                      key={`${e.round}-${p.id || p.name}`}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 6,
                        background: e.made ? "rgba(0,245,160,0.07)" : "rgba(255,255,255,0.03)",
                        border: `1px solid ${e.made ? "rgba(0,245,160,0.2)" : "rgba(255,255,255,0.06)"}`,
                      }}
                    >
                      <div style={{ fontSize: 10, color: "#7a819c", marginBottom: 2 }}>
                        R{e.round} {e.made ? "· drafted" : "· projected"}
                      </div>
                      <div style={{ fontSize: 13, color: "#e8e8f0", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <span style={{ color: posColor(p.position), fontWeight: 700, marginRight: 5 }}>{p.position}</span>
                        {p.name}
                      </div>
                      <div style={{ fontSize: 10, color: "#7a819c" }}>
                        {p.team ? `${p.team} · ` : ""}{p.age ? `${p.age}y` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 10, color: "#7a819c", marginTop: 10 }}>
                Availability uses dynasty value-rank as an ADP proxy (no true ADP feed yet) — an
                illustrative snake draft, not an exact forecast.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
