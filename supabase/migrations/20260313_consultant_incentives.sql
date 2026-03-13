alter table public.profiles
  add column if not exists is_consultant_verified boolean not null default false;

alter table public.profiles
  add column if not exists is_founder boolean not null default false;

alter table public.profiles
  add column if not exists launch_bonus_expires_at timestamptz null;

create or replace function public.moderation_set_profile_incentives(
  p_target_user_id uuid,
  p_is_consultant_verified boolean,
  p_is_founder boolean,
  p_launch_bonus_expires_at timestamptz default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row public.profiles%rowtype;
begin
  if v_actor is null or not public.is_moderation_master(v_actor) then
    raise exception 'Acesso negado: apenas master pode alterar incentivos.';
  end if;

  update public.profiles p
  set
    is_consultant_verified = coalesce(p_is_consultant_verified, false),
    is_founder = coalesce(p_is_founder, false),
    launch_bonus_expires_at = p_launch_bonus_expires_at
  where p.id = p_target_user_id
  returning * into v_row;

  if not found then
    raise exception 'Perfil não encontrado.';
  end if;

  return v_row;
end;
$$;

grant execute on function public.moderation_set_profile_incentives(uuid, boolean, boolean, timestamptz) to authenticated;
