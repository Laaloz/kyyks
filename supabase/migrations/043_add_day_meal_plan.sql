-- Treenaajan päiväkohtainen ateriakooste (vaihe 6).
-- Suunnitelma (assigned_meal_plans) antaa pohjan ja tavoitteet; treenaaja kokoaa
-- päivänsä ateriat itse näiden rivien kautta (vaihto/lisäys/poisto + "syöty"-tila).
-- Ateriavalinta on aina treenaajan oma: kirjoitus vain treenaajalla (tai adminilla),
-- valmentaja näkee rivit read-only-esikatselua varten.

create table if not exists public.day_meal_plans (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  plan_date date not null,
  meal_tag public.meal_tag not null,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  -- Mistä rivi tuli: pohjalistalta, vaihdettu toiseksi, vai itse lisätty.
  source text not null default 'plan' check (source in ('plan', 'swapped', 'added')),
  servings numeric(8, 2) not null default 1 check (servings > 0),
  -- null = ei vielä syöty; aikaleima = merkitty syödyksi.
  eaten_at timestamptz,
  -- Järjestys päivärytmissä saman ateriapaikan sisällä.
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists day_meal_plans_athlete_date_idx
on public.day_meal_plans (athlete_id, plan_date);

alter table public.day_meal_plans enable row level security;

create policy "day meal plans read by participant, coach or admin"
on public.day_meal_plans for select
using (public.is_admin() or auth.uid() = athlete_id or public.is_coach_of(athlete_id));

create policy "day meal plans insert by athlete or admin"
on public.day_meal_plans for insert
with check (public.is_admin() or auth.uid() = athlete_id);

create policy "day meal plans update by athlete or admin"
on public.day_meal_plans for update
using (public.is_admin() or auth.uid() = athlete_id)
with check (public.is_admin() or auth.uid() = athlete_id);

create policy "day meal plans delete by athlete or admin"
on public.day_meal_plans for delete
using (public.is_admin() or auth.uid() = athlete_id);
