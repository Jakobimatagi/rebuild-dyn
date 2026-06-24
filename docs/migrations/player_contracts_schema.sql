-- Active-player contracts, produced by the offline Python pipeline
-- (python/projections/contracts_table.py → store.py) from the nflverse `contracts`
-- release (OverTheCap / OTC). One row per active player's current deal, used to add
-- contract signals (years remaining, guaranteed money, AAV) to the app and models.
--
-- Same security model as team_scheme_seasons / player_projections: browser READS
-- (anon SELECT), the pipeline WRITES with the service-role key (bypasses RLS). No
-- write policies.
--
-- Dollar figures are in MILLIONS, as the OTC Parquet reports them (e.g. 64.0 = $64M);
-- formatting is the frontend's job.
--
-- Paste into the Supabase SQL editor.

create table if not exists player_contracts (
  otc_id            text        not null,            -- OTC per-player id (natural key)
  player_name       text,
  position          text,
  team              text,                            -- app/Sleeper abbreviation
  total_value       numeric,                         -- $M, full contract value
  years             int,                             -- contract length (total years)
  avg_annual_value  numeric,                         -- $M, AAV (OTC `apy`)
  year_signed       int,
  years_remaining   int,                             -- computed vs current league year
  guaranteed        numeric,                         -- $M, guaranteed money
  apy_cap_pct       numeric,                          -- AAV as % of the cap when signed
  inflated_apy      numeric,                         -- $M, era-adjusted AAV
  gsis_id           text,                             -- nflverse gsis id (joins other tables)
  sleeper_id        text,                             -- when linkable, else null
  updated_at        timestamptz not null default now(),
  primary key (otc_id)
);

create index if not exists player_contracts_sleeper_idx on player_contracts (sleeper_id);
create index if not exists player_contracts_pos_idx     on player_contracts (position);

-- ── RLS: anon read-only ──────────────────────────────────────────────────────
alter table player_contracts enable row level security;

drop policy if exists player_contracts_read on player_contracts;
create policy player_contracts_read on player_contracts for select using (true);
-- No insert/update/delete policies: writes go through the service-role key.
