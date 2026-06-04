/**
 * validateOcMapping.ts
 *
 * Runtime guardrail for the OC-outlook pipeline. Asserts the core invariant:
 *
 *     a player's displayed coach === OC_DATA[season][player.team].name
 *
 * The mapping is structurally sound (player + OC are co-derived from the same
 * `player.team` key — see ocAdjustment.js), so this exists to catch *data* drift:
 * a hand-seeded OC_DATA entry that's wrong/empty, or a malformed roster payload
 * arriving from the frontend (Sleeper/Fleaflicker normalization quirks, partial
 * objects, legacy team abbreviations).
 *
 * Defensive by construction: never throws on a malformed payload — every bad
 * input becomes an issue row instead. Pure, no React/DOM.
 *
 * The engine modules are plain JS and import as `any`; this is the typed
 * boundary around them.
 */

import { OC_DATA, NFL_TEAMS } from "./ocData.js";

// OC_DATA imports from JS with a frozen literal type (keys `2026 | 2025 | …`),
// which can't be indexed by a general `number`. View it as a season→team record;
// every nested value is still re-validated at runtime via isObject().
const OC_BY_SEASON = OC_DATA as Record<number, Record<string, unknown> | undefined>;

const NFL_ABBRS: ReadonlySet<string> = new Set(
  (Array.isArray(NFL_TEAMS) ? NFL_TEAMS : [])
    .map((t: { abbr?: unknown }) => (typeof t?.abbr === "string" ? t.abbr : null))
    .filter((a): a is string => a !== null),
);

/**
 * Legacy / alternate abbreviations seen in third-party payloads, mapped to the
 * canonical Sleeper abbr used in NFL_TEAMS + OC_DATA. Only unambiguous mappings
 * are included — `LA` → `LAR` follows the historical convention (the Chargers
 * are always `LAC`/`SD`).
 */
const TEAM_ALIASES: Readonly<Record<string, string>> = {
  JAC: "JAX",
  WSH: "WAS",
  LA: "LAR",
  STL: "LAR",
  SL: "LAR",
  OAK: "LV",
  SD: "LAC",
  ARZ: "ARI",
  CLV: "CLE",
  HST: "HOU",
  BLT: "BAL",
  KCC: "KC",
  TBB: "TB",
  GBP: "GB",
  NOR: "NO",
  SFO: "SF",
  NWE: "NE",
};

export type OcMappingIssueCode =
  | "MALFORMED_PLAYER"
  | "UNKNOWN_TEAM"
  | "NO_OC_FOR_TEAM"
  | "OC_NAME_MISMATCH"
  | "PROSPECT_NO_TEAM";

export type OcMappingIssue = {
  playerId: string;
  name: string;
  severity: "error" | "warn";
  code: OcMappingIssueCode;
  detail: string;
};

/** Minimal shape we read off a roster entry. All fields are validated at runtime. */
export type OcMappingPlayerInput = {
  id?: unknown;
  name?: unknown;
  team?: unknown;
  ocOutlook?: { ocName?: unknown } | null;
};

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

/** A non-null object (not an array). */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Normalize a raw team value to a canonical NFL abbr, or null when it isn't a
 * usable team string. Trims, upcases, and resolves known legacy aliases. Does
 * NOT assert membership in NFL_ABBRS — the caller decides how to treat an
 * unknown-but-well-formed abbr.
 */
export function normalizeTeam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  if (!t || t === "FA" || t === "NONE" || t === "NULL") return null;
  return TEAM_ALIASES[t] ?? t;
}

/**
 * Validate player → team → coach pairings for a season. Returns an issue list
 * (empty === all good). Never throws, regardless of payload shape.
 *
 * @param players Roster entries. Accepts `unknown[]` so malformed payloads are
 *                reported rather than crashing; non-array input yields `[]`.
 * @param season  Target season (number or numeric string).
 */
export function validateOcMapping(
  players: readonly unknown[] | null | undefined,
  season: number | string,
): OcMappingIssue[] {
  const issues: OcMappingIssue[] = [];
  if (!Array.isArray(players)) return issues;

  const seasonKey = Number(season);
  const rawSeason = Number.isFinite(seasonKey) ? OC_BY_SEASON[seasonKey] : undefined;
  const seasonOcs: Record<string, unknown> = isObject(rawSeason) ? rawSeason : {};

  players.forEach((raw, i) => {
    if (!isObject(raw)) {
      issues.push({
        playerId: `index:${i}`,
        name: "(malformed)",
        severity: "error",
        code: "MALFORMED_PLAYER",
        detail: `Roster entry at index ${i} is not an object (got ${raw === null ? "null" : typeof raw}).`,
      });
      return;
    }

    const playerId = asString(raw.id, `index:${i}`);
    const name = asString(raw.name, playerId);

    const outlook = isObject(raw.ocOutlook) ? raw.ocOutlook : null;
    const outlookOcName = outlook ? asString(outlook.ocName) : null;

    const team = normalizeTeam(raw.team);

    // Prospect / FA / no usable team: legitimate only if it carries no outlook.
    if (team === null) {
      if (outlook) {
        issues.push({
          playerId,
          name,
          severity: "error",
          code: "PROSPECT_NO_TEAM",
          detail: `No NFL team but has OC outlook "${outlookOcName || "?"}" — contamination.`,
        });
      }
      return;
    }

    if (!NFL_ABBRS.has(team)) {
      issues.push({
        playerId,
        name,
        severity: "error",
        code: "UNKNOWN_TEAM",
        detail: `team ${JSON.stringify(raw.team)} is not a known NFL abbr (normalized: "${team}").`,
      });
      return;
    }

    // No outlook to verify (e.g. a non-skill position, or OC data not loaded).
    if (!outlook) return;

    const entry = seasonOcs[team];
    const truth = isObject(entry) && typeof entry.name === "string" ? entry.name : null;

    if (!truth) {
      issues.push({
        playerId,
        name,
        severity: "warn",
        code: "NO_OC_FOR_TEAM",
        detail: `OC_DATA[${seasonKey}][${team}] is empty or malformed.`,
      });
      return;
    }

    // The core invariant. Trim both sides so incidental whitespace in a
    // hand-edited OC_DATA entry doesn't read as a real mismatch.
    if ((outlookOcName ?? "").trim() !== truth.trim()) {
      issues.push({
        playerId,
        name,
        severity: "error",
        code: "OC_NAME_MISMATCH",
        detail: `${name} (${team}) shows "${outlookOcName ?? ""}" but OC_DATA says "${truth}".`,
      });
    }
  });

  return issues;
}
