-- 账号系统：profiles（角色/状态/配额）、usage_events（用量统计）
-- 1. profiles: per-user account info (role, status, quota)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'employee' check (role in ('admin', 'employee')),
  status text not null default 'active' check (status in ('active', 'frozen')),
  daily_image_quota integer not null default 50 check (daily_image_quota >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_status_idx on public.profiles(status);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- 2. usage_events: per-user activity tracking
create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (
    event_type in ('upload', 'print_extract', 'ai_generate', 'api_call')
  ),
  quantity integer not null default 1 check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_id_created_at_idx
on public.usage_events(user_id, created_at desc);

create index if not exists usage_events_type_created_at_idx
on public.usage_events(event_type, created_at desc);

-- 3. admin check helper (security definer avoids RLS recursion)
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

-- 4. auto-create profile on signup; first user becomes admin
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count integer;
begin
  select count(*) into user_count from public.profiles;
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    case when user_count = 0 then 'admin' else 'employee' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- 5. RLS
alter table public.profiles enable row level security;
alter table public.usage_events enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "Admins can read all profiles" on public.profiles;
create policy "Admins can read all profiles"
on public.profiles for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete profiles" on public.profiles;
create policy "Admins can delete profiles"
on public.profiles for delete
to authenticated
using (public.is_admin());

drop policy if exists "Users can insert own usage events" on public.usage_events;
create policy "Users can insert own usage events"
on public.usage_events for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Users can read own usage events" on public.usage_events;
create policy "Users can read own usage events"
on public.usage_events for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can read all usage events" on public.usage_events;
create policy "Admins can read all usage events"
on public.usage_events for select
to authenticated
using (public.is_admin());
