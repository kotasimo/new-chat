-- マーケットが属するリーグ。既存の行はプレミアリーグとして取り込んだものなので epl を既定値にする。
alter table public.markets
  add column if not exists league text not null default 'epl';

create index if not exists markets_league_sort_idx
  on public.markets (league, active, closed, sort_order);
