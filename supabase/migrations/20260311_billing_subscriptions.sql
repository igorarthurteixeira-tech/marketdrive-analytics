create extension if not exists pgcrypto;

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text,
  status text,
  cancel_at_period_end boolean not null default false,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_subscriptions_user_id
  on public.billing_subscriptions(user_id);

create index if not exists idx_billing_subscriptions_customer_id
  on public.billing_subscriptions(stripe_customer_id);

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_billing_subscriptions_set_updated_at on public.billing_subscriptions;
create trigger trg_billing_subscriptions_set_updated_at
before update on public.billing_subscriptions
for each row
execute function public.tg_set_updated_at();

alter table public.billing_subscriptions enable row level security;

drop policy if exists "billing_subscriptions_select_own" on public.billing_subscriptions;
create policy "billing_subscriptions_select_own"
on public.billing_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

