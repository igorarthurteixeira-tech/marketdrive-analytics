alter table public.vehicle_versions
  add column if not exists image_url text null;

comment on column public.vehicle_versions.image_url is
  'Imagem específica da versão. Se nula, usar imagem do modelo (vehicles.image_url).';

-- Backfill inicial para manter comportamento atual após criar a coluna.
update public.vehicle_versions vv
set image_url = v.image_url
from public.vehicles v
where vv.vehicle_id = v.id
  and vv.image_url is null;
