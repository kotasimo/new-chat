alter table public.profiles
  add column if not exists periodic_bonus_claimed_at timestamptz;

alter table public.point_transactions
  drop constraint if exists point_transactions_type_check;

alter table public.point_transactions
  add constraint point_transactions_type_check
  check (
    type in (
      'initial_grant',
      'prediction_stake',
      'prediction_payout',
      'prediction_refund',
      'periodic_bonus'
    )
  );

create or replace function public.grant_periodic_points(
  target_profile_id uuid,
  bonus_amount integer default 1000,
  cooldown_seconds integer default 3600
)
returns table (
  granted boolean,
  points integer,
  next_available_at timestamptz
)
language plpgsql
as $$
declare
  profile_row public.profiles%rowtype;
  granted_at timestamptz := now();
  cooldown interval := make_interval(secs => cooldown_seconds);
begin
  if bonus_amount <= 0 or cooldown_seconds <= 0 then
    raise exception 'bonus_amount and cooldown_seconds must be positive';
  end if;

  select *
  into profile_row
  from public.profiles
  where id = target_profile_id
  for update;

  if not found then
    raise exception 'profile not found';
  end if;

  if profile_row.periodic_bonus_claimed_at is not null
    and profile_row.periodic_bonus_claimed_at + cooldown > granted_at then
    granted := false;
    points := profile_row.points;
    next_available_at := profile_row.periodic_bonus_claimed_at + cooldown;
    return next;
    return;
  end if;

  update public.profiles
  set
    points = points + bonus_amount,
    periodic_bonus_claimed_at = granted_at,
    updated_at = granted_at
  where id = target_profile_id
  returning public.profiles.points into profile_row.points;

  insert into public.point_transactions (
    profile_id,
    transaction_key,
    type,
    amount,
    balance_after,
    description,
    created_at
  )
  values (
    target_profile_id,
    'periodic:' || target_profile_id::text || ':' || to_char(granted_at, 'YYYYMMDDHH24MISSMS'),
    'periodic_bonus',
    bonus_amount,
    profile_row.points,
    '定期ポイントプレゼント',
    granted_at
  );

  granted := true;
  points := profile_row.points;
  next_available_at := granted_at + cooldown;
  return next;
end;
$$;
