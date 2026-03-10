-- Permite ao autor do veículo aprovar pedidos e inserir pontos/defeitos
-- com autoria do solicitante (created_by diferente de auth.uid()).

do $$
begin
  if to_regclass('public.positives') is not null then
    execute 'alter table public.positives enable row level security';

    if not exists (
      select 1
      from pg_policies
      where schemaname = ''public''
        and tablename = ''positives''
        and policyname = ''Vehicle owner can insert positives for own versions''
    ) then
      execute '
        create policy "Vehicle owner can insert positives for own versions"
        on public.positives
        for insert
        to authenticated
        with check (
          auth.uid() is not null
          and exists (
            select 1
            from public.vehicle_versions vv
            where vv.id = positives.vehicle_version_id
              and vv.created_by = auth.uid()
          )
        )
      ';
    end if;
  end if;

  if to_regclass('public.defects') is not null then
    execute 'alter table public.defects enable row level security';

    if not exists (
      select 1
      from pg_policies
      where schemaname = ''public''
        and tablename = ''defects''
        and policyname = ''Vehicle owner can insert defects for own versions''
    ) then
      execute '
        create policy "Vehicle owner can insert defects for own versions"
        on public.defects
        for insert
        to authenticated
        with check (
          auth.uid() is not null
          and exists (
            select 1
            from public.vehicle_versions vv
            where vv.id = defects.vehicle_version_id
              and vv.created_by = auth.uid()
          )
        )
      ';
    end if;
  end if;
end $$;
