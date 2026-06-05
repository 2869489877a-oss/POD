alter table public.ai_providers
  add column if not exists health_status text not null default 'healthy',
  add column if not exists request_count integer not null default 0,
  add column if not exists success_count integer not null default 0,
  add column if not exists failure_count integer not null default 0,
  add column if not exists daily_limit integer,
  add column if not exists daily_used integer not null default 0,
  add column if not exists daily_window_start date not null default current_date,
  add column if not exists last_used_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists cooldown_until timestamptz,
  add column if not exists quota_last_checked_at timestamptz,
  add column if not exists quota_snapshot jsonb not null default '{}'::jsonb;

alter table public.ai_providers
  drop constraint if exists ai_providers_health_status_check;

alter table public.ai_providers
  add constraint ai_providers_health_status_check check (
    health_status in ('healthy', 'cooldown', 'rate_limited', 'quota_exhausted', 'invalid_key', 'error')
  );

alter table public.ai_providers
  drop constraint if exists ai_providers_daily_limit_check;

alter table public.ai_providers
  add constraint ai_providers_daily_limit_check check (daily_limit is null or daily_limit >= 0);

create index if not exists ai_providers_health_rotation_idx
  on public.ai_providers(is_active, health_status, priority desc, last_used_at);

create index if not exists ai_providers_cooldown_until_idx
  on public.ai_providers(cooldown_until)
  where cooldown_until is not null;
