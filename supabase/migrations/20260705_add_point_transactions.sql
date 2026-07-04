create table if not exists public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  prediction_id uuid references public.predictions(id) on delete set null,
  transaction_key text not null unique,
  type text not null check (
    type in (
      'initial_grant',
      'prediction_stake',
      'prediction_payout',
      'prediction_refund'
    )
  ),
  amount integer not null check (amount <> 0),
  balance_after integer not null check (balance_after >= 0),
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists point_transactions_profile_created_idx
on public.point_transactions (profile_id, created_at desc);

create index if not exists point_transactions_prediction_idx
on public.point_transactions (prediction_id);

alter table public.point_transactions enable row level security;

insert into public.point_transactions (
  profile_id,
  transaction_key,
  type,
  amount,
  balance_after,
  description
)
select
  profiles.id,
  'initial:' || profiles.id::text,
  'initial_grant',
  profiles.points,
  profiles.points,
  '台帳開始時の保有ポイント'
from public.profiles
where profiles.points <> 0
on conflict (transaction_key) do nothing;
