import { useEffect, useMemo, useState } from "react";
import { styles } from "../../styles";
import {
  fetchNflState,
  fetchProjections,
  fetchMatchups,
  optimalLineup,
  winProbability,
} from "../../lib/projectionsApi";

const ACCENT = "#00f5a0";
const MUTED = "#94a3b8";

const POS_COLOR = { QB: "#f87171", RB: "#34d399", WR: "#60a5fa", TE: "#fbbf24" };

function teamName(t) {
  // `label` is the Sleeper-resolved name (metadata.team_name || display_name)
  // set by buildRosterSnapshot — the same field every other tab uses.
  return t?.label || t?.teamName || t?.name || t?.displayName || t?.owner || `Roster ${t?.rosterId}`;
}

/** Merge a team's enriched roster players with their published projection. */
function mergeProjections(team, byPlayerId) {
  return (team?.enriched || []).map((p) => {
    const proj = byPlayerId.get(String(p.id));
    return {
      id: String(p.id),
      name: p.name,
      pos: p.position,
      team: p.team,
      injuryStatus: p.injuryStatus,
      proj: proj ? Number(proj.proj_ppr) : null,
      floor: proj ? Number(proj.floor) : null,
      ceiling: proj ? Number(proj.ceiling) : null,
      opponent: proj?.opponent || null,
      why: proj?.components || null,
    };
  });
}

function Band({ floor, ceiling }) {
  if (floor == null || ceiling == null) return <span style={{ color: MUTED }}>—</span>;
  return (
    <span style={{ color: MUTED, fontSize: 11 }}>
      {floor.toFixed(1)}<span style={{ opacity: 0.5 }}> – </span>{ceiling.toFixed(1)}
    </span>
  );
}

function PosTag({ pos }) {
  return <span style={styles.tag(POS_COLOR[pos] || MUTED)}>{pos}</span>;
}

const fmt = (n, d = 1) => (n == null || isNaN(n) ? "—" : Number(n).toFixed(d));
const pct = (n) => (n == null || isNaN(n) ? "—" : `${(Number(n) * 100).toFixed(0)}%`);

function WhyRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, padding: "3px 0" }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ color: "#cbd5e1", textAlign: "right" }}>{value}</span>
    </div>
  );
}

/** Plain-language breakdown of how one player's projection was built, read from
 *  the `components` the model stores on every row. Degrades gracefully when a
 *  field is missing (trimmed rows) or the number is a pure-Sleeper passthrough. */
function WhyPanel({ p }) {
  const w = p.why || {};
  const box = w.box || {};
  const wrap = {
    background: "#0b1220", border: `1px solid ${MUTED}33`, borderRadius: 8,
    padding: "10px 14px", margin: "0 0 8px 64px",
  };
  const hdr = { fontSize: 10, letterSpacing: 1.5, color: ACCENT, textTransform: "uppercase", marginTop: 8 };

  // Rookie / new team with no usage history → Sleeper passthrough.
  if (w.src === "sleeper" || (w.struct_ppr == null && w.recent_ppg == null)) {
    return (
      <div style={wrap}>
        <div style={{ color: "#cbd5e1", fontSize: 12, lineHeight: 1.6 }}>
          No usage history yet (rookie or changed teams), so this uses Sleeper's market
          projection of <b style={{ color: ACCENT }}>{fmt(w.sleeper_ppr ?? p.proj)}</b> PPR.
          Our usage model takes over once they log snaps.
        </div>
      </div>
    );
  }

  // Recover the actual model↔Sleeper blend weight from the stored numbers.
  let blend = null;
  if (w.model_ppr != null && w.sleeper_ppr != null && w.sleeper_ppr !== w.model_ppr) {
    const a = (p.proj - w.model_ppr) / (w.sleeper_ppr - w.model_ppr);
    if (isFinite(a)) blend = `${Math.round((1 - a) * 100)}% our model + ${Math.round(a * 100)}% Sleeper`;
  }

  const line = [];
  if (box.rec) line.push(`${fmt(box.rec)} rec`);
  if (box.rec_yd) line.push(`${fmt(box.rec_yd, 0)} rec yds`);
  if (box.rec_td) line.push(`${fmt(box.rec_td)} rec TD`);
  if (box.pass_yd) line.push(`${fmt(box.pass_yd, 0)} pass yds`);
  if (box.pass_td) line.push(`${fmt(box.pass_td)} pass TD`);
  if (box.rush_yd) line.push(`${fmt(box.rush_yd, 0)} rush yds`);
  if (box.rush_td) line.push(`${fmt(box.rush_td)} rush TD`);

  const hasUsage = w.target_share != null || w.qb_pass_share != null || w.carry_share != null;

  return (
    <div style={wrap}>
      {hasUsage && (
        <>
          <div style={hdr}>1 · Role &amp; volume</div>
          {w.target_share != null && <WhyRow label="Target share" value={`${pct(w.target_share)} → ${fmt(w.proj_targets)} targets`} />}
          {w.qb_pass_share != null && <WhyRow label="Pass share" value={`${pct(w.qb_pass_share)} → ${fmt(w.proj_pass_att, 0)} attempts`} />}
          {w.carry_share != null && <WhyRow label="Carry share" value={`${pct(w.carry_share)} → ${fmt(w.proj_carries)} carries`} />}
        </>
      )}
      {line.length > 0 && (
        <>
          <div style={hdr}>{hasUsage ? "2" : "1"} · Projected stat line</div>
          <WhyRow label="Efficiency →" value={line.join(", ")} />
        </>
      )}
      <div style={hdr}>Our model</div>
      {w.struct_ppr != null && <WhyRow label="Usage model" value={`${fmt(w.struct_ppr)} pts`} />}
      {w.recent_ppg != null && <WhyRow label="Recent form (PPG)" value={`${fmt(w.recent_ppg)} pts`} />}
      {w.def_mult != null && <WhyRow label={`Opponent (${p.opponent || "?"}) adjustment`} value={`×${fmt(w.def_mult, 2)}`} />}
      {w.model_ppr != null && <WhyRow label="Model projection" value={`${fmt(w.model_ppr)} PPR`} />}
      <div style={hdr}>Final</div>
      {w.sleeper_ppr != null && <WhyRow label="Sleeper projection" value={`${fmt(w.sleeper_ppr)} PPR`} />}
      {blend && <WhyRow label="Blend" value={blend} />}
      <WhyRow label="Projection" value={`${fmt(p.proj)} PPR  ·  floor ${fmt(p.floor)} / ceiling ${fmt(p.ceiling)}`} />
    </div>
  );
}

function LineupTable({ lineup }) {
  const [openId, setOpenId] = useState(null);
  return (
    <div>
      {lineup.starters.map(({ slot, player }, i) => {
        const canExplain = !!(player && player.why);
        const isOpen = canExplain && openId === player.id;
        return (
          <div key={i}>
            <div
              style={{ ...styles.playerRow, gap: 12, cursor: canExplain ? "pointer" : "default" }}
              onClick={canExplain ? () => setOpenId(isOpen ? null : player.id) : undefined}
              title={canExplain ? "Tap to see how this projection is built" : undefined}
            >
              <span style={{ width: 64, fontSize: 10, letterSpacing: 1.5, color: MUTED, textTransform: "uppercase" }}>
                {slot}
              </span>
              {player ? (
                <>
                  <span style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                    <PosTag pos={player.pos} />
                    <span style={{ color: "#e2e8f0" }}>{player.name}</span>
                    {player.opponent && (
                      <span style={{ color: MUTED, fontSize: 11 }}>vs {player.opponent}</span>
                    )}
                    {canExplain && (
                      <span style={{ color: ACCENT, fontSize: 11, opacity: 0.7 }}>{isOpen ? "▾ why" : "▸ why"}</span>
                    )}
                  </span>
                  <span style={{ width: 90, textAlign: "right" }}>
                    <Band floor={player.floor} ceiling={player.ceiling} />
                  </span>
                  <span style={{ width: 56, textAlign: "right", color: ACCENT, fontWeight: 700 }}>
                    {player.proj != null ? player.proj.toFixed(1) : "—"}
                  </span>
                </>
              ) : (
                <span style={{ flex: 1, color: MUTED, fontStyle: "italic" }}>(empty)</span>
              )}
            </div>
            {isOpen && <WhyPanel p={player} />}
          </div>
        );
      })}
      <div style={{ ...styles.playerRow, borderBottom: "none", paddingTop: 14 }}>
        <span style={{ flex: 1, fontWeight: 700, color: "#e2e8f0" }}>Projected total</span>
        <span style={{ width: 90, textAlign: "right" }}>
          <Band floor={lineup.floor} ceiling={lineup.ceiling} />
        </span>
        <span style={{ width: 56, textAlign: "right", color: ACCENT, fontWeight: 800, fontSize: 16 }}>
          {lineup.total.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

function Notice({ title, children }) {
  return (
    <div style={{ ...styles.card, textAlign: "center", padding: "40px 22px" }}>
      <div style={{ ...styles.sectionLabel, justifyContent: "center" }}>{title}</div>
      <div style={{ color: MUTED, maxWidth: 540, margin: "0 auto", lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export default function ProjectionsTab({ leagueTeams = [], myRosterId, leagueId, rosterPositions }) {
  const [nflState, setNflState] = useState(null);
  const [week, setWeek] = useState(null); // user-selected week (1–18)
  const [loading, setLoading] = useState(true);
  const [proj, setProj] = useState(null);
  const [matchups, setMatchups] = useState([]);

  // 1. Resolve the season + a sensible default week once. In-season that's the
  //    live week; in the offseason (week 0) we default to week 1.
  useEffect(() => {
    let alive = true;
    (async () => {
      const state = await fetchNflState().catch(() => null);
      if (!alive) return;
      setNflState(state);
      const live = Number(state?.week) || 0;
      setWeek(live > 0 ? live : 1);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const season = Number(nflState?.season) || null;
  const liveWeek = Number(nflState?.week) || 0;
  const preview = liveWeek <= 0; // offseason: weeks shown are upcoming-season previews

  // 2. (Re)fetch projections + matchups whenever the selected week changes.
  useEffect(() => {
    if (!season || !week) return;
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const [p, m] = await Promise.all([
          fetchProjections(season, week),
          leagueId ? fetchMatchups(leagueId, week) : Promise.resolve([]),
        ]);
        if (!alive) return;
        setProj(p);
        setMatchups(m);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [season, week, leagueId]);

  const myTeam = useMemo(
    () => leagueTeams.find((t) => String(t.rosterId) === String(myRosterId)),
    [leagueTeams, myRosterId],
  );

  const view = useMemo(() => {
    if (!proj || !myTeam) return null;
    const myPlayers = mergeProjections(myTeam, proj.byPlayerId);
    const myLineup = optimalLineup(myPlayers, rosterPositions);

    // Opponent: find my matchup, then the other roster sharing the matchup_id.
    let oppTeam = null;
    let oppLineup = null;
    let winProb = null;
    const mine = matchups.find((m) => String(m.roster_id) === String(myRosterId));
    if (mine?.matchup_id != null) {
      const oppEntry = matchups.find(
        (m) => m.matchup_id === mine.matchup_id && String(m.roster_id) !== String(myRosterId),
      );
      if (oppEntry) {
        oppTeam = leagueTeams.find((t) => String(t.rosterId) === String(oppEntry.roster_id));
        if (oppTeam) {
          oppLineup = optimalLineup(mergeProjections(oppTeam, proj.byPlayerId), rosterPositions);
          winProb = winProbability(myLineup, oppLineup);
        }
      }
    }

    // Start/sit: current starters (from the live matchup) vs the optimal lineup.
    let startSit = null;
    if (mine?.starters?.length) {
      const optimalIds = new Set(myLineup.starters.map((s) => s.player?.id).filter(Boolean));
      const currentIds = new Set(mine.starters.map(String));
      const byId = new Map(myPlayers.map((p) => [p.id, p]));
      const bench = myPlayers.filter((p) => optimalIds.has(p.id) && !currentIds.has(p.id) && p.proj != null);
      const sit = [...currentIds]
        .filter((id) => !optimalIds.has(id))
        .map((id) => byId.get(id))
        .filter((p) => p && p.proj != null);
      if (bench.length) startSit = { start: bench, sit };
    }

    return { myPlayers, myLineup, oppTeam, oppLineup, winProb, startSit };
  }, [proj, myTeam, matchups, myRosterId, leagueTeams, rosterPositions]);

  if (!season || !week) return <Notice title="Projections">Loading weekly projections…</Notice>;

  const heading = `${preview ? "Preseason Preview · " : ""}Week ${week} · ${season}`;
  const hasView = !loading && view && proj && proj.count > 0;

  // Header is always rendered (even while loading / empty) so the week selector
  // stays reachable and the user can jump to another week.
  const header = (
    <div style={{ ...styles.card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
      <div>
        <div style={styles.sectionLabel}>{heading}</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{myTeam ? teamName(myTeam) : "Weekly Projections"}</div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>Week</span>
        <select
          value={week}
          onChange={(e) => setWeek(Number(e.target.value))}
          style={{
            background: "#0b1220", color: "#e2e8f0", border: `1px solid ${MUTED}55`,
            borderRadius: 8, padding: "6px 10px", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}
        >
          {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
            <option key={w} value={w}>
              Week {w}{w === liveWeek ? " (current)" : ""}
            </option>
          ))}
        </select>
      </label>

      {hasView && view.oppLineup ? (
        <>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 34, fontWeight: 800, color: ACCENT }}>
              {(view.winProb * 100).toFixed(0)}%
            </div>
            <div style={{ fontSize: 10, letterSpacing: 2, color: MUTED, textTransform: "uppercase" }}>
              win probability
            </div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
              {view.myLineup.total.toFixed(1)} – {view.oppLineup.total.toFixed(1)} proj
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={styles.sectionLabel}>Opponent</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#e2e8f0" }}>{teamName(view.oppTeam)}</div>
          </div>
        </>
      ) : hasView ? (
        <div style={{ color: MUTED, fontSize: 12, maxWidth: 200 }}>
          No head-to-head opponent set for week {week} yet — showing your best lineup.
        </div>
      ) : null}
    </div>
  );

  if (loading) return <div>{header}<Notice title={heading}>Loading week {week}…</Notice></div>;

  if (!myTeam) {
    return <div>{header}<Notice title={heading}>Couldn't find your roster in this league.</Notice></div>;
  }

  if (!proj || proj.count === 0) {
    return (
      <div>
        {header}
        <Notice title={heading}>
          {`No projections published for ${season} week ${week} yet. `}
          They're generated by the offline model pipeline (python/projections) and written to
          Supabase. {proj?.unavailable
            ? "The projection store isn't reachable — the player_projections table may not be migrated yet."
            : `Run “python -m projections publish --season ${season} --week ${week}” to populate it.`}
        </Notice>
      </div>
    );
  }

  const { myLineup, oppLineup, oppTeam, startSit } = view;

  return (
    <div>
      {header}

      {/* Matchup — your lineup and your opponent's side by side (wraps to one
          column on narrow screens). When there's no opponent, yours is full width. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div style={{ ...styles.card, margin: 0 }}>
          <div style={styles.sectionLabel}>Your optimal lineup (projected PPR)</div>
          <LineupTable lineup={myLineup} />
        </div>

        {oppLineup && (
          <div style={{ ...styles.card, margin: 0 }}>
            <div style={styles.sectionLabel}>{teamName(oppTeam)} — projected lineup</div>
            <LineupTable lineup={oppLineup} />
          </div>
        )}
      </div>

      {/* Who to start — under the matchup */}
      {startSit && (
        <div style={{ ...styles.card, borderColor: `${ACCENT}55`, marginTop: 16 }}>
          <div style={styles.sectionLabel}>Who to start</div>
          {startSit.start.map((p, i) => {
            const swap = startSit.sit[i];
            return (
              <div key={p.id} style={{ ...styles.playerRow }}>
                <span style={{ flex: 1 }}>
                  <span style={{ color: ACCENT, fontWeight: 700 }}>START </span>
                  <PosTag pos={p.pos} /> <span style={{ color: "#e2e8f0" }}>{p.name}</span>{" "}
                  <span style={{ color: ACCENT }}>{p.proj.toFixed(1)}</span>
                </span>
                {swap && (
                  <span style={{ flex: 1, textAlign: "right", color: MUTED }}>
                    over <span style={{ color: "#e2e8f0" }}>{swap.name}</span> {swap.proj.toFixed(1)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* How the model works — methodology, in plain language */}
      <details style={{ ...styles.card, marginTop: 16 }}>
        <summary style={{ ...styles.sectionLabel, cursor: "pointer", listStyle: "none" }}>
          How these projections are built ▾
        </summary>
        <div style={{ color: MUTED, fontSize: 13, lineHeight: 1.7, marginTop: 10 }}>
          <p style={{ margin: "0 0 8px" }}>
            <b style={{ color: "#e2e8f0" }}>1 · Role &amp; volume.</b> We take each player's recency-weighted
            target / carry / pass share (the same usage engine behind the OC tools) and multiply it by their
            team's projected play volume → expected targets, carries, or pass attempts.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <b style={{ color: "#e2e8f0" }}>2 · Efficiency.</b> Catch rate, yards and TDs per opportunity —
            each regressed toward position baselines so small samples don't overreact — turn that volume into a
            projected stat line and a usage-based point total.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <b style={{ color: "#e2e8f0" }}>3 · Form &amp; matchup.</b> The usage model is blended with the
            player's recent fantasy PPG, then adjusted for the opponent defense's strength versus that position.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <b style={{ color: "#e2e8f0" }}>4 · Market ensemble.</b> Finally it's combined with Sleeper's
            projection at the weight our walk-forward backtest found most accurate. <b style={{ color: "#e2e8f0" }}>Tap any
            starter</b> to see that player's exact numbers.
          </p>
          <p style={{ margin: 0, fontStyle: "italic" }}>
            Floor / ceiling are the 15th–85th percentile band from each position's historical scoring variance.
          </p>
        </div>
      </details>
    </div>
  );
}
