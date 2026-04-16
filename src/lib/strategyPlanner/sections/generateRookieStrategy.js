// Produce a per-year rookie pick plan for the next 3 draft classes.
// Inventory is pulled from analysis.picksByYear, strategy from the path.

function summarizeInventory(pickList) {
  if (!pickList || pickList.length === 0) {
    return "None owned";
  }
  const byRound = {};
  pickList.forEach((p) => {
    const r = p.round || 0;
    byRound[r] = (byRound[r] || 0) + 1;
  });
  return Object.keys(byRound)
    .sort((a, b) => Number(a) - Number(b))
    .map((r) => {
      const n = byRound[r];
      const label =
        r === "1" ? "1st" : r === "2" ? "2nd" : r === "3" ? "3rd" : `${r}th`;
      return `${n} ${label}${n > 1 ? "s" : ""}`;
    })
    .join(", ");
}

export function generateRookieStrategy(analysis, path) {
  const current = new Date().getFullYear();
  const years = [current + 1, current + 2, current + 3]; // upcoming + 2 future
  const picksByYear = analysis?.picksByYear || {};

  const perYear = path.rookieStrategy?.perYear;

  const yearPlans = years.map((year) => {
    const owned = picksByYear[String(year)] || picksByYear[year] || [];
    const inventory = summarizeInventory(owned);
    if (typeof perYear === "function") {
      try {
        return perYear(year, inventory, owned);
      } catch {
        /* fall through */
      }
    }
    return {
      year,
      targetPicks: "Follow path guidance",
      behavior: "Default behavior",
      positions: [],
      inventory,
      ownedPicks: owned,
      namedRookies: [],
      note: "",
    };
  });

  return { years: yearPlans };
}
