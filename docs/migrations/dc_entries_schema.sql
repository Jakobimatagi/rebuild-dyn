-- Defensive-coordinator entries, edited from /admin/dc-rankings — the DC twin
-- of oc_entries with the identical shape and security model. The editor writes
-- from the browser using the anon key (auth is gated client-side via
-- verify_login + a localStorage session, same as the OC editor), so read +
-- write are open to anon. Paste into the Supabase SQL editor.

create table if not exists dc_entries (
  season      int         not null,
  team        text        not null,   -- app/Sleeper abbreviation ("__init__" = year marker)
  name        text        not null default '',
  partial     boolean     not null default false,
  playcaller  text,                   -- "HC" when the head coach runs the defense
  note        text,
  updated_at  timestamptz not null default now(),
  primary key (season, team)
);

alter table dc_entries enable row level security;

drop policy if exists dc_entries_read   on dc_entries;
drop policy if exists dc_entries_insert on dc_entries;
drop policy if exists dc_entries_update on dc_entries;
drop policy if exists dc_entries_delete on dc_entries;

create policy dc_entries_read
  on dc_entries for select
  using (true);

create policy dc_entries_insert
  on dc_entries for insert
  with check (true);

create policy dc_entries_update
  on dc_entries for update
  using (true) with check (true);

create policy dc_entries_delete
  on dc_entries for delete
  using (true);
