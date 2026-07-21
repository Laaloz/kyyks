-- Animoitu liikedemo (ExerciseDB / GymVisual -lähtöinen GIF → animoitu WebP).
-- Ensisijainen esitys ohjesheetissä; 064:n image_start_url/image_end_url jää varaesitykseksi
-- niille liikkeille joilta animaatio puuttuu. Lähteillä on eri aukot, joten yhdessä ne
-- kattavat 130/133 liikettä.
--
-- HUOM lisenssistä: animaatiomedia on © Gym visual eikä sille ole julkista käyttöehtoa.
-- Kelpaa nykyisessä ei-kaupallisessa käytössä; kaupallistuessa korvattava ostetulla
-- lisenssillä tai palattava pelkkään still-pariin (public domain).
-- Ks. scripts/exercise-animation-map.mjs.
alter table "public"."exercises"
  add column if not exists "animation_url" "text";

-- Erillinen lähdeviite: animaatio ja still-pari voivat tulla eri lähteistä.
alter table "public"."exercises"
  add column if not exists "animation_source" "text",
  add column if not exists "animation_source_id" "text";

create index if not exists exercises_animation_source_id_idx
  on public.exercises (animation_source, animation_source_id)
  where animation_source is not null;
