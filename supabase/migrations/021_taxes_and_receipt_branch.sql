-- Rename receipt_taxes → tax_rates
-- Taxes now apply to sales, not just receipts. The receipt reads from the
-- sales.taxes_snapshot (a point-in-time copy of the rates applied at checkout).
alter table public.shops rename column receipt_taxes to tax_rates;

-- Toggle: show / hide branch name on printed receipts (default: show)
alter table public.shops
  add column if not exists receipt_show_branch boolean not null default false;

-- Snapshot of tax rates (with computed amounts) recorded at time of each sale.
-- Allows historical receipts to always show the correct tax breakdown even if
-- rates are changed later.
-- Shape: [{ "label": "VAT", "rate": 15, "amount": 12.50 }, ...]
alter table public.sales
  add column if not exists taxes_snapshot jsonb not null default '[]';
