create table if not exists public.image_derivatives (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  job_id uuid references public.image_jobs(id) on delete set null,
  job_item_id uuid references public.image_job_items(id) on delete set null,
  derivative_type text not null check (
    derivative_type in (
      'print_extract_raw',
      'print_extract_final',
      'cutout',
      'mask',
      'preview'
    )
  ),
  source_url text not null,
  output_url text,
  preview_url text,
  mask_url text,
  width integer,
  height integer,
  bbox jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assets
add column if not exists print_extract_url text;

alter table public.assets
add column if not exists cutout_url text;

alter table public.assets
add column if not exists preferred_design_url text;

create index if not exists image_derivatives_asset_id_idx
on public.image_derivatives(asset_id);

create index if not exists image_derivatives_type_idx
on public.image_derivatives(derivative_type);

create index if not exists image_derivatives_status_idx
on public.image_derivatives(status);

create index if not exists image_derivatives_created_at_idx
on public.image_derivatives(created_at desc);

drop trigger if exists image_derivatives_set_updated_at on public.image_derivatives;
create trigger image_derivatives_set_updated_at
before update on public.image_derivatives
for each row execute function public.set_updated_at();

alter table public.image_derivatives enable row level security;

drop policy if exists "Allow authenticated users to access image derivatives"
on public.image_derivatives;

create policy "Allow authenticated users to access image derivatives"
on public.image_derivatives
for all
to authenticated
using (true)
with check (true);
