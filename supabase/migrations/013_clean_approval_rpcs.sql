-- ─── 013: clean dead current_stock_boxes branches from approval RPCs ────────
-- unit_type is always 'kg' or 'units'; 'boxes' was removed in migration 001.
-- The CASE branches guarding current_stock_boxes never execute and are
-- confusing. Remove them to make the intent clear.
-- Stock correctness is unchanged — kg and units branches were always correct.

-- ── approve_stock_adjustment ─────────────────────────────────────────────────
create or replace function public.approve_stock_adjustment(
  p_adjustment_id uuid,
  p_approver_id uuid
) returns void language plpgsql security definer as $$
declare
  v_adj record;
begin
  select sa.*, p.unit_type
    into v_adj
    from public.stock_adjustments sa
    join public.products p on p.id = sa.product_id
   where sa.id = p_adjustment_id;

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
       set current_stock_kg    = case when v_adj.unit_type = 'kg'    then current_stock_kg    + v_adj.quantity else current_stock_kg    end,
           current_stock_units = case when v_adj.unit_type = 'units' then current_stock_units + v_adj.quantity else current_stock_units end,
           updated_at          = now()
     where branch_id = v_adj.branch_id and product_id = v_adj.product_id;
  else
    update public.branch_products
       set current_stock_kg    = case when v_adj.unit_type = 'kg'    then greatest(0, current_stock_kg    - v_adj.quantity) else current_stock_kg    end,
           current_stock_units = case when v_adj.unit_type = 'units' then greatest(0, current_stock_units - v_adj.quantity) else current_stock_units end,
           updated_at          = now()
     where branch_id = v_adj.branch_id and product_id = v_adj.product_id;
  end if;
end;
$$;

-- ── approve_stock_transfer ───────────────────────────────────────────────────
create or replace function public.approve_stock_transfer(
  p_transfer_id uuid,
  p_approver_id uuid
) returns void language plpgsql security definer as $$
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

  -- Decrement source branch
  update public.branch_products
     set current_stock_kg    = case when v_unit_type = 'kg'    then greatest(0, current_stock_kg    - v_transfer.quantity) else current_stock_kg    end,
         current_stock_units = case when v_unit_type = 'units' then greatest(0, current_stock_units - v_transfer.quantity) else current_stock_units end,
         updated_at          = now()
   where branch_id = v_transfer.from_branch_id and product_id = v_transfer.product_id;

  -- Increment destination branch
  update public.branch_products
     set current_stock_kg    = case when v_unit_type = 'kg'    then current_stock_kg    + v_transfer.quantity else current_stock_kg    end,
         current_stock_units = case when v_unit_type = 'units' then current_stock_units + v_transfer.quantity else current_stock_units end,
         updated_at          = now()
   where branch_id = v_transfer.to_branch_id and product_id = v_transfer.product_id;
end;
$$;

grant execute on function public.approve_stock_adjustment(uuid, uuid) to authenticated;
grant execute on function public.approve_stock_transfer(uuid, uuid) to authenticated;
