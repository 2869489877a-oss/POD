alter table public.image_collection_templates
add column if not exists last_run_at timestamptz;

alter table public.image_collection_templates
add column if not exists next_run_at timestamptz;

create index if not exists image_collection_templates_schedule_idx
on public.image_collection_templates(schedule_enabled, status, next_run_at);
