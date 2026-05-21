do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.theme_mode'::regtype
      and enumlabel = 'camel'
  ) then
    alter type public.theme_mode add value 'camel';
  end if;
end
$$;
