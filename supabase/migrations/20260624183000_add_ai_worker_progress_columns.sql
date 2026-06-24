alter table public.ai_image_jobs
add column if not exists stage text not null default 'pending';

alter table public.ai_image_jobs
add column if not exists progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100);

alter table public.ai_image_jobs
add column if not exists started_at timestamptz;

alter table public.ai_image_jobs
add column if not exists finished_at timestamptz;

alter table public.ai_split_grid_jobs
add column if not exists stage text not null default 'pending';

alter table public.ai_split_grid_jobs
add column if not exists progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100);

alter table public.ai_split_grid_jobs
add column if not exists started_at timestamptz;

alter table public.ai_split_grid_jobs
add column if not exists finished_at timestamptz;

alter table public.ai_apply_pattern_jobs
add column if not exists stage text not null default 'pending';

alter table public.ai_apply_pattern_jobs
add column if not exists progress_percent integer not null default 0 check (progress_percent >= 0 and progress_percent <= 100);

alter table public.ai_apply_pattern_jobs
add column if not exists started_at timestamptz;

alter table public.ai_apply_pattern_jobs
add column if not exists finished_at timestamptz;
