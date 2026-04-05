insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images',
  'profile-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile images public read" on storage.objects;
drop policy if exists "profile images insert by owner or admin" on storage.objects;
drop policy if exists "profile images update by owner or admin" on storage.objects;
drop policy if exists "profile images delete by owner or admin" on storage.objects;

create policy "profile images public read"
on storage.objects for select
to public
using (bucket_id = 'profile-images');

create policy "profile images insert by owner or admin"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

create policy "profile images update by owner or admin"
on storage.objects for update
to authenticated
using (
  bucket_id = 'profile-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
)
with check (
  bucket_id = 'profile-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);

create policy "profile images delete by owner or admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and (
    public.is_admin()
    or (storage.foldername(name))[1] = auth.uid()::text
  )
);
