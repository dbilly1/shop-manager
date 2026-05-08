-- ─── 012: fix box stock deduction in create_sale_with_items ─────────────────
-- Previously the RPC validated and decremented current_stock_boxes when
-- quantity_boxes > 0. But current_stock_boxes is never incremented during
-- restock (boxes are converted to primary units at receive time), so the
-- validation always failed with "Insufficient stock" for box sales.
--
-- Fix: boxes are converted to primary units (kg or units) for both stock
-- validation and deduction. current_stock_boxes is left untouched.
-- The quantity_boxes value is still recorded in sale_items for display.

create or replace function public.create_sale_with_items(
  p_shop_id uuid,
  p_branch_id uuid,
  p_sale_date date,
  p_total_amount numeric,
  p_payment_method text,
  p_customer_id uuid,
  p_recorded_by uuid,
  p_recorded_by_name text,
  p_notes text,
  p_items jsonb,
  p_batch_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id      uuid;
  v_item         jsonb;
  v_bp_id        uuid;
  v_qty_kg       numeric;
  v_qty_units    numeric;
  v_qty_boxes    numeric;
  v_current_kg   numeric;
  v_current_units numeric;
  v_product_name text;
  v_unit_type    text;
  v_units_per_box numeric;
  v_box_primary  numeric;
begin
  -- Insert the sale
  insert into public.sales (
    shop_id, branch_id, sale_date, total_amount,
    payment_method, customer_id, recorded_by, recorded_by_name, notes, batch_id
  )
  values (
    p_shop_id, p_branch_id, p_sale_date, p_total_amount,
    p_payment_method, p_customer_id, p_recorded_by, p_recorded_by_name, p_notes, p_batch_id
  )
  returning id into v_sale_id;

  -- Iterate items
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_bp_id     := (v_item->>'branch_product_id')::uuid;
    v_qty_kg    := coalesce((v_item->>'quantity_kg')::numeric, 0);
    v_qty_units := coalesce((v_item->>'quantity_units')::numeric, 0);
    v_qty_boxes := coalesce((v_item->>'quantity_boxes')::numeric, 0);

    -- Lock the row and read current stock + product info
    select bp.current_stock_kg, bp.current_stock_units,
           p.name, p.unit_type, p.units_per_box
      into v_current_kg, v_current_units,
           v_product_name, v_unit_type, v_units_per_box
      from public.branch_products bp
      join public.products p on p.id = bp.product_id
     where bp.id = v_bp_id
       for update;

    -- Convert boxes → primary units for stock purposes
    v_box_primary := case
      when v_qty_boxes > 0 and v_units_per_box > 0 then v_qty_boxes * v_units_per_box
      else 0
    end;

    -- Validate primary stock (includes box contribution)
    if v_qty_kg > 0 and v_current_kg < v_qty_kg then
      raise exception 'Insufficient stock for %. Available: % kg, requested: % kg',
        v_product_name, v_current_kg, v_qty_kg;
    end if;
    if (v_qty_units + v_box_primary) > 0 and v_unit_type = 'units'
       and v_current_units < (v_qty_units + v_box_primary) then
      raise exception 'Insufficient stock for %. Available: % units, requested: % units',
        v_product_name, v_current_units, v_qty_units + v_box_primary;
    end if;
    if v_qty_kg + v_box_primary > 0 and v_unit_type = 'kg'
       and v_current_kg < (v_qty_kg + v_box_primary) then
      raise exception 'Insufficient stock for %. Available: % kg, requested: % kg',
        v_product_name, v_current_kg, v_qty_kg + v_box_primary;
    end if;

    -- Insert sale_item (quantity_boxes recorded for display only)
    insert into public.sale_items (
      sale_id, shop_id, branch_id, product_id,
      quantity_kg, quantity_units, quantity_boxes,
      unit_price, discount_amount, line_total, cost_price_at_sale
    )
    values (
      v_sale_id, p_shop_id, p_branch_id, (v_item->>'product_id')::uuid,
      v_qty_kg, v_qty_units, v_qty_boxes,
      (v_item->>'unit_price')::numeric,
      coalesce((v_item->>'discount_amount')::numeric, 0),
      (v_item->>'line_total')::numeric,
      coalesce((v_item->>'cost_price_at_sale')::numeric, 0)
    );

    -- Decrement primary stock atomically.
    -- Boxes are converted to primary units; current_stock_boxes is not touched.
    update public.branch_products
       set current_stock_kg    = case when v_unit_type = 'kg'
                                   then current_stock_kg - v_qty_kg - v_box_primary
                                   else current_stock_kg - v_qty_kg
                                 end,
           current_stock_units = case when v_unit_type = 'units'
                                   then current_stock_units - v_qty_units - v_box_primary
                                   else current_stock_units - v_qty_units
                                 end,
           updated_at          = now()
     where id = v_bp_id;
  end loop;

  -- Credit-sale tracking
  if p_payment_method = 'credit' and p_customer_id is not null then
    insert into public.credit_sales (
      shop_id, branch_id, sale_id, customer_id,
      amount_owed, amount_paid, balance
    )
    values (
      p_shop_id, p_branch_id, v_sale_id, p_customer_id,
      p_total_amount, 0, p_total_amount
    );
  end if;

  return v_sale_id;
end;
$$;

grant execute on function public.create_sale_with_items(
  uuid, uuid, date, numeric, text, uuid, uuid, text, text, jsonb, uuid
) to authenticated;
