// ── NFL Defensive Coordinator database ────────────────────────────────────────
// Static dataset of NFL defensive coordinators by season + team — the DC twin
// of ocData.js, curated the same way. Team abbreviations match Sleeper's
// player.team field (the canonical list lives in ocData.js NFL_TEAMS).
//
// Import a season (or several) from the same CSV source you use for OCs:
//
//     npm run import:ocs -- --dc /path/to/dc.csv
//     # or
//     cat dc.csv | npm run import:ocs -- --dc --stdin
//
// CSV header: Team,2026,2025,2024,2023,2022 (any number of year columns;
// new years auto-create a new block). Empty cells are skipped, so partial
// imports are fine. See scripts/import-ocs.mjs.
//
// Per-entry shape (same as OC_DATA):
//   { name: "Jesse Minter" }                                 — minimum
//   { name: "Vic Fangio", playcaller: "HC" }                 — HC runs the defense
//   { name: "Vacant" }                                       — no formal DC
//   { name: "...", partial: true, note: "Fired mid-season" }
//
// The IDP Matchup Lab uses this for scheme-continuity weighting: seasons a
// team played under a DIFFERENT coordinator than its current one get their
// weight reduced in the defense-vs-position multipliers. Until a team has
// entries here, its weighting stays neutral — the feature degrades gracefully.
export const DC_DATA = {};
