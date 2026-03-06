-- Star rating por versão de veículo.
-- Regras:
-- 1) Um usuário pode avaliar cada versão apenas uma vez (upsert no frontend).
-- 2) A nota deve estar entre 1 e 5.
-- 3) Leitura pública, escrita apenas pelo próprio usuário autenticado.

create table if not exists public.vehicle_version_ratings (
  id uuid primary key default gen_random_uuid(),
  vehicle_version_id uuid not null references public.vehicle_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_version_id, user_id)
);

create index if not exists idx_vehicle_version_ratings_version_id
  on public.vehicle_version_ratings (vehicle_version_id);

create index if not exists idx_vehicle_version_ratings_user_id
  on public.vehicle_version_ratings (user_id);

create or replace function public.set_updated_at_vehicle_version_ratings()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_vehicle_version_ratings
  on public.vehicle_version_ratings;

create trigger trg_set_updated_at_vehicle_version_ratings
before update on public.vehicle_version_ratings
for each row
execute function public.set_updated_at_vehicle_version_ratings();

alter table public.vehicle_version_ratings enable row level security;

drop policy if exists "vehicle_version_ratings_select_all"
  on public.vehicle_version_ratings;
create policy "vehicle_version_ratings_select_all"
  on public.vehicle_version_ratings
  for select
  using (true);

drop policy if exists "vehicle_version_ratings_insert_own"
  on public.vehicle_version_ratings;
create policy "vehicle_version_ratings_insert_own"
  on public.vehicle_version_ratings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "vehicle_version_ratings_update_own"
  on public.vehicle_version_ratings;
create policy "vehicle_version_ratings_update_own"
  on public.vehicle_version_ratings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "vehicle_version_ratings_delete_own"
  on public.vehicle_version_ratings;
create policy "vehicle_version_ratings_delete_own"
  on public.vehicle_version_ratings
  for delete
  to authenticated
  using (auth.uid() = user_id);
