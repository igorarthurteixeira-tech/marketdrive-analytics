-- Evita versões duplicadas por veículo + nome da versão + ano,
-- sem diferenciar maiúsculas/minúsculas.
create unique index if not exists uq_vehicle_versions_vehicle_version_year_ci
on public.vehicle_versions (
  vehicle_id,
  lower(btrim(version_name)),
  year
)
where version_name is not null
  and year is not null;
