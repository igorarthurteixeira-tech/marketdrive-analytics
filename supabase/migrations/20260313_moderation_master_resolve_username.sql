create or replace function public.moderation_resolve_profile_by_username(
  p_username text
)
returns table (
  id uuid,
  name text,
  username text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_username text := lower(trim(coalesce(p_username, '')));
begin
  if v_actor is null or not public.is_moderation_master(v_actor) then
    raise exception 'Acesso negado: apenas master pode resolver username.';
  end if;

  if left(v_username, 1) = '@' then
    v_username := substr(v_username, 2);
  end if;

  if v_username = '' then
    return;
  end if;

  return query
  select p.id, p.name::text, p.username::text
  from public.profiles p
  where lower(coalesce(p.username, '')) = v_username
  limit 1;
end;
$$;

grant execute on function public.moderation_resolve_profile_by_username(text) to authenticated;
