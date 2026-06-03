create table if not exists public.infringement_checks (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  status text not null default 'pending' check (
    status in ('pending', 'clear', 'review', 'risky', 'blocked')
  ),
  risk_level text not null default 'unknown' check (
    risk_level in ('unknown', 'low', 'medium', 'high', 'critical')
  ),
  confidence integer not null default 0 check (confidence >= 0 and confidence <= 100),
  detection_source text not null default 'rule_engine' check (
    detection_source in ('rule_engine', 'visual_ai', 'manual')
  ),
  matched_rules jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  recommendation text,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists infringement_checks_asset_id_created_at_idx
on public.infringement_checks(asset_id, created_at desc);

create index if not exists infringement_checks_status_idx
on public.infringement_checks(status);

create index if not exists infringement_checks_risk_level_idx
on public.infringement_checks(risk_level);

drop trigger if exists infringement_checks_set_updated_at on public.infringement_checks;
create trigger infringement_checks_set_updated_at
before update on public.infringement_checks
for each row execute function public.set_updated_at();

alter table public.infringement_checks enable row level security;

drop policy if exists "Allow authenticated users to access infringement checks" on public.infringement_checks;
create policy "Allow authenticated users to access infringement checks"
on public.infringement_checks
for all
to authenticated
using (true)
with check (true);
