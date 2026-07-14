import { useEffect, useMemo, useRef, useState } from "react";
import { captureShareImage, tiktokFilename } from "../lib/shareImage.js";
import TikTokFrame from "./TikTokFrame.jsx";
import { useModalBehavior } from "../lib/useModalBehavior.js";
import { fetchShareBlurbs, buildDcBlurbInput } from "../lib/aiShareBlurbsApi.js";
import { NFL_TEAMS } from "../lib/ocData.js";
import {
  buildCoachProfile,
  allCoachNames,
  careerDefenseSummary,
  metricDisplay,
  fmtMetric,
  ordinal,
} from "../lib/dcFingerprint.js";
import {
  StintFingerprint,
  CareerTrendChart,
  DefenseRankBadge,
} from "./DcFingerprintVisuals.jsx";

const TEAM_NAME = Object.fromEntries(NFL_TEAMS.map((t) => [t.abbr, t.name]));

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

// Share-card modal for a coach's defensive fingerprint — the DC twin of
// OcShareModal, single card type. Renders a fixed 1080px card (career KPIs,
// season-by-season trend, a spotlight season's full fingerprint, and the
// career stint ledger), captures it with html-to-image, and optionally frames
// it 9:16 for TikTok. AI blurb + tweet come from the shared insight proxy.
export default function DcShareModal({ allDcs, schemeRows, initialCoach, onClose }) {
  const modalRef = useModalBehavior(onClose);

  const coachOptions = useMemo(() => allCoachNames(allDcs, schemeRows), [allDcs, schemeRows]);
  const [coachName, setCoachName] = useState(initialCoach || coachOptions[0] || "");
  const [spotlightKey, setSpotlightKey] = useState(null); // "year-team"
  const [downloading, setDownloading] = useState(false);
  const [tiktok, setTiktok] = useState(false);

  const [blurb, setBlurb] = useState("");
  const [tweet, setTweet] = useState("");
  const [blurbsLoading, setBlurbsLoading] = useState(false);
  const [blurbsError, setBlurbsError] = useState("");
  const [blurbsCached, setBlurbsCached] = useState(false);
  const [blurbBumpKey, setBlurbBumpKey] = useState(0);
  const [copied, setCopied] = useState(false);

  const shareRef = useRef(null);

  const profile = useMemo(
    () => buildCoachProfile(coachName, allDcs, schemeRows),
    [coachName, allDcs, schemeRows],
  );
  const summary = useMemo(
    () => (profile ? careerDefenseSummary(profile.stints, schemeRows) : null),
    [profile, schemeRows],
  );

  // Seasons with published pbp, newest first — the spotlight choices.
  const spotlightOptions = useMemo(
    () => (summary ? [...summary.points].reverse() : []),
    [summary],
  );
  const spotlight = useMemo(() => {
    const found = spotlightOptions.find((p) => `${p.year}-${p.team}` === spotlightKey);
    return found || spotlightOptions[0] || null;
  }, [spotlightOptions, spotlightKey]);

  const blurbSubjects = useMemo(() => {
    if (!profile || !summary) return [];
    return [buildDcBlurbInput(profile, summary)];
  }, [profile, summary]);

  useEffect(() => {
    if (!blurbSubjects.length) { setBlurb(""); setTweet(""); return; }
    const force = blurbBumpKey > 0;
    let cancelled = false;
    setBlurbsLoading(true);
    setBlurbsError("");
    setTweet("");
    setBlurb("");
    fetchShareBlurbs("dc-fingerprint", blurbSubjects, { board: coachName }, { force })
      .then(({ blurbsById, tweet: nextTweet, cached }) => {
        if (cancelled) return;
        setBlurb(blurbsById.get(blurbSubjects[0].id) || "");
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
      link.download = tiktokFilename(`dc-fingerprint-${slug(coachName)}.png`, tiktok);
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

  const canRender = !!(profile && summary);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div
        ref={modalRef}
        className="w-full h-full flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="DC fingerprint share card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="bg-slate-900 border-b border-white/10 px-6 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Share</span>
          <span className="text-sm text-slate-200">DC fingerprint card</span>

          <div className="flex items-center gap-2 ml-2">
            <select
              value={coachName}
              onChange={(e) => { setCoachName(e.target.value); setSpotlightKey(null); }}
              className="bg-slate-950 border border-emerald-400/40 rounded px-2 py-1 text-sm text-emerald-200 outline-none max-w-[240px]"
            >
              {coachOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {spotlightOptions.length > 1 && (
              <select
                value={spotlight ? `${spotlight.year}-${spotlight.team}` : ""}
                onChange={(e) => setSpotlightKey(e.target.value)}
                title="Which season gets the full fingerprint breakdown"
                className="bg-slate-950 border border-white/10 rounded px-2 py-1 text-sm text-slate-200 outline-none"
              >
                {spotlightOptions.map((p) => (
                  <option key={`${p.year}-${p.team}`} value={`${p.year}-${p.team}`}>
                    {p.year} {p.team}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-slate-400 mr-1">
              {blurbsLoading ? "AI insights…"
                : blurbsError ? <span className="text-rose-300" title={blurbsError}>insights error</span>
                : blurb ? `insights ✓${blurbsCached ? " (cached)" : ""}` : ""}
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
              aria-label="Close share card"
              className="text-slate-400 hover:text-slate-100 text-lg leading-none px-2"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tweet caption — outside shareRef so it never lands in the PNG. */}
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
          {!canRender && (
            <div className="text-slate-500 text-sm self-center mt-12">
              No published pbp fingerprints for this coach's seasons yet — run the publish-dc pipeline
              or pick another coach.
            </div>
          )}
          {canRender && (
            <TikTokFrame enabled={tiktok}>
              <div
                ref={shareRef}
                style={{ width: 1080, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
                className="bg-slate-950 text-slate-100 p-10 flex flex-col gap-5"
              >
                <DcCardHeader profile={profile} summary={summary} />
                {blurb && (
                  <div className="rounded-xl border border-white/10 bg-slate-900/60 px-5 py-3 text-sm text-slate-200 italic">
                    {blurb}
                  </div>
                )}
                <DcKpiRow summary={summary} />
                <DcTrendPanel summary={summary} />
                {spotlight && <DcSpotlightPanel spotlight={spotlight} schemeRows={schemeRows} />}
                <DcStintLedger profile={profile} summary={summary} spotlight={spotlight} schemeRows={schemeRows} />
                <div className="text-center text-[11px] text-slate-500 pt-2 border-t border-white/10">
                  Dynasty Oracle · league percentiles vs all 32 defenses per season · nflverse play-by-play
                </div>
              </div>
            </TikTokFrame>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Card sections ────────────────────────────────────────────────────────────

function DcCardHeader({ profile, summary }) {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const years = summary.points.map((p) => p.year);
  const span = years.length > 1 ? `${Math.min(...years)}–${Math.max(...years)}` : String(years[0]);
  return (
    <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 flex items-center justify-between">
      <div>
        <div className="text-xs uppercase tracking-[0.3em] text-white/80 font-bold mb-1">DC Defensive Fingerprint</div>
        <div className="text-4xl font-black text-white leading-tight">{profile.name}</div>
        <div className="text-sm text-white/80 mt-2">
          {span} · {summary.seasons} {summary.seasons === 1 ? "season" : "seasons"} of pbp ·{" "}
          {[...new Set(summary.points.map((p) => p.team))].join(" / ")}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-widest text-white/70">As of</div>
        <div className="text-base font-bold text-white">{date}</div>
      </div>
    </div>
  );
}

function DcKpiRow({ summary }) {
  const tiles = [
    { label: "Seasons (pbp)", value: summary.seasons },
    {
      label: "Best defense",
      value: summary.best ? `#${summary.best.rank.rank}` : "—",
      sub: summary.best ? `${summary.best.year} ${summary.best.team}` : null,
    },
    {
      label: "Career EPA/play",
      value: summary.avgEpa != null ? fmtMetric("epa_play_allowed", summary.avgEpa) : "—",
      sub: "allowed · play-weighted",
    },
    { label: "Top-10 defenses", value: summary.top10, sub: "by EPA/play allowed" },
  ];
  return (
    <div className="grid grid-cols-4 gap-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-white/10 bg-slate-900/70 px-5 py-4 text-center">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">{t.label}</div>
          <div className="text-3xl font-black text-slate-100 mt-1">{t.value}</div>
          {t.sub && <div className="text-[10px] text-slate-500 mt-0.5">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function DcTrendPanel({ summary }) {
  if (summary.points.length < 2) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 px-5 py-4">
      <div className="text-xs uppercase tracking-widest font-bold text-emerald-300 mb-3">
        Defense percentile by season <span className="text-slate-500 normal-case font-normal">(EPA/play allowed vs league)</span>
      </div>
      <CareerTrendChart points={summary.points} size="lg" />
    </div>
  );
}

function DcSpotlightPanel({ spotlight, schemeRows }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 px-5 py-4">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs uppercase tracking-widest font-bold text-sky-300">
          {spotlight.year} {TEAM_NAME[spotlight.team] || spotlight.team}
        </span>
        <DefenseRankBadge rows={schemeRows} fp={spotlight.fp} size="lg" />
      </div>
      <StintFingerprint rows={schemeRows} fp={spotlight.fp} season={spotlight.year} size="lg" />
    </div>
  );
}

// Career ledger — one compact line per pbp season (newest first), so the card
// carries the whole track record even when only one season is spotlit.
function DcStintLedger({ profile, summary, spotlight, schemeRows }) {
  const rows = [...summary.points].reverse();
  if (rows.length < 2) return null;
  const stintMeta = new Map(profile.stints.map((s) => [`${s.year}-${s.team}`, s]));
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/70 overflow-hidden">
      <div className="px-5 py-2.5 text-xs uppercase tracking-widest font-bold text-violet-300 border-b border-white/5">
        Career ledger
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((p) => {
          const meta = stintMeta.get(`${p.year}-${p.team}`) || {};
          const epa = metricDisplay(schemeRows, p.fp, "epa_play_allowed");
          const sack = metricDisplay(schemeRows, p.fp, "sack_rate");
          const intR = metricDisplay(schemeRows, p.fp, "int_rate");
          const proe = metricDisplay(schemeRows, p.fp, "proe_faced");
          const isSpot = spotlight && p.year === spotlight.year && p.team === spotlight.team;
          return (
            <div key={`${p.year}-${p.team}`} className={`px-5 py-2.5 flex items-center gap-4 ${isSpot ? "bg-sky-500/5" : ""}`}>
              <span className="text-sm font-bold text-slate-100 w-24 shrink-0">{p.year} {p.team}</span>
              <DefenseRankBadge rows={schemeRows} fp={p.fp} />
              {meta.headCoach && !meta.name && (
                <span className="text-[10px] uppercase text-violet-300 bg-violet-500/10 border border-violet-400/30 px-1.5 py-0.5 rounded">HC</span>
              )}
              {meta.partial && (
                <span className="text-[10px] uppercase text-amber-400 bg-amber-500/10 border border-amber-400/30 px-1.5 py-0.5 rounded">partial</span>
              )}
              <div className="ml-auto flex items-center gap-5 text-[12px] tabular-nums">
                <LedgerStat label="EPA" d={epa} />
                <LedgerStat label="Sack" d={sack} />
                <LedgerStat label="INT" d={intR} />
                <LedgerStat label="PROE" d={proe} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LedgerStat({ label, d }) {
  if (!d) return null;
  const rankBit = d.kind === "quality" && d.rank ? ` (${ordinal(d.rank.rank)})` : "";
  const noteBit = d.kind === "funnel" && d.note ? ` ${d.note}` : "";
  return (
    <span className="text-slate-300">
      <span className="text-slate-600">{label}</span> {d.text}
      <span className="text-slate-500">{rankBit}{noteBit}</span>
    </span>
  );
}
