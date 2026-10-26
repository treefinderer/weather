-- 0001 accounts: one profile row per user, holding the temperature unit.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  unit text not null default 'C' check (unit in ('C', 'F')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Each user reads, creates and updates only their own row. No delete policy: rows go with the auth user.
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Keeps updated_at current on every update.
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Creates the profile row when a user signs up. The app also creates it on the first save if this ever fails.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
