-- Store the adjuster's display name alongside the record so the adjustments
-- table can show "By: Douglas Billy" without requiring an auth.users join.
alter table public.stock_adjustments
  add column if not exists adjuster_name text;
