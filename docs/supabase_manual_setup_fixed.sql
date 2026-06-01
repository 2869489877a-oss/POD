-- Source migration: supabase/migrations/20260524093000_create_pod_core_tables.sql
-- Fixed manual setup notes:
-- 1. Trigger statements are written on one complete line to avoid partial execution in SQL Editor.
-- 2. Tables and indexes use IF NOT EXISTS where PostgreSQL supports it.
-- 3. Triggers and policies are dropped before being recreated so the script can be rerun.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  original_url text not null,
  processed_url text,
  filename text not null,
  file_size bigint not null check (file_size >= 0),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  format text not null,
  status text not null default 'uploaded' check (
    status in ('uploaded', 'processing', 'processed', 'failed')
  ),
  source text not null default 'upload' check (
    source in ('upload', 'link', 'ai', 'other')
  ),
  copyright_status text not null default 'unknown' check (
    copyright_status in ('unknown', 'owned', 'commercial_ok', 'risky', 'forbidden')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.image_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (
    job_type in ('resize', 'cutout', 'enhance', 'mockup')
  ),
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed', 'partial_failed')
  ),
  total_count integer not null default 0 check (total_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  options jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint image_jobs_counts_check check (
    success_count + failed_count <= total_count
  )
);

create table if not exists public.image_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.image_jobs(id) on delete cascade,
  asset_id uuid not null references public.assets(id),
  input_url text not null,
  output_url text,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mockup_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  product_type text not null,
  scenes jsonb not null default '[]'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mockup_outputs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  template_id uuid not null references public.mockup_templates(id),
  output_images jsonb not null default '[]'::jsonb,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_drafts (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id),
  mockup_output_id uuid references public.mockup_outputs(id),
  title text,
  description text,
  tags jsonb not null default '[]'::jsonb,
  bullet_points jsonb not null default '[]'::jsonb,
  sku text,
  price numeric(12, 2),
  product_type text,
  status text not null default 'draft' check (
    status in ('draft', 'ready', 'exported', 'failed')
  ),
  images jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  product_draft_id uuid not null references public.product_drafts(id) on delete cascade,
  provider text not null check (provider in ('qwen', 'doubao')),
  prompt text not null,
  response jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists assets_status_idx on public.assets(status);
create index if not exists assets_source_idx on public.assets(source);
create index if not exists image_jobs_status_idx on public.image_jobs(status);
create index if not exists image_job_items_job_id_idx on public.image_job_items(job_id);
create index if not exists image_job_items_asset_id_idx on public.image_job_items(asset_id);
create index if not exists mockup_outputs_asset_id_idx on public.mockup_outputs(asset_id);
create index if not exists mockup_outputs_template_id_idx on public.mockup_outputs(template_id);
create index if not exists product_drafts_asset_id_idx on public.product_drafts(asset_id);
create index if not exists product_drafts_status_idx on public.product_drafts(status);
create index if not exists ai_generations_product_draft_id_idx on public.ai_generations(product_draft_id);

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at before update on public.assets for each row execute function public.set_updated_at();

drop trigger if exists image_jobs_set_updated_at on public.image_jobs;
create trigger image_jobs_set_updated_at before update on public.image_jobs for each row execute function public.set_updated_at();

drop trigger if exists image_job_items_set_updated_at on public.image_job_items;
create trigger image_job_items_set_updated_at before update on public.image_job_items for each row execute function public.set_updated_at();

drop trigger if exists mockup_templates_set_updated_at on public.mockup_templates;
create trigger mockup_templates_set_updated_at before update on public.mockup_templates for each row execute function public.set_updated_at();

drop trigger if exists mockup_outputs_set_updated_at on public.mockup_outputs;
create trigger mockup_outputs_set_updated_at before update on public.mockup_outputs for each row execute function public.set_updated_at();

drop trigger if exists product_drafts_set_updated_at on public.product_drafts;
create trigger product_drafts_set_updated_at before update on public.product_drafts for each row execute function public.set_updated_at();

alter table public.assets enable row level security;
alter table public.image_jobs enable row level security;
alter table public.image_job_items enable row level security;
alter table public.mockup_templates enable row level security;
alter table public.mockup_outputs enable row level security;
alter table public.product_drafts enable row level security;
alter table public.ai_generations enable row level security;

drop policy if exists "Allow authenticated users to access assets" on public.assets;
create policy "Allow authenticated users to access assets"
on public.assets
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated users to access image jobs" on public.image_jobs;
create policy "Allow authenticated users to access image jobs"
on public.image_jobs
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated users to access image job items" on public.image_job_items;
create policy "Allow authenticated users to access image job items"
on public.image_job_items
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated users to access mockup templates" on public.mockup_templates;
create policy "Allow authenticated users to access mockup templates"
on public.mockup_templates
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated users to access mockup outputs" on public.mockup_outputs;
create policy "Allow authenticated users to access mockup outputs"
on public.mockup_outputs
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated users to access product drafts" on public.product_drafts;
create policy "Allow authenticated users to access product drafts"
on public.product_drafts
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated users to access ai generations" on public.ai_generations;
create policy "Allow authenticated users to access ai generations"
on public.ai_generations
for all
to authenticated
using (true)
with check (true);

-- Source migration: supabase/migrations/20260524094500_create_assets_storage_bucket.sql

insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Allow authenticated users to read assets bucket" on storage.objects;
create policy "Allow authenticated users to read assets bucket"
on storage.objects
for select
to authenticated
using (bucket_id = 'assets');

drop policy if exists "Allow authenticated users to insert assets bucket" on storage.objects;
create policy "Allow authenticated users to insert assets bucket"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'assets');

-- Source migration: supabase/migrations/20260524101600_make_ai_generations_product_draft_nullable.sql

alter table public.ai_generations
alter column product_draft_id drop not null;

-- Source migration: supabase/migrations/20260524113000_create_export_records.sql

create table if not exists public.export_records (
  id uuid primary key default gen_random_uuid(),
  export_type text not null check (
    export_type in ('excel', 'images_zip')
  ),
  product_ids jsonb not null default '[]'::jsonb,
  product_count integer not null default 0 check (product_count >= 0),
  filename text,
  download_url text,
  status text not null default 'completed' check (
    status in ('completed', 'failed')
  ),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists export_records_created_at_idx
on public.export_records(created_at desc);

create index if not exists export_records_status_idx
on public.export_records(status);

alter table public.export_records enable row level security;

drop policy if exists "Allow authenticated users to access export records" on public.export_records;
create policy "Allow authenticated users to access export records"
on public.export_records
for all
to authenticated
using (true)
with check (true);
