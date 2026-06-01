create table public.ai_providers (
  id uuid primary key default gen_random_uuid(),
  provider_type text not null check (
    provider_type in ('gemini', 'openai', 'doubao', 'tongyi')
  ),
  display_name text not null,
  api_key text not null,
  base_url text,
  model_id text not null,
  is_active boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_image_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.ai_providers(id) on delete set null,
  provider_type text not null,
  model_id text not null,
  prompt text not null,
  negative_prompt text,
  width integer not null default 1024,
  height integer not null default 1024,
  style text,
  status text not null default 'pending' check (
    status in ('pending', 'processing', 'completed', 'failed')
  ),
  result_url text,
  asset_id uuid references public.assets(id),
  error_message text,
  created_at timestamptz not null default now()
);

create index ai_providers_type_active_idx on public.ai_providers(provider_type, is_active);
create index ai_providers_priority_idx on public.ai_providers(priority desc) where is_active = true;
create index ai_image_jobs_status_idx on public.ai_image_jobs(status);
create index ai_image_jobs_provider_id_idx on public.ai_image_jobs(provider_id);

create trigger ai_providers_set_updated_at
before update on public.ai_providers
for each row execute function public.set_updated_at();

alter table public.ai_providers enable row level security;
alter table public.ai_image_jobs enable row level security;

create policy "Allow authenticated users to access ai_providers"
on public.ai_providers for all to authenticated
using (true) with check (true);

create policy "Allow authenticated users to access ai_image_jobs"
on public.ai_image_jobs for all to authenticated
using (true) with check (true);
