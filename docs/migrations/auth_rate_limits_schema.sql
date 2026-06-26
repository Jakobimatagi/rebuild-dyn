-- Rate limiting + lockout for the Sleeper-verified login endpoint
-- (api/sleeper-auth.js). Durable and shared across serverless invocations, so a
-- short one-time code can't be brute-forced and codes can't be mass-requested
-- (email bombing). Service-role only — the endpoint talks to it with the service
-- key; anon/auth clients have no access.
--
-- Apply in the Supabase SQL editor (or via the MCP apply_migration).

create table if not exists public.auth_rate_limits (
  bucket        text        primary key,   -- e.g. "vc:email:foo@bar.com", "rc:ip:1.2.3.4"
  count         integer     not null default 0,
  window_start  timestamptz not null default now(),
  locked_until  timestamptz
);

alter table public.auth_rate_limits enable row level security;
-- No policies on purpose → only the service role (bypasses RLS) can touch it.

-- Atomically count one attempt against a bucket. Resets the window when it has
-- elapsed; locks the bucket for p_lock_seconds once count exceeds p_limit.
-- Returns { allowed, retry_after, remaining, locked_until }.
create or replace function public.consume_rate_limit(
  p_bucket          text,
  p_limit           integer,
  p_window_seconds  integer,
  p_lock_seconds    integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec     public.auth_rate_limits;
  now_ts  timestamptz := now();
begin
  insert into public.auth_rate_limits (bucket, count, window_start)
  values (p_bucket, 0, now_ts)
  on conflict (bucket) do nothing;

  select * into rec from public.auth_rate_limits
   where bucket = p_bucket
   for update;  -- serialize concurrent attempts on the same bucket

  -- Already locked? Reject without incrementing further.
  if rec.locked_until is not null and rec.locked_until > now_ts then
    return jsonb_build_object(
      'allowed', false,
      'retry_after', ceil(extract(epoch from (rec.locked_until - now_ts))),
      'locked_until', rec.locked_until
    );
  end if;

  -- Window elapsed → start a fresh one.
  if now_ts - rec.window_start > make_interval(secs => p_window_seconds) then
    rec.count := 0;
    rec.window_start := now_ts;
    rec.locked_until := null;
  end if;

  rec.count := rec.count + 1;

  if rec.count > p_limit then
    rec.locked_until := now_ts + make_interval(secs => p_lock_seconds);
    update public.auth_rate_limits
       set count = rec.count, window_start = rec.window_start, locked_until = rec.locked_until
     where bucket = p_bucket;
    return jsonb_build_object(
      'allowed', false,
      'retry_after', p_lock_seconds,
      'locked_until', rec.locked_until
    );
  end if;

  update public.auth_rate_limits
     set count = rec.count, window_start = rec.window_start, locked_until = rec.locked_until
   where bucket = p_bucket;

  return jsonb_build_object('allowed', true, 'remaining', p_limit - rec.count);
end;
$$;

-- Clear a bucket after a successful verification so a legit user who fumbled a
-- couple codes isn't left throttled.
create or replace function public.reset_rate_limit(p_bucket text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.auth_rate_limits where bucket = p_bucket;
$$;

-- Supabase default privileges auto-grant EXECUTE on new public-schema functions
-- to anon & authenticated, so revoking from `public` alone is NOT enough — revoke
-- from those roles explicitly. Otherwise anyone could reset their own lockout
-- (defeating brute-force protection) or DoS a victim by calling these via REST.
revoke all on function public.consume_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.reset_rate_limit(text) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, integer) to service_role;
grant execute on function public.reset_rate_limit(text) to service_role;

-- Optional housekeeping (wire to a cron if the table ever grows): prune rows
-- whose window has long passed and that aren't currently locked.
--   delete from public.auth_rate_limits
--    where window_start < now() - interval '1 day'
--      and (locked_until is null or locked_until < now());
