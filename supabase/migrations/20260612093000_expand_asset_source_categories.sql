begin;

alter table public.assets
drop constraint if exists assets_source_check;

alter table public.assets
add constraint assets_source_check check (
  source in (
    'upload',
    'link',
    'ai',
    'other',
    'upload_original',
    'print_transparent',
    'garment_base'
  )
);

create index if not exists assets_source_idx on public.assets(source);

commit;
