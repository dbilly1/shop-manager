-- Migration: add units_per_box to products
-- Run this in the Supabase SQL editor.
--
-- units_per_box: how many primary units (kg or pieces) fit in one box.
-- NULL means the product has no box conversion configured.
-- Examples:
--   Chicken Wings (kg, units_per_box=25)  → 1 box = 25 kg
--   Bottled Water (units, units_per_box=24) → 1 box = 24 bottles
--   Bulk Rice (kg, units_per_box=NULL)    → sold by kg only, no box concept

alter table public.products
  add column if not exists units_per_box numeric(12,4);

-- Existing products with unit_type = 'boxes' are migrated:
-- treat them as 'units' products with units_per_box = 1
-- (1 box = 1 primary unit — preserves existing stock numbers)
update public.products
  set unit_type = 'units', units_per_box = 1
  where unit_type = 'boxes';
