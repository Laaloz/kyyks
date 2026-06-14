-- Reseptikirjan ulkopuolinen ruokaloggaus (MyFitnessPal-tyyli).
-- Treenaaja voi lisätä päiväkirjaansa yksittäisiä ruokia kolmella tavalla:
--   1) haku olemassa olevasta tietokannasta (Fineli on jo ingredient_catalogissa),
--   2) käsin-syöttö (nimi + makrot per 100 g),
--   3) AI-kuva (Gemini Flash) -arvio.
-- Kaikki yksittäisruoat tallentuvat ingredient_catalogiin uudelleenkäytettäviksi:
-- Fineli/admin-rivit ovat globaaleja (owner_user_id null), omat tuotteet yksityisiä
-- (owner_user_id = käyttäjä). Päiväkirjariville tallennetaan makro-snapshot, jotta
-- historia säilyy vaikka oma tuote myöhemmin poistetaan.

-- 1) ingredient_catalog: athlete-omisteiset, yksityiset omat tuotteet ------------------

alter table public.ingredient_catalog
  add column if not exists owner_user_id uuid references public.profiles(id) on delete cascade;

create index if not exists ingredient_catalog_owner_idx
  on public.ingredient_catalog (owner_user_id);

-- Lukunäkyvyys: globaalit (owner null) kaikille kirjautuneille; yksityiset vain
-- omistajalle, hänen valmentajalleen ja adminille.
drop policy if exists "ingredient catalog read by authenticated users" on public.ingredient_catalog;
create policy "ingredient catalog read by visibility"
on public.ingredient_catalog for select
using (
  public.is_admin()
  or owner_user_id is null
  or owner_user_id = auth.uid()
  or public.is_coach_of(owner_user_id)
);

-- Athlete saa luoda/muokata/poistaa vain omia tuotteitaan ja vain manual/ai-lähteenä.
-- Admin säilyttää täydet oikeudet globaaleihin riveihin ("write by admin" -policy, 033).
create policy "ingredient catalog insert own"
on public.ingredient_catalog for insert
with check (
  owner_user_id = auth.uid()
  and created_by = auth.uid()
  and source in ('manual', 'ai')
);

create policy "ingredient catalog update own"
on public.ingredient_catalog for update
using (owner_user_id = auth.uid())
with check (
  owner_user_id = auth.uid()
  and source in ('manual', 'ai')
);

create policy "ingredient catalog delete own"
on public.ingredient_catalog for delete
using (owner_user_id = auth.uid());

-- 2) day_meal_plans: ad hoc -ruoka reseptin rinnalle, makro-snapshot ------------------

alter table public.day_meal_plans
  alter column recipe_id drop not null;

alter table public.day_meal_plans
  add column if not exists ingredient_id uuid references public.ingredient_catalog(id) on delete set null,
  add column if not exists grams numeric(8, 2),
  add column if not exists food_name text,
  add column if not exists kcal_per_100 numeric(8, 2),
  add column if not exists protein_per_100 numeric(8, 2),
  add column if not exists carbs_per_100 numeric(8, 2),
  add column if not exists fat_per_100 numeric(8, 2),
  add column if not exists food_source text;

alter table public.day_meal_plans
  drop constraint if exists day_meal_plans_food_source_check;
alter table public.day_meal_plans
  add constraint day_meal_plans_food_source_check
    check (food_source is null or food_source in ('manual', 'ai', 'fineli'));

-- Rivi on joko resepti TAI ad hoc -ruoka (snapshot), ei molempia.
alter table public.day_meal_plans
  drop constraint if exists day_meal_plans_entry_kind_check;
alter table public.day_meal_plans
  add constraint day_meal_plans_entry_kind_check
    check (
      (recipe_id is not null and food_name is null)
      or (recipe_id is null and food_name is not null and grams is not null)
    );

-- 3) ai_usage_events: AI-kiintiön rate limit (vain palvelin/service-role käsittelee) ----

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'food_estimate',
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_user_created_idx
  on public.ai_usage_events (user_id, created_at);

-- RLS päällä eikä yhtään policya: estää suoran client-pääsyn. Vain service-role-client
-- (lib/supabase/admin.ts) kirjoittaa ja lukee rivejä palvelimella.
alter table public.ai_usage_events enable row level security;
