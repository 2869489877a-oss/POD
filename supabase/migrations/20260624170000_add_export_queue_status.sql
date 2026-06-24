alter table public.export_records
drop constraint if exists export_records_status_check;

alter table public.export_records
add constraint export_records_status_check check (
  status in ('pending', 'processing', 'completed', 'failed')
);
