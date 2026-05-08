-- ─── 014: create restocks table (with cost_per_box, units_per_box_at_restock, recorded_by_name) ───
-- The restocks table was previously created manually in Supabase.
-- This migration codifies it properly and adds three new columns:
--   cost_per_box             : cost paid per box (when restocked in boxes)
--   units_per_box_at_restock : qty/box in effect at restock time (may differ from current product value)
--   recorded_by_name         : denormalised name so history page doesn't need a join

create table if not exists public.restocks (
  id                       uuid primary key default uuid_generate_v4(),
  shop_id                  uuid not null references public.shops(id) on delete cascade,
  branch_id                uuid not null references public.branches(id) on delete cascade,
  product_id               uuid not null references public.products(id),
  quantity_kg              numeric(14,4) not null default 0,
  quantity_units           numeric(14,4) not null default 0,
  quantity_boxes           numeric(14,4) not null default 0,
  cost_per_unit            numeric(12,4),
  cost_per_box             numeric(12,4),
  units_per_box_at_restock numeric(10,4),
  supplier                 text,
  notes                    text,
  recorded_by              uuid references auth.users(id),
  recorded_by_name         text,
  created_at               timestamptz not null default now()
);

-- If the table already existed, add only the new columns
alter table public.restocks
  add column if not exists cost_per_box             numeric(12,4),
  add column if not exists units_per_box_at_restock numeric(10,4),
  add column if not exists recorded_by_name         text;

-- Indexes
create index if not exists idx_restocks_shop_id    on public.restocks(shop_id);
create index if not exists idx_restocks_branch_id  on public.restocks(branch_id);
create index if not exists idx_restocks_product_id on public.restocks(product_id);
create index if not exists idx_restocks_created_at on public.restocks(created_at);

-- RLS
alter table public.restocks enable row level security;

create policy "restocks_read" on public.restocks for select
  using (shop_id = (select shop_id from public.shop_members where user_id = auth.uid() limit 1));

create policy "restocks_write" on public.restocks for insert
  with check (shop_id = (select shop_id from public.shop_members where user_id = auth.uid() limit 1));
