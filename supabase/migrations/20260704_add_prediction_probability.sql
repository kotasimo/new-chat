alter table public.predictions
  add column if not exists probability_at_prediction double precision;

update public.predictions
set probability_at_prediction = least(1, greatest(0, 1 / odds))
where probability_at_prediction is null
  and odds > 0;

alter table public.predictions
  alter column probability_at_prediction set not null;

alter table public.predictions
  drop constraint if exists predictions_probability_at_prediction_check;

alter table public.predictions
  add constraint predictions_probability_at_prediction_check
  check (
    probability_at_prediction >= 0
    and probability_at_prediction <= 1
  );
