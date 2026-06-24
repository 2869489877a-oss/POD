create table if not exists public.asset_delete_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed', 'partial_failed')
  ),
  total_count integer not null default 0 check (total_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  force boolean not null default false,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint asset_delete_jobs_counts_check check (
    success_count + failed_count <= total_count
  )
);

create table if not exists public.asset_delete_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.asset_delete_jobs(id) on delete cascade,
  asset_id uuid not null,
  filename text,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asset_delete_jobs_status_idx
on public.asset_delete_jobs(status);

create index if not exists asset_delete_jobs_status_updated_at_idx
on public.asset_delete_jobs(status, updated_at);

create index if not exists asset_delete_job_items_job_id_idx
on public.asset_delete_job_items(job_id);

create index if not exists asset_delete_job_items_asset_id_idx
on public.asset_delete_job_items(asset_id);

drop trigger if exists asset_delete_jobs_set_updated_at on public.asset_delete_jobs;

create trigger asset_delete_jobs_set_updated_at
before update on public.asset_delete_jobs
for each row execute function public.set_updated_at();

drop trigger if exists asset_delete_job_items_set_updated_at on public.asset_delete_job_items;

create trigger asset_delete_job_items_set_updated_at
before update on public.asset_delete_job_items
for each row execute function public.set_updated_at();

alter table public.asset_delete_jobs enable row level security;
alter table public.asset_delete_job_items enable row level security;

drop policy if exists "Allow authenticated users to access asset_delete_jobs"
on public.asset_delete_jobs;

create policy "Allow authenticated users to access asset_delete_jobs"
on public.asset_delete_jobs for all to authenticated
using (true) with check (true);

drop policy if exists "Allow authenticated users to access asset_delete_job_items"
on public.asset_delete_job_items;

create policy "Allow authenticated users to access asset_delete_job_items"
on public.asset_delete_job_items for all to authenticated
using (true) with check (true);
