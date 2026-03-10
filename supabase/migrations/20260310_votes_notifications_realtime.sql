-- Ensure vote tables are readable for realtime notification matching
-- and included in Supabase Realtime publication.

-- 1) positive_votes policies
do $$
begin
  if to_regclass('public.positive_votes') is not null then
    execute 'alter table public.positive_votes enable row level security';

    execute 'drop policy if exists "Positive votes are viewable by everyone" on public.positive_votes';
    execute '
      create policy "Positive votes are viewable by everyone"
      on public.positive_votes
      for select
      using (true)
    ';

    execute 'drop policy if exists "Authenticated users can manage own positive votes" on public.positive_votes';
    execute '
      create policy "Authenticated users can manage own positive votes"
      on public.positive_votes
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id)
    ';
  end if;
end $$;

-- 2) vehicle_comment_votes policies
do $$
begin
  if to_regclass('public.vehicle_comment_votes') is not null then
    execute 'alter table public.vehicle_comment_votes enable row level security';

    execute 'drop policy if exists "Comment votes are viewable by everyone" on public.vehicle_comment_votes';
    execute '
      create policy "Comment votes are viewable by everyone"
      on public.vehicle_comment_votes
      for select
      using (true)
    ';

    execute 'drop policy if exists "Authenticated users can manage own comment votes" on public.vehicle_comment_votes';
    execute '
      create policy "Authenticated users can manage own comment votes"
      on public.vehicle_comment_votes
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id)
    ';
  end if;
end $$;

-- 3) Ensure tables are present in realtime publication
do $$
begin
  if to_regclass('public.positive_votes') is not null
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'positive_votes'
     ) then
    execute 'alter publication supabase_realtime add table public.positive_votes';
  end if;

  if to_regclass('public.defect_votes') is not null
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'defect_votes'
     ) then
    execute 'alter publication supabase_realtime add table public.defect_votes';
  end if;

  if to_regclass('public.vehicle_comment_votes') is not null
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'vehicle_comment_votes'
     ) then
    execute 'alter publication supabase_realtime add table public.vehicle_comment_votes';
  end if;
end $$;
