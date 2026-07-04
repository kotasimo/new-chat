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
