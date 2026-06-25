create table if not exists public.collector_operation_jobs (
  id uuid primary key default gen_random_uuid(),
  operation text not null check (operation in ('promote', 'add_to_risk_library', 'delete')),
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed', 'partial_failed')
  ),
  total_count integer not null default 0 check (total_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.collector_operation_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.collector_operation_jobs(id) on delete cascade,
  relative_path text not null,
  filename text,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  result jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists collector_operation_jobs_status_created_at_idx
on public.collector_operation_jobs(status, created_at);

create index if not exists collector_operation_job_items_job_id_idx
on public.collector_operation_job_items(job_id);

create index if not exists collector_operation_job_items_status_created_at_idx
on public.collector_operation_job_items(status, created_at);

drop trigger if exists collector_operation_jobs_set_updated_at on public.collector_operation_jobs;
create trigger collector_operation_jobs_set_updated_at
before update on public.collector_operation_jobs
for each row execute function public.set_updated_at();

drop trigger if exists collector_operation_job_items_set_updated_at on public.collector_operation_job_items;
create trigger collector_operation_job_items_set_updated_at
before update on public.collector_operation_job_items
for each row execute function public.set_updated_at();
