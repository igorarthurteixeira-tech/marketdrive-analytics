alter table public.vehicle_comments
  add column if not exists is_pinned boolean not null default false,
  add column if not exists pinned_at timestamptz null;

create index if not exists idx_vehicle_comments_pinning
  on public.vehicle_comments (vehicle_version_id, is_pinned, pinned_at desc, created_at desc);

create or replace function public.enforce_max_pinned_vehicle_comments()
returns trigger
language plpgsql
as $$
declare
  pinned_count integer;
begin
  if coalesce(new.is_pinned, false) = false then
    if coalesce(old.is_pinned, false) = true then
      new.pinned_at := null;
    end if;
    return new;
  end if;

  if new.parent_comment_id is not null then
    raise exception 'Apenas comentarios principais podem ser fixados.';
  end if;

  select count(*) into pinned_count
  from public.vehicle_comments vc
  where vc.vehicle_version_id = new.vehicle_version_id
    and vc.parent_comment_id is null
    and coalesce(vc.is_pinned, false) = true
    and vc.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if pinned_count >= 3 then
    raise exception 'Limite de 3 comentarios fixados por veiculo.';
  end if;

  if new.pinned_at is null then
    new.pinned_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_vehicle_comments_enforce_max_pinned on public.vehicle_comments;
create trigger trg_vehicle_comments_enforce_max_pinned
before insert or update of is_pinned, parent_comment_id, vehicle_version_id
on public.vehicle_comments
for each row
execute function public.enforce_max_pinned_vehicle_comments();
