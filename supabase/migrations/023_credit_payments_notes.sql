-- ─── 023: add notes to credit_payments ────────────────────────────────────────
-- The notes field was in the TypeScript interface but was never persisted.
-- Adding it now so payment records can include optional context.

alter table public.credit_payments
  add column if not exists notes text;
