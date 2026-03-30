do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.theme_mode'::regtype
      and enumlabel = 'mallu'
  ) then
    alter type public.theme_mode add value 'mallu';
  end if;
end
$$;
