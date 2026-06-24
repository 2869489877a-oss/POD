alter table public.image_jobs
drop constraint if exists image_jobs_job_type_check;

alter table public.image_jobs
add constraint image_jobs_job_type_check check (
  job_type in ('resize', 'cutout', 'print_extraction', 'enhance', 'mockup', 'infringement_check')
);
