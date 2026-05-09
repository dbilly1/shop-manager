-- Add tax display and receipt number prefix to shops
alter table public.shops
  add column if not exists receipt_tax_enabled    boolean       not null default false,
  add column if not exists receipt_tax_label      text          not null default 'Tax',
  add column if not exists receipt_tax_rate       numeric(5,2)  not null default 0,
  add column if not exists receipt_number_prefix  text          not null default '';
