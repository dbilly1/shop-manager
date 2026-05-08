-- ─── 017: stock audits — add missing DELETE policies ─────────────────────────
-- Migration 015 created read/insert/update policies but omitted delete.
-- Without a delete policy, RLS silently swallows the delete (no error, no effect).

create policy "stock_audits_delete" on public.stock_audits for delete
  using (shop_id = (select shop_id from public.shop_members where user_id = auth.uid() limit 1));

-- Items are cascade-deleted by the FK, but add a delete policy too for direct deletes.
create policy "stock_audit_items_delete" on public.stock_audit_items for delete
  using (shop_id = (select shop_id from public.shop_members where user_id = auth.uid() limit 1));
