-- Dated dynasty value snapshots, captured daily by api/snapshot-values.js (Vercel
-- cron). These build the point-in-time history the Trade Report Card needs for its
-- "value then" lens — FantasyCalc and RosterAudit expose no dated historical
-- endpoint, so we record one row per player per format per day going forward.
--
-- Security model matches player_projections: the browser only READS (anon SELECT),
-- the cron WRITES with the Supabase service-role key (bypasses RLS). No write
-- policies are granted, so anon cannot insert/update/delete.
--
-- Paste into the Supabase SQL editor.

-- ── value_snapshots ──────────────────────────────────────────────────────────
create table if not exists value_snapshots (
  snap_date   date        not null,
  source      text        not null check (source in ('fc','ra')),  -- FantasyCalc / RosterAudit
  format      text        not null,                                 -- e.g. 'sf_12', '1qb_12'
  sleeper_id  text        not null,
  name        text,
  position    text,
  value       int         not null,                                 -- dollar scale (~100-9000)
  trend_30d   int,                                                  -- RA only; 30-day delta
  primary key (snap_date, source, format, sleeper_id)
);

create index if not exists value_snapshots_player_idx
  on value_snapshots (sleeper_id, source);
create index if not exists value_snapshots_date_idx
  on value_snapshots (snap_date);

alter table value_snapshots enable row level security;

drop policy if exists value_snapshots_read on value_snapshots;
create policy value_snapshots_read
  on value_snapshots for select
  using (true);
-- No insert/update/delete policies: writes go through the service-role key.

-- ── pick_value_snapshots ─────────────────────────────────────────────────────
-- Draft-pick values by (season, round, slot). Lets the Report Card price unused /
-- future picks at trade time once history accumulates.
create table if not exists pick_value_snapshots (
  snap_date  date  not null,
  source     text  not null check (source in ('fc','ra')),
  format     text  not null,
  season     text  not null,
  round      int   not null,
  slot       text  not null,            -- 'early' | 'mid' | 'late'
  value      int   not null,
  primary key (snap_date, source, format, season, round, slot)
);

alter table pick_value_snapshots enable row level security;

drop policy if exists pick_value_snapshots_read on pick_value_snapshots;
create policy pick_value_snapshots_read
  on pick_value_snapshots for select
  using (true);
