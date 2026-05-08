-- RLS policies for oc_entries.
-- The OC editor writes from the browser using the anon key (auth is gated
-- client-side via verify_login + a localStorage session — same pattern as
-- the rookie prospect editor). We need read + write open to anon for that
-- to work. Paste into the Supabase SQL editor.

alter table oc_entries enable row level security;

drop policy if exists oc_entries_read   on oc_entries;
drop policy if exists oc_entries_insert on oc_entries;
drop policy if exists oc_entries_update on oc_entries;
drop policy if exists oc_entries_delete on oc_entries;

create policy oc_entries_read
  on oc_entries for select
  using (true);

create policy oc_entries_insert
  on oc_entries for insert
  with check (true);

create policy oc_entries_update
  on oc_entries for update
  using (true) with check (true);

create policy oc_entries_delete
  on oc_entries for delete
  using (true);
