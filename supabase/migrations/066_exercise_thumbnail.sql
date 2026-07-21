-- Liikerivin pikkukuva: animaation staattinen versio samasta lähteestä (180x180 → WebP).
--
-- Miksi oma sarake eikä olemassa olevat:
--   - animation_url: animoitu WebP toistuisi listassa kymmenessä rivissä yhtä aikaa ja veisi
--     huomion sarjakuittauksesta.
--   - image_start_url: salivalokuva ei lukeudu 44 pikselissä (tumma, rajattu, ei keskitetty),
--     kun taas animaation staattinen kehys on korkeakontrastista viivagrafiikkaa keskitettynä.
alter table "public"."exercises"
  add column if not exists "thumbnail_url" "text";
