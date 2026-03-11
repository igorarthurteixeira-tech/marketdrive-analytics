-- Classifica transmissão por tipo (manual/automática/automatizada),
-- mesmo quando o texto contém palavras adicionais.

create or replace function public.transmission_type_bucket(input_text text)
returns text
language sql
immutable
as $$
  with normalized as (
    select lower(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(coalesce(input_text, ''), 'á', 'a'),
                'à', 'a'),
              'â', 'a'),
            'ã', 'a'),
          'é', 'e'),
        'ê', 'e'),
      'í', 'i')
    ) as value
  )
  select
    case
      when input_text is null then ''
      when (select value from normalized) like '%manual%' then 'manual'
      when (select value from normalized) like '%automatizad%' then 'automatizada'
      when (select value from normalized) like '%automatic%' then 'automatica'
      else lower(btrim(coalesce(input_text, '')))
    end
$$;

drop index if exists public.uq_vehicle_versions_vehicle_version_year_ci;
drop index if exists public.uq_vehicle_versions_vehicle_version_year_transmission_ci;

create unique index if not exists uq_vehicle_versions_vehicle_version_year_transmission_type_ci
on public.vehicle_versions (
  vehicle_id,
  lower(btrim(version_name)),
  year,
  public.transmission_type_bucket(transmission)
)
where version_name is not null
  and year is not null;
