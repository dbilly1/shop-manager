-- ─── 024: add UPDATE and DELETE RLS policies for credit_payments ─────────────
-- The original schema only defined SELECT and INSERT policies.
-- Without UPDATE/DELETE policies, Supabase silently rejects edits and deletes
-- (RLS blocks the operation but returns no error to the client).

create policy "credit_payments_update" on public.credit_payments for update
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager','branch_supervisor')
  );

create policy "credit_payments_delete" on public.credit_payments for delete
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager','branch_supervisor')
  );
