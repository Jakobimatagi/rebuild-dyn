export const POSITION_PRIORITY = ["QB", "WR", "RB", "TE"];

export const IDEAL_PROPORTION = { QB: 0.18, RB: 0.35, WR: 0.35, TE: 0.12 };

export const ARCHETYPE_META = {
  Cornerstone: { color: "#FFD700", short: "CS" },
  Foundational: { color: "#00f5a0", short: "FD" },
  "Productive Vet": { color: "#7fff7f", short: "PV" },
  Mainstay: { color: "#64b5f6", short: "MS" },
  "Upside Shot": { color: "#c084fc", short: "UP" },
  "Short Term League Winner": { color: "#ff9800", short: "LW" },
  "Short Term Production": { color: "#ffd84d", short: "ST" },
  Serviceable: { color: "#d9deef", short: "SV" },
  "JAG - Insurance": { color: "#d1d7ea", short: "JI" },
  "JAG - Developmental": { color: "#9b7fd4", short: "JD" },
  Replaceable: { color: "#ff2d55", short: "RP" },
};

export const ARCHETYPE_DESC = {
  Cornerstone:
    "Proven elite production with high insulation. Unlikely to lose value even after a bad season.",
  Foundational:
    "At or near prime, highly insulated, undetermined ceiling. High floor and high upside.",
  "Productive Vet":
    "Older but in a good situation with years of proven start-worthy production ahead.",
  Mainstay:
    "Young version of Productive Vet — consistent role and output, not yet elite.",
  "Upside Shot":
    "Young with insulation but ceiling unrealized. Breakout potential via development or situation change.",
  "Short Term League Winner":
    "Aging but elite producer. High production floor, low dynasty insulation — play for now.",
  "Short Term Production":
    "Currently producing but significant questions about sustainability beyond this season.",
  Serviceable:
    "Name value, consistent flex role, capped ceiling. Reliable bench filler.",
  "JAG - Insurance":
    "Bench insurance. Limited production, not a weekly starter — just a number.",
  "JAG - Developmental":
    "Young with little production yet. Pure development prospect, hold and wait.",
  Replaceable:
    "Droppable. Low FAAB cost to replace, not rostered in every league.",
};
