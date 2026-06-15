-- Ainesosahaun nopeutus: ilike '%term%' (johtava wildcard) ei voi käyttää btree-indeksiä
-- (ingredient_catalog_name_idx), joten haku seq-scannaa koko katalogin. pg_trgm + GIN-indeksi
-- tekee substring-hausta indeksoidun.
--
-- Hyödyttää:
--   - reseptieditorin palvelinhakua  GET /api/nutrition/ingredients/search
--   - AI-arvion Fineli-täsmäystä      lib/server/ai-food.ts (findFineliMatch)
--
-- Indeksin rakennus 4k+ rivin taululle on käytännössä hetkellinen ja täysin palautettava
-- (drop index).

create extension if not exists pg_trgm;

create index if not exists ingredient_catalog_name_trgm_idx
  on public.ingredient_catalog using gin (name gin_trgm_ops);

create index if not exists ingredient_catalog_display_name_trgm_idx
  on public.ingredient_catalog using gin (display_name gin_trgm_ops);
