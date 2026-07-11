-- Defensive-scheme fingerprints (the DC Blueprint), produced by the offline
-- Python pipeline (python/projections/defense_scheme.py → store.py) from
-- nflverse play-by-play (1999+; sack/qb_hit and pass_oe coverage begins later).
-- The mirror of team_scheme_seasons keyed to the DEFENSE on the field: what a
-- defense allows, how offenses attack it (run/pass funnel), and how it
-- pressures the QB. Read by the admin IDP Matchup Lab to explain and stabilize
-- its defense-vs-position multipliers.
--
-- Same security model as the OC tables: browser READS (anon SELECT), the
-- pipeline WRITES with the service-role key (bypasses RLS). No write policies.
--
-- Publish with: python -m projections publish-dc --start 2016
-- Paste into the Supabase SQL editor.

-- ── defense_scheme_seasons ───────────────────────────────────────────────────
-- One defensive-identity fingerprint per (season, team). Metrics are nullable:
-- air-yards fields don't exist before 2006, pass_oe/cpoe start later, and any
-- rate can be null for a team-season with no qualifying plays.
create table if not exists defense_scheme_seasons (
  season                int         not null,
  team                  text        not null,   -- app/Sleeper abbreviation
  plays                 int         not null,
  epa_play_allowed      numeric,                -- lower = stingier defense
  pass_epa_allowed      numeric,
  rush_epa_allowed      numeric,
  success_rate_allowed  numeric,
  cpoe_allowed          numeric,
  pass_rate_faced       numeric,                -- share of plays that were passes
  proe_faced            numeric,                -- pass-rate-over-expected faced (%): + = pass funnel
  adot_faced            numeric,                -- avg intended air yards thrown at this defense
  deep_rate_allowed     numeric,                -- share of att with air_yards >= 20
  sack_rate             numeric,                -- sacks per dropback
  int_rate              numeric,                -- interceptions per dropback
  qb_hit_rate           numeric,                -- QB hits per dropback
  head_coach            text,                   -- defteam's head coach (modal for the season)
  updated_at            timestamptz not null default now(),
  primary key (season, team)
);

create index if not exists defense_scheme_seasons_coach_idx
  on defense_scheme_seasons (head_coach);

-- ── RLS: anon read-only ──────────────────────────────────────────────────────
alter table defense_scheme_seasons enable row level security;

drop policy if exists defense_scheme_seasons_read on defense_scheme_seasons;
create policy defense_scheme_seasons_read on defense_scheme_seasons for select using (true);
-- No insert/update/delete policies: writes go through the service-role key.
