create table if not exists public.markets (
  id text primary key,
  slug text not null unique,
  category text not null check (category in ('match', 'winner', 'special')),
  code text not null,
  title text not null,
  note text not null,
  volume_label text not null,
  source text not null check (source in ('polymarket', 'manual')),
  polymarket_slug text,
  active boolean not null default true,
  closed boolean not null default false,
  closed_at timestamptz,
  starts_at timestamptz,
  lock_at timestamptz,
  winning_outcome_id text,
  sort_order integer not null default 0,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.outcomes (
  id text primary key,
  market_id text not null references public.markets(id) on delete cascade,
  label text not null,
  side text not null check (side in ('yes', 'no', 'other')),
  probability double precision not null check (probability >= 0 and probability <= 1),
  final_price double precision check (final_price is null or (final_price >= 0 and final_price <= 1)),
  winning boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  points integer not null default 10000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  market_id text not null references public.markets(id) on delete cascade,
  outcome_id text not null references public.outcomes(id) on delete cascade,
  stake integer not null check (stake > 0),
  odds double precision not null check (odds > 0),
  probability_at_prediction double precision not null check (
    probability_at_prediction >= 0
    and probability_at_prediction <= 1
  ),
  status text not null default 'open' check (status in ('open', 'won', 'lost', 'void')),
  payout integer,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

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

create index if not exists markets_active_sort_idx on public.markets (active, sort_order);
create index if not exists markets_closed_sort_idx on public.markets (closed, sort_order);
create index if not exists markets_lock_at_idx on public.markets (lock_at);
create index if not exists outcomes_market_sort_idx on public.outcomes (market_id, sort_order);
create index if not exists predictions_profile_idx on public.predictions (profile_id);
create index if not exists predictions_market_idx on public.predictions (market_id);
create index if not exists predictions_status_idx on public.predictions (status);
create index if not exists point_transactions_profile_created_idx on public.point_transactions (profile_id, created_at desc);
create index if not exists point_transactions_prediction_idx on public.point_transactions (prediction_id);

alter table public.markets
  drop constraint if exists markets_winning_outcome_id_fkey;
alter table public.markets
  add constraint markets_winning_outcome_id_fkey
  foreign key (winning_outcome_id) references public.outcomes(id) on delete set null;

alter table public.markets enable row level security;
alter table public.outcomes enable row level security;
alter table public.profiles enable row level security;
alter table public.predictions enable row level security;
alter table public.point_transactions enable row level security;

drop policy if exists "public can read active markets" on public.markets;
create policy "public can read active markets"
on public.markets for select
using (active = true);

drop policy if exists "public can read outcomes" on public.outcomes;
create policy "public can read outcomes"
on public.outcomes for select
using (
  exists (
    select 1 from public.markets
    where markets.id = outcomes.market_id
      and markets.active = true
  )
);

drop policy if exists "authenticated can read own profile" on public.profiles;
create policy "authenticated can read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "authenticated can read own predictions" on public.predictions;
create policy "authenticated can read own predictions"
on public.predictions for select
to authenticated
using (auth.uid() = profile_id);

drop policy if exists "authenticated can read own point transactions" on public.point_transactions;
create policy "authenticated can read own point transactions"
on public.point_transactions for select
to authenticated
using (auth.uid() = profile_id);
