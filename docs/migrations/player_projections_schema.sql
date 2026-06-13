-- Weekly player points projections, produced by the offline Python pipeline
-- (python/projections) and read by the React app's Projections tab.
--
-- Security model differs from the other tables here: the browser only READS
-- these rows (anon SELECT), while the pipeline WRITES them with the Supabase
-- service-role key, which bypasses RLS entirely. So we open select to anon and
-- grant NO write policies — anon cannot insert/update/delete.
--
-- Paste into the Supabase SQL editor.

-- ── player_projections ───────────────────────────────────────────────────────
create table if not exists player_projections (
  season         int         not null,
  week           int         not null,
  player_id      text        not null,              -- Sleeper player_id
  model_version  text        not null default 'v1',
  position       text        not null check (position in ('QB','RB','WR','TE')),
  name           text,
  team           text,
  opponent       text,
  proj_ppr       numeric     not null,
  proj_half      numeric     not null,
  proj_std       numeric     not null,
  floor          numeric     not null,              -- ~p15
  ceiling        numeric     not null,              -- ~p85
  components     jsonb       not null default '{}'::jsonb,  -- shares, efficiencies,
                                                            -- def_mult, projected box line
  updated_at     timestamptz not null default now(),
  primary key (season, week, player_id, model_version)
);

create index if not exists player_projections_week_idx
  on player_projections (season, week);
create index if not exists player_projections_player_idx
  on player_projections (player_id);

alter table player_projections enable row level security;

drop policy if exists player_projections_read on player_projections;
create policy player_projections_read
  on player_projections for select
  using (true);
-- No insert/update/delete policies: writes go through the service-role key.

-- ── projection_runs ──────────────────────────────────────────────────────────
-- Provenance + headline backtest accuracy for each publish, so the UI can show
-- "model v1, validated MAE x.x" and we can track drift over time.
create table if not exists projection_runs (
  id                bigserial    primary key,
  season            int          not null,
  week              int          not null,
  model_version     text         not null default 'v1',
  backtest_metrics  jsonb        not null default '{}'::jsonb,
  created_at        timestamptz  not null default now()
);

alter table projection_runs enable row level security;

drop policy if exists projection_runs_read on projection_runs;
create policy projection_runs_read
  on projection_runs for select
  using (true);
