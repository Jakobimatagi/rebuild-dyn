// Single-plan-per-league persistence in localStorage.
// Key: dyn:strategy-plan:{leagueId}:{rosterId}

function storageKey(leagueId, rosterId) {
  return `dyn:strategy-plan:${leagueId}:${rosterId}`;
}

function hasStorage() {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

export function savePlan(leagueId, rosterId, plan) {
  if (!hasStorage() || !leagueId || !rosterId) return;
  try {
    window.localStorage.setItem(
      storageKey(leagueId, rosterId),
      JSON.stringify(plan),
    );
  } catch {
    /* quota / serialization — silently fail */
  }
}

export function loadPlan(leagueId, rosterId) {
  if (!hasStorage() || !leagueId || !rosterId) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(leagueId, rosterId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearPlan(leagueId, rosterId) {
  if (!hasStorage() || !leagueId || !rosterId) return;
  try {
    window.localStorage.removeItem(storageKey(leagueId, rosterId));
  } catch {
    /* noop */
  }
}
