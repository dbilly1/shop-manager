-- ─── 015: stock audits ───────────────────────────────────────────────────────
-- stock_audits      : one row per audit session (Full or Partial)
-- stock_audit_items : one row per product per audit (system snapshot + physical count)

create table public.stock_audits (
  id                uuid primary key default uuid_generate_v4(),
  shop_id           uuid not null references public.shops(id) on delete cascade,
  branch_id         uuid not null references public.branches(id) on delete cascade,
  audit_type        text not null default 'full',       -- 'full' | 'partial'
  status            text not null default 'in_progress', -- 'in_progress' | 'completed'
  notes             text,
  conducted_by      uuid not null references auth.users(id),
  conducted_by_name text,
  completed_at      timestamptz,
  created_at        timestamptz not null default now()
);

create table public.stock_audit_items (
  id             uuid primary key default uuid_generate_v4(),
  audit_id       uuid not null references public.stock_audits(id) on delete cascade,
  shop_id        uuid not null references public.shops(id) on delete cascade,
  branch_id      uuid not null references public.branches(id) on delete cascade,
  product_id     uuid not null references public.products(id),
  system_stock   numeric(14,4) not null,   -- stock at the moment the audit was created
  physical_count numeric(14,4) not null default 0,
  is_adjusted    boolean not null default false,
  adjustment_id  uuid references public.stock_adjustments(id),
  created_at     timestamptz not null default now()
);

-- Indexes
create index idx_stock_audits_shop_id   on public.stock_audits(shop_id);
create index idx_stock_audits_branch_id on public.stock_audits(branch_id);
create index idx_stock_audits_status    on public.stock_audits(status);
create index idx_stock_audit_items_audit_id   on public.stock_audit_items(audit_id);
create index idx_stock_audit_items_product_id on public.stock_audit_items(product_id);

-- RLS
alter table public.stock_audits      enable row level security;
alter table public.stock_audit_items enable row level security;

create policy "stock_audits_read" on public.stock_audits for select
  using (shop_id = (select shop_id from public.shop_members where user_id = auth.uid() limit 1));

create policy "stock_audits_write" on public.stock_audits for insert
  with check (shop_id = (select shop_id from public.shop_members where user_id = auth.uid() limit 1));

create policy "stock_audits_update" on public.stock_audits for update
  using (shop_id = (select shop_id from public.shop_members where user_id = auth.uid() limit 1));

create policy "stock_audit_items_read" on public.stock_audit_items for select
  using (shop_id = (select shop_id from public.shop_members where user_id = auth.uid() limit 1));

create policy "stock_audit_items_write" on public.stock_audit_items for insert
  with check (shop_id = (select shop_id from public.shop_members where user_id = auth.uid() limit 1));

create policy "stock_audit_items_update" on public.stock_audit_items for update
  using (shop_id = (select shop_id from public.shop_members where user_id = auth.uid() limit 1));
