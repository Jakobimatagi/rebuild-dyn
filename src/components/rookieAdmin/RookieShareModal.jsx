import { useEffect, useMemo, useRef, useState } from "react";
import { captureShareImage, tiktokFilename } from "../../lib/shareImage.js";
import TikTokFrame from "../TikTokFrame.jsx";
import { useModalBehavior } from "../../lib/useModalBehavior.js";
import { computeGrade, deriveSchool, deriveTier } from "../../lib/prospectScoring.js";
import { fetchShareBlurbs, buildRookieBlurbInput } from "../../lib/aiShareBlurbsApi.js";
import { normalizeName } from "./utils.js";
import { POS_COLORS } from "./constants.js";

const SHARE_TABS = ["Overall", "QB", "RB", "WR", "TE"];

const POS_GRADIENTS = {
  Overall: "from-emerald-500 to-emerald-700",
  QB: "from-rose-500 to-rose-700",
  RB: "from-emerald-500 to-emerald-700",
  WR: "from-sky-500 to-sky-700",
  TE: "from-amber-500 to-amber-700",
};

const TIER_COLORS = {
  "Cornerstone":              "bg-yellow-400 text-yellow-950 border-yellow-300",
  "Foundational":             "bg-emerald-400 text-emerald-950 border-emerald-300",
  "Upside Shot":              "bg-purple-400 text-purple-950 border-purple-300",
  "Mainstay":                 "bg-blue-400 text-blue-950 border-blue-300",
  "Productive Vet":           "bg-green-300 text-green-950 border-green-200",
  "Short Term League Winner": "bg-orange-400 text-orange-950 border-orange-300",
  "Short Term Production":    "bg-yellow-300 text-yellow-950 border-yellow-200",
  "Serviceable":              "bg-slate-300 text-slate-900 border-slate-200",
  "JAG - Insurance":          "bg-slate-200 text-slate-900 border-slate-100",
  "JAG - Developmental":      "bg-violet-400 text-violet-950 border-violet-300",
  "Replaceable":              "bg-rose-500 text-rose-50 border-rose-400",
};

// Same thresholds as utils.gradeLetter — duplicated to keep this file
// self-contained for the score badge below.
function gradeLetter(score) {
  if (score >= 78) return "A";
  if (score >= 62) return "B";
  if (score >= 46) return "C";
  if (score >= 30) return "D";
  return "F";
}

const GRADE_BG = {
  A: "bg-emerald-500 text-emerald-950 border-emerald-400",
  B: "bg-lime-400 text-lime-950 border-lime-300",
  C: "bg-amber-400 text-amber-950 border-amber-300",
  D: "bg-orange-500 text-orange-950 border-orange-400",
  F: "bg-rose-500 text-rose-50 border-rose-400",
};

export default function RookieShareModal({
  prospects,
  annotations,
  sleeperByName,
  currentDraftYear,
  initialYear,
  onClose,
}) {
  const modalRef = useModalBehavior(onClose);

  // Year options: every distinct projected year on file plus the next two
  // future classes, in ascending order. Past archived years stay available
  // so old class shares can still be regenerated.
  const yearOptions = useMemo(() => {
    const set = new Set();
    prospects.forEach((p) => {
      const y = Number(p.projectedDraftYear);
      if (y) set.add(y);
    });
    [0, 1, 2].forEach((o) => set.add(currentDraftYear + o));
    return Array.from(set).sort((a, b) => a - b);
  }, [prospects, currentDraftYear]);

  const defaultYear = yearOptions.includes(Number(initialYear))
    ? Number(initialYear)
    : currentDraftYear;

  const [year, setYear] = useState(defaultYear);
  const [limit, setLimit] = useState(12);
  const [tab, setTab] = useState("Overall");
  const [downloading, setDownloading] = useState(null);
  const [tiktok, setTiktok] = useState(false);
  const shareRefs = useRef({});

  // Per-player AI rationale blurbs. Keyed by prospect id. We accumulate
  // across tab/year/limit changes so a previously-fetched player stays
  // captioned when the user switches scope back. `blurbsLoading` flips
  // while a fetch is in flight; `blurbsError` surfaces transient failures
  // without nuking the visible blurbs we already have.
  const [blurbs, setBlurbs] = useState(() => new Map());
  const [blurbsLoading, setBlurbsLoading] = useState(false);
  const [blurbsError, setBlurbsError] = useState("");
  const [blurbsCached, setBlurbsCached] = useState(false);
  const [blurbBumpKey, setBlurbBumpKey] = useState(0);

  // Mirror the membership rules the rest of the admin uses (filter on
  // RookieProspector lines 416-425 + the Archive selector). For a given
  // prospect, compute their "effective" draft year:
  //  - past projectedDraftYear (< currentDraftYear) only counts in that
  //    year *if* the prospect was declared; otherwise they fall off the
  //    board entirely (undrafted underclassman who never materialized).
  //  - future projectedDraftYear with declared / Sleeper-declared flag is
  //    pulled forward into the current class, mirroring the Upcoming tab.
  //  - everything else stays in its projected year.
  const effectiveYear = (p, ann) => {
    const yProj = Number(p.projectedDraftYear);
    const isSleeperDecl =
      !!sleeperByName?.[normalizeName(p.name)] &&
      yProj >= currentDraftYear &&
      yProj <= currentDraftYear + 1;
    const declared = ann.declared || isSleeperDecl;
    if (yProj < currentDraftYear) return declared ? yProj : null;
    if (declared) return currentDraftYear;
    return yProj;
  };
  const matchesYear = (p, ann) => effectiveYear(p, ann) === year;

  const graded = useMemo(() => {
    return prospects
      .map((p) => {
        const ann = annotations[p.id] || {};
        if (!matchesYear(p, ann)) return null;
        const sleeperRank = sleeperByName?.[normalizeName(p.name)]?.rank;
        const capitalKey = ann.draftCapital || p.draftCapital || "";
        const isSleeperDecl =
          !!sleeperByName?.[normalizeName(p.name)] &&
          Number(p.projectedDraftYear) >= currentDraftYear &&
          Number(p.projectedDraftYear) <= currentDraftYear + 1;
        const declared = ann.declared || isSleeperDecl;
        const { total: grade } = computeGrade(
          p,
          sleeperRank,
          capitalKey,
          declared,
          ann.tier || "",
        );
        const tierLabel = ann.tier || deriveTier(grade, capitalKey) || "";
        return {
          id: p.id,
          name: p.name,
          position: p.position,
          school: deriveSchool(p),
          capitalKey,
          tierLabel,
          landingSpot: ann.landingSpot || "",
          comp: p.comparablePlayer || p.comparable_player || "",
          rookieAdp: ann.rookieDraftAdp || "",
          grade: Math.round(grade),
          seasons: p.seasons || [],
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.grade - a.grade);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospects, annotations, sleeperByName, currentDraftYear, year]);

  const byTab = useMemo(() => {
    const out = { Overall: graded.slice(0, limit) };
    ["QB", "RB", "WR", "TE"].forEach((pos) => {
      out[pos] = graded.filter((x) => x.position === pos).slice(0, limit);
    });
    return out;
  }, [graded, limit]);

  // Chunk into 12-player pages so a Top 24 card splits into two equally
  // dense 2×6 screenshots instead of a single tall card that's hard to
  // read on Twitter.
  const PAGE_SIZE = 12;
  const pagesPerTab = useMemo(() => {
    const out = {};
    SHARE_TABS.forEach((tabKey) => {
      const players = byTab[tabKey] || [];
      const pages = [];
      for (let i = 0; i < players.length; i += PAGE_SIZE) {
        pages.push({
          players: players.slice(i, i + PAGE_SIZE),
          startRank: i + 1,
        });
      }
      out[tabKey] = pages.map((pg, idx) => ({ ...pg, part: idx + 1, total: pages.length }));
    });
    return out;
  }, [byTab]);

  // Auto-fetch blurbs whenever the active tab's player set changes. We
  // build the input off `byTab[tab]` (the unpaged list capped at `limit`)
  // so the model sees ALL visible players in one round-trip, not per page.
  // bumpKey lets the "Regenerate" button force a refetch through the cache.
  useEffect(() => {
    const players = byTab[tab] || [];
    if (!players.length) return;
    const inputs = players.map(buildRookieBlurbInput);
    const force = blurbBumpKey > 0;
    let cancelled = false;
    setBlurbsLoading(true);
    setBlurbsError("");
    fetchShareBlurbs("rookies", inputs, { year, position: tab === "Overall" ? "all" : tab }, { force })
      .then(({ blurbsById, cached }) => {
        if (cancelled) return;
        setBlurbs((prev) => {
          const next = new Map(prev);
          for (const [id, blurb] of blurbsById) next.set(id, blurb);
          return next;
        });
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
  }, [byTab, tab, year, blurbBumpKey]);

  async function captureNode(node) {
    return captureShareImage(node, { tiktok });
  }

  function filenameFor(tabKey, page) {
    const base = `rookies-${year}-${tabKey.toLowerCase()}-top${limit}`;
    const name = page.total > 1 ? `${base}-pt${page.part}.png` : `${base}.png`;
    return tiktokFilename(name, tiktok);
  }

  async function downloadTab(tabKey) {
    const pages = pagesPerTab[tabKey] || [];
    if (!pages.length) return;
    setDownloading(tabKey);
    try {
      for (let i = 0; i < pages.length; i++) {
        const node = shareRefs.current[`${tabKey}-${i}`];
        if (!node) continue;
        const dataUrl = await captureNode(node);
        const link = document.createElement("a");
        link.download = filenameFor(tabKey, pages[i]);
        link.href = dataUrl;
        link.click();
        if (i < pages.length - 1) await new Promise((r) => setTimeout(r, 250));
      }
    } catch (err) {
      console.error("Failed to generate image:", err);
    } finally {
      setDownloading(null);
    }
  }

  async function downloadAll() {
    setDownloading("all");
    for (const tabKey of SHARE_TABS) {
      const pages = pagesPerTab[tabKey] || [];
      for (let i = 0; i < pages.length; i++) {
        const node = shareRefs.current[`${tabKey}-${i}`];
        if (!node) continue;
        try {
          const dataUrl = await captureNode(node);
          const link = document.createElement("a");
          link.download = filenameFor(tabKey, pages[i]);
          link.href = dataUrl;
          link.click();
          await new Promise((r) => setTimeout(r, 250));
        } catch (err) {
          console.error(`Failed to generate ${tabKey} pt${pages[i].part} image:`, err);
        }
      }
    }
    setDownloading(null);
  }

  const totalForTab = byTab[tab]?.length || 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex flex-col" onClick={onClose}>
      <div
        ref={modalRef}
        className="w-full h-full flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rookie-share-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-slate-900 border-b border-white/10 px-6 py-3 flex flex-wrap items-center gap-3">
          <span className="text-[10px] uppercase tracking-widest text-emerald-400 font-bold">Share</span>
          <span id="rookie-share-title" className="text-sm text-slate-200">Rookie ranking cards</span>

          <div className="flex items-center gap-2 ml-2">
            <label className="text-[10px] uppercase tracking-wider text-slate-500">Class</label>
            <select
              value={year}
              onChange={(e) => setYear(parseInt(e.target.value, 10))}
              className="bg-slate-950 border border-emerald-400/40 rounded px-2 py-1 text-sm text-emerald-200 outline-none focus:border-emerald-400"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 ml-2">
            {[12, 24].map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className={`px-3 py-1 rounded text-xs font-semibold border ${
                  limit === n
                    ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                    : "border-white/10 text-slate-400 bg-slate-900/40 hover:text-slate-200"
                }`}
              >
                Top {n}
              </button>
            ))}
          </div>

          <div className="flex gap-1 ml-2">
            {SHARE_TABS.map((t) => {
              const count = byTab[t]?.length || 0;
              const isOverall = t === "Overall";
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  disabled={count === 0}
                  className={`px-3 py-1 rounded text-xs font-semibold border ${
                    active
                      ? isOverall
                        ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-200"
                        : POS_COLORS[t]
                      : "border-white/10 text-slate-500 bg-slate-900/40 hover:text-slate-200 disabled:opacity-30"
                  }`}
                >
                  {t}{count ? ` · ${count}` : ""}
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-slate-400 mr-1">
              {blurbsLoading
                ? "AI insights…"
                : blurbsError
                ? <span className="text-rose-300" title={blurbsError}>insights error</span>
                : blurbs.size > 0
                ? `insights ✓${blurbsCached ? " (cached)" : ""}`
                : ""}
            </span>
            <button
              onClick={() => setBlurbBumpKey((k) => k + 1)}
              disabled={blurbsLoading || !totalForTab}
              title="Force re-fetch of AI insights (bypasses cache)"
              className="text-[10px] font-semibold px-2 py-1 rounded border border-amber-400/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20 disabled:opacity-40"
            >
              Regenerate
            </button>
            <button
              onClick={() => setTiktok((v) => !v)}
              title="Export as 1080×1920 vertical cards sized for TikTok / Reels / Shorts"
              className={`text-xs font-semibold px-3 py-1.5 rounded border ${
                tiktok
                  ? "border-fuchsia-400/70 bg-fuchsia-500/20 text-fuchsia-100"
                  : "border-white/15 bg-slate-900/40 text-slate-300 hover:text-slate-100"
              }`}
            >
              📱 TikTok 9:16 {tiktok ? "on" : "off"}
            </button>
            <button
              onClick={() => downloadTab(tab)}
              disabled={!totalForTab || downloading === tab || downloading === "all"}
              className="text-xs font-semibold px-3 py-1.5 rounded border border-sky-400/60 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 disabled:opacity-40"
            >
              {downloading === tab
                ? "Generating…"
                : `Download ${tab}${(pagesPerTab[tab]?.length || 0) > 1 ? ` (${pagesPerTab[tab].length} PNGs)` : " PNG"}`}
            </button>
            <button
              onClick={downloadAll}
              disabled={downloading === "all"}
              className="text-xs font-semibold px-3 py-1.5 rounded border border-emerald-400/60 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-40"
            >
              {downloading === "all" ? "Generating all…" : "Download all"}
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

        <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-6">
          {SHARE_TABS.map((t) => {
            const pages = pagesPerTab[t] || [];
            const isActive = tab === t;
            if (!pages.length && !isActive) return null;
            const wrapperStyle = isActive ? {} : { position: "absolute", left: "-9999px", top: 0 };
            return (
              <div key={t} style={wrapperStyle} className="flex flex-col items-center gap-6">
                {pages.map((page, idx) => (
                  <TikTokFrame key={`${t}-${idx}`} enabled={tiktok}>
                    <ShareCard
                      innerRef={(el) => { shareRefs.current[`${t}-${idx}`] = el; }}
                      which={t}
                      players={page.players}
                      year={year}
                      limit={limit}
                      startRank={page.startRank}
                      part={page.part}
                      total={page.total}
                      blurbs={blurbs}
                    />
                  </TikTokFrame>
                ))}
              </div>
            );
          })}
          {!totalForTab && (
            <div className="text-slate-500 text-sm self-center">
              No prospects in this slice. Pick another position or year.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ShareCard({ innerRef, which, players, year, limit, startRank = 1, part = 1, total = 1, blurbs }) {
  const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const endRank = startRank + players.length - 1;
  const label = which === "Overall" ? "Overall" : which;
  const subtitle = total > 1
    ? `Top ${limit} ${label} · ${startRank}–${endRank}`
    : `Top ${Math.min(limit, players.length)} ${label}`;

  // Always 2 columns of (up to) 6, mirroring the Top-12 layout for both
  // halves of a Top-24 export so the two screenshots feel like a single
  // matched pair.
  const half = Math.ceil(players.length / 2);
  const col1 = players.slice(0, half);
  const col2 = players.slice(half);

  return (
    <div
      ref={innerRef}
      style={{ width: 1080, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}
      className="bg-slate-950 text-slate-100 p-10 flex flex-col gap-5"
    >
      <div className={`rounded-xl bg-gradient-to-br ${POS_GRADIENTS[which]} p-6 flex items-center justify-between`}>
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-white/80 font-bold mb-1">
            Rookie Class · {year}
          </div>
          <div className="text-5xl font-black text-white leading-none">{which.toUpperCase()}</div>
          <div className="text-sm text-white/80 mt-2">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-white/70">As of</div>
          <div className="text-base font-bold text-white">{date}</div>
          {total > 1 && (
            <div className="text-[10px] uppercase tracking-widest text-white/70 mt-2">
              Part {part} / {total}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {[col1, col2].map((col, ci) => (
          <div key={ci} className="rounded-xl border border-white/10 bg-slate-900/70 overflow-hidden">
            <div className="divide-y divide-white/5">
              {col.map((p, i) => (
                <ShareRow
                  key={p.id}
                  player={p}
                  rank={ci === 0 ? startRank + i : startRank + half + i}
                  blurb={blurbs?.get(p.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="text-center text-[11px] text-slate-500 pt-2 border-t border-white/10">
        Raw admin grade · production, age, athletic profile, draft capital
      </div>
    </div>
  );
}

function ShareRow({ player, rank, blurb }) {
  const { name, position, school, capitalKey, tierLabel, landingSpot, comp, rookieAdp, grade } = player;
  const letter = gradeLetter(grade);
  const tierCls = TIER_COLORS[tierLabel] || "bg-slate-700 text-slate-200 border-slate-600";

  return (
    <div className="flex items-start gap-4 px-5 py-3">
      <span className="text-2xl font-black text-slate-400 w-10 text-right tabular-nums shrink-0 pt-1">{rank}</span>

      <div className={`w-14 h-14 rounded-lg border flex flex-col items-center justify-center font-bold shrink-0 ${GRADE_BG[letter]}`}>
        <span className="text-2xl leading-none">{letter}</span>
        <span className="text-[10px] leading-none mt-0.5 opacity-80">{grade}</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-slate-100 font-bold text-lg truncate">{name}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${POS_COLORS[position] || "border-white/10 text-slate-400"}`}>
            {position}
          </span>
          {tierLabel && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${tierCls}`}>
              {tierLabel}
            </span>
          )}
          {comp && (
            <span className="text-[10px] text-violet-200 bg-violet-500/20 border border-violet-400/40 px-1.5 py-0.5 rounded">
              Comp: {comp}
            </span>
          )}
        </div>
        <div className="text-[11px] text-slate-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
          {school && <span>{school}</span>}
          {capitalKey && (
            <span className="capitalize">
              <span className="text-slate-600">NFL:</span> {capitalKey.replace(/_/g, " ")}
            </span>
          )}
          {landingSpot && <span>{landingSpot}</span>}
          {rookieAdp && <span className="text-sky-300">ADP {rookieAdp}</span>}
        </div>
        {blurb && (
          <div className="text-[11px] text-slate-300 italic mt-1.5 leading-snug">{blurb}</div>
        )}
      </div>
    </div>
  );
}
