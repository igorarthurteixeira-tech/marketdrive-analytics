alter table public.vehicle_versions
  add column if not exists body_style text;

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

create or replace function public.body_style_bucket(input_text text)
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
      when (select value from normalized) like '%hatch%' then 'hatch'
      when (select value from normalized) like '%sedan%' then 'sedan'
      when (select value from normalized) like '%suv%' then 'suv'
      when (select value from normalized) like '%crossover%' then 'crossover'
      when (select value from normalized) like '%picape%' then 'picape'
      when (select value from normalized) like '%pickup%' then 'picape'
      when (select value from normalized) like '%coupe%' then 'cupe'
      when (select value from normalized) like '%cupe%' then 'cupe'
      when (select value from normalized) like '%perua%' then 'perua'
      when (select value from normalized) like '%wagon%' then 'perua'
      when (select value from normalized) like '%minivan%' then 'van'
      when (select value from normalized) like '%van%' then 'van'
      else lower(btrim(coalesce(input_text, '')))
    end
$$;

drop index if exists public.uq_vehicle_versions_vehicle_version_year_ci;
drop index if exists public.uq_vehicle_versions_vehicle_version_year_transmission_ci;
drop index if exists public.uq_vehicle_versions_vehicle_version_year_transmission_type_ci;
drop index if exists public.uq_vehicle_versions_vehicle_version_year_transmission_body_style_ci;
drop index if exists public.uq_vehicle_versions_vehicle_version_year_transmission_type_body_style_type_ci;

create unique index if not exists uq_vehicle_versions_vehicle_version_year_transmission_body_style_ci
on public.vehicle_versions (
  vehicle_id,
  lower(btrim(version_name)),
  year,
  public.transmission_type_bucket(transmission),
  public.body_style_bucket(body_style)
)
where version_name is not null
  and year is not null;

