insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do update set public = excluded.public;

create policy "Allow authenticated users to read assets bucket"
on storage.objects
for select
to authenticated
using (bucket_id = 'assets');

create policy "Allow authenticated users to insert assets bucket"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'assets');
