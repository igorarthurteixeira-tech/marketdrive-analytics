alter table public.vehicle_versions
  add column if not exists created_by uuid null references auth.users(id) on delete set null;

create index if not exists idx_vehicle_versions_created_by
  on public.vehicle_versions(created_by);
