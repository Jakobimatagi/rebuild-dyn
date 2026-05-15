// Single-plan-per-league persistence in localStorage.
// Key: dyn:strategy-plan:{leagueId}:{rosterId}

// Legacy pathKeys are migrated on read so plans saved before the
// composite "rebuild" path was introduced continue to work. The
// migrated shape is persisted back so the cost is paid once.
const LEGACY_PATH_MAP = {
  fullTeardown: { pathKey: "rebuild", variant: "hard" },
  retoolRebuild: { pathKey: "rebuild", variant: "measured" },
};

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
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.pathKey) return parsed;
    const mapping = LEGACY_PATH_MAP[parsed.pathKey];
    if (!mapping) return parsed;
    const migrated = {
      ...parsed,
      pathKey: mapping.pathKey,
      variant: mapping.variant,
    };
    try {
      window.localStorage.setItem(
        storageKey(leagueId, rosterId),
        JSON.stringify(migrated),
      );
    } catch {
      /* persist-back is best-effort; the in-memory object still works */
    }
    return migrated;
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
