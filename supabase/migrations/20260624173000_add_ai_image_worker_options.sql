alter table public.ai_image_jobs
add column if not exists request_options jsonb not null default '{}'::jsonb;

alter table public.ai_image_jobs
add column if not exists attempts jsonb not null default '[]'::jsonb;

alter table public.ai_image_jobs
add column if not exists updated_at timestamptz not null default now();

drop trigger if exists ai_image_jobs_set_updated_at on public.ai_image_jobs;

create trigger ai_image_jobs_set_updated_at
before update on public.ai_image_jobs
for each row execute function public.set_updated_at();
