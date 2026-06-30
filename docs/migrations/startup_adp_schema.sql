-- Community-derived startup draft ADP, refreshed daily by api/snapshot-values.js
-- (Vercel cron). Dynasty startups have no public ADP endpoint, so we rank a community
-- value feed (KeepTradeCut) per format and treat value-rank as ADP — in startups the
-- two track closely. Drives the Draft Blueprint example builds and league outlook.
--
-- Security model matches value_snapshots / player_projections: the browser only READS
-- (anon SELECT), the cron WRITES with the Supabase service-role key (bypasses RLS).
-- No write policies are granted, so anon cannot insert/update/delete.
--
-- Paste into the Supabase SQL editor.

create table if not exists startup_adp (
  format      text not null,                 -- 'sf_12' | '1qb_12' (Superflex vs 1QB, team count)
  sleeper_id  text not null,
  name        text,
  position    text,
  value       int,                           -- source community value (dollar scale)
  adp_rank    int  not null,                 -- 1 = drafted earliest; derived from value order
  updated_at  timestamptz not null default now(),
  primary key (format, sleeper_id)
);

create index if not exists startup_adp_format_rank_idx
  on startup_adp (format, adp_rank);

alter table startup_adp enable row level security;

drop policy if exists startup_adp_read on startup_adp;
create policy startup_adp_read
  on startup_adp for select
  using (true);
-- No insert/update/delete policies: the cron writes with the service-role key.
