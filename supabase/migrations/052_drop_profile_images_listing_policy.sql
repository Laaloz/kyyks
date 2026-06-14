-- profile-images is a public bucket: object URLs are served without RLS, so this broad
-- SELECT policy on storage.objects is not needed for display and only lets clients
-- LIST/enumerate every file in the bucket. Drop it to stop enumeration. The owner-scoped
-- insert/update/delete policies are unaffected.
drop policy if exists "profile images public read" on storage.objects;
