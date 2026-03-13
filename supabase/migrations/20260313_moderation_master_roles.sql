alter table public.moderation_admins
  add column if not exists role text not null default 'admin'
  check (role in ('admin', 'master'));

-- Evita lockout: administradores ativos atuais viram master na primeira migração
update public.moderation_admins
set role = 'master'
where is_active = true
  and role = 'admin';

create or replace function public.is_moderation_master(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.moderation_admins ma
    where ma.user_id = p_user_id
      and ma.is_active = true
      and ma.role = 'master'
  );
$$;

create or replace function public.moderation_upsert_admin(
  p_target_user_id uuid,
  p_role text default 'admin',
  p_is_active boolean default true
)
returns public.moderation_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := lower(coalesce(p_role, 'admin'));
  v_row public.moderation_admins%rowtype;
begin
  if v_actor is null or not public.is_moderation_master(v_actor) then
    raise exception 'Acesso negado: apenas master pode gerenciar administradores.';
  end if;

  if v_role not in ('admin', 'master') then
    raise exception 'Role inválida.';
  end if;

  insert into public.moderation_admins (user_id, created_by, is_active, role)
  values (p_target_user_id, v_actor, coalesce(p_is_active, true), v_role)
  on conflict (user_id) do update
    set
      is_active = excluded.is_active,
      role = excluded.role,
      created_by = coalesce(public.moderation_admins.created_by, excluded.created_by),
      updated_at = now()
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.moderation_set_admin_status(
  p_target_user_id uuid,
  p_is_active boolean
)
returns public.moderation_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.moderation_admins%rowtype;
  v_active_master_count integer;
begin
  if v_actor is null or not public.is_moderation_master(v_actor) then
    raise exception 'Acesso negado: apenas master pode gerenciar administradores.';
  end if;

  select * into v_row
  from public.moderation_admins ma
  where ma.user_id = p_target_user_id
  for update;

  if not found then
    raise exception 'Administrador não encontrado.';
  end if;

  if v_row.role = 'master' and coalesce(p_is_active, false) = false then
    select count(*)::integer into v_active_master_count
    from public.moderation_admins ma
    where ma.is_active = true
      and ma.role = 'master';

    if v_active_master_count <= 1 then
      raise exception 'Não é possível desativar o último master.';
    end if;
  end if;

  update public.moderation_admins
  set
    is_active = coalesce(p_is_active, false),
    updated_at = now()
  where user_id = p_target_user_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.moderation_set_admin_role(
  p_target_user_id uuid,
  p_role text
)
returns public.moderation_admins
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := lower(coalesce(p_role, 'admin'));
  v_row public.moderation_admins%rowtype;
  v_active_master_count integer;
begin
  if v_actor is null or not public.is_moderation_master(v_actor) then
    raise exception 'Acesso negado: apenas master pode gerenciar administradores.';
  end if;

  if v_role not in ('admin', 'master') then
    raise exception 'Role inválida.';
  end if;

  select * into v_row
  from public.moderation_admins ma
  where ma.user_id = p_target_user_id
  for update;

  if not found then
    raise exception 'Administrador não encontrado.';
  end if;

  if v_row.role = 'master' and v_role = 'admin' and v_row.is_active = true then
    select count(*)::integer into v_active_master_count
    from public.moderation_admins ma
    where ma.is_active = true
      and ma.role = 'master';

    if v_active_master_count <= 1 then
      raise exception 'Não é possível rebaixar o último master.';
    end if;
  end if;

  update public.moderation_admins
  set
    role = v_role,
    updated_at = now()
  where user_id = p_target_user_id
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.is_moderation_master(uuid) to authenticated;
grant execute on function public.moderation_upsert_admin(uuid, text, boolean) to authenticated;
grant execute on function public.moderation_set_admin_status(uuid, boolean) to authenticated;
grant execute on function public.moderation_set_admin_role(uuid, text) to authenticated;
