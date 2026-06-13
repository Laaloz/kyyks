-- Vaihe 6: treenaaja voi luoda omia reseptejä ("Oma resepti").
-- recipes-kirjoituspolitiikka (035) sallii jo created_by = auth.uid() -rivit, joten
-- treenaaja saa lisätä oman reseptinsä. Tässä avataan kaksi puuttuvaa kohtaa:
--   1) nutrition_owner_role-enumiin 'athlete', jotta omistajaroolin voi tallentaa.
--   2) recipe_ingredients-kirjoitus omistajaperusteiseksi (oli vain admin) — sama
--      malli kuin meal_plan_template_items (035): reseptin created_by saa kirjoittaa
--      sen ainekset. Tämä korjaa myös valmentajan oman reseptin ainesten kirjoituksen.

-- HUOM: 'alter type ... add value' ei saa käyttää lisättyä arvoa samassa
-- transaktiossa. Tässä migraatiossa arvoa ei käytetä (vain enum laajenee +
-- politiikat), joten ajo yhtenä tiedostona on turvallista.
alter type public.nutrition_owner_role add value if not exists 'athlete';

drop policy if exists "recipe ingredients write by admin" on public.recipe_ingredients;

create policy "recipe ingredients write by owner or admin"
on public.recipe_ingredients for all
using (
  exists (
    select 1
    from public.recipes recipe
    where recipe.id = recipe_id
      and (public.is_admin() or recipe.created_by = auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.recipes recipe
    where recipe.id = recipe_id
      and (public.is_admin() or recipe.created_by = auth.uid())
  )
);
