/**
 * formatMode.js
 *
 * A league is analyzed in one of two modes:
 *   - "dynasty"  — the app's original behavior: forward-tilted, age-aware value
 *                  with rookie picks and multi-year outlook.
 *   - "redraft"  — single-season value: current-year production leads, age and
 *                  the 3-year forecast are switched off, no future picks.
 *
 * The mode is auto-detected from the connected league's real settings, and the
 * user can override it with the dashboard toggle. Keep this dependency-free so
 * it unit-tests in isolation.
 */

export const FORMAT_MODES = ["dynasty", "redraft"];

export function isValidFormatMode(mode) {
  return FORMAT_MODES.includes(mode);
}

/**
 * Infer the format from a normalized league object. Sleeper's `settings.type`
 * is the primary signal (0 = redraft, 1 = keeper, 2 = dynasty); the ESPN and
 * Fleaflicker normalizers set the same field. Falls back to the league name,
 * then to dynasty (the app's historical default).
 *
 * @param {object} league  normalized league (Sleeper-shaped)
 * @returns {"dynasty"|"redraft"}
 */
export function deriveFormatMode(league) {
  const type = league?.settings?.type;
  if (type === 2) return "dynasty";
  if (type === 0 || type === 1) return "redraft"; // redraft + keeper

  const name = (league?.name || "").toLowerCase();
  if (name.includes("dynasty")) return "dynasty";
  if (name.includes("redraft") || name.includes("re-draft") || name.includes("keeper")) {
    return "redraft";
  }
  return "dynasty";
}

/** Human label for the current mode. */
export function formatModeLabel(mode) {
  return mode === "redraft" ? "Redraft" : "Dynasty";
}
