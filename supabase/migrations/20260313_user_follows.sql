-- Sistema de seguidores (perfil -> perfil)

create table if not exists public.user_follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint user_follows_no_self_follow check (follower_id <> following_id)
);

create index if not exists idx_user_follows_following
  on public.user_follows (following_id, created_at desc);

create index if not exists idx_user_follows_follower
  on public.user_follows (follower_id, created_at desc);

alter table public.user_follows enable row level security;

drop policy if exists "user_follows_select_all" on public.user_follows;
create policy "user_follows_select_all"
on public.user_follows
for select
using (true);

drop policy if exists "user_follows_insert_own" on public.user_follows;
create policy "user_follows_insert_own"
on public.user_follows
for insert
to authenticated
with check (auth.uid() = follower_id and follower_id <> following_id);

drop policy if exists "user_follows_delete_own" on public.user_follows;
create policy "user_follows_delete_own"
on public.user_follows
for delete
to authenticated
using (auth.uid() = follower_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_follows'
  ) THEN
    execute 'alter publication supabase_realtime add table public.user_follows';
  END IF;
END $$;
