create or replace function public.settle_prediction_result(
  target_prediction_id uuid,
  target_winning_outcome_id text,
  settled_timestamp timestamptz default now()
)
returns table (
  settled boolean,
  won boolean,
  payout integer
)
language plpgsql
as $$
declare
  prediction_row public.predictions%rowtype;
  current_points integer;
  payout_points integer;
  did_win boolean;
begin
  select *
  into prediction_row
  from public.predictions
  where id = target_prediction_id
    and status = 'open'
  for update;

  if not found then
    settled := false;
    won := false;
    payout := 0;
    return next;
    return;
  end if;

  did_win := prediction_row.outcome_id = target_winning_outcome_id;
  payout_points := case
    when did_win then round(prediction_row.stake * prediction_row.odds)::integer
    else 0
  end;

  if did_win and payout_points > 0 then
    select points
    into current_points
    from public.profiles
    where id = prediction_row.profile_id
    for update;

    update public.profiles
    set
      points = current_points + payout_points,
      updated_at = settled_timestamp
    where id = prediction_row.profile_id;

    insert into public.point_transactions (
      profile_id,
      prediction_id,
      transaction_key,
      type,
      amount,
      balance_after,
      description,
      created_at
    )
    values (
      prediction_row.profile_id,
      prediction_row.id,
      'payout:' || prediction_row.id::text,
      'prediction_payout',
      payout_points,
      current_points + payout_points,
      '的中による払戻',
      settled_timestamp
    )
    on conflict (transaction_key) do nothing;
  end if;

  update public.predictions
  set
    status = case when did_win then 'won' else 'lost' end,
    payout = payout_points,
    settled_at = settled_timestamp
  where id = prediction_row.id;

  settled := true;
  won := did_win;
  payout := payout_points;
  return next;
end;
$$;
