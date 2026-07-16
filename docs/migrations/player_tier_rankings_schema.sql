-- Saved Tier Maker boards (one row per user + position scope).
--
-- The Tier Maker tab lets a user drag player face cards into S–E tiers,
-- either across all positions ("ALL") or per position (QB/RB/WR/TE). Each
-- scope is an independent board; `tiers` stores the board as
-- { "S": [sleeperPlayerId, ...], "A": [...], ..., "E": [...] } with array
-- order = display order within the tier row.
--
-- Auth pattern matches rookie_draft_plans: client-side gating via the
-- signed-in account, so RLS allows anon read + write.
--
-- Paste into the Supabase SQL editor.

create table if not exists player_tier_rankings (
  id             uuid primary key default gen_random_uuid(),
  -- text (not uuid) to match the precedent set by expert_rankings /
  -- rookie_draft_plans.
  user_id        text        not null,
  position_scope text        not null,                     -- ALL | QB | RB | WR | TE
  title          text,                                     -- user-editable board title
  tiers          jsonb       not null default '{}'::jsonb, -- { S: [id,...], ..., E: [...] }
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id, position_scope)
);

create or replace function set_player_tier_rankings_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists player_tier_rankings_set_updated_at on player_tier_rankings;
create trigger player_tier_rankings_set_updated_at
  before update on player_tier_rankings
  for each row execute function set_player_tier_rankings_updated_at();

create index if not exists player_tier_rankings_user_idx
  on player_tier_rankings (user_id);

-- RLS: open read + write to anon (gated client-side, matching the other
-- user-doc tables).
alter table player_tier_rankings enable row level security;

drop policy if exists player_tier_rankings_read   on player_tier_rankings;
drop policy if exists player_tier_rankings_insert on player_tier_rankings;
drop policy if exists player_tier_rankings_update on player_tier_rankings;
drop policy if exists player_tier_rankings_delete on player_tier_rankings;

create policy player_tier_rankings_read
  on player_tier_rankings for select
  using (true);

create policy player_tier_rankings_insert
  on player_tier_rankings for insert
  with check (true);

create policy player_tier_rankings_update
  on player_tier_rankings for update
  using (true) with check (true);

create policy player_tier_rankings_delete
  on player_tier_rankings for delete
  using (true);
