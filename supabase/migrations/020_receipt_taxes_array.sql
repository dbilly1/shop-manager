-- Replace single-tax columns with a JSONB array supporting multiple taxes.
-- Each element: { "label": "VAT", "rate": 15 }

alter table public.shops
  add column if not exists receipt_taxes jsonb not null default '[]';

-- Migrate any existing single-tax config into the new array
update public.shops
  set receipt_taxes = jsonb_build_array(
    jsonb_build_object('label', receipt_tax_label, 'rate', receipt_tax_rate)
  )
  where receipt_tax_enabled = true and receipt_tax_rate > 0;

-- Drop the now-redundant single-tax columns
alter table public.shops
  drop column if exists receipt_tax_enabled,
  drop column if exists receipt_tax_label,
  drop column if exists receipt_tax_rate;
