alter table public.profiles
  add column if not exists username text null;

create unique index if not exists uq_profiles_username_ci
  on public.profiles (lower(btrim(username)))
  where username is not null and btrim(username) <> '';
