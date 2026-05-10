-- ─── 025: RBAC — configurable role permissions + per-member overrides ─────────
--
-- Two new tables:
--   shop_role_permissions  — owner customises what each base role can do
--   member_permission_overrides — per-member grants/revocations on top of role
--
-- Resolution order (app layer):
--   member override  →  role custom permissions  →  hardcoded base defaults
--
-- RLS stays as the security floor (hardcoded role checks in DB policies).
-- These tables control the app-layer ceiling — what the UI permits.

-- ── shop_role_permissions ────────────────────────────────────────────────────

create table public.shop_role_permissions (
  id          uuid primary key default uuid_generate_v4(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  role        text not null,
  permissions jsonb not null default '{}',
  -- e.g. { "canManageInventory": true, "canViewReports": false }
  updated_at  timestamptz not null default now(),
  unique(shop_id, role)
);

alter table public.shop_role_permissions enable row level security;

-- All shop members can read (needed to resolve permissions on login)
create policy "role_permissions_read" on public.shop_role_permissions for select
  using (shop_id = public.get_my_shop_id());

-- Only the owner can write
create policy "role_permissions_insert" on public.shop_role_permissions for insert
  with check (shop_id = public.get_my_shop_id() and public.get_my_role() = 'owner');

create policy "role_permissions_update" on public.shop_role_permissions for update
  using (shop_id = public.get_my_shop_id() and public.get_my_role() = 'owner');

create policy "role_permissions_delete" on public.shop_role_permissions for delete
  using (shop_id = public.get_my_shop_id() and public.get_my_role() = 'owner');

-- ── member_permission_overrides ──────────────────────────────────────────────

create table public.member_permission_overrides (
  id          uuid primary key default uuid_generate_v4(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  member_id   uuid not null references public.shop_members(id) on delete cascade,
  permission  text not null,
  granted     boolean not null,
  created_at  timestamptz not null default now(),
  unique(member_id, permission)
);

alter table public.member_permission_overrides enable row level security;

-- All shop members can read (resolver needs to read their own overrides)
create policy "member_overrides_read" on public.member_permission_overrides for select
  using (shop_id = public.get_my_shop_id());

-- Owner and GM can manage overrides
create policy "member_overrides_insert" on public.member_permission_overrides for insert
  with check (
    shop_id = public.get_my_shop_id() and
    public.get_my_role() in ('owner', 'general_manager')
  );

create policy "member_overrides_update" on public.member_permission_overrides for update
  using (
    shop_id = public.get_my_shop_id() and
    public.get_my_role() in ('owner', 'general_manager')
  );

create policy "member_overrides_delete" on public.member_permission_overrides for delete
  using (
    shop_id = public.get_my_shop_id() and
    public.get_my_role() in ('owner', 'general_manager')
  );
