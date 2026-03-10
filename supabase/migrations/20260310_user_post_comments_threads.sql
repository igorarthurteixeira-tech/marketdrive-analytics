-- Permite respostas em cadeia nos comentários do feed

alter table public.user_post_comments
  add column if not exists parent_comment_id uuid null references public.user_post_comments(id) on delete cascade;

create index if not exists idx_user_post_comments_parent_comment_id
  on public.user_post_comments(parent_comment_id);

create or replace function public.enforce_user_post_comment_parent_same_post()
returns trigger
language plpgsql
as $$
declare
  parent_post_id uuid;
begin
  if new.parent_comment_id is null then
    return new;
  end if;

  select post_id
    into parent_post_id
  from public.user_post_comments
  where id = new.parent_comment_id;

  if parent_post_id is null then
    raise exception 'Comentario pai nao encontrado.';
  end if;

  if parent_post_id <> new.post_id then
    raise exception 'Resposta deve pertencer ao mesmo post.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_user_post_comment_parent_same_post on public.user_post_comments;
create trigger trg_enforce_user_post_comment_parent_same_post
before insert or update of parent_comment_id, post_id
on public.user_post_comments
for each row
execute function public.enforce_user_post_comment_parent_same_post();

