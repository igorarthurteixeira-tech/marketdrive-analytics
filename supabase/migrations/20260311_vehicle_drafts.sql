create table if not exists public.vehicle_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('model', 'version')),
  title text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vehicle_drafts_user_id
  on public.vehicle_drafts(user_id);

create or replace function public.tg_vehicle_drafts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_vehicle_drafts_set_updated_at on public.vehicle_drafts;
create trigger trg_vehicle_drafts_set_updated_at
before update on public.vehicle_drafts
for each row
execute function public.tg_vehicle_drafts_set_updated_at();

alter table public.vehicle_drafts enable row level security;

drop policy if exists "vehicle_drafts_select_own" on public.vehicle_drafts;
create policy "vehicle_drafts_select_own"
on public.vehicle_drafts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "vehicle_drafts_insert_own" on public.vehicle_drafts;
create policy "vehicle_drafts_insert_own"
on public.vehicle_drafts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "vehicle_drafts_update_own" on public.vehicle_drafts;
create policy "vehicle_drafts_update_own"
on public.vehicle_drafts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "vehicle_drafts_delete_own" on public.vehicle_drafts;
create policy "vehicle_drafts_delete_own"
on public.vehicle_drafts
for delete
to authenticated
using (auth.uid() = user_id);

