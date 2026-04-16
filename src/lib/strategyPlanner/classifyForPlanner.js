// Thin adapter over analysis.teamPhase produced by classifyLeagueTeams().
// Maps the league-relative phase onto the Strategy Planner's 3 classes and
// passes through the existing reasoning signals.

const PHASE_TO_CLASS = {
  contender: "contender",
  retool: "retooler",
  rebuild: "rebuilder",
};

const CLASS_TO_PHASE = {
  contender: "contender",
  retooler: "retool",
  rebuilder: "rebuild",
};

export function classifyForPlanner(analysis, userOverride) {
  const tp = analysis?.teamPhase || {};
  const derivedClass = PHASE_TO_CLASS[tp.phase] || "retooler";
  const finalClass = userOverride || derivedClass;
  return {
    class: finalClass,
    derivedClass,
    confidence: typeof tp.score === "number" ? tp.score : 50,
    reasoning: tp.signals || [],
    userOverride: !!userOverride && userOverride !== derivedClass,
  };
}

export function classToPhase(cls) {
  return CLASS_TO_PHASE[cls] || "retool";
}

export const PLANNER_CLASSES = ["rebuilder", "retooler", "contender"];
