-- Permissões de exclusão para o autor do veículo (owner da versão)
-- Cobre: pontos positivos, defeitos e comentários.

do $$
begin
  if to_regclass('public.positives') is not null then
    execute 'alter table public.positives enable row level security';

    if not exists (
      select 1
      from pg_policies
      where schemaname = ''public''
        and tablename = ''positives''
        and policyname = ''Vehicle owner can delete positives for own versions''
    ) then
      execute '
        create policy "Vehicle owner can delete positives for own versions"
        on public.positives
        for delete
        to authenticated
        using (
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
        and policyname = ''Vehicle owner can delete defects for own versions''
    ) then
      execute '
        create policy "Vehicle owner can delete defects for own versions"
        on public.defects
        for delete
        to authenticated
        using (
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

  if to_regclass('public.vehicle_comments') is not null then
    execute 'alter table public.vehicle_comments enable row level security';

    if not exists (
      select 1
      from pg_policies
      where schemaname = ''public''
        and tablename = ''vehicle_comments''
        and policyname = ''Vehicle owner can delete comments for own versions''
    ) then
      execute '
        create policy "Vehicle owner can delete comments for own versions"
        on public.vehicle_comments
        for delete
        to authenticated
        using (
          auth.uid() is not null
          and exists (
            select 1
            from public.vehicle_versions vv
            where vv.id = vehicle_comments.vehicle_version_id
              and vv.created_by = auth.uid()
          )
        )
      ';
    end if;
  end if;
end $$;
