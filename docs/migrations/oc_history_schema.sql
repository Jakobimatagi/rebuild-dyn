-- Offensive-scheme fingerprints, head-coach history, and historical player
-- utilization, produced by the offline Python pipeline (python/projections/scheme.py
-- → store.py) from nflverse play-by-play (1999+). Read by the OC tool to deepen
-- its scheme analysis, build coach-tree lineage, and extend player-utilization
-- history far past Sleeper's reach.
--
-- Same security model as player_projections: browser READS (anon SELECT), the
-- pipeline WRITES with the service-role key (bypasses RLS). No write policies.
--
-- Paste into the Supabase SQL editor.

-- ── team_scheme_seasons ──────────────────────────────────────────────────────
-- One offensive-identity fingerprint per (season, team). Metrics are nullable:
-- air-yards-based fields (adot, deep_rate) don't exist before 2006, and rate
-- metrics can be null for a team-season with no qualifying plays.
create table if not exists team_scheme_seasons (
  season          int         not null,
  team            text        not null,             -- app/Sleeper abbreviation
  plays           int         not null,
  pass_rate       numeric,
  proe            numeric,                            -- pass rate over expected (%)
  adot            numeric,                            -- true intended air yards / att
  deep_rate       numeric,                            -- share of att with air_yards>=20
  shotgun_rate    numeric,
  no_huddle_rate  numeric,
  epa_play        numeric,
  pass_epa        numeric,
  rush_epa        numeric,
  success_rate    numeric,
  cpoe            numeric,
  scramble_rate   numeric,
  head_coach      text,
  updated_at      timestamptz not null default now(),
  primary key (season, team)
);

create index if not exists team_scheme_seasons_coach_idx
  on team_scheme_seasons (head_coach);

-- ── coach_seasons ────────────────────────────────────────────────────────────
-- Every (season, team, head_coach) stint with its play count; is_primary flags
-- the team-season's dominant coach (mid-season changes surface as two rows).
-- This is the spine of the coach-tree lineage.
create table if not exists coach_seasons (
  season       int         not null,
  team         text        not null,
  head_coach   text        not null,
  plays        int         not null,
  is_primary   boolean     not null default false,
  updated_at   timestamptz not null default now(),
  primary key (season, team, head_coach)
);

create index if not exists coach_seasons_coach_idx on coach_seasons (head_coach);

-- ── player_utilization_seasons ───────────────────────────────────────────────
-- Per (season, team, player) true usage shares from pbp. player_id is the gsis
-- id; sleeper_id is filled when linkable (null for deep history pre-Sleeper).
create table if not exists player_utilization_seasons (
  season           int         not null,
  team             text        not null,
  player_id        text        not null,             -- nflverse gsis id
  sleeper_id       text,                              -- when linkable, else null
  name             text,
  targets          int,
  receptions       int,
  rec_air_yards    numeric,
  carries          int,
  rz_targets       int,
  rz_carries       int,
  target_share     numeric,
  carry_share      numeric,
  air_yard_share   numeric,
  rz_target_share  numeric,
  rz_carry_share   numeric,
  updated_at       timestamptz not null default now(),
  primary key (season, team, player_id)
);

create index if not exists player_utilization_season_idx
  on player_utilization_seasons (season);
create index if not exists player_utilization_sleeper_idx
  on player_utilization_seasons (sleeper_id);

-- ── RLS: anon read-only on all three ─────────────────────────────────────────
alter table team_scheme_seasons          enable row level security;
alter table coach_seasons                enable row level security;
alter table player_utilization_seasons   enable row level security;

drop policy if exists team_scheme_seasons_read on team_scheme_seasons;
create policy team_scheme_seasons_read on team_scheme_seasons for select using (true);

drop policy if exists coach_seasons_read on coach_seasons;
create policy coach_seasons_read on coach_seasons for select using (true);

drop policy if exists player_utilization_seasons_read on player_utilization_seasons;
create policy player_utilization_seasons_read on player_utilization_seasons for select using (true);
-- No insert/update/delete policies: writes go through the service-role key.
