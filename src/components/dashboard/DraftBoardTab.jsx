// Redraft Draft Board — an always-available draft cheat sheet (no live draft
// feed required, works for Sleeper and ESPN alike). Ranks the still-available
// pool by this-season projected production, weighs each player against the
// replacement-level starter at his position (VOR), and steers toward the
// starting slots you still need to fill. Reuses the live-draft board components.

import { useEffect, useMemo, useState } from "react";
import { styles } from "../../styles";
import { fetchNflState, fetchSeasonProjectedPpg } from "../../lib/projectionsApi";
import { assignRosterSlots } from "../../lib/liveDraft";
import {
  replacementLevels,
  draftRosterNeeds,
  recommendRedraftPicks,
} from "../../lib/redraftDraft";
import { BestAvailable, RedraftRecommendation } from "./LiveDraftTab";

export default function DraftBoardTab({
  waiver, // analysis.waiver: { pool, enriched, players, allowedPositions }
  leagueContext = {},
  myRosterPlayers = [], // my enriched roster players (for roster-need)
  rosterPositions = [],
  ppr = 1,
}) {
  const pool = waiver?.pool || [];
  const [posFilter, setPosFilter] = useState([]);
  const [projPpg, setProjPpg] = useState(null); // Map(playerId → ppg) | null

  // This-season projected PPG in league scoring — the redraft board's currency.
  useEffect(() => {
    let alive = true;
    (async () => {
      const state = await fetchNflState().catch(() => null);
      const season = Number(state?.season) || new Date().getFullYear();
      const map = await fetchSeasonProjectedPpg(season, ppr).catch(() => new Map());
      if (alive) setProjPpg(map);
    })();
    return () => { alive = false; };
  }, [ppr]);

  // Projected PPG as a plain object keyed by Sleeper id (BestAvailable shape).
  const ppgById = useMemo(() => {
    const obj = {};
    if (projPpg) for (const [id, v] of projPpg) obj[id] = v;
    return obj;
  }, [projPpg]);

  // Roster need from my current starting lineup's unfilled slots. Pre-draft this
  // is every slot; post-draft it's whatever holes remain.
  const needs = useMemo(() => {
    const players = (myRosterPlayers || []).map((p) => ({ position: p.position }));
    const { starters } = assignRosterSlots(players, rosterPositions);
    return draftRosterNeeds(starters);
  }, [myRosterPlayers, rosterPositions]);

  // VOR replacement lines + the top need-weighted recommendations.
  const { levels, recs } = useMemo(() => {
    const ppgOf = (p) => ppgById[p.playerId] || 0;
    const lv = replacementLevels(pool, ppgOf, leagueContext);
    const rc = recommendRedraftPicks(pool, ppgOf, lv, needs, 3);
    return { levels: lv, recs: rc };
  }, [pool, ppgById, leagueContext, needs]);

  if (!pool.length) {
    return (
      <div style={{ ...styles.card, color: "#d1d7ea", fontSize: 13 }}>
        No draftable players available — everyone rostered.
      </div>
    );
  }

  const loadingProj = projPpg == null;

  return (
    <div>
      <div style={{ ...styles.sectionLabel, marginBottom: 4 }}>Draft Board</div>
      <div style={{ fontSize: 11, color: "#8a91a8", marginBottom: 12 }}>
        Best available ranked by this-season projected points. VOR = points above the
        replacement-level starter at each position; NEED marks a starting slot you
        haven't filled yet. Your live cheat sheet for draft day.
        {loadingProj ? " · loading projections…" : ""}
      </div>

      <RedraftRecommendation recs={recs} />

      <BestAvailable
        pool={pool}
        draftedIds={new Set()}
        posFilter={posFilter}
        setPosFilter={setPosFilter}
        ppgBySleeperId={ppgById}
        rosterPositions={rosterPositions}
        isRedraft
        vorLevels={levels}
        needs={needs}
      />
    </div>
  );
}
