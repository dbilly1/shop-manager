-- Extend reconciliations table to support session-based reconciliation.
-- Each date can have multiple sessions: one "direct" (single sales) and
-- one per bulk batch (identified by batch_id).

alter table public.reconciliations
  add column if not exists session_type   text          not null default 'direct',
  add column if not exists batch_id       uuid,
  add column if not exists credit_repayments_cash numeric(14,2) not null default 0,
  add column if not exists till_expenses  numeric(14,2) not null default 0;

-- Drop the old single-reconciliation-per-date unique constraint
alter table public.reconciliations
  drop constraint if exists reconciliations_shop_id_branch_id_reconciliation_date_key;

-- One direct-entry reconciliation per branch per date
create unique index if not exists reconciliations_direct_unique
  on public.reconciliations(shop_id, branch_id, reconciliation_date)
  where batch_id is null;

-- One bulk-batch reconciliation per batch per date
create unique index if not exists reconciliations_bulk_unique
  on public.reconciliations(shop_id, branch_id, reconciliation_date, batch_id)
  where batch_id is not null;
