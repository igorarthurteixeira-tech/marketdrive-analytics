-- Permite versões com mesmo nome/ano para o mesmo modelo
-- quando a transmissão é diferente (ex.: Manual vs Automática).

drop index if exists public.uq_vehicle_versions_vehicle_version_year_ci;

create unique index if not exists uq_vehicle_versions_vehicle_version_year_transmission_ci
on public.vehicle_versions (
  vehicle_id,
  lower(btrim(version_name)),
  year,
  lower(btrim(coalesce(transmission, '')))
)
where version_name is not null
  and year is not null;

