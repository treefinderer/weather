# 0002 Cities and twice-daily weather collection

## Request

> "stores the history of weather (day weather and night weather) for the locations that user selects. The app checks several weather services at 12pm and 12am local time in the cities selected by user and saves the result into SQL database. Each user can select up to 10 different cities."

This is the cities and collection part of the owner's full request. Accounts were spec 0001. History tables, charts and date ranges are 0003, and notifications are 0004.

Fixed decisions (owner, 2026-10-25): Supabase (Postgres + RLS + Edge Functions), keyless sources only (Open-Meteo, and MET Norway with a `User-Agent` naming the app and a contact), and every reading stored per source.

## Goal

A signed-in user can search for cities by name, keep a list of up to 10, and remove them. For each of those cities the backend records the weather from Open-Meteo and MET Norway once in the local 12am hour and once in the local 12pm hour. Each city card shows the latest day and night reading from each source in the user's unit.

## Scope

**In**
- A "Your cities" list in the signed-in shell, replacing "No cities yet." as the only content: city search (Open-Meteo geocoding), add, remove, a limit of 10 per user, and no duplicates.
- City cards showing the latest day (12pm) and night (12am) reading per source, converted to °C or °F on display.
- A new migration with `cities`, `user_cities`, `readings`, a `latest_readings` view, a `follow_city` function, RLS, the 10-city trigger, and the pg_cron schedule.
- An Edge Function `supabase/functions/collect/` that collects readings, run every hour by pg_cron + pg_net and authenticated with a secret kept in Supabase Vault and Edge Function secrets (never committed).
- An owner checklist for the dashboard steps.

**Out**
- History tables, charts, date ranges, and any reading older than the latest per slot (0003).
- Notifications (0004).
- Daily min/max, forecasts, weather icons or text descriptions for weather codes, maps, current location or geolocation, reordering cities, renaming cities.
- Live updates: new readings show after a reload or the next time the shell opens.
- Backfilling past days. A newly added city has no readings until its next 12am or 12pm local hour.

## Behavior

**Files and wiring**
- New `cities.js` (an IIFE, loaded after `auth.js`). It uses only `Wx.supabase`, `Wx.user`, `Wx.unit` and `Wx.onAccountChange` from 0001, and must not create its own Supabase client. Geocoding uses `fetch`, so tests can mock it.
- Markup goes in `index.html` (inside `#screen-shell`) and styles in `style.css`, using existing tokens plus any new ones, each with both dark-mode overrides.
- New migration `supabase/migrations/0002_cities.sql`.
- New `supabase/functions/collect/index.ts` (the HTTP handler: auth, database reads and writes, fetches) and `supabase/functions/collect/logic.ts` (pure functions with no network or database access: slot selection, URL building, parsing each source's reply into a row). Recorded sample replies for both sources go in `supabase/functions/collect/fixtures/`.

**Schema** (`0002_cities.sql`)
- `cities`: `id bigint primary key` (the Open-Meteo geocoding `id`, which dedupes cities across users), `name text not null`, `admin1 text` (region, may be null), `country text not null`, `lat double precision not null check (lat between -90 and 90)`, `lon double precision not null check (lon between -180 and 180)`, `timezone text not null` (IANA name, checked against `pg_timezone_names`), `created_at timestamptz default now()`.
- `user_cities`: `user_id uuid references auth.users on delete cascade`, `city_id bigint references cities`, `added_at timestamptz not null default now()`, `primary key (user_id, city_id)`. The primary key blocks duplicates.
- A `before insert` trigger on `user_cities` raises an error with the message `city_limit` when the user already has 10 rows. It locks per user first (for example `pg_advisory_xact_lock` on the user id) so two adds at the same moment can't make 11.
- `readings`: `id bigint generated always as identity primary key`, `city_id bigint not null references cities`, `source text not null check (source in ('open-meteo','met-norway'))`, `slot text not null check (slot in ('day','night'))`, `local_date date not null`, `observed_at timestamptz not null`, `fetched_at timestamptz not null default now()`, `temperature_c real`, `feels_like_c real`, `humidity_pct real`, `wind_speed_ms real`, `precipitation_mm real`, `weather_code text`, `raw jsonb`, and `unique (city_id, source, local_date, slot)`. All values are metric.
- `weather_code` holds the source's own code as text: the WMO code from Open-Meteo (for example `"3"`) or the MET Norway `symbol_code` (for example `"cloudy"`). 0003 decides how to display them.
- `latest_readings`: a view with `security_invoker = true`, returning, for each (city, source, slot), the row with the newest `local_date`.
- `follow_city(p_id, p_name, p_admin1, p_country, p_lat, p_lon, p_timezone)`: a `security definer` function (with `search_path = ''`, executable by `authenticated` only). It inserts the `cities` row if that id is new (`on conflict do nothing`, so the first values stored win and a later caller can't overwrite a shared city), then inserts `(auth.uid(), p_id)` into `user_cities`. The 10-city trigger and the primary key still apply, so the errors reach the client.
- RLS is enabled on all three tables, and `anon` gets no access.
  - `user_cities`: select, insert and delete only where `user_id = auth.uid()`. No update.
  - `cities`: select only where the user follows the city (`exists` in `user_cities` for `auth.uid()`). There are no insert, update or delete policies, so writes go through `follow_city` only.
  - `readings`: select only for cities the user follows. There are no write policies for `authenticated`. The collector writes with the service role, which bypasses RLS.
- Removing a city deletes only the user's `user_cities` row. The `cities` row and its readings stay, so if the city is added again later, its earlier readings show.

**Your cities (shell)**
- Order: the "Your cities" heading, a count ("3 of 10 cities"), the search form, the search results, then the city cards in `added_at` order (oldest first).
- *Loading*: "Loading your cities…" while `user_cities` (joined to `cities`) and `latest_readings` load. If either fails, show "Can't load your cities. Check your connection and try again." with a "Try again" button.
- *No cities*: "No cities yet. Search for a city to add it."
- *Search*: a form with a labeled "Search for a city" input and a "Search" button. Enter submits. It needs at least 2 characters after trimming, or it shows "Type at least 2 letters." with no request. It calls `https://geocoding-api.open-meteo.com/v1/search?name=<encoded>&count=10&language=en&format=json`.
  - While a search is running, the button is disabled and reads "Searching…".
  - Results (up to 10) show as a list. Each item shows name, region (`admin1`, left out when missing) and country, for example "Paris, Île-de-France, France", plus an "Add" button whose accessible name includes the full place name. Results with no `timezone` or coordinates are dropped.
  - No results (the reply has no `results` key or an empty array): "No places found for "<query>"."
  - Network failure, a non-2xx reply, or no reply within 10 s: "Can't search right now. Check your connection and try again." The query stays in the input.
  - A result the user already follows (same geocoding id) shows "Added" as a disabled button instead of "Add".
- *Add*: calls `Wx.supabase.rpc('follow_city', {...})` with the result's fields. While it runs, that button is disabled and reads "Adding…". On success, the card appears at the end of the list with the empty-readings text, the count goes up, the result changes to "Added", and "Added <name>." is announced.
  - A unique-violation error (`23505`) shows "<name> is already in your list."
  - A `city_limit` error shows "You can follow up to 10 cities. Remove one to add another."
  - A network error shows "Can't add the city. Check your connection and try again."
- *Limit in the UI*: at 10 cities, every "Add" button is disabled and the limit message shows next to the search form. Search still works.
- *Remove*: each card has a "Remove" button with the accessible name "Remove <name>". It deletes that `user_cities` row (for `user_id = Wx.user.id` and `city_id`) right away, with no confirmation. While it runs, the button is disabled. On success, the card goes away, the count goes down, "Removed <name>." is announced, and focus moves to the next card's Remove button, or to the search input when no cards are left. On failure, the card stays and shows "Can't remove the city. Try again."
- *Account changes*: on `Wx.onAccountChange`, a different user (or sign-out) clears the list and search results and reloads for the new user. A unit-only change re-renders the cards from data already loaded, with no new requests.

**City card**
- Heading: "Name, Region, Country", with the city's IANA timezone underneath in muted text.
- Two groups, "Day (12pm)" and "Night (12am)". Each group has one entry per source, labeled "Open-Meteo" and "MET Norway", showing the local date of the reading (for example "Oct 24"), temperature, feels-like, humidity (%), wind and precipitation (mm). Any null value shows "–".
- Temperature: stored in °C, shown rounded to a whole number, as "21°C", or converted as °F = °C × 9/5 + 32 and shown as "70°F". Feels-like works the same way.
- Wind: stored in m/s. Shown in km/h for °C users and mph for °F users, rounded to whole numbers (pending owner, Open question 5).
- If the city has no readings at all: "No readings yet. First reading at 12am/12pm local time." If only one slot or source has data, the missing entries show "No reading yet".
- At 400px, the groups and entries stack in one column with no sideways scroll, and long city names wrap.
- Keyboard only: the search input, Search, each Add, and each Remove are reachable with Tab in visual order and show the `:focus-visible` outline. Messages go through an `aria-live` region, never `alert()`.
- Dark mode: all new colors come from tokens with both dark overrides.

**Collector** (`supabase/functions/collect/`)
- *Schedule*: pg_cron runs `5 * * * *` (minute 5 of every UTC hour) and calls `net.http_post` to `<project_url>/functions/v1/collect`. It reads both the project URL and the secret from `vault.decrypted_secrets` by name (`project_url`, `collect_secret`) when the job runs, so the migration contains no secret. The request sends the secret in an `x-collect-secret` header.
- *Auth*: the function is deployed with JWT verification off. It compares `x-collect-secret` with the `COLLECT_SECRET` Edge Function secret and returns 401 with no work done if they don't match or the header is missing. It writes with `SUPABASE_SERVICE_ROLE_KEY`, which Supabase provides to the function.
- *Which cities*: only cities that at least one user follows right now (`exists` in `user_cities`). Cities nobody follows are never fetched.
- *Slot selection* (pure, `dueSlot(nowUtc, timezone)`): convert the run time to the city's local time with `Intl.DateTimeFormat` and the IANA timezone.
  - Local hour 0, 1 or 2 means the `night` slot. Local hour 12, 13 or 14 means the `day` slot. Any other hour means nothing is due.
  - `local_date` is the local calendar date at run time. The night slot of Oct 25 is the 12am that starts Oct 25.
  - The first hour is the normal reading. The next two hours are catch-up only: in those hours a source is fetched only if its row for that `(city, source, local_date, slot)` doesn't exist yet. Catch-up covers a failed source, a missed cron run, and a DST jump that skips local midnight (pending owner, Open question 4).
  - Before fetching, the function reads existing rows for the due `(city, local_date, slot)` and fetches only the missing sources. A city with both rows already present gets no requests.
  - Half-hour and 45-minute offsets need no special case. Each local hour contains exactly one minute-5 UTC run, so in Asia/Kolkata (+5:30) the reading runs at about 00:35 and 12:35 local, and in Asia/Kathmandu (+5:45) at about 00:50 and 12:50.
  - DST: a skipped local hour 0 or 12 is covered by catch-up. A repeated local hour (fall back) produces a second run for the same slot, which inserts nothing because the row already exists.
- *What "the reading at 12pm" means*: current conditions at the time of the run, not a forecast for 12:00 and not a daily summary. `observed_at` is the source's own timestamp for those values. `fetched_at` is when the collector stored them.
- *Open-Meteo*: `https://api.open-meteo.com/v1/forecast?latitude=<lat>&longitude=<lon>&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code&wind_speed_unit=ms&timezone=UTC`. The fields map as `current.temperature_2m` → `temperature_c`, `apparent_temperature` → `feels_like_c`, `relative_humidity_2m` → `humidity_pct`, `wind_speed_10m` → `wind_speed_ms`, `precipitation` → `precipitation_mm`, `weather_code` → `weather_code` (as text), and `current.time` (read as UTC) → `observed_at`.
- *MET Norway*: `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=<lat>&lon=<lon>`, with lat and lon rounded to 4 decimals (MET rejects more), and the header `User-Agent: weather-history/1.0 (https://treefinderer.github.io/weather/; <contact email>)` (pending owner, Open question 2). The function uses the `properties.timeseries` entry with the latest `time` that is not after the run time (normally the first entry). The fields map as `data.instant.details.air_temperature` → `temperature_c`, `relative_humidity` → `humidity_pct`, `wind_speed` → `wind_speed_ms`, `data.next_1_hours.details.precipitation_amount` → `precipitation_mm`, `data.next_1_hours.summary.symbol_code` → `weather_code`, and the entry `time` → `observed_at`. `feels_like_c` is null, because MET doesn't provide it (pending owner, Open question 6). If `next_1_hours` is missing, precipitation and code are null.
- *Raw*: the whole reply goes in `raw` for Open-Meteo. For MET only the chosen timeseries entry plus `properties.meta` is stored, not the full 9-day forecast (pending owner, Open question 3).
- *Parsing rule*: a reply without the temperature counts as a failure for that source, and no row is written. Other missing fields become null.
- *Failures*: each fetch has a 10 s timeout. A failure (network, timeout, non-2xx, unparseable reply) for one source or one city is logged and skipped. The other source and the other cities still go ahead, and a later run in the catch-up window tries again. The function fetches at most 5 cities at a time.
- *Writes*: one row per `(city, source, local_date, slot)`, upserted with `on conflict do nothing`, so the first successful reading wins, catch-up never overwrites, and runs at the same moment can't create duplicates.
- *Response*: 200 with JSON `{ "due": n, "inserted": n, "skipped": n, "failed": [{ "city_id", "source", "error" }] }`. It returns 200 even when some sources failed, and 500 only when it can't read the city list.

**Owner checklist** (Supabase dashboard, after merge)
1. Database → Extensions: enable `pg_cron` and `pg_net` (the migration also runs `create extension if not exists` for both).
2. Generate a long random secret (for example `openssl rand -hex 32`). Don't commit it or paste it into any file in the repo.
3. Edge Functions → Secrets: add `COLLECT_SECRET` = that secret.
4. Run in the SQL editor, with your real values: `select vault.create_secret('<secret>', 'collect_secret');` and `select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');`.
5. SQL editor: run `supabase/migrations/0002_cities.sql`. It creates the tables, policies, view, function, trigger and the hourly `collect` cron job.
6. Deploy the function: `supabase functions deploy collect --no-verify-jwt` (or create it in the dashboard from `supabase/functions/collect/` and turn off "Enforce JWT verification").
7. Check: Integrations → Cron shows the `collect` job, and after the next hour its run history shows success. Edge Functions → collect → Logs shows a 200 reply. A `curl -X POST` to the function URL without the header returns 401.

## Acceptance criteria

Checks 1 to 7 run in `tests/tests.js` with `supabase-js` and `fetch` mocked. Checks 8 and 9 are Deno unit tests of `supabase/functions/collect/logic.ts` against the fixtures. Checks 10 to 12 are **[real Supabase]**.

1. In the shell, searching "Par" calls the geocoding URL with `name=Par` and lists each result as "name, region, country" with an "Add" button. A reply with no `results` shows "No places found for "Par".", a rejected `fetch` shows "Can't search right now. Check your connection and try again.", and a 1-letter query makes no request and shows "Type at least 2 letters."
2. Clicking "Add" on a result calls `rpc('follow_city', …)` with that result's id, name, admin1, country, latitude, longitude and timezone. The new card appears with "No readings yet. First reading at 12am/12pm local time.", the count goes from "0 of 10" to "1 of 10", and that result now shows a disabled "Added".
3. A result whose id is already in the list shows a disabled "Added" and can't be added. A mocked `23505` error from `follow_city` shows "<name> is already in your list." and adds no card.
4. With 10 cities loaded, every "Add" is disabled and "You can follow up to 10 cities. Remove one to add another." shows. A mocked `city_limit` error from `follow_city` shows the same message.
5. Clicking "Remove <name>" deletes from `user_cities` filtered by the current user id and that city id. The card disappears and the count goes down. Removing the last city shows "No cities yet. Search for a city to add it." and focus moves to the search input.
6. With mocked `latest_readings` for one city (Open-Meteo day 21.4 °C, MET Norway day 20.6 °C with null feels-like, Open-Meteo night 12.0 °C), the card shows "21°C", "21°C" and "12°C", "–" for MET feels-like, and "No reading yet" for MET night. After `Wx.unit` changes to `F` and the account-change listeners fire, the same entries show "71°F", "69°F" and "54°F", with no new Supabase or `fetch` calls.
7. At a 400px viewport with 10 cities with readings and 10 search results showing, the shell has no horizontal scroll (`scrollWidth <= clientWidth`). The search input has a `<label>`, each Add and Remove button's accessible name includes the place name, and Enter in the search input submits the search.
8. (Deno) `dueSlot` returns: `night` with local date 2026-10-25 for 2026-10-24T22:05Z in Europe/Berlin (00:05 local, still on summer time, the night the clocks go back); `day` with local date 2026-10-25 for 2026-10-25T07:05Z in Asia/Kolkata (12:35 local); `night` for 2026-10-24T19:05Z in Asia/Kathmandu (00:50 local); `day` (catch-up) for 2026-10-25T18:05Z and nothing for 2026-10-25T19:05Z in America/New_York (14:05 and 15:05 local); and `night` with local date 2026-09-06 for 2026-09-06T04:05Z in America/Santiago (01:05 local, a day whose local midnight is skipped by DST).
9. (Deno) Parsing the Open-Meteo fixture and the MET Norway fixture gives rows with the field mapping above (MET `feels_like_c` null, `observed_at` taken from the source's time, MET `raw` without the full timeseries). A MET fixture without `next_1_hours` gives null precipitation and code, and a reply with no temperature throws instead of returning a partial row.
10. **[real Supabase]** Signed in as user A: adding the same city twice fails, an 11th city fails even when inserted straight into `user_cities` through the REST API, selecting `user_cities`, `cities` and `readings` returns only rows for A's own cities (not B's), and inserting into `readings` or `cities` directly is rejected.
11. **[real Supabase]** After the first cron run in a followed city's local 12am or 12pm hour, `readings` holds exactly one row per source for that city, slot and local date. Calling the function again in the same hour adds no rows, and a city that nobody follows any more gets no new rows.
12. **[real Supabase]** A POST to the function without `x-collect-secret`, or with a wrong one, returns 401 and writes nothing. No secret value appears anywhere in the repository (the cron job reads it from Vault by name).

## Decisions (owner, 2026-10-25)

1. Daily min/max: not recorded for now.
2. MET Norway User-Agent contact: the repo URL, `https://github.com/treefinderer/weather`. No email address.
3. Raw JSON: kept as drafted (the full Open-Meteo reply, only the chosen MET entry).
4. Catch-up window: as drafted. Local hours 00–02 count as night and 12–14 as day, and the first successful reading wins.
5. Units follow the °C/°F setting: °C shows km/h and mm, °F shows mph and inches.
6. MET feels-like: left empty (shown as "–"). It is not computed.
7. Readings of cities nobody follows any more are kept indefinitely.
8. The Deno tests (checks 8–9) are run by hand and stay out of `tests/run.sh`, because Deno isn't installed. The QA report records how to run them.

Spec approved by the owner on 2026-10-25.
