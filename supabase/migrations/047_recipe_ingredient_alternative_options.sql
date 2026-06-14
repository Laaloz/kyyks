-- Rakenteiset vaihtoehtoiset ainekset (vaihe 6): aiempi alternatives text[] piti
-- vain nimiä. Tämä lisää strukturoidun alternative_options-sarakkeen, jossa jokainen
-- vaihtoehto kantaa oman katalogi-aineksensa (ingredientId) ja grammamääränsä, jotta
-- esikatselu voi laskea makrot uudelleen valinnan mukaan.
-- Muoto: [{ "ingredientId": "uuid|null", "ingredientName": "...", "grams": 120 }, ...]
alter table public.recipe_ingredients
  add column if not exists alternative_options jsonb not null default '[]'::jsonb;
