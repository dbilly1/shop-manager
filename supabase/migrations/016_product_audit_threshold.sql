-- ─── 016: per-product audit threshold ───────────────────────────────────────
-- Adds an optional audit_threshold_pct column to products.
-- When set, this overrides the global 5 % default for that product's
-- variance check during stock audits.

alter table public.products
  add column if not exists audit_threshold_pct numeric(5,2);

comment on column public.products.audit_threshold_pct is
  'Optional per-product variance threshold (%) used in stock audits. NULL means use the global default (5%).';
