create table if not exists public.ai_apply_pattern_jobs (
  id uuid primary key default gen_random_uuid(),
  garment_url text not null,
  reference_url text,
  asset_id uuid,
  style_description text not null,
  provider_id uuid,
  position jsonb,
  opacity integer not null default 100 check (opacity >= 0 and opacity <= 100),
  blend_mode text not null default 'over' check (blend_mode in ('over', 'multiply')),
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_apply_pattern_jobs_status_idx
on public.ai_apply_pattern_jobs(status);

drop trigger if exists ai_apply_pattern_jobs_set_updated_at on public.ai_apply_pattern_jobs;

create trigger ai_apply_pattern_jobs_set_updated_at
before update on public.ai_apply_pattern_jobs
for each row execute function public.set_updated_at();

alter table public.ai_apply_pattern_jobs enable row level security;

drop policy if exists "Allow authenticated users to access ai_apply_pattern_jobs"
on public.ai_apply_pattern_jobs;

create policy "Allow authenticated users to access ai_apply_pattern_jobs"
on public.ai_apply_pattern_jobs for all to authenticated
using (true) with check (true);
