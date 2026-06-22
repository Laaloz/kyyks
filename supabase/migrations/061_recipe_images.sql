-- Reseptien kuvat: image_url-sarake + julkinen recipe-images-bucket (malli: 032_profile_images_storage).
alter table "public"."recipes" add column if not exists "image_url" "text";

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'recipe-images',
  'recipe-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "recipe images public read" on storage.objects;
drop policy if exists "recipe images insert by admin" on storage.objects;
drop policy if exists "recipe images update by admin" on storage.objects;
drop policy if exists "recipe images delete by admin" on storage.objects;

create policy "recipe images public read"
on storage.objects for select
to public
using (bucket_id = 'recipe-images');

create policy "recipe images insert by admin"
on storage.objects for insert
to authenticated
with check (bucket_id = 'recipe-images' and public.is_admin());

create policy "recipe images update by admin"
on storage.objects for update
to authenticated
using (bucket_id = 'recipe-images' and public.is_admin())
with check (bucket_id = 'recipe-images' and public.is_admin());

create policy "recipe images delete by admin"
on storage.objects for delete
to authenticated
using (bucket_id = 'recipe-images' and public.is_admin());
