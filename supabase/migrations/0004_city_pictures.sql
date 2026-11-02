-- 0009 satellite pictures: one NASA GIBS picture per city, local date and slot, shared by every follower of the city.
-- Run after 0002_cities_readings.sql. The collect Edge Function writes the files and rows with the service role;
-- signed-in users can read only the pictures of the cities they follow. Every picture is kept (no cleanup job).

-- --- Table ---

-- storage_path is the object name inside the city-pictures bucket: "{city_id}/{local_date}/{slot}.jpg".
-- layer and image_time record what was asked of GIBS, so a later layer change doesn't relabel old pictures.
-- bbox is the requested box as {minLat, minLon, maxLat, maxLon}; the frontend places the city marker from it.
create table public.city_pictures (
  id bigint generated always as identity primary key,
  city_id bigint not null references public.cities (id),
  local_date date not null,
  slot text not null check (slot in ('day', 'night')),
  layer text not null check (char_length(layer) between 1 and 200),
  image_time text not null check (char_length(image_time) between 1 and 40),
  bbox double precision[] check (bbox is null or array_length(bbox, 1) = 4),
  storage_path text not null check (char_length(storage_path) between 1 and 200),
  bytes integer not null check (bytes > 0),
  fetched_at timestamptz not null default now(),
  unique (city_id, local_date, slot)
);

-- The newest picture per city. On the same date, day (12pm) is newer than night (12am).
-- security_invoker applies the caller's RLS on city_pictures.
create view public.latest_pictures with (security_invoker = true) as
  select distinct on (city_id) *
  from public.city_pictures
  order by city_id, local_date desc, (slot = 'day') desc;

-- --- Row Level Security ---
-- Read-only for followers. No write policies: only the collector writes, with the service role.

alter table public.city_pictures enable row level security;

revoke all on public.city_pictures, public.latest_pictures from anon;
revoke insert, update, delete, truncate on public.city_pictures from authenticated;

create policy "city_pictures_select_followed" on public.city_pictures
  for select to authenticated using (exists (
    select 1 from public.user_cities uc where uc.city_id = city_pictures.city_id and uc.user_id = (select auth.uid())
  ));

-- --- Storage ---
-- A private bucket for the JPEGs. The frontend reads them through signed URLs, which Storage creates only when
-- this select policy allows the caller to read the object: the first folder must be a city the caller follows.
-- The folder is compared as text, so an object name that isn't a number simply matches nothing.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('city-pictures', 'city-pictures', false, 1048576, array['image/jpeg'])
  on conflict (id) do nothing;

create policy "city_pictures_read_followed" on storage.objects
  for select to authenticated using (
    bucket_id = 'city-pictures' and exists (
      select 1 from public.user_cities uc
      where uc.user_id = (select auth.uid()) and uc.city_id::text = (storage.foldername(name))[1]
    )
  );
