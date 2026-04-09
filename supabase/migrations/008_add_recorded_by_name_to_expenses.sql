-- Store recorder's display name on expenses (like we do on sales).
alter table public.expenses
  add column if not exists recorded_by_name text;
