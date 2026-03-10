-- Garantir limpeza de thread ao apagar comentário raiz
-- e limpar votos vinculados aos comentários removidos.

create or replace function public.cleanup_comment_dependencies_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Remove votos do comentário atual.
  if to_regclass('public.vehicle_comment_votes') is not null then
    delete from public.vehicle_comment_votes
    where comment_id = old.id;
  end if;

  -- Se for comentário raiz, remove respostas da thread.
  if old.parent_comment_id is null and to_regclass('public.vehicle_comments') is not null then
    delete from public.vehicle_comments
    where parent_comment_id = old.id;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_cleanup_comment_dependencies_before_delete on public.vehicle_comments;
create trigger trg_cleanup_comment_dependencies_before_delete
before delete on public.vehicle_comments
for each row
execute function public.cleanup_comment_dependencies_before_delete();
