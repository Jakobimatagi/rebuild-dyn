// ── OC scheme tags ────────────────────────────────────────────────────────────
// Coaching-tree / scheme labels for offensive coordinators. Used to group OCs
// at a glance ("ah, another Shanahan-tree hire") and to spot scheme-fits when
// players move teams. Tags are best-effort and editable — when in doubt err
// on the side of leaving an OC untagged rather than guessing.

export const SCHEMES = {
  shanahan: {
    label:  "Shanahan tree",
    short:  "Shanahan",
    accent: "text-emerald-300 border-emerald-400/30 bg-emerald-500/10",
    desc:   "Outside zone, play-action, condensed sets, motion-heavy.",
  },
  reid: {
    label:  "Reid tree",
    short:  "Reid",
    accent: "text-rose-300 border-rose-400/30 bg-rose-500/10",
    desc:   "West Coast variant, RPO-friendly, motion + spread concepts.",
  },
  patriots: {
    label:  "Patriots / EP",
    short:  "EP",
    accent: "text-sky-300 border-sky-400/30 bg-sky-500/10",
    desc:   "Erhardt-Perkins concepts, multiple personnel, matchup-driven.",
  },
  payton: {
    label:  "Payton tree",
    short:  "Payton",
    accent: "text-violet-300 border-violet-400/30 bg-violet-500/10",
    desc:   "Saints-style spread, vertical play-action, versatile back usage.",
  },
  airraid: {
    label:  "Air Raid",
    short:  "Air Raid",
    accent: "text-amber-300 border-amber-400/30 bg-amber-500/10",
    desc:   "Spread, pass-first, four-verts and mesh concepts.",
  },
  westcoast: {
    label:  "West Coast",
    short:  "WC",
    accent: "text-indigo-300 border-indigo-400/30 bg-indigo-500/10",
    desc:   "Short, timing-based passing, rhythm-based.",
  },
  prostyle: {
    label:  "Pro Style",
    short:  "Pro",
    accent: "text-zinc-300 border-zinc-400/30 bg-zinc-500/10",
    desc:   "Balanced, traditional under-center looks.",
  },
  ground: {
    label:  "Ground Control",
    short:  "Ground",
    accent: "text-lime-300 border-lime-400/30 bg-lime-500/10",
    desc:   "Run-first, gap and power schemes.",
  },
};

// OC name → array of scheme keys (in priority order). Names match the seed in
// ocData.js exactly (case + spelling). Add or correct entries freely; an
// untagged OC simply renders no chips.
export const OC_SCHEMES = {
  // Shanahan tree (49ers / Lions / Dolphins lineage)
  "Kyle Shanahan":        ["shanahan"],
  "Mike McDaniel":        ["shanahan"],
  "Mike LaFleur":         ["shanahan"],
  "Bobby Slowik":         ["shanahan"],
  "Klint Kubiak":         ["shanahan"],
  "Klay Kubiak":          ["shanahan"],
  "Klayton Adams":        ["shanahan"],
  "Ben Johnson":          ["shanahan"],
  "Liam Coen":            ["shanahan"],
  "Zac Robinson":         ["shanahan"],
  "Nick Caley":           ["shanahan"],
  "Wes Phillips":         ["shanahan"],
  "Shane Waldron":        ["shanahan"],
  "Thomas Brown":         ["shanahan"],
  "Adam Stenavich":       ["shanahan"],
  "Declan Doyle":         ["shanahan"],
  "Tanner Engstrand":     ["shanahan"],
  "John Morton":          ["shanahan"],

  // Reid tree (Chiefs / Eagles lineage)
  "Andy Reid":            ["reid"],
  "Matt Nagy":            ["reid"],
  "Eric Bieniemy":        ["reid"],
  "Mike Kafka":           ["reid"],
  "Frank Reich":          ["reid", "westcoast"],
  "Press Taylor":         ["reid"],
  "Doug Nussmeier":       ["reid"],
  "Shane Steichen":       ["reid"],
  "Kevin Patullo":        ["reid"],
  "Brian Johnson":        ["reid"],

  // Patriots / Erhardt-Perkins
  "Bill O'Brien":         ["patriots"],
  "Josh McDaniels":       ["patriots"],
  "Brian Daboll":         ["patriots", "reid"],
  "Mick Lombardi":        ["patriots"],
  "Matt Patricia":        ["patriots"],
  "Alex Van Pelt":        ["patriots"],
  "Ben McAdoo":           ["patriots"],

  // Payton / Saints tree
  "Pete Carmichael":      ["payton"],
  "Joe Lombardi":         ["payton"],
  "Joe Brady":            ["payton"],
  "Frank Smith":          ["payton"],
  "Klint Kubiak":         ["shanahan", "payton"],

  // Air Raid
  "Kliff Kingsbury":      ["airraid"],
  "Kellen Moore":         ["airraid", "prostyle"],
  "Ryan Grubb":           ["airraid"],

  // Pro-style / multiple
  "Brian Schottenheimer": ["prostyle", "westcoast"],
  "Scott Turner":         ["prostyle"],
  "Pep Hamilton":         ["westcoast"],
  "Brian Callahan":       ["westcoast"],
  "Dan Pitcher":          ["westcoast"],
  "Tommy Rees":           ["prostyle"],
  "Arthur Smith":         ["prostyle"],

  // Run-heavy
  "Greg Roman":           ["ground"],
  "Todd Monken":          ["ground", "prostyle"],

  // Spread / pro-style hybrids — leaving most rookies unlabeled until verified
  "Chip Kelly":           ["airraid"],
  "Dave Canales":         ["payton"],
  "Drew Petzing":         ["shanahan"],
  "Nathaniel Hackett":    ["shanahan"],
  "Luke Getsy":           ["shanahan"],
};

/**
 * Look up scheme entries (with display metadata) for an OC name. Returns an
 * empty array if no schemes are mapped — the UI should render nothing in that
 * case rather than a placeholder.
 */
export function getOcSchemes(name) {
  const keys = OC_SCHEMES[name] || [];
  return keys.map((k) => ({ key: k, ...(SCHEMES[k] || {}) })).filter((s) => s.label);
}
