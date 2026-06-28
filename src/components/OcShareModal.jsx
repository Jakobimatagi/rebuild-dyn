import { useEffect, useMemo, useRef, useState } from "react";
import { captureShareImage, tiktokFilename } from "../lib/shareImage.js";
import TikTokFrame from "./TikTokFrame.jsx";
import { useModalBehavior } from "../lib/useModalBehavior.js";
import { fetchShareBlurbs, buildOcBlurbInput } from "../lib/aiShareBlurbsApi.js";
import {
  buildSeasonUsage,
  buildTeamUsage,
  aggregateOcUsage,
  pct,
  dec,
  concentrationLabel,
} from "../lib/ocUtilization.js";
import { NFL_TEAMS } from "../lib/ocData.js";
import { getOcSchemes } from "../lib/ocSchemes.js";
import { fetchHistoricalStats } from "../lib/sleeperApi.js";
import { fetchHistoricalRoster } from "../lib/historicalRostersApi.js";

const TEAM_NAME = Object.fromEntries(NFL_TEAMS.map((t) => [t.abbr, t.name]));

const CARD_TYPES = [
  { key: "leaderboard", label: "Leaderboard" },
  { key: "fingerprint", label: "OC Fingerprint" },
  { key: "team", label: "Team Room" },
  { key: "player", label: "Single Player" },
];

// Headline gradient per card type — mirrors the rookie/top-player share look.
const CARD_GRADIENT = {
  leaderboard: "from-sky-500 to-indigo-700",
  fingerprint: "from-emerald-500 to-emerald-700",
  team: "from-violet-500 to-violet-700",
  player: "from-amber-500 to-orange-700",
};

// Leaderboard registry. Each board declares its scope (player vs team rows),
// the metric to rank by, and how to render each row + feed the AI blurb. Kept
// in lockstep with the Usage Boards tab in OffensiveCoordinators.jsx.
const LEADERBOARDS = [
  {
    key: "targetShare", title: "Target Share", accent: "text-sky-300", scope: "player",
    filter: (p) => p.pos === "WR" || p.pos === "TE", sortKey: "targetShare",
    value: (p) => pct(p.targetShare, 1), sub: (p) => `${p.targets} tgt · ${p.oc || "—"}`,
  },
  {
    key: "wopr", title: "WOPR (Alpha Index)", accent: "text-sky-300", scope: "player",
    filter: (p) => p.pos === "WR" || p.pos === "TE", sortKey: "wopr",
    value: (p) => dec(p.wopr, 2), sub: (p) => `${pct(p.targetShare, 0)} tgt · ${pct(p.airYardShare, 0)} air`,
  },
  {
    key: "adot", title: "aDOT (40+ tgt)", accent: "text-amber-300", scope: "player",
    filter: (p) => (p.pos === "WR" || p.pos === "TE") && p.targets >= 40, sortKey: "adot",
    value: (p) => dec(p.adot), sub: (p) => `${p.targets} tgt · ${Math.round(p.recYd)} yds`,
  },
  {
    key: "carryShare", title: "RB Carry Share", accent: "text-emerald-300", scope: "player",
    filter: (p) => p.pos === "RB", sortKey: "carryShare",
    value: (p) => pct(p.carryShare, 1), sub: (p) => `${p.carries} car · ${p.oc || "—"}`,
  },
  {
    key: "rzTargetShare", title: "RZ Target Share", accent: "text-rose-300", scope: "player",
    filter: (p) => p.pos === "WR" || p.pos === "TE", sortKey: "rzTargetShare",
    value: (p) => pct(p.rzTargetShare, 0), sub: (p) => `${p.rzTgt} RZ tgt`,
  },
  {
    key: "rzCarryShare", title: "RZ Carry Share", accent: "text-rose-300", scope: "player",
    filter: (p) => p.pos === "RB", sortKey: "rzCarryShare",
    value: (p) => pct(p.rzCarryShare, 0), sub: (p) => `${p.rzCarry} RZ car`,
  },
  {
    key: "passRate", title: "Pass-Happiest Offenses", accent: "text-sky-300", scope: "team",
    sortKey: "passRate",
    value: (t) => pct(t.passRate, 0), label: (t) => t.teamName, sub: (t) => t.oc || "—",
  },
  {
    key: "runRate", title: "Run-Heaviest Offenses", accent: "text-emerald-300", scope: "team",
    sortKey: "passRate", asc: true,
    value: (t) => pct(t.passRate, 0), label: (t) => t.teamName, sub: (t) => t.oc || "—",
  },
  {
    key: "carryHHI", title: "Most Concentrated Backfields", accent: "text-emerald-300", scope: "team",
    filter: (t) => t.carryHHI != null, sortKey: "carryHHI",
    value: (t) => concentrationLabel(t.carryHHI), label: (t) => t.teamName,
    sub: (t) => t.leadCarry ? `${lastName(t.leadCarry.name)} ${pct(t.leadCarry.share, 0)} · ${t.oc || "—"}` : (t.oc || "—"),
  },
  {
    key: "teamAdot", title: "Most Downfield Offenses", accent: "text-amber-300", scope: "team",
    filter: (t) => t.teamAdot != null, sortKey: "teamAdot",
    value: (t) => dec(t.teamAdot), label: (t) => t.teamName, sub: (t) => t.oc || "—",
  },
];

function lastName(name) {
  return (name || "").split(" ").slice(-1)[0] || name;
}

function topBy(rows, key, { asc = false, limit = 10 } = {}) {
  return [...rows]
    .filter((r) => r[key] != null && Number.isFinite(r[key]) && r[key] > 0)
    .sort((a, b) => (asc ? a[key] - b[key] : b[key] - a[key]))
    .slice(0, limit);
}

export default function OcShareModal({
  players,
  statsByYear,
  rosterByYear,
  setStats,
  setRoster,
  effectiveOcData,
  allOcs,
  initialSeason,
  onClose,
}) {
  const modalRef = useModalBehavior(onClose);

  const seasonOptions = useMemo(
    () => Object.keys(effectiveOcData).map(Number).sort((a, b) => b - a),
    [effectiveOcData],
  );

  const [cardType, setCardType] = useState("leaderboard");
  const [season, setSeason] = useState(initialSeason);
  const [boardKey, setBoardKey] = useState(LEADERBOARDS[0].key);
  const [ocName, setOcName] = useState(allOcs[0]?.name || "");
  const [team, setTeam] = useState("DET");
  const [playerId, setPlayerId] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [tiktok, setTiktok] = useState(false);

  const [blurbs, setBlurbs] = useState(() => new Map());
  const [blurbsLoading, setBlurbsLoading] = useState(false);
  const [blurbsError, setBlurbsError] = useState("");
  const [blurbsCached, setBlurbsCached] = useState(false);
  const [blurbBumpKey, setBlurbBumpKey] = useState(0);
  const [tweet, setTweet] = useState("");
  const [copied, setCopied] = useState(false);

  const shareRef = useRef(null);

  const selectedOc = useMemo(
    () => allOcs.find((o) => o.name === ocName) || null,
    [allOcs, ocName],
  );

  // Which seasons does the current card need loaded? Leaderboard/team/player
  // need the picked season; the fingerprint needs every stint year for the OC.
  const neededSeasons = useMemo(() => {
    if (cardType === "fingerprint") {
      return selectedOc ? selectedOc.stints.map((s) => s.year) : [];
    }
    return [season];
  }, [cardType, season, selectedOc]);

  // Lazy-load any season the card needs but the page hasn't fetched yet.
  useEffect(() => {
    if (!players) return;
    neededSeasons.forEach((y) => {
      if (!statsByYear[y]) {
        fetchHistoricalStats(y).then((data) =>
          setStats((prev) => (prev[y] ? prev : { ...prev, [y]: data || {} })),
        ).catch(() => {});
      }
      if (!rosterByYear[y]) {
        fetchHistoricalRoster(y).then((data) =>
          setRoster((prev) => (prev[y] ? prev : { ...prev, [y]: data || {} })),
        ).catch(() => {});
      }
    });
  }, [players, neededSeasons, statsByYear, rosterByYear, setStats, setRoster]);

  const ocsForSeason = effectiveOcData[season] || {};
  const stats = statsByYear[season];
  const roster = rosterByYear[season];
  const ready = !!(players && stats && roster);

  const seasonUsage = useMemo(() => {
    if (!ready) return null;
    return buildSeasonUsage(players, stats, roster, ocsForSeason, { minGp: 4 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, stats, roster, season]);

  const teamUsage = useMemo(() => {
    if (!ready) return null;
    return buildTeamUsage(players, stats, roster, team);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, stats, roster, season, team]);

  const fingerprint = useMemo(() => {
    if (!players || !selectedOc) return null;
    return aggregateOcUsage(selectedOc, players, statsByYear, rosterByYear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, selectedOc, statsByYear, rosterByYear]);

  // Default the single-player picker to the season's top WR by target share.
  useEffect(() => {
    if (cardType !== "player" || !seasonUsage) return;
    if (playerId && seasonUsage.playerRows.some((p) => p.id === playerId)) return;
    const top = topBy(seasonUsage.playerRows, "wopr", { limit: 1 })[0]
      || seasonUsage.playerRows[0];
    if (top) setPlayerId(top.id);
  }, [cardType, seasonUsage, playerId]);

  const selectedPlayer = useMemo(
    () => seasonUsage?.playerRows.find((p) => p.id === playerId) || null,
    [seasonUsage, playerId],
  );

  // ── Board rows + blurb subjects for the active card ────────────────────────
  const board = LEADERBOARDS.find((b) => b.key === boardKey) || LEADERBOARDS[0];

  const leaderRows = useMemo(() => {
    if (cardType !== "leaderboard" || !seasonUsage) return [];
    const src = board.scope === "team"
      ? seasonUsage.teamRows.map((t) => ({ ...t, id: t.team }))
      : seasonUsage.playerRows;
    const filtered = board.filter ? src.filter(board.filter) : src;
    return topBy(filtered, board.sortKey, { asc: board.asc });
  }, [cardType, seasonUsage, board]);

  const teamRooms = useMemo(() => {
    if (cardType !== "team" || !teamUsage) return null;
    const pick = (pos) => (teamUsage.byPos[pos] || [])
      .filter((p) => p.snaps > 0 || p.targets > 0 || p.carries > 0)
      .slice(0, 6);
    return { RB: pick("RB"), WR: pick("WR"), TE: pick("TE") };
  }, [cardType, teamUsage]);

  // Compact AI-blurb inputs for whatever the active card shows.
  const blurbSubjects = useMemo(() => {
    if (cardType === "leaderboard") {
      return leaderRows.map((r) => buildOcBlurbInput({
        ...r, season, oc: r.oc || ocsForSeason[r.team]?.name || null,
        metric: board.scope === "team" ? r[board.sortKey] : r[board.sortKey],
      }));
    }
    if (cardType === "fingerprint" && fingerprint && selectedOc) {
      const fp = fingerprint.fingerprint;
      return [buildOcBlurbInput({
        id: `oc:${selectedOc.name}`, name: selectedOc.name,
        passRate: fp.passRate, leadCarryShare: fp.leadCarryShare,
        leadTargetShare: fp.leadTargetShare, carryHHI: fp.carryHHI,
        targetHHI: fp.targetHHI, teamAdot: fp.teamAdot, metric: fp.passRate,
      })];
    }
    if (cardType === "team" && teamRooms) {
      const all = [...teamRooms.RB, ...teamRooms.WR, ...teamRooms.TE];
      return all.map((p) => buildOcBlurbInput({ ...p, team, season, metric: p.snapShare }));
    }
    if (cardType === "player" && selectedPlayer) {
      return [buildOcBlurbInput({ ...selectedPlayer, season, metric: selectedPlayer.wopr ?? selectedPlayer.carryShare })];
    }
    return [];
  }, [cardType, leaderRows, fingerprint, selectedOc, teamRooms, selectedPlayer, season, team, ocsForSeason, board]);

  const scopeLabel = cardType === "leaderboard" ? board.title
    : cardType === "fingerprint" ? ocName
    : cardType === "team" ? `${team} ${season}`
    : selectedPlayer?.name || "player";

  // Fetch blurbs whenever the visible subjects change.
  useEffect(() => {
    if (!blurbSubjects.length) return;
    const force = blurbBumpKey > 0;
    let cancelled = false;
    setBlurbsLoading(true);
    setBlurbsError("");
    setTweet("");
    fetchShareBlurbs("oc-usage", blurbSubjects, { season, board: scopeLabel }, { force })
      .then(({ blurbsById, tweet: nextTweet, cached }) => {
        if (cancelled) return;
        setBlurbs((prev) => {
          const next = new Map(prev);
          for (const [id, b] of blurbsById) next.set(id, b);
          return next;
        });
        if (nextTweet) setTweet(nextTweet);
        setBlurbsCached(cached);
        setBlurbsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setBlurbsError(String(err.message || err));
        setBlurbsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blurbSubjects, blurbBumpKey]);

  async function downloadCard() {
    const node = shareRef.current;
    if (!node) return;
    setDownloading(true);
    try {
      const dataUrl = await captureShareImage(node, { tiktok });
      const link = document.createElement("a");
      link.download = tiktokFilename(`oc-usage-${cardType}-${season}-${slug(scopeLabel)}.png`, tiktok);
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Failed to generate image:", err);
    } finally {
      setDownloading(false);
    }
  }

  async function copyTweet() {
    try {
      await navigator.clipboard.writeText(tweet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — user can still select the text */
    }
  }

  const canRender =
    cardType === "leaderboard" ? leaderRows.length > 0
    : cardType === "fingerprint" ? !!(fingerprint && fingerprint.played.length)
    : cardType === "team" ? !!(teamRooms && (teamRooms.RB.length || teamRooms.WR.length || teamRooms.TE.length))
    : !!selectedPlayer;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div
        ref={modalRef}
        className="w-full h-full flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="OC usage share cards"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="bg-slate-900 border-b border-white/10 px-6 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Share</span>
          <span className="text-sm text-slate-200">OC usage cards</span>

          <div className="flex gap-1 ml-2">
            {CARD_TYPES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCardType(c.key)}
                className={`px-3 py-1 rounded text-xs font-semibold border ${
                  cardType === c.key
                    ? "border-sky-400/60 bg-sky-500/15 text-sky-200"
                    : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Per-card pickers */}
          <div className="flex items-center gap-2 ml-2">
            {cardType !== "fingerprint" && (
              <select
                value={season}
                onChange={(e) => setSeason(parseInt(e.target.value, 10))}
                className="bg-slate-950 border border-sky-400/40 rounded px-2 py-1 text-sm text-sky-200 outline-none"
              >
                {seasonOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            )}
            {cardType === "leaderboard" && (
              <select
                value={boardKey}
                onChange={(e) => setBoardKey(e.target.value)}
                className="bg-slate-950 border border-white/10 rounded px-2 py-1 text-sm text-slate-200 outline-none"
              >
                {LEADERBOARDS.map((b) => <option key={b.key} value={b.key}>{b.title}</option>)}
              </select>
            )}
            {cardType === "fingerprint" && (
              <select
                value={ocName}
                onChange={(e) => setOcName(e.target.value)}
                className="bg-slate-950 border border-emerald-400/40 rounded px-2 py-1 text-sm text-emerald-200 outline-none"
              >
                {allOcs.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
              </select>
            )}
            {cardType === "team" && (
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="bg-slate-950 border border-violet-400/40 rounded px-2 py-1 text-sm text-violet-200 outline-none"
              >
                {NFL_TEAMS.map((t) => <option key={t.abbr} value={t.abbr}>{t.name}</option>)}
              </select>
            )}
            {cardType === "player" && seasonUsage && (
              <select
                value={playerId || ""}
                onChange={(e) => setPlayerId(e.target.value)}
                className="bg-slate-950 border border-amber-400/40 rounded px-2 py-1 text-sm text-amber-200 outline-none max-w-[220px]"
              >
                {topBy(seasonUsage.playerRows, "pts", { limit: 200 }).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} · {p.team} {p.pos}</option>
                ))}
              </select>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-slate-400 mr-1">
              {blurbsLoading ? "AI insights…"
                : blurbsError ? <span className="text-rose-300" title={blurbsError}>insights error</span>
                : blurbs.size > 0 ? `insights ✓${blurbsCached ? " (cached)" : ""}` : ""}
            </span>
            <button
              onClick={() => setBlurbBumpKey((k) => k + 1)}
              disabled={blurbsLoading || !blurbSubjects.length}
              title="Force re-fetch of AI insights (bypasses cache)"
              className="text-[10px] font-semibold px-2 py-1 rounded border border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-40"
            >
              Regenerate
            </button>
            <button
              onClick={() => setTiktok((v) => !v)}
              title="Export as a 1080×1920 vertical card sized for TikTok / Reels / Shorts"
              className={`text-xs font-semibold px-3 py-1.5 rounded border ${
                tiktok
                  ? "border-fuchsia-400/70 bg-fuchsia-500/20 text-fuchsia-100"
                  : "border-white/15 bg-slate-900/40 text-slate-300 hover:text-slate-100"
              }`}
            >
              📱 TikTok 9:16 {tiktok ? "on" : "off"}
            </button>
            <button
              onClick={downloadCard}
              disabled={!canRender || downloading}
              className="text-xs font-semibold px-3 py-1.5 rounded border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40"
            >
              {downloading ? "Generating…" : tiktok ? "Download TikTok PNG" : "Download PNG"}
            </button>
            <button
              onClick={onClose}
              aria-label="Close share cards"
              className="text-slate-400 hover:text-slate-100 text-lg leading-none px-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tweet caption — AI-written, editable, copy to clipboard. Lives
            outside the shareRef so it never lands in the exported PNG. */}
        {(tweet || blurbsLoading) && (
          <div className="bg-slate-900/60 border-b border-white/10 px-6 py-3 flex items-start gap-3">
            <span className="text-[10px] uppercase tracking-widest text-sky-400 font-bold mt-2 shrink-0">Tweet</span>
            {blurbsLoading && !tweet ? (
              <div className="flex-1 text-sm text-slate-500 italic py-2">Writing caption…</div>
            ) : (
              <>
                <textarea
                  value={tweet}
                  onChange={(e) => setTweet(e.target.value)}
                  rows={2}
                  className="flex-1 resize-none bg-slate-950 border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-400/40"
                />
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={copyTweet}
                    className="text-xs font-semibold px-3 py-1.5 rounded border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25"
                  >
                    {copied ? "Copied ✓" : "Copy tweet"}
                  </button>
                  <span className={`text-[10px] tabular-nums ${tweet.length > 280 ? "text-rose-300" : "text-slate-500"}`}>
                    {tweet.length}/280
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Preview */}
        <div className="flex-1 overflow-auto p-6 flex flex-col items-center">
          {!ready && cardType !== "fingerprint" && (
            <div className="text-slate-500 text-sm self-center mt-12">Loading {season} usage…</div>
          )}
          {ready && !canRender && (
            <div className="text-slate-500 text-sm self-center mt-12">
              No usage data for this selection. Try another season or subject.
            </div>
          )}
          {canRender && (
            <TikTokFrame enabled={tiktok}>
              <div ref={shareRef} style={{ width: 1080, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
                className="bg-slate-950 text-slate-100 p-10 flex flex-col gap-5">
                <CardHeader cardType={cardType} season={season} scopeLabel={scopeLabel} ocName={ocName} team={team} />
                {cardType === "leaderboard" && (
                  <LeaderboardBody board={board} rows={leaderRows} season={season} ocsForSeason={ocsForSeason} blurbs={blurbs} />
                )}
                {cardType === "fingerprint" && (
                  <FingerprintBody oc={selectedOc} agg={fingerprint} blurbs={blurbs} />
                )}
                {cardType === "team" && (
                  <TeamRoomBody team={team} usage={teamUsage} rooms={teamRooms} blurbs={blurbs} />
                )}
                {cardType === "player" && (
                  <PlayerBody player={selectedPlayer} season={season} blurb={blurbs.get(selectedPlayer?.id)} />
                )}
                <Footer />
              </div>
            </TikTokFrame>
          )}
        </div>
      </div>
    </div>
  );
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function CardHeader({ cardType, season, scopeLabel, ocName, team }) {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const kicker = cardType === "leaderboard" ? `NFL Usage · ${season}`
    : cardType === "fingerprint" ? "OC Usage Fingerprint"
    : cardType === "team" ? `${TEAM_NAME[team] || team} · ${season}`
    : `Workload · ${season}`;
  const title = cardType === "leaderboard" ? scopeLabel
    : cardType === "fingerprint" ? ocName
    : cardType === "team" ? "Skill-Position Usage"
    : scopeLabel;
  const schemes = cardType === "fingerprint" ? getOcSchemes(ocName).map((s) => s.short) : [];

  return (
    <div className={`rounded-xl bg-gradient-to-br ${CARD_GRADIENT[cardType]} p-6 flex items-center justify-between`}>
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-white/80 font-bold mb-1">{kicker}</div>
        <div className="text-4xl font-black text-white leading-tight">{title}</div>
        {schemes.length > 0 && (
          <div className="text-sm text-white/80 mt-2">{schemes.join(" · ")}</div>
        )}
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-widest text-white/70">As of</div>
        <div className="text-base font-bold text-white">{date}</div>
      </div>
    </div>
  );
}

function Footer() {
  return (
    <div className="text-center text-[11px] text-slate-500 pt-2 border-t border-white/10">
      Dynasty Oracle · shares are exact team fractions from Sleeper season totals
    </div>
  );
}

// ── Leaderboard card body ──────────────────────────────────────────────────
function LeaderboardBody({ board, rows, season, ocsForSeason, blurbs }) {
  const labelOf = board.label || ((r) => `${r.name} · ${r.team}`);
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 overflow-hidden divide-y divide-white/5">
      {rows.map((r, i) => {
        const id = board.scope === "team" ? r.team : r.id;
        const blurb = blurbs?.get(id);
        return (
          <div key={id} className="flex items-start gap-4 px-5 py-3">
            <span className="text-2xl font-black text-slate-500 w-9 text-right tabular-nums shrink-0">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="text-lg font-bold text-slate-100 truncate">{labelOf(r)}</div>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate">{board.sub(r)}</div>
              {blurb && <div className="text-[11px] text-slate-300 italic mt-1 leading-snug">{blurb}</div>}
            </div>
            <span className={`text-2xl font-black tabular-nums shrink-0 ${board.accent}`}>{board.value(r)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── OC fingerprint card body ────────────────────────────────────────────────
// Flatten every played stint into the standout usage role each player held
// under this OC. Dedupe by player, keeping their peak season (by the metric
// that defines the role), so the card reads as "this is the role you get
// here" rather than repeating a player across years.
function collectOcPlayers(agg) {
  const best = new Map(); // id -> row with peak metric
  for (const r of agg.played) {
    const { usage, stint } = r;
    for (const pos of ["RB", "WR", "TE"]) {
      for (const p of usage.byPos[pos] || []) {
        if (!(p.snaps > 0 || p.targets > 0 || p.carries > 0)) continue;
        const metric = pos === "RB" ? (p.carryShare ?? 0) : (p.wopr ?? p.targetShare ?? 0);
        const row = { ...p, team: stint.team, year: stint.year, metric };
        const prev = best.get(p.id);
        if (!prev || metric > prev.metric) best.set(p.id, row);
      }
    }
  }
  const all = [...best.values()];
  const backs = all.filter((p) => p.pos === "RB")
    .sort((a, b) => b.metric - a.metric).slice(0, 4);
  const passCatchers = all.filter((p) => p.pos === "WR" || p.pos === "TE")
    .sort((a, b) => b.metric - a.metric).slice(0, 6);
  return { backs, passCatchers };
}

function FingerprintBody({ oc, agg, blurbs }) {
  const fp = agg.fingerprint;
  const blurb = blurbs?.get(`oc:${oc.name}`);
  const { backs, passCatchers } = collectOcPlayers(agg);

  const chips = [
    `Pass lean ${pct(fp.passRate, 0)} · ${leanNote(fp.passRate)}`,
    `Backfield ${concentrationLabel(fp.carryHHI)}${fp.leadCarryShare != null ? ` · lead ${pct(fp.leadCarryShare, 0)} car` : ""}`,
    `Alpha target ${fp.leadTargetShare != null ? pct(fp.leadTargetShare, 0) : "—"}`,
    `Team aDOT ${dec(fp.teamAdot)} · ${adotNote(fp.teamAdot)}`,
  ];

  return (
    <div className="flex flex-col gap-4">
      {blurb && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 px-5 py-3 text-sm text-slate-200 italic">{blurb}</div>
      )}
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <span key={c} className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 bg-slate-900/60 text-slate-300">{c}</span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4">
        <FingerprintRoom title="Backfield Workload" accent="text-emerald-300" rows={backs} isRush />
        <FingerprintRoom title="Pass-Game Roles" accent="text-sky-300" rows={passCatchers} />
      </div>
      <div className="text-[11px] text-slate-500">
        Peak role per player across {agg.played.length} {agg.played.length === 1 ? "season" : "seasons"}
        {": "}
        {agg.played.map((r) => `${r.stint.team} ${r.stint.year}`).join(" · ")}
      </div>
    </div>
  );
}

function FingerprintRoom({ title, accent, rows, isRush }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 overflow-hidden">
      <div className={`px-4 py-2 text-xs uppercase tracking-widest font-bold ${accent} border-b border-white/5`}>{title}</div>
      {rows.length === 0 ? (
        <div className="px-4 py-3 text-[11px] text-slate-600">No qualifying players.</div>
      ) : (
        <div className="divide-y divide-white/5">
          {rows.map((p) => (
            <div key={p.id} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-100 truncate">{p.name}</span>
                <span className="text-[10px] text-slate-500 shrink-0">{p.team} '{String(p.year).slice(-2)}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                <span><span className="text-slate-600">Snap</span> {pct(p.snapShare, 0)}</span>
                {isRush ? (
                  <>
                    <span><span className="text-slate-600">Car</span> {pct(p.carryShare, 0)}</span>
                    <span><span className="text-slate-600">RZ</span> {pct(p.rzCarryShare, 0)}</span>
                    <span><span className="text-slate-600">Tgt</span> {pct(p.targetShare, 0)}</span>
                  </>
                ) : (
                  <>
                    <span><span className="text-slate-600">Tgt</span> {pct(p.targetShare, 0)}</span>
                    <span><span className="text-slate-600">RZ</span> {pct(p.rzTargetShare, 0)}</span>
                    <span><span className="text-slate-600">aDOT</span> {dec(p.adot)}</span>
                    <span><span className="text-slate-600">WOPR</span> {dec(p.wopr, 2)}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function leanNote(passRate) {
  if (passRate == null) return "—";
  if (passRate >= 0.60) return "pass-first scheme";
  if (passRate <= 0.52) return "run-leaning scheme";
  return "balanced scheme";
}
// Thresholds are on air-yards-per-completion (team scale ~4–7.5), not the
// classic per-target aDOT — see the rec_air_yd note in ocUtilization.js.
function adotNote(adot) {
  if (adot == null) return "—";
  if (adot >= 7) return "downfield passing game";
  if (adot <= 5.5) return "underneath / quick game";
  return "intermediate passing game";
}

// ── Team room card body ──────────────────────────────────────────────────────
const ROOMS = [
  { pos: "RB", label: "Backfield", accent: "text-emerald-300" },
  { pos: "WR", label: "Wide Receiver", accent: "text-sky-300" },
  { pos: "TE", label: "Tight End", accent: "text-amber-300" },
];

function TeamRoomBody({ usage, rooms, blurbs }) {
  const { concentration, passRate, denom } = usage;
  const teamAdot = denom.rec_tgt ? denom.rec_air_yd / denom.rec_tgt : null;
  const chips = [
    `Pass rate ${pct(passRate, 0)}`,
    `Backfield ${concentrationLabel(concentration.carry.hhi)}`,
    concentration.target.lead ? `Alpha ${lastName(concentration.target.lead.name)} ${pct(concentration.target.lead.share, 0)}` : null,
    `Team aDOT ${dec(teamAdot)}`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <span key={c} className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 bg-slate-900/60 text-slate-300">{c}</span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-4">
        {ROOMS.map(({ pos, label, accent }) => (
          <div key={pos} className="rounded-xl border border-white/10 bg-slate-900/70 overflow-hidden">
            <div className={`px-4 py-2 text-xs uppercase tracking-widest font-bold ${accent} border-b border-white/5`}>{label}</div>
            <div className="divide-y divide-white/5">
              {(rooms[pos] || []).map((p) => (
                <div key={p.id} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-100 truncate">{p.name}</span>
                    <span className="text-[10px] text-slate-500 shrink-0">{p.gp}g</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span><span className="text-slate-600">Snap</span> {pct(p.snapShare, 0)}</span>
                    {pos === "RB" ? (
                      <>
                        <span><span className="text-slate-600">Car</span> {pct(p.carryShare, 0)}</span>
                        <span><span className="text-slate-600">RZ</span> {pct(p.rzCarryShare, 0)}</span>
                      </>
                    ) : (
                      <>
                        <span><span className="text-slate-600">Tgt</span> {pct(p.targetShare, 0)}</span>
                        <span><span className="text-slate-600">aDOT</span> {dec(p.adot)}</span>
                        <span><span className="text-slate-600">WOPR</span> {dec(p.wopr, 2)}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Single player card body ──────────────────────────────────────────────────
function PlayerBody({ player, blurb }) {
  const isRush = player.pos === "RB";
  const stats = isRush
    ? [
        { label: "Snap Share", value: pct(player.snapShare, 0) },
        { label: "Carry Share", value: pct(player.carryShare, 0) },
        { label: "RZ Carry Share", value: pct(player.rzCarryShare, 0) },
        { label: "Target Share", value: pct(player.targetShare, 0) },
        { label: "Touches", value: player.touches },
        { label: "RZ Carries", value: player.rzCarry },
      ]
    : [
        { label: "Snap Share", value: pct(player.snapShare, 0) },
        { label: "Target Share", value: pct(player.targetShare, 1) },
        { label: "RZ Target Share", value: pct(player.rzTargetShare, 0) },
        { label: "aDOT", value: dec(player.adot) },
        { label: "Air-Yard Share", value: pct(player.airYardShare, 0) },
        { label: "WOPR", value: dec(player.wopr, 2) },
      ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-3xl font-black text-slate-100">{player.name}</div>
          <div className="text-sm text-slate-400 mt-1">{player.pos} · {TEAM_NAME[player.team] || player.team} · {player.oc || "—"}</div>
        </div>
        <div className="text-right text-[11px] text-slate-500">
          {player.gp}g · {Math.round(player.pts)} PPR
        </div>
      </div>
      {blurb && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 px-5 py-3 text-sm text-slate-200 italic">{blurb}</div>
      )}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-white/10 bg-slate-900/70 px-5 py-4 text-center">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{s.label}</div>
            <div className="text-3xl font-black text-slate-100 mt-1 tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
