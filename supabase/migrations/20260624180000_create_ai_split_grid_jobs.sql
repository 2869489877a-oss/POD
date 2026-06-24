create table if not exists public.ai_split_grid_jobs (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  rows integer not null default 2 check (rows >= 1 and rows <= 4),
  columns integer not null default 2 check (columns >= 1 and columns <= 4),
  save_to_assets boolean not null default true,
  source_names jsonb not null default '[]'::jsonb,
  split_mode text not null default 'grid' check (split_mode in ('grid', 'content')),
  transparent_background boolean not null default false,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_split_grid_jobs_status_idx
on public.ai_split_grid_jobs(status);

drop trigger if exists ai_split_grid_jobs_set_updated_at on public.ai_split_grid_jobs;

create trigger ai_split_grid_jobs_set_updated_at
before update on public.ai_split_grid_jobs
for each row execute function public.set_updated_at();

alter table public.ai_split_grid_jobs enable row level security;

drop policy if exists "Allow authenticated users to access ai_split_grid_jobs"
on public.ai_split_grid_jobs;

create policy "Allow authenticated users to access ai_split_grid_jobs"
on public.ai_split_grid_jobs for all to authenticated
using (true) with check (true);
