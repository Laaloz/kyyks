do $$
begin
  if not exists (
    select 1
    from pg_enum enum
    join pg_type type on type.oid = enum.enumtypid
    where type.typname = 'conversation_entry_type'
      and enum.enumlabel = 'admin_message'
  ) then
    alter type public.conversation_entry_type add value 'admin_message';
  end if;
end
$$;
