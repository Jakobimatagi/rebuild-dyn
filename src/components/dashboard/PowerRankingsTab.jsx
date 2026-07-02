import { Fragment, useEffect, useMemo, useState } from "react";
import { styles } from "../../styles";
import { fetchNflState, fetchSeasonProjectionAverages } from "../../lib/projectionsApi";
import { lineupStrength, simulatePowerRankings } from "../../lib/powerRankings";
import SeasonSimulationPanel from "./SeasonSimulationPanel";

const ACCENT = "#00f5a0";
const MUTED = "#94a3b8";
const GOLD = "#fbbf24";
const POS_COLOR = { QB: "#f87171", RB: "#34d399", WR: "#60a5fa", TE: "#fbbf24" };
const STARTER_SLOTS = new Set(["QB", "RB", "WR", "TE"]);

function teamName(t) {
  return t?.label || t?.teamName || t?.name || `Roster ${t?.rosterId}`;
}

const pct = (n) => (n == null || isNaN(n) ? "—" : `${(Number(n) * 100).toFixed(0)}%`);
const pct1 = (n) => (n == null || isNaN(n) ? "—" : `${(Number(n) * 100).toFixed(1)}%`);
const fmt = (n, d = 1) => (n == null || isNaN(n) ? "—" : Number(n).toFixed(d));

/** Merge a team's enriched roster with the season-average projection map. */
function mergeAverages(team, byPlayerId) {
  return (team?.enriched || []).map((p) => {
    const a = byPlayerId.get(String(p.id));
    return {
      id: String(p.id),
      name: p.name,
      pos: p.position,
      team: p.team,
      injuryStatus: p.injuryStatus,
      proj: a ? Number(a.proj_ppr) : null,
      floor: a ? Number(a.floor) : null,
      ceiling: a ? Number(a.ceiling) : null,
    };
  });
}

function PosTag({ pos }) {
  return <span style={styles.tag(POS_COLOR[pos] || MUTED)}>{pos}</span>;
}

function Bar({ value, color = ACCENT, width = 120 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width, height: 7, background: "rgba(255,255,255,0.08)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, value * 100))}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
    </div>
  );
}

function Notice({ title, children }) {
  return (
    <div style={{ ...styles.card, textAlign: "center", padding: "40px 22px" }}>
      <div style={{ ...styles.sectionLabel, justifyContent: "center" }}>{title}</div>
      <div style={{ color: MUTED, maxWidth: 560, margin: "0 auto", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

/** Settings + methodology header. */
function SettingsBar({ league, numTeams, regWeeks, playoffTeams, isSuperflex, scoringLabel, projLed }) {
  const chip = (label, value) => (
    <div>
      <div style={{ fontSize: 9, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#e2e8f0" }}>{value}</div>
    </div>
  );
  return (
    <div style={{ ...styles.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div style={styles.sectionLabel}>League Settings</div>
        <div style={{ fontSize: 11, color: projLed ? ACCENT : GOLD, fontWeight: 600 }}>
          {projLed ? "● Projection-led" : "● Results-based (no projections published)"}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 14, marginTop: 4 }}>
        {chip("Teams", numTeams)}
        {chip("Format", isSuperflex ? "Superflex" : "1QB")}
        {chip("Scoring", scoringLabel)}
        {chip("Playoff field", `${playoffTeams} teams`)}
        {chip("Reg. season", `${regWeeks} wks`)}
        {chip("Sims", "4,000")}
      </div>
    </div>
  );
}

/** Expanded roster layout for one team: optimal starters + bench depth. */
function RosterLayout({ players, lineup }) {
  const starterIds = new Set(lineup.starters.map((s) => s.player?.id).filter(Boolean));
  const bench = players
    .filter((p) => !starterIds.has(p.id))
    .sort((a, b) => (b.proj || 0) - (a.proj || 0));

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, padding: "4px 0 8px" }}>
      <div>
        <div style={styles.sectionLabel}>Optimal starting lineup</div>
        {lineup.starters.map(({ slot, player }, i) => (
          <div key={i} style={{ ...styles.playerRow, padding: "7px 0" }}>
            <span style={{ width: 70, fontSize: 10, letterSpacing: 1.5, color: MUTED, textTransform: "uppercase" }}>{slot}</span>
            {player ? (
              <>
                <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                  <PosTag pos={player.pos} />
                  <span style={{ color: "#e2e8f0" }}>{player.name}</span>
                </span>
                <span style={{ width: 48, textAlign: "right", color: ACCENT, fontWeight: 700 }}>{fmt(player.proj)}</span>
              </>
            ) : (
              <span style={{ flex: 1, color: MUTED, fontStyle: "italic" }}>(empty)</span>
            )}
          </div>
        ))}
        <div style={{ ...styles.playerRow, borderBottom: "none", paddingTop: 10 }}>
          <span style={{ flex: 1, fontWeight: 700, color: "#e2e8f0" }}>Projected max / week</span>
          <span style={{ color: ACCENT, fontWeight: 800, fontSize: 16 }}>{fmt(lineup.total)}</span>
        </div>
      </div>
      <div>
        <div style={styles.sectionLabel}>Bench depth ({bench.length})</div>
        {bench.slice(0, 12).map((p) => (
          <div key={p.id} style={{ ...styles.playerRow, padding: "6px 0" }}>
            <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
              <PosTag pos={p.pos} />
              <span style={{ color: "#cbd5e1" }}>{p.name}</span>
            </span>
            <span style={{ width: 48, textAlign: "right", color: MUTED }}>{p.proj != null ? fmt(p.proj) : "—"}</span>
          </div>
        ))}
        {bench.length === 0 && <div style={{ color: MUTED, fontSize: 13 }}>No bench players.</div>}
      </div>
    </div>
  );
}

export default function PowerRankingsTab({
  leagueTeams = [],
  myRosterId,
  league,
  isSuperflex,
}) {
  const [nflState, setNflState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [avg, setAvg] = useState(null); // { byPlayerId, count }
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const state = await fetchNflState().catch(() => null);
      if (!alive) return;
      setNflState(state);
    })();
    return () => { alive = false; };
  }, []);

  const season = Number(nflState?.season) || new Date().getFullYear();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const a = await fetchSeasonProjectionAverages(season).catch(() => ({ byPlayerId: new Map(), count: 0 }));
      if (!alive) return;
      setAvg(a);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [season]);

  const rosterPositions = league?.roster_positions || [];
  const numTeams = leagueTeams.length;
  const playoffTeams = Number(league?.settings?.playoff_teams) || 6;
  const regWeeks = Math.max(1, (Number(league?.settings?.playoff_week_start) || 15) - 1);
  const scoringLabel = useMemo(() => {
    const rec = Number(league?.scoring_settings?.rec);
    if (rec >= 1) return "PPR";
    if (rec >= 0.5) return "Half-PPR";
    if (rec > 0) return `${rec} PPR`;
    return "Standard";
  }, [league]);

  // Per-team projected strength (optimal lineup = max points / week).
  const teamData = useMemo(() => {
    if (!avg) return [];
    return leagueTeams.map((t) => {
      const players = mergeAverages(t, avg.byPlayerId);
      const strength = lineupStrength(players, rosterPositions);
      const games = (t.wins || 0) + (t.losses || 0) + (t.ties || 0);
      const actualPPG = games > 0 ? (t.pointsFor || 0) / games : 0;
      return { team: t, players, strength, actualPPG };
    });
  }, [avg, leagueTeams, rosterPositions]);

  const hasProj = (avg?.count || 0) > 0;

  // Shared strength inputs for both the instant table and the on-demand
  // simulation panel, so they run off identical team distributions.
  const simInput = useMemo(
    () =>
      teamData.map(({ team, strength, actualPPG }) => ({
        rosterId: team.rosterId,
        label: teamName(team),
        projMean: hasProj ? strength.mean : undefined,
        projSigma: hasProj ? strength.sigma : undefined,
        actualPPG,
        wins: team.wins || 0,
        losses: team.losses || 0,
        ties: team.ties || 0,
      })),
    [teamData, hasProj],
  );

  const results = useMemo(() => {
    if (simInput.length === 0) return [];
    return simulatePowerRankings(simInput, {
      weeks: regWeeks,
      playoffTeams,
      sims: 4000,
      seed: 1337,
    });
  }, [simInput, regWeeks, playoffTeams]);

  const dataByRoster = useMemo(
    () => new Map(teamData.map((d) => [String(d.team.rosterId), d])),
    [teamData],
  );

  if (loading || !avg) return <Notice title="Power Rankings">Crunching projections and simulating the season…</Notice>;
  if (numTeams === 0) return <Notice title="Power Rankings">No league rosters found.</Notice>;

  const maxPts = Math.max(...results.map((r) => r.mean), 1);

  return (
    <div>
      <SettingsBar
        league={league}
        numTeams={numTeams}
        regWeeks={regWeeks}
        playoffTeams={playoffTeams}
        isSuperflex={isSuperflex}
        scoringLabel={scoringLabel}
        projLed={hasProj}
      />

      {!hasProj && (
        <div style={{ ...styles.card, borderColor: `${GOLD}55`, color: "#e2e8f0", fontSize: 13, lineHeight: 1.6 }}>
          No weekly projections are published for {season} yet, so these rankings fall back to each team's
          realized points-for and record. Run the projections pipeline
          (<code style={{ color: GOLD }}>python -m projections publish</code>) to switch to the projection-led
          model, where strength = each team's optimal lineup (max points / week).
        </div>
      )}

      {/* Rankings table */}
      <div style={{ ...styles.card, overflowX: "auto" }}>
        <div style={styles.sectionLabel}>Power Rankings · Playoff &amp; Title Odds</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ color: MUTED, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase" }}>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>#</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Team</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }} title="Optimal projected lineup — the team's max points for a week">Max&nbsp;Pts/Wk</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Power</th>
              <th style={{ textAlign: "right", padding: "6px 8px" }}>Proj&nbsp;Record</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Playoffs</th>
              <th style={{ textAlign: "left", padding: "6px 8px" }}>Champion</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => {
              const mine = String(r.rosterId) === String(myRosterId);
              const isOpen = openId === String(r.rosterId);
              const d = dataByRoster.get(String(r.rosterId));
              const projWins = Math.round(r.avgWins);
              const projLosses = Math.max(0, regWeeks - projWins);
              return (
                <Fragment key={r.rosterId}>
                  <tr
                    onClick={() => setOpenId(isOpen ? null : String(r.rosterId))}
                    style={{
                      cursor: "pointer",
                      background: mine ? `${ACCENT}12` : isOpen ? "rgba(255,255,255,0.03)" : "transparent",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <td style={{ padding: "9px 8px", fontWeight: 800, color: r.powerRank <= 3 ? GOLD : "#e2e8f0" }}>{r.powerRank}</td>
                    <td style={{ padding: "9px 8px" }}>
                      <span style={{ color: mine ? ACCENT : "#e2e8f0", fontWeight: mine ? 700 : 500 }}>
                        {r.label}{mine ? " (you)" : ""}
                      </span>
                      <span style={{ color: MUTED, marginLeft: 8, fontSize: 11 }}>{isOpen ? "▾" : "▸"}</span>
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right", color: ACCENT, fontWeight: 700 }}>{fmt(r.mean)}</td>
                    <td style={{ padding: "9px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Bar value={r.mean / maxPts} width={70} color="#60a5fa" />
                        <span style={{ color: MUTED, fontSize: 11 }}>{r.powerScore}</span>
                      </div>
                    </td>
                    <td style={{ padding: "9px 8px", textAlign: "right", color: "#cbd5e1" }}>
                      {projWins}–{projLosses}
                    </td>
                    <td style={{ padding: "9px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Bar value={r.playoffOdds} width={84} color={ACCENT} />
                        <span style={{ color: "#e2e8f0", fontWeight: 600, minWidth: 34 }}>{pct(r.playoffOdds)}</span>
                      </div>
                    </td>
                    <td style={{ padding: "9px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <Bar value={r.championOdds} width={84} color={GOLD} />
                        <span style={{ color: GOLD, fontWeight: 700, minWidth: 38 }}>{pct1(r.championOdds)}</span>
                      </div>
                    </td>
                  </tr>
                  {isOpen && d && (
                    <tr>
                      <td colSpan={7} style={{ padding: "0 8px 8px", background: "rgba(255,255,255,0.02)" }}>
                        <RosterLayout players={d.players} lineup={d.strength.lineup} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* On-demand animated season simulations */}
      <SeasonSimulationPanel
        input={simInput}
        myRosterId={myRosterId}
        regWeeks={regWeeks}
        playoffTeams={playoffTeams}
        hasProj={hasProj}
      />

      {/* Methodology */}
      <details style={{ ...styles.card }}>
        <summary style={{ ...styles.sectionLabel, cursor: "pointer", listStyle: "none" }}>
          How these rankings are built ▾
        </summary>
        <div style={{ color: MUTED, fontSize: 13, lineHeight: 1.7, marginTop: 10 }}>
          <p style={{ margin: "0 0 8px" }}>
            <b style={{ color: "#e2e8f0" }}>1 · Max points / week.</b> For every team we set its optimal
            starting lineup from the season-average weekly projections (the same model behind the Projections
            tab) under your exact roster slots. That best-lineup total — the team's <i>max points</i> — is its
            core strength, and the bands give each team a realistic week-to-week spread (sigma).
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <b style={{ color: "#e2e8f0" }}>2 · Simulate the season.</b> We play a balanced round-robin of
            {" "}{regWeeks} weeks 4,000 times. Each matchup samples both teams' weekly scores from their
            projection distributions, so better — and more consistent — rosters win more often.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <b style={{ color: "#e2e8f0" }}>3 · Playoffs &amp; title.</b> The top {playoffTeams} by record
            (points-for breaks ties) make the bracket; a seeded single-elimination playoff crowns a champion.
            Across all sims that yields each team's playoff% and championship%.
          </p>
          <p style={{ margin: 0, fontStyle: "italic" }}>
            Records already played are carried in. Tap any team to see its optimal lineup and bench depth.
          </p>
        </div>
      </details>
    </div>
  );
}
