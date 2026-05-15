// Rebuild — composite rebuilder-class path. Wraps two genuinely
// distinct configs (fullTeardown and retoolRebuild) under one card with
// a variant chip. The configs differ in too many specifics (triage
// archetype lists, position-aware age gates via getPeakAge, roadmap
// text, risk patterns) to cleanly parameterize, so we keep both source
// files as the truth and pick between them at build time.
//
// Selection flow:
//   1. PathSelector renders one "Rebuild" card with two variant chips.
//   2. User clicks a chip → generatePlan(analysis, "rebuild", { variant }).
//   3. generatePlan calls rebuild.build(variant) to materialize the
//      source config for that variant.
//
// Saved plans key on { pathKey: "rebuild", variant: "hard"|"measured" }.
// Legacy keys ("fullTeardown" / "retoolRebuild") are migrated by
// persistPlan.loadPlan on read.

import { fullTeardown } from "./fullTeardown";
import { retoolRebuild } from "./retoolRebuild";

const measuredVariant = {
  key: "measured",
  label: "Soft Rebuild",
  source: retoolRebuild,
};

const hardVariant = {
  key: "hard",
  label: "Scorched Earth",
  source: fullTeardown,
};

const VARIANTS_BY_KEY = {
  measured: measuredVariant,
  hard: hardVariant,
};

export const rebuild = {
  key: "rebuild",
  name: "Rebuild",
  class: "rebuilder",
  // Card-level summary shown before the user picks a variant. The
  // materialized path overrides these with variant-specific values.
  tagline: "Reset for a sustained next window — pick your aggressiveness",
  bestFor: "Teams without a current contending roster",
  risk: "Medium / High",
  timeToContend: "1-3 years",
  mechanic: "Pick a variant chip to lock in trade and triage rules",
  variants: [
    {
      key: measuredVariant.key,
      label: measuredVariant.label,
      risk: measuredVariant.source.risk,
      timeToContend: measuredVariant.source.timeToContend,
      tagline: measuredVariant.source.tagline,
      mechanic: measuredVariant.source.mechanic,
    },
    {
      key: hardVariant.key,
      label: hardVariant.label,
      risk: hardVariant.source.risk,
      timeToContend: hardVariant.source.timeToContend,
      tagline: hardVariant.source.tagline,
      mechanic: hardVariant.source.mechanic,
    },
  ],
  defaultVariant: "measured",
  build(variantKey) {
    const v = VARIANTS_BY_KEY[variantKey] || VARIANTS_BY_KEY[this.defaultVariant];
    return {
      ...v.source,
      key: "rebuild",
      name: "Rebuild",
      subtitle: v.label,
      tagline: v.source.tagline,
      risk: v.source.risk,
      timeToContend: v.source.timeToContend,
      mechanic: v.source.mechanic,
      bestFor: v.source.bestFor,
      variantKey: v.key,
      variantLabel: v.label,
    };
  },
};
