-- Add receipt preferences to shops
alter table public.shops
  add column if not exists receipt_format  text    not null default 'a4'
    check (receipt_format in ('a4', 'thermal_58', 'thermal_80')),
  add column if not exists receipt_header  text    not null default 'Thank you for your purchase!',
  add column if not exists receipt_footer  text    not null default '',
  add column if not exists receipt_show_logo boolean not null default true;
