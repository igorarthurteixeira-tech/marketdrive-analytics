create table if not exists public.defect_votes (
  id uuid primary key default gen_random_uuid(),
  defect_id uuid not null references public.defects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_confirmed boolean not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (defect_id, user_id)
);

create index if not exists idx_defect_votes_defect_id on public.defect_votes(defect_id);
create index if not exists idx_defect_votes_user_id on public.defect_votes(user_id);

create or replace function public.set_current_timestamp_updated_at_defect_votes()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_defect_votes_updated_at on public.defect_votes;
create trigger set_defect_votes_updated_at
before update on public.defect_votes
for each row
execute procedure public.set_current_timestamp_updated_at_defect_votes();

alter table public.defect_votes enable row level security;

drop policy if exists "Defect votes are viewable by everyone" on public.defect_votes;
create policy "Defect votes are viewable by everyone"
on public.defect_votes
for select
using (true);

drop policy if exists "Authenticated users can manage own defect votes" on public.defect_votes;
create policy "Authenticated users can manage own defect votes"
on public.defect_votes
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
