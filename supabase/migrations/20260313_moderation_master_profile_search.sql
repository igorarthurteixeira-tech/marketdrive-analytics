create or replace function public.moderation_search_profiles(
  p_query text,
  p_limit integer default 10
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
  v_query text := trim(coalesce(p_query, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 30));
begin
  if v_actor is null or not public.is_moderation_master(v_actor) then
    raise exception 'Acesso negado: apenas master pode buscar perfis.';
  end if;

  if length(v_query) < 2 then
    return;
  end if;

  return query
  select
    p.id,
    p.name::text,
    p.username::text
  from public.profiles p
  where
    coalesce(p.name, '') ilike '%' || v_query || '%'
    or coalesce(p.username, '') ilike '%' || v_query || '%'
  order by
    case
      when lower(coalesce(p.username, '')) = lower(v_query) then 0
      when lower(coalesce(p.name, '')) = lower(v_query) then 1
      else 2
    end,
    p.created_at desc
  limit v_limit;
end;
$$;

grant execute on function public.moderation_search_profiles(text, integer) to authenticated;
