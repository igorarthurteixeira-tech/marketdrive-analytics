-- Garante autoria de modelo/versão para aplicar RLS consistente
-- e permitir rollback de criação quando houver falha parcial.

alter table public.vehicles
  add column if not exists created_by uuid null references auth.users(id) on delete set null;

create index if not exists idx_vehicles_created_by
  on public.vehicles(created_by);

alter table public.vehicles enable row level security;
alter table public.vehicle_versions enable row level security;

drop policy if exists "vehicles_select_all" on public.vehicles;
create policy "vehicles_select_all"
on public.vehicles
for select
to anon, authenticated
using (true);

drop policy if exists "vehicles_insert_profissional" on public.vehicles;
create policy "vehicles_insert_profissional"
on public.vehicles
for insert
to authenticated
with check (
  auth.uid() is not null
  and created_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.plan = 'profissional'
  )
);

drop policy if exists "vehicles_delete_own" on public.vehicles;
create policy "vehicles_delete_own"
on public.vehicles
for delete
to authenticated
using (
  created_by = auth.uid()
);

drop policy if exists "vehicle_versions_select_all" on public.vehicle_versions;
create policy "vehicle_versions_select_all"
on public.vehicle_versions
for select
to anon, authenticated
using (true);

drop policy if exists "vehicle_versions_insert_own" on public.vehicle_versions;
create policy "vehicle_versions_insert_own"
on public.vehicle_versions
for insert
to authenticated
with check (
  auth.uid() is not null
  and created_by = auth.uid()
);

drop policy if exists "vehicle_versions_delete_own" on public.vehicle_versions;
create policy "vehicle_versions_delete_own"
on public.vehicle_versions
for delete
to authenticated
using (
  created_by = auth.uid()
);

