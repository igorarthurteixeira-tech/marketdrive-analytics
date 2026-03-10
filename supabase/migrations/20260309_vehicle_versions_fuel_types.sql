alter table public.vehicle_versions
  add column if not exists fuel_types text[] not null default '{gasolina,etanol}',
  add column if not exists consumo_urbano_kml numeric null,
  add column if not exists consumo_estrada_kml numeric null;

update public.vehicle_versions
set fuel_types = case
  when coalesce(array_length(fuel_types, 1), 0) = 0 then
    case
      when (consumo_gasolina_urbano_kml is not null or consumo_gasolina_estrada_kml is not null)
           and (consumo_etanol_urbano_kml is not null or consumo_etanol_estrada_kml is not null)
        then array['gasolina','etanol']
      when (consumo_gasolina_urbano_kml is not null or consumo_gasolina_estrada_kml is not null)
        then array['gasolina']
      when (consumo_etanol_urbano_kml is not null or consumo_etanol_estrada_kml is not null)
        then array['etanol']
      else array['gasolina','etanol']
    end
  else fuel_types
end;
