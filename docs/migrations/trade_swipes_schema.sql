-- Trade Tinder: anonymous swipe storage
-- Run in Supabase SQL editor

create table if not exists trade_swipes (
  id            uuid primary key default gen_random_uuid(),
  league_id     text not null,
  session_id    text not null,          -- random UUID from localStorage, not tied to Sleeper identity
  trade_hash    text not null,          -- deterministic hash of both asset sets
  team_a_id     text not null,
  team_b_id     text not null,
  assets_a      jsonb not null,         -- assets sent by Team A
  assets_b      jsonb not null,         -- assets sent by Team B
  engine_verdict text not null,         -- 'fair' | 'team_a' | 'team_b'
  engine_net    numeric not null,       -- engine net value from Team A's perspective
  user_verdict  text not null,          -- 'fair' | 'team_a' | 'team_b'
  created_at    timestamptz default now(),

  unique(league_id, session_id, trade_hash)
);

-- Indexes for perception queries
create index if not exists trade_swipes_league_idx on trade_swipes(league_id);

-- RLS: allow anonymous reads and inserts (anon key)
alter table trade_swipes enable row level security;

create policy "anon insert" on trade_swipes
  for insert with check (true);

create policy "anon read" on trade_swipes
  for select using (true);
