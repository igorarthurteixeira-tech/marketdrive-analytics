-- Limpa votos dependentes ao apagar pontos/defeitos.

create or replace function public.cleanup_positive_votes_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.positive_votes') is not null then
    delete from public.positive_votes where positive_id = old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_cleanup_positive_votes_before_delete on public.positives;
create trigger trg_cleanup_positive_votes_before_delete
before delete on public.positives
for each row
execute function public.cleanup_positive_votes_before_delete();

create or replace function public.cleanup_defect_votes_before_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.defect_votes') is not null then
    delete from public.defect_votes where defect_id = old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists trg_cleanup_defect_votes_before_delete on public.defects;
create trigger trg_cleanup_defect_votes_before_delete
before delete on public.defects
for each row
execute function public.cleanup_defect_votes_before_delete();
