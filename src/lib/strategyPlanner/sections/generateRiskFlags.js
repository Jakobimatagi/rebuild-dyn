// Walk the path's risk patterns, keep only the ones whose predicate matches
// the current analysis, and surface up to 5 with severity weighting.

const SEVERITY_RANK = { high: 3, medium: 2, low: 1 };

export function generateRiskFlags(analysis, path) {
  const patterns = path.riskPatterns || [];

  const matched = patterns
    .map((pattern) => {
      try {
        if (!pattern.match(analysis)) return null;
      } catch {
        return null;
      }
      return {
        id: pattern.id,
        risk: pattern.risk,
        pivotTrigger: pattern.pivotTrigger,
        severity: pattern.severity || "medium",
      };
    })
    .filter(Boolean);

  matched.sort(
    (a, b) => (SEVERITY_RANK[b.severity] || 0) - (SEVERITY_RANK[a.severity] || 0),
  );

  return matched.slice(0, 5);
}
