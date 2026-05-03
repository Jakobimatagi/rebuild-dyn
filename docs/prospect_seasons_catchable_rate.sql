-- Add catchable_rate_pct to prospect_seasons.
-- Tracks the % of a QB's pass attempts that were on-target (catchable),
-- i.e. accuracy independent of drops. Stored as a numeric percentage (0-100).
--
-- Paste into the Supabase SQL editor.

alter table prospect_seasons
  add column if not exists catchable_rate_pct numeric;

comment on column prospect_seasons.catchable_rate_pct is
  'QB on-target throw rate (catchable pass %). 0-100.';
