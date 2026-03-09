alter table public.profiles
  add column if not exists profession text null,
  add column if not exists interests text[] not null default '{}',
  add column if not exists profile_level text null,
  add column if not exists focus text null,
  add column if not exists favorite_brands text[] not null default '{}',
  add column if not exists reference_vehicles text[] not null default '{}';
