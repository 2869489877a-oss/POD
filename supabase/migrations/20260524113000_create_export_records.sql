create table if not exists public.export_records (
  id uuid primary key default gen_random_uuid(),
  export_type text not null check (
    export_type in ('excel', 'images_zip')
  ),
  product_ids jsonb not null default '[]'::jsonb,
  product_count integer not null default 0 check (product_count >= 0),
  filename text,
  download_url text,
  status text not null default 'completed' check (
    status in ('completed', 'failed')
  ),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists export_records_created_at_idx
on public.export_records(created_at desc);

create index if not exists export_records_status_idx
on public.export_records(status);

alter table public.export_records enable row level security;

create policy "Allow authenticated users to access export records"
on public.export_records
for all
to authenticated
using (true)
with check (true);
