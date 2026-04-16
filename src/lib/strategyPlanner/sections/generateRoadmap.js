// Build a 3-stage roadmap by filling the path's static template with concrete
// moves from the generated trade targets, marquee moves, and rookie plan.

function formatAcquire(target) {
  if (!target) return null;
  const p = target.player;
  const name = p?.name || "Unknown";
  const pos = p?.position || "";
  const pkg = (target.package || []).join(" + ");
  return pkg
    ? `Trade ${pkg} for ${name} (${pos})`
    : `Acquire ${name} (${pos})`;
}

function formatMarquee(move) {
  if (!move || !move.send || !move.receive?.player) return null;
  const send = move.send.name;
  const recv = move.receive.player.name;
  const picks = move.receivePickLabels || [];
  const picksStr = picks.length ? ` + ${picks.join(", ")}` : "";
  return `Ship ${send} to ${move.partnerTeam} for ${recv}${picksStr}`;
}

export function generateRoadmap(
  analysis,
  path,
  { tradeTargets, marqueeMoves, rookieStrategy } = {},
) {
  const template = path.roadmapTemplate || [];
  const tier1 = tradeTargets?.tier1 || [];
  const marquee = marqueeMoves?.moves || [];
  const firstYear = rookieStrategy?.years?.[0];
  const secondYear = rookieStrategy?.years?.[1];
  const thirdYear = rookieStrategy?.years?.[2];

  // Year 1 gets the biggest marquee move + the top acquisition
  const year1Moves = [
    formatMarquee(marquee[0]),
    formatAcquire(tier1[0]),
    firstYear ? `Rookie draft (${firstYear.year}): ${firstYear.targetPicks}` : null,
  ];

  // Year 2 gets the second marquee + second acquisition
  const year2Moves = [
    formatMarquee(marquee[1]),
    formatAcquire(tier1[1]),
    secondYear ? `Rookie draft (${secondYear.year}): ${secondYear.targetPicks}` : null,
  ];

  // Year 3: remaining rookie plan + any third marquee move
  const year3Moves = [
    formatMarquee(marquee[2]),
    thirdYear ? `Rookie draft (${thirdYear.year}): ${thirdYear.targetPicks}` : null,
  ];

  const stageMoves = [year1Moves, year2Moves, year3Moves];

  const stages = template.map((stage, i) => ({
    label: stage.label,
    objective: stage.objective,
    lineupPhilosophy: stage.lineupPhilosophy,
    winLoss: stage.winLoss,
    decisionGates: stage.decisionGates || [],
    moves: (stageMoves[i] || []).filter(Boolean),
  }));

  return { stages };
}
