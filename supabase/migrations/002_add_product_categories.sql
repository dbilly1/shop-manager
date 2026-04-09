-- Product categories per shop (owner-managed)
create table if not exists public.product_categories (
  id uuid primary key default uuid_generate_v4(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique(shop_id, name)
);

-- RLS
alter table public.product_categories enable row level security;

create policy "shop members can view categories"
  on public.product_categories for select
  using (
    shop_id in (
      select shop_id from public.shop_members where user_id = auth.uid()
    )
  );

create policy "admins can manage categories"
  on public.product_categories for all
  using (
    shop_id in (
      select shop_id from public.shop_members
      where user_id = auth.uid() and role in ('admin', 'supervisor')
    )
  );
