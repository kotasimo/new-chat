alter table public.profiles
  add column if not exists display_name text;

update public.profiles
set display_name = 'ゲスト'
where display_name is null;

alter table public.profiles
  alter column display_name set not null;
