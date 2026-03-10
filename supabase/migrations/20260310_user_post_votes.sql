-- Votos (confirmar/negar) em publicações do feed

create table if not exists public.user_post_votes (
  post_id uuid not null references public.user_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_confirmed boolean not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_user_post_votes_post on public.user_post_votes (post_id);
create index if not exists idx_user_post_votes_created_at on public.user_post_votes (created_at desc);

create or replace function public.touch_updated_at_user_post_votes()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_user_post_votes on public.user_post_votes;
create trigger trg_touch_updated_at_user_post_votes
before update on public.user_post_votes
for each row
execute function public.touch_updated_at_user_post_votes();

alter table public.user_post_votes enable row level security;

drop policy if exists "user_post_votes_select_all" on public.user_post_votes;
create policy "user_post_votes_select_all"
on public.user_post_votes
for select
using (true);

drop policy if exists "user_post_votes_insert_own" on public.user_post_votes;
create policy "user_post_votes_insert_own"
on public.user_post_votes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_post_votes_update_own" on public.user_post_votes;
create policy "user_post_votes_update_own"
on public.user_post_votes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_post_votes_delete_own" on public.user_post_votes;
create policy "user_post_votes_delete_own"
on public.user_post_votes
for delete
to authenticated
using (auth.uid() = user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_post_votes'
  ) THEN
    execute 'alter publication supabase_realtime add table public.user_post_votes';
  END IF;
END $$;
