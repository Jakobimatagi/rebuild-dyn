-- Saved rookie draft plans (one row per user + league + season).
--
-- Captures who you planned to draft at which slot, plus a `prospect_snapshot`
-- of how each prospect was graded at plan-time. Once the rookie hits the NFL,
-- a future weekly job can append to `grading_log` to track how the plan ages.
--
-- Auth pattern matches oc_entries: client-side gating via verify_login + a
-- localStorage session, so RLS allows anon read + write.
--
-- Paste into the Supabase SQL editor.

create table if not exists rookie_draft_plans (
  id                uuid primary key default gen_random_uuid(),
  -- text (not uuid) so it matches whatever verify_login returns; the
  -- existing expert_rankings table set the precedent.
  user_id           text        not null,
  league_id         text        not null,
  league_name       text,
  team_name         text,
  roster_id         int,
  season            int         not null,                   -- draft year (e.g. 2026)

  -- { [pickKey]: prospectId } where pickKey is "<season>-<round>-<originalOwner>"
  picks             jsonb       not null default '{}'::jsonb,

  -- { [prospectId]: { name, position, grade, dynastyScore, capturedAt } }
  -- Frozen at plan-time so retrospective grading isn't disrupted when the
  -- prospect's source row changes (new seasons added, grade recalculated).
  prospect_snapshot jsonb       not null default '{}'::jsonb,

  -- Reserved for the future weekly-grading job. Append-only, e.g.:
  --   [{ week, season, prospectId, sleeperId, ppg, gp, mark }, ...]
  grading_log       jsonb       not null default '[]'::jsonb,

  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, league_id, season)
);

create or replace function set_rookie_draft_plans_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rookie_draft_plans_set_updated_at on rookie_draft_plans;
create trigger rookie_draft_plans_set_updated_at
  before update on rookie_draft_plans
  for each row execute function set_rookie_draft_plans_updated_at();

create index if not exists rookie_draft_plans_user_league_idx
  on rookie_draft_plans (user_id, league_id, season desc);

-- RLS: open read + write to anon (gated client-side via verify_login).
alter table rookie_draft_plans enable row level security;

drop policy if exists rookie_draft_plans_read   on rookie_draft_plans;
drop policy if exists rookie_draft_plans_insert on rookie_draft_plans;
drop policy if exists rookie_draft_plans_update on rookie_draft_plans;
drop policy if exists rookie_draft_plans_delete on rookie_draft_plans;

create policy rookie_draft_plans_read
  on rookie_draft_plans for select
  using (true);

create policy rookie_draft_plans_insert
  on rookie_draft_plans for insert
  with check (true);

create policy rookie_draft_plans_update
  on rookie_draft_plans for update
  using (true) with check (true);

create policy rookie_draft_plans_delete
  on rookie_draft_plans for delete
  using (true);
