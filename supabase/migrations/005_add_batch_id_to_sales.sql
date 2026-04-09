-- Add batch_id to sales so bulk-entry batches can be grouped and distinguished
-- from direct (single) sales in the drill-down view and reconciliation.
alter table public.sales
  add column if not exists batch_id uuid;

create index if not exists idx_sales_batch_id on public.sales(batch_id);
