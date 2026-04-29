-- Migration 011: atomic shop + branch + membership + subscription creation
-- Replaces four sequential inserts in the onboarding API with a single
-- transaction so no orphaned shops/branches can be left on partial failure.

create or replace function public.create_shop_with_branch(
  p_user_id        uuid,
  p_shop_name      text,
  p_shop_type      text,
  p_currency       text,
  p_country        text,
  p_timezone       text,
  p_branch_name    text,
  p_branch_address text default null,
  p_plan_id        uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id   uuid;
  v_branch_id uuid;
begin
  -- Prevent duplicate shops for this user
  if exists (
    select 1 from shop_members
    where user_id = p_user_id and status = 'active'
  ) then
    raise exception 'User already belongs to an active shop';
  end if;

  -- Create the shop
  insert into shops (name, type, owner_id, plan_id, currency, country, timezone)
  values (
    trim(p_shop_name),
    p_shop_type,
    p_user_id,
    p_plan_id,
    upper(p_currency),
    p_country,
    p_timezone
  )
  returning id into v_shop_id;

  -- Create the first branch
  insert into branches (shop_id, name, address)
  values (
    v_shop_id,
    trim(p_branch_name),
    nullif(trim(coalesce(p_branch_address, '')), '')
  )
  returning id into v_branch_id;

  -- Create owner membership (not branch-scoped — owner sees all branches)
  insert into shop_members (shop_id, branch_id, user_id, role, status)
  values (v_shop_id, null, p_user_id, 'owner', 'active');

  -- Create free subscription
  if p_plan_id is not null then
    insert into shop_subscriptions (shop_id, plan_id, status)
    values (v_shop_id, p_plan_id, 'active');
  end if;

  return jsonb_build_object(
    'shop_id',   v_shop_id,
    'branch_id', v_branch_id
  );
end;
$$;

-- Revoke public execute; only the service-role key (used by the API) can call it
revoke execute on function public.create_shop_with_branch from public;
grant  execute on function public.create_shop_with_branch to service_role;
