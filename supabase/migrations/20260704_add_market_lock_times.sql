alter table public.markets
  add column if not exists starts_at timestamptz,
  add column if not exists lock_at timestamptz;

create index if not exists markets_lock_at_idx
on public.markets (lock_at);
