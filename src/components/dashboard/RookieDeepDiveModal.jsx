import { createPortal } from "react-dom";
import {
  CONFERENCE_SCORES,
  BLUE_BLOOD_TEAMS,
  CAPITAL_PROD_SCORES,
  computeGrade,
  dynastyScore,
  deriveTier,
  deriveSchool,
} from "../../lib/prospectScoring.js";
import { useModalBehavior } from "../../lib/useModalBehavior.js";

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

const DIVIDER = (
  <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "20px 0" }} />
);

function SectionLabel({ children }) {
  return (
    <div
      style={{
        fontSize: 9,
        letterSpacing: 3.5,
        color: "#00f5a0",
        textTransform: "uppercase",
        marginBottom: 14,
        opacity: 0.8,
      }}
    >
      {children}
    </div>
  );
}

function MiniBar({ value, color, height = 5 }) {
  return (
    <div
      style={{
        height,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 2,
        overflow: "hidden",
        flexGrow: 1,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.max(2, value)}%`,
          background: color,
          borderRadius: 2,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PEAK_AGE = { QB: 28, RB: 24, WR: 26, TE: 27 };
const DECLINE_AGE = { QB: 33, RB: 27, WR: 30, TE: 31 };
const CLIFF_AGE = { QB: 37, RB: 30, WR: 33, TE: 34 };

const TIER_VERDICT_COLOR = (grade) => {
  if (grade >= 72) return "#00f5a0";
  if (grade >= 55) return "#7b8cff";
  if (grade >= 40) return "#ffd84d";
  return "#ff6b35";
};

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function formatCapital(cap) {
  if (!cap) return "";
  return cap.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function sortSeasons(seasons) {
  return [...(seasons || [])].sort(
    (a, b) => Number(a.season_year) - Number(b.season_year),
  );
}

// ---------------------------------------------------------------------------
// Component-level explanations (rookie-specific)
// ---------------------------------------------------------------------------

function ageExp(position, ageAtDraft) {
  const peak = PEAK_AGE[position] ?? 26;
  const gap = peak - ageAtDraft;
  if (ageAtDraft <= 21) return `Enters the NFL at age ${ageAtDraft} — ${gap} year${gap !== 1 ? "s" : ""} of runway before ${position} peak (age ${peak}). Full dynasty window.`;
  if (ageAtDraft <= 22) return `Age ${ageAtDraft} at draft — standard runway. ${gap > 0 ? `${gap} year${gap !== 1 ? "s" : ""} to peak.` : "At peak already."}`;
  if (ageAtDraft <= 23) return `Age ${ageAtDraft} at draft — slightly older profile. Expect a shorter prime window versus younger peers.`;
  return `Age ${ageAtDraft} at draft — old-for-position. Limited dynasty runway; prime may arrive alongside decline risk.`;
}

function prodExp(position, seasons, capitalKey) {
  if (!seasons || seasons.length === 0) {
    return "No college production on file. Grade falls back to draft capital as the dominant signal.";
  }
  const sorted = sortSeasons(seasons);
  const recent = sorted[sorted.length - 1];
  const capScore = CAPITAL_PROD_SCORES[capitalKey];

  const statLine = () => {
    if (position === "WR" || position === "TE") {
      const ts = num(recent.target_share_pct);
      const ypr = num(recent.yards_per_reception);
      const cr = num(recent.catch_rate_pct);
      return `${ts.toFixed(1)}% target share · ${ypr.toFixed(1)} YPR · ${cr.toFixed(1)}% catch rate`;
    }
    if (position === "QB") {
      const cp = num(recent.completion_pct);
      const ypa = num(recent.yards_per_attempt);
      return `${cp.toFixed(1)}% completions · ${ypa.toFixed(1)} YPA · ${num(recent.passing_tds)} TD / ${num(recent.interceptions)} INT`;
    }
    if (position === "RB") {
      const ypc = num(recent.yards_per_carry);
      const ts = num(recent.target_share_pct);
      return `${ypc.toFixed(2)} YPC · ${ts.toFixed(1)}% target share · ${num(recent.total_tds)} total TDs`;
    }
    return "";
  };

  const line = `Final college season: ${statLine()}.`;
  if (capScore != null) return `${line} Weighted with NFL draft capital (${formatCapital(capitalKey)}) as the dominant future-production signal.`;
  return `${line} No NFL draft capital set yet — score based on college film alone.`;
}

function availExp(seasons) {
  if (!seasons || seasons.length === 0) return "No games logged.";
  const sorted = sortSeasons(seasons);
  const recent = sorted[sorted.length - 1];
  const games = num(recent.games);
  const yrs = sorted.length;
  const line = `${games} games in last college season, ${yrs} season${yrs !== 1 ? "s" : ""} on file.`;
  if (yrs >= 3 && games >= 12) return `${line} Durable multi-year profile.`;
  if (yrs >= 2) return `${line} Moderate sample — watch for injury history on the scouting report.`;
  return `${line} Thin sample size; one-year wonders carry heightened bust risk.`;
}

function trendExp(position, seasons) {
  if (!seasons || seasons.length < 2) return "Only one college season available — no year-over-year trend to evaluate.";
  const sorted = sortSeasons(seasons);
  const recent = sorted[sorted.length - 1];
  const prev = sorted[sorted.length - 2];
  let label, prevVal, recentVal, unit;
  if (position === "WR" || position === "TE") {
    prevVal = num(prev.target_share_pct); recentVal = num(recent.target_share_pct);
    label = "target share"; unit = "%";
  } else if (position === "QB") {
    prevVal = num(prev.yards_per_attempt); recentVal = num(recent.yards_per_attempt);
    label = "yards/attempt"; unit = "";
  } else {
    prevVal = num(prev.yards_per_carry); recentVal = num(recent.yards_per_carry);
    label = "yards/carry"; unit = "";
  }
  const delta = recentVal - prevVal;
  const dir = delta >= 0 ? "improved" : "declined";
  const mag = Math.abs(delta).toFixed(2);
  const verdict = Math.abs(delta) >= 2 ? "Significant movement." : Math.abs(delta) >= 1 ? "Moderate movement." : "Stable profile.";
  return `${label} ${dir} by ${mag}${unit} year-over-year (${prevVal.toFixed(2)}${unit} → ${recentVal.toFixed(2)}${unit}). ${verdict}`;
}

function situExp(school, conferenceScore) {
  const blueBlood = BLUE_BLOOD_TEAMS.has(school);
  if (!school) return "No college listed — situation score defaulted.";
  if (blueBlood) return `${school} — blue-blood program (score ${conferenceScore}/100). Faced top-tier competition week in, week out.`;
  if (conferenceScore >= 70) return `${school} — Power 5 program (score ${conferenceScore}/100). Quality opposition every week.`;
  if (conferenceScore >= 55) return `${school} — mid-tier program (score ${conferenceScore}/100). Level of competition is a mild concern.`;
  if (conferenceScore > 0) return `${school} — lower-tier program (score ${conferenceScore}/100). Production should be discounted vs. stronger schedules.`;
  return `${school} — non-P5 or unscored conference. Limited strength-of-schedule signal.`;
}

// ---------------------------------------------------------------------------
// Projection arc (age curve sparkline, seeded from grade + position)
// ---------------------------------------------------------------------------

function ProjectionArc({ position, ageAtDraft, grade }) {
  const peak = PEAK_AGE[position] ?? 26;
  const decline = DECLINE_AGE[position] ?? 30;
  const cliff = CLIFF_AGE[position] ?? 33;

  const W = 480, H = 120;
  const PAD = { l: 28, r: 12, t: 10, b: 22 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const ageMin = 21, ageMax = 34;
  const ageRange = ageMax - ageMin;

  const xOf = (age) => PAD.l + ((age - ageMin) / ageRange) * innerW;
  const yOf = (score) => PAD.t + (1 - score / 100) * innerH;

  // Base arc: starts below peak, rises to peak, declines, cliffs.
  // Scaled so the peak matches the player's grade (ceiling of their profile).
  const ceilingPeak = Math.min(99, Math.max(45, grade + 10));
  const rookieFloor = Math.max(30, ceilingPeak - 25);

  const scoreAt = (age) => {
    if (age < peak) {
      const t = Math.max(0, (age - 21) / Math.max(1, peak - 21));
      return Math.round(rookieFloor + t * (ceilingPeak - rookieFloor));
    }
    if (age <= decline) {
      const t = (age - peak) / Math.max(1, decline - peak);
      return Math.round(ceilingPeak - t * (ceilingPeak * 0.35));
    }
    if (age <= cliff) {
      const declineVal = ceilingPeak * 0.65;
      const t = (age - decline) / Math.max(1, cliff - decline);
      return Math.max(12, Math.round(declineVal - t * (declineVal - 18)));
    }
    return 12;
  };

  const ages = Array.from({ length: ageRange + 1 }, (_, i) => ageMin + i);
  const points = ages.map((a) => `${xOf(a).toFixed(1)},${yOf(scoreAt(a)).toFixed(1)}`).join(" ");

  const rookieAge = Math.round(ageAtDraft);
  const clampedAge = Math.max(ageMin, Math.min(ageMax, rookieAge));
  const markerX = xOf(clampedAge);
  const markerY = yOf(scoreAt(clampedAge));

  const marks = [
    { label: "Rookie", age: rookieAge, color: "#7b8cff" },
    { label: "Y+2", age: rookieAge + 2, color: "#ffd84d" },
    { label: "Peak", age: peak, color: "#00f5a0" },
    { label: "Decline", age: decline, color: "#ff6b35" },
  ];

  return (
    <div style={{ margin: "8px 0 0" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ display: "block", overflow: "visible" }}
        aria-label={`Projected NFL arc for ${position}, entering at age ${rookieAge}`}
      >
        <rect x={PAD.l} y={PAD.t} width={xOf(peak) - PAD.l} height={innerH} fill="rgba(0,245,160,0.05)" />
        <rect x={xOf(peak)} y={PAD.t} width={xOf(decline) - xOf(peak)} height={innerH} fill="rgba(255,216,77,0.05)" />
        <rect x={xOf(decline)} y={PAD.t} width={xOf(cliff) - xOf(decline)} height={innerH} fill="rgba(255,107,53,0.05)" />

        <polyline points={points} fill="none" stroke="#7b8cff" strokeWidth={2} strokeLinejoin="round" />

        <line x1={markerX} y1={PAD.t} x2={markerX} y2={PAD.t + innerH} stroke="#fff" strokeWidth={1.5} opacity={0.75} />
        <circle cx={markerX} cy={markerY} r={4} fill="#fff" />

        <text x={PAD.l - 4} y={PAD.t + 1} fill="#505868" fontSize={7} textAnchor="end" dominantBaseline="hanging">100</text>
        <text x={PAD.l - 4} y={PAD.t + innerH} fill="#505868" fontSize={7} textAnchor="end" dominantBaseline="auto">0</text>

        {[22, 24, 26, 28, 30, 32].map((a) => (
          <text key={a} x={xOf(a)} y={PAD.t + innerH + 11} fill="#505868" fontSize={7} textAnchor="middle">{a}</text>
        ))}

        {marks.map(({ label, age, color }) => (
          <g key={label}>
            <line
              x1={xOf(age)} y1={PAD.t}
              x2={xOf(age)} y2={PAD.t + innerH}
              stroke={color} strokeWidth={1} strokeDasharray="3,3" opacity={0.35}
            />
            <text x={xOf(age)} y={PAD.t - 2} fill={color} fontSize={7} textAnchor="middle" opacity={0.8}>
              {label}
            </text>
          </g>
        ))}
      </svg>
      <div style={{ fontSize: 9, color: "#606878", marginTop: 4, lineHeight: 1.5, textAlign: "center" }}>
        Projected career arc — peak scaled to current grade ({grade}). Seeded from position age-curve averages.
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score math table
// ---------------------------------------------------------------------------

function ScoreMathTable({ components, grade, athleticBonus }) {
  const w = { age: 35, prod: 30, avail: 15, trend: 10, situ: 10 };
  const total = 100;
  const pct = (k) => w[k] / total;

  const rows = [
    { key: "age",   label: "Age",         color: "#7b8cff", value: components.age  },
    { key: "prod",  label: "Production",  color: "#00f5a0", value: components.prod },
    { key: "avail", label: "Availability", color: "#ffd84d", value: components.avail },
    { key: "trend", label: "Trend",       color: "#ff6b35", value: components.trend },
    { key: "situ",  label: "Situation",   color: "#c084fc", value: components.situ },
  ];

  const internal = rows.reduce((s, r) => s + r.value * pct(r.key), 0);

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Component", "Raw Score", "Weight", "Points"].map((h) => (
              <th
                key={h}
                style={{
                  textAlign: h === "Component" ? "left" : "right",
                  fontSize: 9, color: "#808898", letterSpacing: 1.5,
                  textTransform: "uppercase", paddingBottom: 8,
                  borderBottom: "1px solid rgba(255,255,255,0.07)", fontWeight: 400,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, color, value }) => {
            const weight = pct(key);
            const pts = value * weight;
            return (
              <tr key={key}>
                <td style={{ padding: "7px 0", verticalAlign: "middle" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: "#e0e5f7" }}>{label}</span>
                  </div>
                </td>
                <td style={{ textAlign: "right", verticalAlign: "middle", padding: "7px 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
                    <MiniBar value={value} color={color} />
                    <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 26, textAlign: "right" }}>
                      {value}
                    </span>
                  </div>
                </td>
                <td style={{ textAlign: "right", fontSize: 11, color: "#808898", padding: "7px 0 7px 16px", verticalAlign: "middle" }}>
                  {Math.round(weight * 100)}%
                </td>
                <td style={{ textAlign: "right", fontSize: 12, color: "#d1d7ea", padding: "7px 0 7px 16px", verticalAlign: "middle", fontWeight: 600 }}>
                  {pts.toFixed(1)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10, fontSize: 11, color: "#808898" }}>
              Base Score
            </td>
            <td style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 10, textAlign: "right", fontSize: 14, fontWeight: 700, color: "#d1d7ea" }}>
              {internal.toFixed(1)}
            </td>
          </tr>
          {athleticBonus > 0 && (
            <tr>
              <td colSpan={3} style={{ paddingTop: 4, fontSize: 11, color: "#808898" }}>
                Athletic Bonus
              </td>
              <td style={{ paddingTop: 4, textAlign: "right", fontSize: 14, fontWeight: 700, color: "#00f5a0" }}>
                +{athleticBonus}
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={3} style={{ paddingTop: 6, fontSize: 11, color: "#a0a8c0" }}>
              Prospect Grade
            </td>
            <td style={{ paddingTop: 6, textAlign: "right", fontSize: 18, fontWeight: 700, color: TIER_VERDICT_COLOR(grade) }}>
              {grade}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// College production history cards
// ---------------------------------------------------------------------------

function SeasonCard({ season, position }) {
  const year = season.season_year;
  const school = season.school || "—";
  const age = season.age != null ? num(season.age) : null;
  const games = num(season.games);

  const stats = [];
  if (position === "WR" || position === "TE") {
    if (season.target_share_pct != null) stats.push(["TGT Share", `${num(season.target_share_pct).toFixed(1)}%`]);
    if (season.yards_per_reception != null) stats.push(["YPR", num(season.yards_per_reception).toFixed(1)]);
    if (season.catch_rate_pct != null) stats.push(["Catch %", `${num(season.catch_rate_pct).toFixed(1)}%`]);
    if (season.receiving_tds != null) stats.push(["REC TD", num(season.receiving_tds)]);
  } else if (season.position === "QB" || position === "QB") {
    if (season.completion_pct != null) stats.push(["CMP %", `${num(season.completion_pct).toFixed(1)}%`]);
    if (season.yards_per_attempt != null) stats.push(["YPA", num(season.yards_per_attempt).toFixed(1)]);
    if (season.passing_tds != null) stats.push(["PASS TD", num(season.passing_tds)]);
    if (season.interceptions != null) stats.push(["INT", num(season.interceptions)]);
  } else if (position === "RB") {
    if (season.yards_per_carry != null) stats.push(["YPC", num(season.yards_per_carry).toFixed(2)]);
    if (season.rush_attempts != null) stats.push(["ATT", num(season.rush_attempts)]);
    if (season.rushing_yards != null) stats.push(["RUSH YDS", num(season.rushing_yards)]);
    if (season.total_tds != null) stats.push(["TOTAL TD", num(season.total_tds)]);
  }

  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 4,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#d1d7ea" }}>{year}</div>
        <div style={{ fontSize: 9, color: "#606878" }}>
          {age != null ? `age ${age} · ` : ""}{games} G
        </div>
      </div>
      <div style={{ fontSize: 10, color: "#808898", marginBottom: 8 }}>{school}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
        {stats.map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
            <span style={{ color: "#606878" }}>{k}</span>
            <span style={{ color: "#d1d7ea", fontWeight: 600 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Athletic profile
// ---------------------------------------------------------------------------

function AthleticProfile({ athletic }) {
  const rows = [
    ["40-yard", athletic.fortyYardDash, "s", 4.3, 4.7, true],
    ["Speed Score", athletic.speedScore, "", 115, 85, false],
    ["Burst Score", athletic.burstScore, "", 135, 95, false],
    ["Agility Score", athletic.agilityScore, "", 115, 85, false],
    ["Height", athletic.heightIn, "\"", 78, 68, false],
    ["Weight", athletic.weightLbs, " lbs", 240, 170, false],
  ].filter(([, v]) => v != null && v !== "");

  if (rows.length === 0) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
      {rows.map(([label, value, suffix, high, low, lowerBetter]) => {
        const v = num(value);
        const pct = lowerBetter
          ? Math.max(0, Math.min(100, ((low - v) / (low - high)) * 100))
          : Math.max(0, Math.min(100, ((v - low) / (high - low)) * 100));
        const color = pct >= 75 ? "#00f5a0" : pct >= 50 ? "#7b8cff" : pct >= 25 ? "#ffd84d" : "#ff6b35";
        return (
          <div
            key={label}
            style={{
              padding: "10px 12px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 4,
            }}
          >
            <div style={{ fontSize: 9, color: "#606878", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color, marginBottom: 4 }}>
              {value}{suffix}
            </div>
            <MiniBar value={pct} color={color} height={3} />
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export default function RookieDeepDiveModal({
  prospect,
  annotation,
  expertRankings,
  experts,
  onClose,
}) {
  const modalRef = useModalBehavior(onClose);

  if (!prospect) return null;

  const ann = annotation || {};
  const capitalKey = ann.draftCapital || prospect.draft_capital || "";
  const athletic = prospect.athletic || {};
  const seasons = prospect.seasons || [];
  const sortedSeasons = sortSeasons(seasons);
  const recent = sortedSeasons[sortedSeasons.length - 1] || {};
  const ageAtDraft = num(recent.age) || 22;
  const school = deriveSchool(prospect);

  const { total: grade, components } = computeGrade({
    ...prospect,
    draftCapital: capitalKey,
    athletic,
  });
  const athleticBonus = components.athletic || 0;
  const suggestedTier = deriveTier(grade, capitalKey);
  const tier = ann.tier || suggestedTier;
  const dsValue = Math.round(dynastyScore(grade, prospect.position, seasons));
  const verdictColor = TIER_VERDICT_COLOR(grade);

  const conferenceScore = CONFERENCE_SCORES[school] ?? 0;

  const rankings = (expertRankings || [])
    .slice()
    .sort((a, b) => Number(a.rank_order) - Number(b.rank_order));
  const expertMap = Object.fromEntries((experts || []).map((e) => [e.id, e.username]));

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.82)",
        zIndex: 200,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "40px 16px 60px",
      }}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Rookie deep dive for ${prospect.name}`}
        style={{
          background: "#0d0d16",
          border: "1px solid rgba(0,245,160,0.18)",
          borderRadius: 6,
          padding: "28px 32px 36px",
          maxWidth: 660,
          width: "100%",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close rookie deep dive"
          style={{
            position: "absolute",
            top: 16,
            right: 18,
            background: "transparent",
            border: "none",
            color: "#d1d7ea",
            fontSize: 18,
            cursor: "pointer",
            lineHeight: 1,
            padding: 4,
          }}
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: "50%",
              background: `${verdictColor}18`,
              border: `2px solid ${verdictColor}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 18,
              fontWeight: 700,
              color: verdictColor,
              flexShrink: 0,
            }}
          >
            {grade}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>
              {prospect.name}
            </div>
            <div style={{ fontSize: 11, color: "#d1d7ea", marginTop: 3 }}>
              {prospect.position}
              {school ? ` · ${school}` : ""}
              {ageAtDraft ? ` · ${ageAtDraft}yo` : ""}
              {prospect.projected_draft_year ? ` · ${prospect.projected_draft_year} class` : ""}
            </div>
            {(capitalKey || ann.landingSpot) && (
              <div style={{ fontSize: 10, color: "#ffd84d", marginTop: 2 }}>
                {capitalKey && `NFL Capital: ${formatCapital(capitalKey)}`}
                {capitalKey && ann.landingSpot && " · "}
                {ann.landingSpot && `Landing: ${ann.landingSpot}`}
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {tier && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: verdictColor,
                    background: `${verdictColor}18`,
                    border: `1px solid ${verdictColor}44`,
                    borderRadius: 3,
                    padding: "3px 8px",
                  }}
                >
                  {tier}
                </span>
              )}
              {prospect.comparable_player && (
                <span
                  style={{
                    fontSize: 9,
                    color: "#c084fc",
                    background: "rgba(192,132,252,0.12)",
                    border: "1px solid rgba(192,132,252,0.3)",
                    borderRadius: 3,
                    padding: "3px 8px",
                  }}
                >
                  Comp: {prospect.comparable_player}
                </span>
              )}
              {ann.declared && (
                <span
                  style={{
                    fontSize: 9,
                    color: "#00f5a0",
                    background: "rgba(0,245,160,0.12)",
                    border: "1px solid rgba(0,245,160,0.3)",
                    borderRadius: 3,
                    padding: "3px 8px",
                    fontWeight: 700,
                  }}
                >
                  ✓ Declared
                </span>
              )}
              {BLUE_BLOOD_TEAMS.has(school) && (
                <span
                  style={{
                    fontSize: 9,
                    color: "#ffd84d",
                    background: "rgba(255,216,77,0.1)",
                    border: "1px solid rgba(255,216,77,0.3)",
                    borderRadius: 3,
                    padding: "3px 8px",
                  }}
                >
                  Blue Blood
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 9, color: "#606878", marginBottom: 2 }}>DYNASTY</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#c084fc" }}>{dsValue}</div>
          </div>
        </div>

        {DIVIDER}

        {/* Score math */}
        <SectionLabel>Grade Calculation</SectionLabel>
        <ScoreMathTable components={components} grade={grade} athleticBonus={athleticBonus} />

        {DIVIDER}

        {/* Component explanations */}
        <SectionLabel>What Each Score Means</SectionLabel>
        {[
          { label: "Age", color: "#7b8cff", value: components.age,   explanation: ageExp(prospect.position, ageAtDraft) },
          { label: "Production", color: "#00f5a0", value: components.prod,  explanation: prodExp(prospect.position, seasons, capitalKey) },
          { label: "Availability", color: "#ffd84d", value: components.avail, explanation: availExp(seasons) },
          { label: "Trend", color: "#ff6b35", value: components.trend, explanation: trendExp(prospect.position, seasons) },
          { label: "Situation", color: "#c084fc", value: components.situ,  explanation: situExp(school, conferenceScore) },
        ].map(({ label, color, value, explanation }) => (
          <div
            key={label}
            style={{
              marginBottom: 12,
              padding: "10px 14px",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderLeft: `3px solid ${color}`,
              borderRadius: 4,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color }}>{label}</span>
              <div style={{ flex: 1 }}>
                <MiniBar value={value} color={color} height={4} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color, minWidth: 24, textAlign: "right" }}>
                {value}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#a0a8c0", lineHeight: 1.5 }}>{explanation}</div>
          </div>
        ))}

        {/* College production history */}
        {sortedSeasons.length > 0 && (
          <>
            {DIVIDER}
            <SectionLabel>College Production History</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
              {sortedSeasons.map((s, i) => (
                <SeasonCard key={i} season={s} position={prospect.position} />
              ))}
            </div>
          </>
        )}

        {/* Athletic profile */}
        {Object.values(athletic).some((v) => v != null && v !== "") && (
          <>
            {DIVIDER}
            <SectionLabel>Athletic Profile</SectionLabel>
            <AthleticProfile athletic={athletic} />
            {athleticBonus > 0 && (
              <div style={{ fontSize: 10, color: "#606878", marginTop: 10, lineHeight: 1.5 }}>
                Athletic testing contributed +{athleticBonus} to the grade above the base score.
              </div>
            )}
          </>
        )}

        {/* NFL projection */}
        {DIVIDER}
        <SectionLabel>NFL Projection</SectionLabel>
        <div style={{ fontSize: 11, color: "#a0a8c0", lineHeight: 1.55, marginBottom: 12 }}>
          Entering the league at age {Math.round(ageAtDraft)} with a grade of {grade}
          {capitalKey ? ` and ${formatCapital(capitalKey)} draft capital` : ""}.
          {` ${prospect.position}s peak around age ${PEAK_AGE[prospect.position] ?? 26}; expect decline near age ${DECLINE_AGE[prospect.position] ?? 30}.`}
        </div>
        <ProjectionArc position={prospect.position} ageAtDraft={ageAtDraft} grade={grade} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 16 }}>
          {[
            { label: "Rookie Year", age: Math.round(ageAtDraft), note: capitalKey ? formatCapital(capitalKey) : "TBD" },
            { label: "Year +2", age: Math.round(ageAtDraft) + 2, note: `Grade ~${Math.min(99, grade + 4)}` },
            { label: "Projected Peak", age: PEAK_AGE[prospect.position] ?? 26, note: `Ceiling ~${Math.min(99, grade + 10)}` },
          ].map(({ label, age, note }) => (
            <div
              key={label}
              style={{
                textAlign: "center",
                padding: "10px 8px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 4,
              }}
            >
              <div style={{ fontSize: 9, color: "#606878", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: verdictColor }}>age {age}</div>
              <div style={{ fontSize: 10, color: "#808898", marginTop: 3 }}>{note}</div>
            </div>
          ))}
        </div>

        {/* Analyst consensus */}
        {rankings.length > 0 && (
          <>
            {DIVIDER}
            <SectionLabel>Analyst Rankings</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
              {rankings.map((r) => (
                <div
                  key={r.user_id}
                  style={{
                    padding: "8px 10px",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 4,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 11, color: "#d1d7ea" }}>{expertMap[r.user_id] || "Analyst"}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#00f5a0" }}>#{r.rank_order}</span>
                </div>
              ))}
            </div>
            {r_avg(rankings) != null && (
              <div style={{ fontSize: 10, color: "#606878", marginTop: 8 }}>
                Consensus avg: #{r_avg(rankings).toFixed(1)} across {rankings.length} analyst{rankings.length !== 1 ? "s" : ""}.
              </div>
            )}
          </>
        )}

        <div
          style={{
            marginTop: 28,
            paddingTop: 16,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 9,
            color: "#404858",
            lineHeight: 1.5,
          }}
        >
          Grade blends college production, age, availability, trend, and strength of schedule,
          weighted by NFL draft capital. Projection arc is heuristic — seeded from position
          age-curve averages, not individual historical comps.
        </div>
      </div>
    </div>,
    document.body,
  );
}

function r_avg(ranks) {
  if (!ranks.length) return null;
  return ranks.reduce((s, r) => s + Number(r.rank_order || 0), 0) / ranks.length;
}
