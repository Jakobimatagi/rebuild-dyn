-- Historical drafted WR/RB profiles with NFL outcomes.
-- Source: per-year "Anatomy of Top WR & RB" CSVs (2011-2026).
--
-- Design: keep the few fields we'll filter/sort/index on as real columns,
-- everything else lives in metrics jsonb so per-position fields differ freely.
--
-- Paste into the Supabase SQL editor.

create table if not exists historical_players (
  id                     bigserial primary key,
  name                   text        not null,
  position               text        not null check (position in ('WR','RB','QB','TE')),
  draft_year             int         not null,
  draft_capital          text,                       -- "1.12", "UDFA", etc. (raw)
  draft_round            int,                        -- parsed from draft_capital
  draft_pick             int,                        -- parsed from draft_capital
  forty_time             numeric,
  ras                    numeric,
  ten_plus_ppg_seasons   int,                        -- key outcome
  avg_top_finish         numeric,                    -- key outcome (lower = better)
  metrics                jsonb       not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (name, draft_year)
);

-- Keep updated_at fresh on every row update.
create or replace function set_historical_players_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists historical_players_set_updated_at on historical_players;
create trigger historical_players_set_updated_at
  before update on historical_players
  for each row execute function set_historical_players_updated_at();

create index if not exists historical_players_position_year_idx
  on historical_players (position, draft_year);

create index if not exists historical_players_outcome_idx
  on historical_players (position, ten_plus_ppg_seasons desc nulls last);

create index if not exists historical_players_metrics_gin_idx
  on historical_players using gin (metrics);

-- Public read access for the rookie prospector UI.
alter table historical_players enable row level security;

drop policy if exists historical_players_read on historical_players;
create policy historical_players_read
  on historical_players for select
  using (true);

-- Writes restricted to service-role (used by the import script).
-- No public insert/update/delete policy intentionally.
