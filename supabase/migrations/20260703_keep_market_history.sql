alter table public.markets
  add column if not exists closed boolean not null default false,
  add column if not exists closed_at timestamptz,
  add column if not exists winning_outcome_id text;

alter table public.outcomes
  add column if not exists final_price double precision,
  add column if not exists winning boolean not null default false;

alter table public.outcomes
  drop constraint if exists outcomes_final_price_check;

alter table public.outcomes
  add constraint outcomes_final_price_check
  check (final_price is null or (final_price >= 0 and final_price <= 1));

alter table public.predictions
  add column if not exists payout integer,
  add column if not exists settled_at timestamptz;

create index if not exists markets_closed_sort_idx
on public.markets (closed, sort_order);

create index if not exists predictions_status_idx
on public.predictions (status);

alter table public.markets
  drop constraint if exists markets_winning_outcome_id_fkey;

alter table public.markets
  add constraint markets_winning_outcome_id_fkey
  foreign key (winning_outcome_id) references public.outcomes(id) on delete set null;
