const FANTASYCALC_BASE_URL = "https://api.fantasycalc.com";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function clampPpr(rec = 0) {
  if (rec >= 1) return 1;
  if (rec >= 0.5) return 0.5;
  return 0;
}

function getFantasyCalcParams(league) {
  const rosterPositions = league?.roster_positions || [];
  const scoring = league?.scoring_settings || {};
  const qbStarters = rosterPositions.filter((slot) => slot === "QB").length;
  const isSuperflex = qbStarters > 1 || rosterPositions.includes("SUPER_FLEX");

  return {
    isDynasty: true,
    numQbs: isSuperflex ? 2 : 1,
    numTeams: Number(league?.total_rosters || 12),
    ppr: clampPpr(Number(scoring.rec ?? 0)),
  };
}

function getCacheKey(params) {
  return `fantasycalc_values_${params.isDynasty}_${params.numQbs}_${params.numTeams}_${params.ppr}`;
}

export async function fetchFantasyCalcValues(league) {
  const params = getFantasyCalcParams(league);
  const cacheKey = getCacheKey(params);

  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (
        Date.now() - parsed.timestamp < ONE_DAY_MS &&
        Array.isArray(parsed.data)
      ) {
        return parsed.data;
      }
    }
  } catch {
    // ignore cache issues
  }

  const query = new URLSearchParams({
    isDynasty: String(params.isDynasty),
    numQbs: String(params.numQbs),
    numTeams: String(params.numTeams),
    ppr: String(params.ppr),
  });
  const res = await fetch(
    `${FANTASYCALC_BASE_URL}/values/current?${query.toString()}`,
  );
  if (!res.ok) throw new Error(`FantasyCalc API error: ${res.status}`);

  const data = await res.json();

  try {
    localStorage.setItem(
      cacheKey,
      JSON.stringify({
        timestamp: Date.now(),
        data,
      }),
    );
  } catch {
    // ignore cache write issues
  }

  return data;
}
