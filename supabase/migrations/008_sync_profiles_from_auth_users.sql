create or replace function public.sync_profile_from_auth_user(
  auth_user_id uuid,
  auth_email text,
  auth_user_meta_data jsonb,
  auth_created_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_record record;
  normalized_email text;
  resolved_full_name text;
  resolved_created_at timestamptz;
begin
  if auth_email is null or btrim(auth_email) = '' then
    return;
  end if;

  normalized_email := lower(btrim(auth_email));
  resolved_created_at := coalesce(auth_created_at, now());

  select
    invites.id,
    invites.role,
    invites.coach_id,
    invites.status
  into invite_record
  from public.invites
  where lower(invites.email) = normalized_email
  order by invites.created_at desc
  limit 1;

  if invite_record.id is null then
    return;
  end if;

  resolved_full_name := nullif(
    btrim(
      coalesce(
        auth_user_meta_data ->> 'full_name',
        auth_user_meta_data ->> 'name',
        split_part(normalized_email, '@', 1)
      )
    ),
    ''
  );

  insert into public.profiles (
    id,
    role,
    status,
    full_name,
    email,
    default_dashboard_view,
    email_notifications,
    theme_mode,
    created_at,
    updated_at
  )
  values (
    auth_user_id,
    invite_record.role,
    'active',
    resolved_full_name,
    normalized_email,
    case when invite_record.role = 'athlete' then 'athlete-log' else 'overview' end,
    false,
    'light',
    resolved_created_at,
    now()
  )
  on conflict (id) do update
  set
    role = excluded.role,
    status = 'active',
    full_name = excluded.full_name,
    email = excluded.email,
    default_dashboard_view = coalesce(public.profiles.default_dashboard_view, excluded.default_dashboard_view),
    updated_at = now();

  if invite_record.role = 'athlete' and invite_record.coach_id is not null then
    insert into public.coach_athlete_assignments (
      coach_id,
      athlete_id,
      active,
      created_at
    )
    select
      invite_record.coach_id,
      auth_user_id,
      true,
      resolved_created_at
    where not exists (
      select 1
      from public.coach_athlete_assignments assignments
      where assignments.coach_id = invite_record.coach_id
        and assignments.athlete_id = auth_user_id
        and assignments.active = true
    );
  end if;

  update public.invites
  set status = 'accepted'
  where id = invite_record.id
    and status <> 'accepted';
end;
$$;

create or replace function public.handle_auth_user_profile_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_profile_from_auth_user(
    new.id,
    new.email,
    new.raw_user_meta_data,
    new.created_at
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_sync_profile on auth.users;

create trigger on_auth_user_created_sync_profile
after insert on auth.users
for each row
execute function public.handle_auth_user_profile_sync();

do $$
declare
  auth_user_row record;
begin
  for auth_user_row in
    select
      users.id,
      users.email,
      users.raw_user_meta_data,
      users.created_at
    from auth.users users
    left join public.profiles profiles on profiles.id = users.id
    where profiles.id is null
      and users.email is not null
  loop
    perform public.sync_profile_from_auth_user(
      auth_user_row.id,
      auth_user_row.email,
      auth_user_row.raw_user_meta_data,
      auth_user_row.created_at
    );
  end loop;
end;
$$;
