-- ─── 009: atomic sale creation ────────────────────────────────────────────────
-- Replaces the multi-step client flow (insert sale → insert items → decrement
-- stock → maybe insert credit_sale) with a single transactional RPC.
--
-- Benefits:
--   • Atomic — partial failures never leave orphaned rows or wrong stock.
--   • Server-side stock check — over-sales raise an exception instead of
--     silently clamping stock at 0.
--   • No race condition — stock is decremented in SQL using current values
--     under the row lock acquired by the UPDATE.
--
-- Returns the new sale id.

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
  v_sale_id uuid;
  v_item jsonb;
  v_bp_id uuid;
  v_qty_kg numeric;
  v_qty_units numeric;
  v_qty_boxes numeric;
  v_current_kg numeric;
  v_current_units numeric;
  v_current_boxes numeric;
  v_product_name text;
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

    -- Lock the row and read current stock
    select current_stock_kg, current_stock_units, current_stock_boxes,
           p.name
      into v_current_kg, v_current_units, v_current_boxes, v_product_name
      from public.branch_products bp
      join public.products p on p.id = bp.product_id
     where bp.id = v_bp_id
       for update;

    -- Validate stock
    if v_qty_kg > 0 and v_current_kg < v_qty_kg then
      raise exception 'Insufficient stock for %. Available: % kg, requested: % kg',
        v_product_name, v_current_kg, v_qty_kg;
    end if;
    if v_qty_units > 0 and v_current_units < v_qty_units then
      raise exception 'Insufficient stock for %. Available: % units, requested: % units',
        v_product_name, v_current_units, v_qty_units;
    end if;
    if v_qty_boxes > 0 and v_current_boxes < v_qty_boxes then
      raise exception 'Insufficient stock for %. Available: % boxes, requested: % boxes',
        v_product_name, v_current_boxes, v_qty_boxes;
    end if;

    -- Insert sale_item
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

    -- Decrement stock atomically
    update public.branch_products
       set current_stock_kg    = current_stock_kg    - v_qty_kg,
           current_stock_units = current_stock_units - v_qty_units,
           current_stock_boxes = current_stock_boxes - v_qty_boxes,
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
