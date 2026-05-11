-- ─── 026: Add missing UPDATE policy for reconciliations ──────────────────────
-- The reconciliations table only had SELECT and INSERT policies.
-- Without an UPDATE policy, PostgreSQL silently updates 0 rows under RLS,
-- causing reconciliation edits to appear to succeed but save nothing.

create policy "reconciliations_update" on public.reconciliations for update
  using (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    )
  )
  with check (
    shop_id = public.get_my_shop_id() and (
      public.can_access_all_branches() or
      branch_id = public.get_my_branch_id()
    ) and get_my_role() in ('owner','general_manager','general_supervisor','branch_manager','branch_supervisor')
  );
