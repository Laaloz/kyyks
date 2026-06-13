-- Sama ohjelma voi olla osoitettu monelle urheilijalle. Jokainen urheilija saa
-- yhä oman training_plans-rivin (oma athlete_id + aikataulu), mutta saman
-- ohjelman rivit jakavat program_group_id:n. Ohjelmaeditori muokkaa koko ryhmää
-- kerralla (luo/päivittää/arkistoi rivit valittujen urheilijoiden mukaan).
alter table public.training_plans
  add column if not exists program_group_id uuid;

create index if not exists training_plans_program_group_idx
  on public.training_plans (program_group_id);
