alter table public.image_jobs
drop constraint if exists image_jobs_job_type_check;

alter table public.image_jobs
add constraint image_jobs_job_type_check check (
  job_type in ('resize', 'cutout', 'print_extraction', 'enhance', 'mockup')
);

create index if not exists image_job_items_status_created_at_idx
on public.image_job_items(status, created_at);
