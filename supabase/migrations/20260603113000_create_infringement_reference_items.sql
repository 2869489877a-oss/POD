create table if not exists public.infringement_reference_items (
  id uuid primary key default gen_random_uuid(),
  library_type text not null check (
    library_type in ('high_risk', 'allowlist')
  ),
  category text not null check (
    category in (
      'brand',
      'character',
      'celebrity',
      'sports',
      'copyright_phrase',
      'logo',
      'marketplace',
      'visual_review'
    )
  ),
  title text not null,
  terms text[] not null default '{}',
  image_url text,
  image_hash text,
  hash_algorithm text not null default 'average_hash_8x8',
  risk_level text not null default 'medium' check (
    risk_level in ('unknown', 'low', 'medium', 'high', 'critical')
  ),
  severity text not null default 'medium' check (
    severity in ('low', 'medium', 'high', 'critical')
  ),
  description text,
  source_label text,
  source_url text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint infringement_reference_items_has_signal check (
    array_length(terms, 1) is not null
    or image_url is not null
    or image_hash is not null
  )
);

create index if not exists infringement_reference_items_type_idx
on public.infringement_reference_items(library_type, is_active);

create index if not exists infringement_reference_items_category_idx
on public.infringement_reference_items(category, is_active);

create index if not exists infringement_reference_items_hash_idx
on public.infringement_reference_items(image_hash)
where image_hash is not null and is_active = true;

drop trigger if exists infringement_reference_items_set_updated_at on public.infringement_reference_items;
create trigger infringement_reference_items_set_updated_at
before update on public.infringement_reference_items
for each row execute function public.set_updated_at();

alter table public.infringement_reference_items enable row level security;

drop policy if exists "Allow authenticated users to access infringement reference items"
on public.infringement_reference_items;

create policy "Allow authenticated users to access infringement reference items"
on public.infringement_reference_items
for all
to authenticated
using (true)
with check (true);
