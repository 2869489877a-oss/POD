alter table public.export_records
add column if not exists updated_at timestamptz not null default now();

drop trigger if exists export_records_set_updated_at on public.export_records;

create trigger export_records_set_updated_at
before update on public.export_records
for each row execute function public.set_updated_at();

create index if not exists export_records_status_updated_at_idx
on public.export_records(status, updated_at);
