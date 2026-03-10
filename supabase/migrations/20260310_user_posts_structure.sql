-- Estrutura base de postagens para feed/perfil

create extension if not exists pgcrypto;

create table if not exists public.user_posts (
  id uuid primary key default gen_random_uuid(),
  author_user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('noticia', 'publicacao')),
  title text null,
  description text not null check (char_length(trim(description)) > 0),
  media_path text null,
  media_kind text null check (media_kind in ('image', 'video')),
  related_vehicle_version_id uuid null references public.vehicle_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_posts_created_at on public.user_posts (created_at desc);
create index if not exists idx_user_posts_author on public.user_posts (author_user_id, created_at desc);
create index if not exists idx_user_posts_related_version on public.user_posts (related_vehicle_version_id);

create table if not exists public.user_post_likes (
  post_id uuid not null references public.user_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_user_post_likes_created_at on public.user_post_likes (created_at desc);

create table if not exists public.user_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.user_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_post_comments_post_created_at
  on public.user_post_comments (post_id, created_at desc);

create or replace function public.touch_updated_at_user_posts()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_user_posts on public.user_posts;
create trigger trg_touch_updated_at_user_posts
before update on public.user_posts
for each row
execute function public.touch_updated_at_user_posts();

create or replace function public.touch_updated_at_user_post_comments()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_updated_at_user_post_comments on public.user_post_comments;
create trigger trg_touch_updated_at_user_post_comments
before update on public.user_post_comments
for each row
execute function public.touch_updated_at_user_post_comments();

alter table public.user_posts enable row level security;
alter table public.user_post_likes enable row level security;
alter table public.user_post_comments enable row level security;

-- user_posts policies

drop policy if exists "user_posts_select_all" on public.user_posts;
create policy "user_posts_select_all"
on public.user_posts
for select
using (true);

drop policy if exists "user_posts_insert_own" on public.user_posts;
create policy "user_posts_insert_own"
on public.user_posts
for insert
to authenticated
with check (auth.uid() = author_user_id);

drop policy if exists "user_posts_update_own" on public.user_posts;
create policy "user_posts_update_own"
on public.user_posts
for update
to authenticated
using (auth.uid() = author_user_id)
with check (auth.uid() = author_user_id);

drop policy if exists "user_posts_delete_own" on public.user_posts;
create policy "user_posts_delete_own"
on public.user_posts
for delete
to authenticated
using (auth.uid() = author_user_id);

-- likes policies

drop policy if exists "user_post_likes_select_all" on public.user_post_likes;
create policy "user_post_likes_select_all"
on public.user_post_likes
for select
using (true);

drop policy if exists "user_post_likes_insert_own" on public.user_post_likes;
create policy "user_post_likes_insert_own"
on public.user_post_likes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_post_likes_delete_own" on public.user_post_likes;
create policy "user_post_likes_delete_own"
on public.user_post_likes
for delete
to authenticated
using (auth.uid() = user_id);

-- comments policies

drop policy if exists "user_post_comments_select_all" on public.user_post_comments;
create policy "user_post_comments_select_all"
on public.user_post_comments
for select
using (true);

drop policy if exists "user_post_comments_insert_own" on public.user_post_comments;
create policy "user_post_comments_insert_own"
on public.user_post_comments
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_post_comments_update_own" on public.user_post_comments;
create policy "user_post_comments_update_own"
on public.user_post_comments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_post_comments_delete_own" on public.user_post_comments;
create policy "user_post_comments_delete_own"
on public.user_post_comments
for delete
to authenticated
using (auth.uid() = user_id);

-- bucket public para midias das postagens
insert into storage.buckets (id, name, public)
values ('posts-media', 'posts-media', true)
on conflict (id) do nothing;

drop policy if exists "posts_media_public_read" on storage.objects;
create policy "posts_media_public_read"
on storage.objects
for select
using (bucket_id = 'posts-media');

drop policy if exists "posts_media_auth_upload" on storage.objects;
create policy "posts_media_auth_upload"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'posts-media' and owner = auth.uid());

drop policy if exists "posts_media_auth_update_own" on storage.objects;
create policy "posts_media_auth_update_own"
on storage.objects
for update
to authenticated
using (bucket_id = 'posts-media' and owner = auth.uid())
with check (bucket_id = 'posts-media' and owner = auth.uid());

drop policy if exists "posts_media_auth_delete_own" on storage.objects;
create policy "posts_media_auth_delete_own"
on storage.objects
for delete
to authenticated
using (bucket_id = 'posts-media' and owner = auth.uid());

-- realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_posts'
  ) THEN
    execute 'alter publication supabase_realtime add table public.user_posts';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_post_likes'
  ) THEN
    execute 'alter publication supabase_realtime add table public.user_post_likes';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_post_comments'
  ) THEN
    execute 'alter publication supabase_realtime add table public.user_post_comments';
  END IF;
END $$;
