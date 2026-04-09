-- Store the recorder's display name at insert time so the client
-- can show it without a separate user-lookup round-trip.
alter table public.sales
  add column if not exists recorded_by_name text;
