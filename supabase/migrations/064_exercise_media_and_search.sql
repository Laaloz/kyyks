-- Liikkeiden esimerkkikuvat + vaiheittainen suoritusohje + palvelinhaku.
--
-- Taustaa: liikekatalogi kasvaa 133 → ~873 (free-exercise-db, public domain). Koko
-- katalogia ei voi enää ladata app-state-payloadiin (training-sync.ts lataa nyt
-- exercises-taulun kokonaan jokaiselle käyttäjälle), joten liikevalitsin siirtyy
-- palvelinhakuun samalla kuvalla kuin ainesosahaku (migraatio 059).
--
-- Media: kaksi still-kuvaa per liike (alku- ja loppuasento), joita UI ristihäivyttää.
-- Malli otettu reseptikuvista (061_recipe_images.sql).

-- 1. Mediasarakkeet + vaiheittainen ohje ------------------------------------------------

alter table "public"."exercises"
  add column if not exists "image_start_url" "text",
  add column if not exists "image_end_url" "text";

-- Vaiheittainen suoritusohje suomeksi. EI korvaa cue-saraketta: cue on valmentajan
-- tiivis pääohje, tämä on sen alle avautuva yksityiskohtainen erittely.
-- Muoto: ["Asetu penkille...", "Vedä tanko...", ...]
alter table "public"."exercises"
  add column if not exists "instruction_steps" jsonb not null default '[]'::jsonb;

-- Lähdeviite: mistä datasta liike ja sen media on tuotu. Tekee seedin uudelleenajosta
-- idempotentin ja kertoo mitkä rivit ovat käsin ylläpidettyjä (source is null).
alter table "public"."exercises"
  add column if not exists "media_source" "text",
  add column if not exists "media_source_id" "text";

-- EI uniikki: useampi Kyyks-liike osoittaa perustellusti samaan lähdedemonstraatioon
-- (esim. Pendlay-soutu ja kulmasoutu tangolla, ylätalja ja pulldown). Indeksi on
-- jäljitystä varten — se kertoo mistä rivin media on peräisin.
create index if not exists exercises_media_source_id_idx
  on public.exercises (media_source, media_source_id)
  where media_source is not null and media_source_id is not null;

-- 2. Palvelinhaun indeksit --------------------------------------------------------------
-- Liikevalitsin hakee ilike '%term%':lla → johtava wildcard estää btree-indeksin käytön,
-- kuten ainesosahaussa. pg_trgm + GIN tekee substring-hausta indeksoidun.
-- Hyödyttää: GET /api/exercises/search (ohjelmaeditorin liikevalitsin).

create extension if not exists pg_trgm;

create index if not exists exercises_name_trgm_idx
  on public.exercises using gin (name gin_trgm_ops);

-- 3. Julkinen exercise-media-bucket -----------------------------------------------------
-- Sama malli ja politiikat kuin recipe-images (061_recipe_images.sql): julkinen luku,
-- kirjoitus vain adminille.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-media',
  'exercise-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "exercise media public read" on storage.objects;
drop policy if exists "exercise media insert by admin" on storage.objects;
drop policy if exists "exercise media update by admin" on storage.objects;
drop policy if exists "exercise media delete by admin" on storage.objects;

create policy "exercise media public read"
on storage.objects for select
to public
using (bucket_id = 'exercise-media');

create policy "exercise media insert by admin"
on storage.objects for insert
to authenticated
with check (bucket_id = 'exercise-media' and public.is_admin());

create policy "exercise media update by admin"
on storage.objects for update
to authenticated
using (bucket_id = 'exercise-media' and public.is_admin())
with check (bucket_id = 'exercise-media' and public.is_admin());

create policy "exercise media delete by admin"
on storage.objects for delete
to authenticated
using (bucket_id = 'exercise-media' and public.is_admin());
