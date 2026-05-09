-- ─── 022: add received_at_shop to credit_payments ─────────────────────────────
-- Tracks whether a credit repayment was physically received at the shop till.
-- When true, the payment is included in the daily cash reconciliation.
-- Default TRUE preserves existing behaviour for historical records.

alter table public.credit_payments
  add column if not exists received_at_shop boolean not null default true;
