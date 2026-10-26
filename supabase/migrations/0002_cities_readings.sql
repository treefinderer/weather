-- 0002 cities and twice-daily collection: followed cities, readings per source, and the hourly collector schedule.
-- Run after 0001_profiles.sql and after the Vault entries `project_url` and `collect_secret` exist (supabase/README.md).
-- This file holds no secret: the cron job reads both values from Vault by name each time it runs.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- --- Tables ---

-- One row per place, keyed by the Open-Meteo geocoding id so users share it. The first values stored win.
create table public.cities (
  id bigint primary key,
  name text not null check (char_length(name) between 1 and 200),
  admin1 text check (char_length(admin1) <= 200),
  country text not null check (char_length(country) <= 200),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  timezone text not null,
  created_at timestamptz not null default now()
);

-- A check constraint can't query pg_timezone_names, so a trigger rejects unknown IANA names.
create function public.check_city_timezone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger cities_check_timezone
  before insert or update of timezone on public.cities
  for each row execute function public.check_city_timezone();

-- The cities each user follows. The primary key blocks duplicates.
create table public.user_cities (
  user_id uuid not null references auth.users (id) on delete cascade,
  city_id bigint not null references public.cities (id),
  added_at timestamptz not null default now(),
  primary key (user_id, city_id)
);
create index user_cities_city_id_idx on public.user_cities (city_id);

-- At most 10 cities per user. The per-user lock makes two adds at the same moment queue, so they can't make 11.
create function public.enforce_city_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('user_cities:' || new.user_id::text, 0));
  if (select count(*) from public.user_cities where user_id = new.user_id) >= 10 then
    raise exception 'city_limit' using hint = 'A user can follow up to 10 cities.';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_city_limit() from public, anon, authenticated;

create trigger user_cities_limit
  before insert on public.user_cities
  for each row execute function public.enforce_city_limit();

-- One reading per city, source, local date and slot. All values are metric; weather_code is the source's own code.
create table public.readings (
  id bigint generated always as identity primary key,
  city_id bigint not null references public.cities (id),
  source text not null check (source in ('open-meteo', 'met-norway')),
  slot text not null check (slot in ('day', 'night')),
  local_date date not null,
  observed_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  temperature_c real,
  feels_like_c real,
  humidity_pct real,
  wind_speed_ms real,
  precipitation_mm real,
  weather_code text,
  raw jsonb,
  unique (city_id, source, local_date, slot)
);

-- The newest reading per city, source and slot. security_invoker applies the caller's RLS on readings.
create view public.latest_readings with (security_invoker = true) as
  select distinct on (city_id, source, slot) *
  from public.readings
  order by city_id, source, slot, local_date desc;

-- --- Row Level Security ---
-- Each user sees only the cities they follow and those cities' readings. Cities and readings have no write
-- policies: cities are written through follow_city, readings by the collector with the service role.

alter table public.cities enable row level security;
alter table public.user_cities enable row level security;
alter table public.readings enable row level security;

revoke all on public.cities, public.user_cities, public.readings, public.latest_readings from anon;
revoke insert, update, delete, truncate on public.cities, public.readings from authenticated;
revoke update, truncate on public.user_cities from authenticated;

create policy "user_cities_select_own" on public.user_cities
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_cities_insert_own" on public.user_cities
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_cities_delete_own" on public.user_cities
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "cities_select_followed" on public.cities
  for select to authenticated using (exists (
    select 1 from public.user_cities uc where uc.city_id = cities.id and uc.user_id = (select auth.uid())
  ));

create policy "readings_select_followed" on public.readings
  for select to authenticated using (exists (
    select 1 from public.user_cities uc where uc.city_id = readings.city_id and uc.user_id = (select auth.uid())
  ));

-- --- follow_city ---
-- Stores the city if its id is new (never overwriting a shared city), then follows it for the caller.
-- The primary key (23505) and the 10-city trigger (city_limit) still apply, and their errors reach the client.
create function public.follow_city(
  p_id bigint, p_name text, p_admin1 text, p_country text,
  p_lat double precision, p_lon double precision, p_timezone text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  insert into public.cities (id, name, admin1, country, lat, lon, timezone)
    values (p_id, p_name, p_admin1, p_country, p_lat, p_lon, p_timezone)
    on conflict (id) do nothing;
  insert into public.user_cities (user_id, city_id) values (uid, p_id);
end;
$$;

revoke execute on function public.follow_city(bigint, text, text, text, double precision, double precision, text) from public, anon;
grant execute on function public.follow_city(bigint, text, text, text, double precision, double precision, text) to authenticated;

-- ============================================================================================================
-- Cron schedule: calls the collect Edge Function at minute 5 of every UTC hour.
-- Safe to run before the function is deployed (those calls just fail until it exists). The URL and the secret
-- are read from Vault by name when each run starts, so changing a Vault entry needs no change here.
-- Re-running this section replaces the job.
-- ============================================================================================================

select cron.unschedule(jobid) from cron.job where jobname = 'collect';

select cron.schedule(
  'collect',
  '5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/collect',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-collect-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collect_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
