create table if not exists public.image_collection_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  main_folder_name text not null,
  storage_prefix text not null default 'collections',
  keywords jsonb not null default '[]'::jsonb,
  max_images integer not null default 50 check (max_images > 0),
  schedule_enabled boolean not null default false,
  cron_expression text,
  status text not null default 'active' check (
    status in ('active', 'archived')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.image_collection_sources (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.image_collection_templates(id) on delete cascade,
  site_name text not null,
  start_url text not null,
  folder_name text not null,
  enabled boolean not null default true,
  options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.image_collection_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.image_collection_templates(id) on delete set null,
  run_type text not null default 'manual' check (
    run_type in ('manual', 'scheduled')
  ),
  root_folder text not null,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed', 'partial_failed')
  ),
  total_found integer not null default 0 check (total_found >= 0),
  total_downloaded integer not null default 0 check (total_downloaded >= 0),
  total_failed integer not null default 0 check (total_failed >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.image_collection_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.image_collection_runs(id) on delete cascade,
  source_id uuid references public.image_collection_sources(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  source_page_url text,
  image_url text,
  storage_path text,
  filename text,
  status text not null default 'pending' check (
    status in ('pending', 'downloaded', 'failed', 'skipped')
  ),
  error_message text,
  width integer,
  height integer,
  file_size bigint,
  created_at timestamptz not null default now()
);

create index if not exists image_collection_templates_status_idx
on public.image_collection_templates(status);

create index if not exists image_collection_templates_created_at_idx
on public.image_collection_templates(created_at desc);

create index if not exists image_collection_sources_template_id_idx
on public.image_collection_sources(template_id);

create index if not exists image_collection_sources_enabled_idx
on public.image_collection_sources(enabled);

create index if not exists image_collection_runs_template_id_idx
on public.image_collection_runs(template_id);

create index if not exists image_collection_runs_status_idx
on public.image_collection_runs(status);

create index if not exists image_collection_runs_created_at_idx
on public.image_collection_runs(created_at desc);

create index if not exists image_collection_items_run_id_idx
on public.image_collection_items(run_id);

create index if not exists image_collection_items_source_id_idx
on public.image_collection_items(source_id);

create index if not exists image_collection_items_asset_id_idx
on public.image_collection_items(asset_id);

create index if not exists image_collection_items_status_idx
on public.image_collection_items(status);

drop trigger if exists image_collection_templates_set_updated_at
on public.image_collection_templates;

create trigger image_collection_templates_set_updated_at
before update on public.image_collection_templates
for each row execute function public.set_updated_at();

drop trigger if exists image_collection_sources_set_updated_at
on public.image_collection_sources;

create trigger image_collection_sources_set_updated_at
before update on public.image_collection_sources
for each row execute function public.set_updated_at();

alter table public.image_collection_templates enable row level security;
alter table public.image_collection_sources enable row level security;
alter table public.image_collection_runs enable row level security;
alter table public.image_collection_items enable row level security;

drop policy if exists "Allow authenticated users to access image collection templates"
on public.image_collection_templates;

create policy "Allow authenticated users to access image collection templates"
on public.image_collection_templates
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated users to access image collection sources"
on public.image_collection_sources;

create policy "Allow authenticated users to access image collection sources"
on public.image_collection_sources
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated users to access image collection runs"
on public.image_collection_runs;

create policy "Allow authenticated users to access image collection runs"
on public.image_collection_runs
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Allow authenticated users to access image collection items"
on public.image_collection_items;

create policy "Allow authenticated users to access image collection items"
on public.image_collection_items
for all
to authenticated
using (true)
with check (true);
