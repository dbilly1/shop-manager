-- ============================================================
-- ShopManager Database Schema
-- Run this against your Supabase project SQL editor
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- PLATFORM TABLES
-- ============================================================

create table public.plans (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  price_monthly numeric(10,2) not null default 0,
  price_annual numeric(10,2) not null default 0,
  max_branches integer not null default 1,
  max_users integer not null default 5,
  max_products integer not null default 100,
  max_customers integer not null default 50,
  data_retention_months integer not null default 3,
  feature_flags jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.shops (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  type text not null default 'general',
  owner_id uuid not null references auth.users(id),
  plan_id uuid references public.plans(id),
  status text not null default 'active',
  currency text not null default 'USD',
  country text not null default 'US',
  timezone text not null default 'UTC',
  logo_url text,
  primary_colour text not null default '#000000',
  secondary_colour text not null default '#ffffff',
  pricing_mode text not null default 'uniform',
  recon_tolerance numeric(10,2) not null default 0,
  credit_overdue_days integer not null default 30,
  created_at timestamptz not null default now()
);

create table public.shop_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  plan_id uuid not null references public.plans(id),
  stripe_subscription_id text,
  status text not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create table public.super_admins (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null unique references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.announcements (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- SHOP STRUCTURE TABLES
-- ============================================================

create table public.branches (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  address text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.shop_members (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid references public.branches(id),
  user_id uuid not null references auth.users(id),
  role text not null,
  invited_by uuid references auth.users(id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique(shop_id, user_id)
);

create table public.shop_invites (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid references public.branches(id),
  email text not null,
  role text not null,
  token text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

-- ============================================================
-- OPERATIONAL TABLES
-- ============================================================

create table public.products (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  sku text,
  category text,
  unit_type text not null default 'units', -- 'kg' or 'units' (primary unit)
  units_per_box numeric(12,4),             -- how many primary units fit in one box (null = no box tracking)
  base_price numeric(12,4) not null default 0,
  cost_price numeric(12,4) not null default 0,
  reorder_threshold numeric(12,4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.branch_products (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  is_active boolean not null default true,
  override_price numeric(12,4),
  current_stock_kg numeric(14,4) not null default 0,
  current_stock_units numeric(14,4) not null default 0,
  current_stock_boxes numeric(14,4) not null default 0,
  updated_at timestamptz not null default now(),
  unique(branch_id, product_id)
);

create table public.customers (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  address text,
  credit_limit numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.sales (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  sale_date date not null default current_date,
  total_amount numeric(14,2) not null default 0,
  payment_method text not null,
  customer_id uuid references public.customers(id),
  recorded_by uuid not null references auth.users(id),
  notes text,
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id uuid primary key default uuid_generate_v4(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity_kg numeric(14,4) not null default 0,
  quantity_units numeric(14,4) not null default 0,
  quantity_boxes numeric(14,4) not null default 0,
  unit_price numeric(12,4) not null,
  discount_amount numeric(12,2) not null default 0,
  line_total numeric(14,2) not null,
  cost_price_at_sale numeric(12,4) not null default 0
);

create table public.expenses (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  expense_date date not null default current_date,
  amount numeric(12,2) not null,
  category text not null,
  description text,
  payment_method text not null default 'cash',
  batch_id uuid,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.stock_adjustments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id),
  adjustment_type text not null,
  quantity numeric(14,4) not null,
  reason text not null,
  notes text,
  adjusted_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.stock_transfers (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  from_branch_id uuid not null references public.branches(id),
  to_branch_id uuid not null references public.branches(id),
  product_id uuid not null references public.products(id),
  quantity numeric(14,4) not null,
  reason text,
  notes text,
  requested_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.credit_sales (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  amount_owed numeric(14,2) not null,
  amount_paid numeric(14,2) not null default 0,
  balance numeric(14,2) not null,
  created_at timestamptz not null default now()
);

create table public.credit_payments (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  amount numeric(12,2) not null,
  payment_method text not null,
  payment_date date not null default current_date,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.reconciliations (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  reconciliation_date date not null default current_date,
  recorded_by uuid not null references auth.users(id),
  expected_cash numeric(14,2) not null default 0,
  actual_cash numeric(14,2) not null default 0,
  cash_variance numeric(14,2) not null default 0,
  expected_mobile numeric(14,2) not null default 0,
  actual_mobile numeric(14,2) not null default 0,
  mobile_variance numeric(14,2) not null default 0,
  status text not null default 'balanced',
  notes text,
  created_at timestamptz not null default now()
);

create table public.alerts (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid references public.branches(id),
  type text not null,
  message text not null,
  entity_id uuid,
  entity_type text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  branch_id uuid references public.branches(id),
  user_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_shop_members_user_id on public.shop_members(user_id);
create index idx_shop_members_shop_id on public.shop_members(shop_id);
create index idx_branches_shop_id on public.branches(shop_id);
create index idx_products_shop_id on public.products(shop_id);
create index idx_branch_products_branch_id on public.branch_products(branch_id);
create index idx_branch_products_shop_id on public.branch_products(shop_id);
create index idx_sales_shop_id on public.sales(shop_id);
create index idx_sales_branch_id on public.sales(branch_id);
create index idx_sales_sale_date on public.sales(sale_date);
create index idx_sale_items_sale_id on public.sale_items(sale_id);
create index idx_expenses_shop_id on public.expenses(shop_id);
create index idx_expenses_branch_id on public.expenses(branch_id);
create index idx_expenses_expense_date on public.expenses(expense_date);
create index idx_customers_shop_id on public.customers(shop_id);
create index idx_customers_branch_id on public.customers(branch_id);
create index idx_credit_sales_customer_id on public.credit_sales(customer_id);
create index idx_credit_sales_branch_id on public.credit_sales(branch_id);
create index idx_alerts_shop_id on public.alerts(shop_id);
create index idx_alerts_status on public.alerts(status);
create index idx_audit_log_shop_id on public.audit_log(shop_id);
create index idx_audit_log_created_at on public.audit_log(created_at);
create index idx_stock_adjustments_branch_id on public.stock_adjustments(branch_id);
create index idx_stock_adjustments_status on public.stock_adjustments(status);

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

create or replace function public.get_my_shop_id()
returns uuid language sql security definer stable as $$
  select shop_id from public.shop_members
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.get_my_branch_id()
returns uuid language sql security definer stable as $$
  select branch_id from public.shop_members
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.shop_members
  where user_id = auth.uid() and status = 'active'
  limit 1;
$$;

create or replace function public.is_super_admin()
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.super_admins where user_id = auth.uid());
$$;

create or replace function public.is_shop_owner_or_gm()
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.shop_members
    where user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'general_manager')
  );
$$;

create or replace function public.can_access_all_branches()
returns boolean language sql security definer stable as $$
  select exists(
    select 1 from public.shop_members
    where user_id = auth.uid()
      and status = 'active'
      and role in ('owner', 'general_manager', 'general_supervisor')
  );
$$;

-- Approve stock adjustment and update stock atomically
create or replace function public.approve_stock_adjustment(p_adjustment_id uuid, p_approver_id uuid)
returns void language plpgsql security definer as $$
declare
  v_adj record;
begin
  select * into v_adj from public.stock_adjustments where id = p_adjustment_id;

  if v_adj.status != 'pending' then
    raise exception 'Adjustment is not pending';
  end if;

  if v_adj.adjusted_by = p_approver_id then
    raise exception 'Cannot self-approve adjustment';
  end if;

  update public.stock_adjustments
  set status = 'approved', approved_by = p_approver_id
  where id = p_adjustment_id;

  if v_adj.adjustment_type = 'increase' then
    update public.branch_products
    set
      current_stock_kg = case when (select unit_type from public.products where id = v_adj.product_id) = 'kg' then current_stock_kg + v_adj.quantity else current_stock_kg end,
      current_stock_units = case when (select unit_type from public.products where id = v_adj.product_id) = 'units' then current_stock_units + v_adj.quantity else current_stock_units end,
      current_stock_boxes = case when (select unit_type from public.products where id = v_adj.product_id) = 'boxes' then current_stock_boxes + v_adj.quantity else current_stock_boxes end,
      updated_at = now()
    where branch_id = v_adj.branch_id and product_id = v_adj.product_id;
  else
    update public.branch_products
    set
      current_stock_kg = case when (select unit_type from public.products where id = v_adj.product_id) = 'kg' then greatest(0, current_stock_kg - v_adj.quantity) else current_stock_kg end,
      current_stock_units = case when (select unit_type from public.products where id = v_adj.product_id) = 'units' then greatest(0, current_stock_units - v_adj.quantity) else current_stock_units end,
      current_stock_boxes = case when (select unit_type from public.products where id = v_adj.product_id) = 'boxes' then greatest(0, current_stock_boxes - v_adj.quantity) else current_stock_boxes end,
      updated_at = now()
    where branch_id = v_adj.branch_id and product_id = v_adj.product_id;
  end if;
end;
$$;

-- Approve stock transfer atomically
create or replace function public.approve_stock_transfer(p_transfer_id uuid, p_approver_id uuid)
returns void language plpgsql security definer as $$
declare
  v_transfer record;
  v_unit_type text;
begin
  select * into v_transfer from public.stock_transfers where id = p_transfer_id;

  if v_transfer.status != 'pending' then
    raise exception 'Transfer is not pending';
  end if;

  select unit_type into v_unit_type from public.products where id = v_transfer.product_id;

  update public.stock_transfers
  set status = 'approved', approved_by = p_approver_id
  where id = p_transfer_id;

  -- Decrement source
  update public.branch_products
  set
    current_stock_kg = case when v_unit_type = 'kg' then greatest(0, current_stock_kg - v_transfer.quantity) else current_stock_kg end,
    current_stock_units = case when v_unit_type = 'units' then greatest(0, current_stock_units - v_transfer.quantity) else current_stock_units end,
    current_stock_boxes = case when v_unit_type = 'boxes' then greatest(0, current_stock_boxes - v_transfer.quantity) else current_stock_boxes end,
    updated_at = now()
  where branch_id = v_transfer.from_branch_id and product_id = v_transfer.product_id;

  -- Increment destination
  update public.branch_products
  set
    current_stock_kg = case when v_unit_type = 'kg' then current_stock_kg + v_transfer.quantity else current_stock_kg end,
    current_stock_units = case when v_unit_type = 'units' then current_stock_units + v_transfer.quantity else current_stock_units end,
    current_stock_boxes = case when v_unit_type = 'boxes' then current_stock_boxes + v_transfer.quantity else current_stock_boxes end,
    updated_at = now()
  where branch_id = v_transfer.to_branch_id and product_id = v_transfer.product_id;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.plans enable row level security;
alter table public.shops enable row level security;
alter table public.shop_subscriptions enable row level security;
alter table public.super_admins enable row level security;
alter table public.announcements enable row level security;
alter table public.branches enable row level security;
alter table public.shop_members enable row level security;
alter table public.shop_invites enable row level security;
alter table public.products enable row level security;
alter table public.branch_products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.expenses enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.stock_transfers enable row level security;
alter table public.credit_sales enable row level security;
alter table public.credit_payments enable row level security;
alter table public.reconciliations enable row level security;
alter table public.alerts enable row level security;
alter table public.audit_log enable row level security;

-- Plans: public read, super admin write
create policy "plans_public_read" on public.plans for select using (true);
create policy "plans_super_admin_all" on public.plans for all using (public.is_super_admin());

-- Shops: super admin all, owner/members read their own
create policy "shops_super_admin_all" on public.shops for all using (public.is_super_admin());
create policy "shops_member_read" on public.shops for select
  using (id = public.get_my_shop_id());
create policy "shops_owner_update" on public.shops for update
  using (owner_id = auth.uid());

-- Super admins: only super admins can view/manage
create policy "super_admins_read" on public.super_admins for select using (public.is_super_admin());
create policy "super_admins_insert" on public.super_admins for insert with check (public.is_super_admin());

-- Announcements: all authenticated read, super admin write
create policy "announcements_read" on public.announcements for select using (auth.uid() is not null);
create policy "announcements_super_admin_write" on public.announcements for all using (public.is_super_admin());

-- Branches: shop members read, owner/gm write
create policy "branches_read" on public.branches for select
  using (shop_id = public.get_my_shop_id() or public.is_super_admin());
create policy "branches_write" on public.branches for insert
  with check (shop_id = public.get_my_shop_id() and public.is_shop_owner_or_gm());
create policy "branches_update" on public.branches for update
  using (shop_id = public.get_my_shop_id() and public.is_shop_owner_or_gm());

-- Shop members: shop members read their shop, owner/gm manage
create policy "shop_members_read" on public.shop_members for select
  using (shop_id = public.get_my_shop_id() or public.is_super_admin());
create policy "shop_members_write" on public.shop_members for insert
  with check (shop_id = public.get_my_shop_id() and public.is_shop_owner_or_gm());
create policy "shop_members_update" on public.shop_members for update
  using (shop_id = public.get_my_shop_id() and public.is_shop_owner_or_gm());

-- Shop invites
create policy "shop_invites_read" on public.shop_invites for select
  using (shop_id = public.get_my_shop_id() or public.is_super_admin());
create policy "shop_invites_write" on public.shop_invites for insert
  with check (shop_id = public.get_my_shop_id() and public.is_shop_owner_or_gm());
create policy "shop_invites_update" on public.shop_invites for update
  using (shop_id = public.get_my_shop_id());

-- Products: shop-level access
create policy "products_read" on public.products for select
  using (shop_id = public.get_my_shop_id() or public.is_super_admin());
create policy "products_write" on public.products for insert
  with check (shop_id = public.get_my_shop_id() and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager'));
create policy "products_update" on public.products for update
  using (shop_id = public.get_my_shop_id() and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager'));

-- Branch products
create policy "branch_products_read" on public.branch_products for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "branch_products_write" on public.branch_products for all
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager')
  );

-- Customers
create policy "customers_read" on public.customers for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "customers_write" on public.customers for insert
  with check (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "customers_update" on public.customers for update
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );

-- Sales
create policy "sales_read" on public.sales for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "sales_insert" on public.sales for insert
  with check (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "sales_update" on public.sales for update
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager','branch_supervisor')
  );
create policy "sales_delete" on public.sales for delete
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','branch_manager')
  );

-- Sale items (same pattern as sales)
create policy "sale_items_read" on public.sale_items for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "sale_items_write" on public.sale_items for all
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );

-- Expenses
create policy "expenses_read" on public.expenses for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "expenses_write" on public.expenses for insert
  with check (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager')
  );
create policy "expenses_update" on public.expenses for update
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager')
  );

-- Stock adjustments
create policy "adjustments_read" on public.stock_adjustments for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "adjustments_write" on public.stock_adjustments for insert
  with check (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager','branch_supervisor')
  );
create policy "adjustments_update" on public.stock_adjustments for update
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager','branch_supervisor')
  );

-- Stock transfers
create policy "transfers_read" on public.stock_transfers for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      from_branch_id = public.get_my_branch_id() or
      to_branch_id = public.get_my_branch_id()
    )
  );
create policy "transfers_write" on public.stock_transfers for insert
  with check (
    shop_id = public.get_my_shop_id() and
    get_my_role() in ('owner','general_manager','general_supervisor','branch_manager')
  );
create policy "transfers_update" on public.stock_transfers for update
  using (
    shop_id = public.get_my_shop_id() and
    get_my_role() in ('owner','general_manager','general_supervisor','branch_manager')
  );

-- Credit sales
create policy "credit_sales_read" on public.credit_sales for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "credit_sales_write" on public.credit_sales for all
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );

-- Credit payments
create policy "credit_payments_read" on public.credit_payments for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "credit_payments_write" on public.credit_payments for insert
  with check (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager','branch_supervisor')
  );

-- Reconciliations
create policy "reconciliations_read" on public.reconciliations for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "reconciliations_write" on public.reconciliations for insert
  with check (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager','branch_supervisor')
  );

-- Alerts
create policy "alerts_read" on public.alerts for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  );
create policy "alerts_update" on public.alerts for update
  using (shop_id = public.get_my_shop_id());

-- Audit log
create policy "audit_log_read" on public.audit_log for select
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager')
  );
create policy "audit_log_insert" on public.audit_log for insert
  with check (shop_id = public.get_my_shop_id());

-- Shop subscriptions
create policy "subscriptions_read" on public.shop_subscriptions for select
  using (shop_id = public.get_my_shop_id() or public.is_super_admin());
create policy "subscriptions_super_admin_write" on public.shop_subscriptions for all
  using (public.is_super_admin());

-- ============================================================
-- DEFAULT DATA
-- ============================================================

insert into public.plans (name, price_monthly, price_annual, max_branches, max_users, max_products, max_customers, data_retention_months, feature_flags, is_active) values
  ('Free', 0, 0, 1, 5, 100, 50, 3, '{"advanced_reports": false, "stock_transfers": false, "audit_log": false, "api_access": false, "custom_branding": false}', true),
  ('Starter', 19, 190, 2, 15, 500, 200, 12, '{"advanced_reports": true, "stock_transfers": false, "audit_log": false, "api_access": false, "custom_branding": false}', true),
  ('Growth', 49, 490, 5, 50, 2000, 1000, 24, '{"advanced_reports": true, "stock_transfers": true, "audit_log": true, "api_access": false, "custom_branding": true}', true),
  ('Pro', 99, 990, 20, 200, 10000, 5000, 60, '{"advanced_reports": true, "stock_transfers": true, "audit_log": true, "api_access": true, "custom_branding": true}', true);
