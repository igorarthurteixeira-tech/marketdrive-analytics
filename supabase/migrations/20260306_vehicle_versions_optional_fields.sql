-- Campos adicionais de especificação para vehicle_versions.
-- Todos opcionais (nullable), conforme regra de negócio.

alter table public.vehicle_versions
  add column if not exists aceleracao_texto text,
  add column if not exists consumo_gasolina_urbano_kml numeric,
  add column if not exists consumo_gasolina_estrada_kml numeric,
  add column if not exists consumo_etanol_urbano_kml numeric,
  add column if not exists consumo_etanol_estrada_kml numeric,
  add column if not exists latin_ncap_pre_2021 text,
  add column if not exists latin_ncap_post_2021 text,
  add column if not exists home_featured boolean default false,
  add column if not exists home_featured_order integer;

comment on column public.vehicle_versions.aceleracao_texto is
  'Aceleração em texto livre (ex.: 10,3 s (E) / 10,8 s (G)).';
comment on column public.vehicle_versions.consumo_gasolina_urbano_kml is
  'Consumo urbano com gasolina em km/l.';
comment on column public.vehicle_versions.consumo_gasolina_estrada_kml is
  'Consumo rodoviário com gasolina em km/l.';
comment on column public.vehicle_versions.consumo_etanol_urbano_kml is
  'Consumo urbano com etanol em km/l.';
comment on column public.vehicle_versions.consumo_etanol_estrada_kml is
  'Consumo rodoviário com etanol em km/l.';
comment on column public.vehicle_versions.latin_ncap_pre_2021 is
  'Nota Latin NCAP na metodologia anterior a 2021.';
comment on column public.vehicle_versions.latin_ncap_post_2021 is
  'Nota Latin NCAP na metodologia a partir de 2021.';
comment on column public.vehicle_versions.home_featured is
  'Define se a versão é fixada manualmente na home.';
comment on column public.vehicle_versions.home_featured_order is
  'Ordem manual de exibição na home quando home_featured = true.';

create index if not exists idx_vehicle_versions_home_featured
  on public.vehicle_versions (home_featured, home_featured_order);
