import { useEffect, useMemo, useState } from "react";
import { styles } from "../../styles";
import {
  generatePlan,
  classifyForPlanner,
  savePlan,
  loadPlan,
  clearPlan,
  computePlanStaleness,
} from "../../lib/strategyPlanner";
import TeamStateBadge from "./strategyPlanner/TeamStateBadge";
import PathSelector from "./strategyPlanner/PathSelector";
import PlanView from "./strategyPlanner/PlanView";

export default function StrategyPlannerTab({ analysis, selectedLeague }) {
  const leagueId = selectedLeague?.league_id;
  const rosterId = analysis?.rosterId;

  const [classOverride, setClassOverride] = useState(null);
  const [selectedPathKey, setSelectedPathKey] = useState(null);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [plan, setPlan] = useState(null);
  const [saved, setSaved] = useState(false);
  const [showAllPaths, setShowAllPaths] = useState(false);

  // Hydrate saved plan on mount or when league/roster changes
  useEffect(() => {
    setClassOverride(null);
    setSelectedPathKey(null);
    setSelectedVariant(null);
    setPlan(null);
    setSaved(false);
    setShowAllPaths(false);

    if (!leagueId || !rosterId) return;
    const stored = loadPlan(leagueId, rosterId);
    if (stored && stored.pathKey) {
      setSelectedPathKey(stored.pathKey);
      setSelectedVariant(stored.variant || null);
      setPlan(stored);
      setSaved(true);
      if (stored.classification?.userOverride) {
        setClassOverride(stored.classification.class);
      }
    }
  }, [leagueId, rosterId]);

  const classification = useMemo(
    () => classifyForPlanner(analysis, classOverride),
    [analysis, classOverride],
  );

  const staleness = useMemo(
    () => (saved && plan ? computePlanStaleness(plan, analysis) : null),
    [saved, plan, analysis],
  );

  const handleSelectPath = (pathKey, variant = null) => {
    setSelectedPathKey(pathKey);
    setSelectedVariant(variant);
    try {
      const next = generatePlan(analysis, pathKey, {
        override: classOverride,
        variant,
      });
      setPlan(next);
      setSaved(false);
    } catch (err) {
      console.error("Strategy planner failed to generate plan", err);
      setPlan(null);
    }
  };

  const handleRegenerate = () => {
    if (!selectedPathKey) return;
    handleSelectPath(selectedPathKey, selectedVariant);
  };

  const handleSave = () => {
    if (!plan || !leagueId || !rosterId) return;
    savePlan(leagueId, rosterId, plan);
    setSaved(true);
  };

  const handleClear = () => {
    if (leagueId && rosterId) clearPlan(leagueId, rosterId);
    setPlan(null);
    setSelectedPathKey(null);
    setSelectedVariant(null);
    setSaved(false);
  };

  const handleOverrideClass = (cls) => {
    const derived = classification.derivedClass;
    setClassOverride(cls === derived ? null : cls);
    // If a plan already exists but doesn't match the new class, clear path selection
    if (plan) {
      setPlan(null);
      setSelectedPathKey(null);
      setSelectedVariant(null);
      setSaved(false);
    }
  };

  // Guard — no analysis yet
  if (!analysis || !analysis.byPos) {
    return (
      <div style={{ ...styles.card, fontSize: 12, color: "#d1d7ea" }}>
        Strategy planner is waiting for roster data.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={styles.sectionLabel}>Strategy Planner</div>
        <div style={{ fontSize: 13, color: "#d9deef", lineHeight: 1.5 }}>
          Classify your team, pick a strategic path, and generate a
          personalized multi-year plan with real player targets pulled from
          your league.
        </div>
      </div>

      <TeamStateBadge
        classification={classification}
        onOverrideClass={handleOverrideClass}
      />

      <PathSelector
        classification={classification}
        selectedPathKey={selectedPathKey}
        selectedVariant={selectedVariant}
        onSelectPath={handleSelectPath}
        showAllPaths={showAllPaths}
        onToggleShowAll={() => setShowAllPaths((v) => !v)}
      />

      {plan ? (
        <PlanView
          plan={plan}
          saved={saved}
          staleness={staleness}
          onSave={handleSave}
          onRegenerate={handleRegenerate}
          onClear={handleClear}
        />
      ) : (
        <div
          style={{
            ...styles.card,
            fontSize: 12,
            color: "#d1d7ea",
            textAlign: "center",
            padding: "40px 20px",
          }}
        >
          Select a path above to generate your plan.
        </div>
      )}
    </div>
  );
}
