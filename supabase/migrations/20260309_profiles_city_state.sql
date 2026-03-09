alter table public.profiles
  add column if not exists city text null,
  add column if not exists state text null;
