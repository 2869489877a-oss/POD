create index if not exists image_job_items_job_id_status_idx
on public.image_job_items(job_id, status);

create index if not exists image_job_items_status_updated_at_idx
on public.image_job_items(status, updated_at);

create index if not exists image_jobs_job_type_status_updated_at_idx
on public.image_jobs(job_type, status, updated_at desc);

create index if not exists collector_operation_job_items_job_id_status_idx
on public.collector_operation_job_items(job_id, status);

create index if not exists collector_operation_jobs_status_updated_at_idx
on public.collector_operation_jobs(status, updated_at desc);

create index if not exists asset_delete_jobs_status_updated_at_idx
on public.asset_delete_jobs(status, updated_at desc);

create index if not exists export_records_type_status_updated_at_idx
on public.export_records(export_type, status, updated_at desc);

create index if not exists ai_image_jobs_status_updated_at_idx
on public.ai_image_jobs(status, updated_at desc);

create index if not exists ai_split_grid_jobs_status_updated_at_idx
on public.ai_split_grid_jobs(status, updated_at desc);

create index if not exists ai_apply_pattern_jobs_status_updated_at_idx
on public.ai_apply_pattern_jobs(status, updated_at desc);

create index if not exists assets_created_at_idx
on public.assets(created_at desc);

create index if not exists infringement_checks_asset_id_created_at_idx
on public.infringement_checks(asset_id, created_at desc);

create index if not exists infringement_reference_items_active_updated_at_idx
on public.infringement_reference_items(is_active, updated_at desc);
