create table if not exists public.user_profile_ratings (
  id uuid primary key default gen_random_uuid(),
  rated_user_id uuid not null references auth.users(id) on delete cascade,
  rater_user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rated_user_id, rater_user_id)
);

create index if not exists idx_user_profile_ratings_rated_user_id
  on public.user_profile_ratings (rated_user_id);

create index if not exists idx_user_profile_ratings_rater_user_id
  on public.user_profile_ratings (rater_user_id);

create or replace function public.set_updated_at_user_profile_ratings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_user_profile_ratings
  on public.user_profile_ratings;

create trigger trg_set_updated_at_user_profile_ratings
before update on public.user_profile_ratings
for each row
execute function public.set_updated_at_user_profile_ratings();

alter table public.user_profile_ratings enable row level security;

drop policy if exists "user_profile_ratings_select_all"
  on public.user_profile_ratings;
create policy "user_profile_ratings_select_all"
  on public.user_profile_ratings
  for select
  using (true);

drop policy if exists "user_profile_ratings_insert_own"
  on public.user_profile_ratings;
create policy "user_profile_ratings_insert_own"
  on public.user_profile_ratings
  for insert
  to authenticated
  with check (auth.uid() = rater_user_id and auth.uid() <> rated_user_id);

drop policy if exists "user_profile_ratings_update_own"
  on public.user_profile_ratings;
create policy "user_profile_ratings_update_own"
  on public.user_profile_ratings
  for update
  to authenticated
  using (auth.uid() = rater_user_id)
  with check (auth.uid() = rater_user_id and auth.uid() <> rated_user_id);

drop policy if exists "user_profile_ratings_delete_own"
  on public.user_profile_ratings;
create policy "user_profile_ratings_delete_own"
  on public.user_profile_ratings
  for delete
  to authenticated
  using (auth.uid() = rater_user_id);
