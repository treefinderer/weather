# 0003 Weather history views

## Request

> "After login user can see the history for his city in a table format, graph and also you can suggest a few diagrams to display weather changes during selected periods."

## Goal

From any city card, a signed-in user opens that city's weather history for a chosen period and source. It shows as a table, a day/night temperature graph, and a few charts of how the weather changed, all in the user's units.

## Scope

**In**
- A "History" button on each city card that opens the city's history view, plus a way back to the list. The URL hash holds the city, period and source.
- Period picker: last 7 days, last 30 days (the default), last 90 days, last 12 months, and a custom from/to range of the city's local dates.
- Source selector: Average (the default), Open-Meteo, MET Norway.
- A table of daily day/night readings, newest first, split into pages.
- A main graph with day and night temperature lines.
- Extra charts: the owner picks from the candidates under *Extra charts*. The recommended set is marked.
- A chart library (Chart.js 4) loaded from a pinned CDN URL.
- Readable labels for the weather codes (`weather_code`) of both sources.
- Empty, error, loading and removed-city states.

**Out**
- Notifications (0004).
- CSV export (Open question 3).
- Daily min/max or daily precipitation totals. These aren't recorded (0002, Decision 1).
- New database objects. No migration is needed (see *Data loading*).

## Behavior

**Files**
- New `history.js` (an IIFE, loaded after `cities.js`). It uses only `Wx.supabase`, `Wx.user`, `Wx.unit` and `Wx.onAccountChange`.
- `index.html` gets a new `screen-history` section and two script tags: Chart.js before `history.js`, using `https://cdn.jsdelivr.net/npm/chart.js@4.x.y/dist/chart.umd.min.js` with an exact pinned version (the latest 4.x at build time).
- `cities.js` adds the History button to each card. The unit formatters `temp`, `wind`, `rain`, `pct` and `day` move to `common.js` on `Wx` (for example `Wx.fmt`) so cards and history round the same way. Their output doesn't change.
- `style.css` gets the history layout and the chart color tokens on `:root` (for example `--chart-day`, `--chart-night`, `--chart-grid`, `--chart-text`), each with both dark-mode overrides.

**Opening and routing**
- Each card gets a "History" button (`aria-label` "History for <place>"). Activating it sets the hash to `#history/<cityId>/30d/avg`.
- Hash format: `#history/<cityId>/<period>/<source>`.
  - `<period>` is `7d`, `30d`, `90d`, `12m`, or `YYYY-MM-DD..YYYY-MM-DD`.
  - `<source>` is `avg`, `open-meteo` or `met-norway`.
  - A missing or invalid period becomes `30d` and a missing or invalid source becomes `avg`. The fix uses `history.replaceState`, so it adds no history entry.
- The router only handles hashes that start with `#history/`. Supabase auth hashes (`#access_token=…`, the reset flow) and an empty hash keep their 0001/0002 behavior.
- On `hashchange` and on page load after sign-in, a valid history hash shows `screen-history` and hides `screen-shell`. Any other hash shows the city list. This makes browser Back and Forward work, and a reload keeps the view.
- If a signed-out visitor loads a history hash, they get the sign-in screen. After signing in they land on that history view.
- Changing the period or source updates the hash. Header: the city name as `h2` (focused when the view opens), the timezone, and a "Back to cities" button. That button clears the hash, and focus returns to the city's History button.
- Signing out or switching account closes the history view and clears its data.

**Periods (city-local dates)**
- "Today" is the current date in the city's IANA timezone, found with `Intl.DateTimeFormat`.
- Preset N covers `today − (N − 1) days` to `today`, with N = 7, 30, 90 or 365 (`12m`).
- Custom: two `<input type="date">` fields and an "Apply" button. All errors show inline and send no query:
  - Both dates are required.
  - `from` must be on or before `to`.
  - `to` can't be after the city's today.
  - The range can be at most 366 days.

**Data loading**
- First the city: `cities` select `id, name, admin1, country, timezone`, `eq id`, `maybeSingle`. RLS returns the row only if the user follows the city, and its timezone defines "today".
- Then the readings: `readings` select `source, slot, local_date, temperature_c, feels_like_c, humidity_pct, wind_speed_ms, precipitation_mm, weather_code`, with no `raw` and no `observed_at`. Filters: `eq city_id`, `gte local_date from`, `lte local_date to`, order `local_date desc`.
- Both sources are always fetched, so switching the source needs no request.
- Row cap: 12 months is up to 2 sources × 2 slots × 366 days = 1464 rows, which is over the PostgREST default of 1000 rows. Requests are paged with `.range(0, 999)`, then `.range(1000, 1999)`, and so on, until a page comes back with fewer than 1000 rows. Any period allowed here needs at most 2 requests.
- No database view or function is added. The existing `readings_select_followed` policy already limits rows to followed cities, and paging is simpler than a new migration. If a later spec adds one, it must use `security_invoker = true` or RLS.
- Loaded data is kept per (city, period). Changing the unit or source re-renders from memory with no new requests.
- Each load has a sequence number. If the period changes while a load is still running, the older reply is ignored.
- While loading, the view shows "Loading history…" (`role="status"`). The controls stay usable.

**Average of sources**
- The average is worked out per date, slot and field, on the metric values.
- If both sources have a value, the average is their mean. If only one has a value, that value is used. If neither has one, the cell shows "–".
- MET Norway never has feels-like (0002, Decision 6), so the average feels-like is effectively Open-Meteo's.
- Conditions can't be averaged. Average uses the Open-Meteo condition, or MET's if Open-Meteo has none.
- The view states the rule under the selector: "Average of the sources available for each reading."

**Conditions labels** (`Wx.condition(code)` or similar, a pure function)
- Open-Meteo WMO codes:
  - 0 → Clear
  - 1 → Mostly clear
  - 2 → Partly cloudy
  - 3 → Cloudy
  - 45, 48 → Fog
  - 51–57 → Drizzle
  - 61–67 and 80–82 → Rain
  - 71–77 and 85–86 → Snow
  - 95–99 → Thunderstorm
- MET Norway `symbol_code`: first drop the `_day`, `_night` or `_polartwilight` suffix. Then the first matching rule wins:
  1. contains `thunder` → Thunderstorm
  2. contains `sleet` → Sleet
  3. contains `snow` → Snow
  4. contains `rain` → Rain
  5. `fog` → Fog
  6. `partlycloudy` → Partly cloudy
  7. `cloudy` → Cloudy
  8. `fair` → Mostly clear
  9. `clearsky` → Clear
- Null or unknown codes → "–".

**Table**
- One row per local date, from the newest date with any reading in the period back to the oldest such date, newest first.
- A date in that span with no readings still gets a row, and all its cells show "–". If the period has no readings at all, the empty state shows instead (see *States*).
- Columns: Date ("Oct 24"), then Day and Night for Temperature, Feels like, Humidity, Wind, Precipitation and Conditions. A two-level header groups them under Day (12pm) and Night (12am). Missing values show "–".
- Units follow `Wx.unit`: °C, km/h and mm, or °F, mph and in. Rounding is the same as on the cards.
- A note under the table: "Precipitation is the short-term amount at the reading time, not a daily total." 0002 stores Open-Meteo's current amount and MET's next-hour amount.
- Paging: 31 rows per page, with "Newer" and "Older" buttons and "Days 1–31 of 90". A new period or source returns to page 1.
- At 400px the page itself never scrolls sideways. The table sits in its own container (`overflow-x: auto`, `tabindex="0"`, `role="region"`, `aria-label` "History table") with the Date column sticky, so keyboard users can scroll it with the arrow keys.

**Main graph**
- A Chart.js line chart created with `new Chart(canvas, config)` on the global `Chart`. Re-renders destroy the previous instance first.
- `config.data.labels` are the dates oldest first, for the same span as the table.
- Two datasets: "Day (12pm)" and "Night (12am)". Values are temperatures in the user's unit, rounded to 1 decimal, for the selected source. Missing values are `null`, shown as gaps (`spanGaps: false`).
- Settings: `responsive: true`, `maintainAspectRatio: false` in a container about 240px tall, and x-axis ticks auto-skipped, so it fits at 400px.

**Extra charts** (candidates. The recommended set is marked ★)
1. ★ **Day–night spread**: bars, one per date, of the day temperature minus the night temperature (in the user's unit, 1 decimal). The bar is `null` if either value is missing. It shows how much each day warmed up.
2. ★ **Source comparison**: two lines (day and night) of Open-Meteo minus MET Norway temperature per date. A value is `null` unless both sources have one. It ignores the source selector and shows how far the services disagree.
3. ★ **Period averages**: shown only when the period is longer than 31 days. It shows the mean day and the mean night temperature per bucket for the selected source. Buckets are weeks starting Monday when the period is 120 days or less ("Week of Oct 6"), and calendar months when it is longer ("Oct 2026"). Each mean uses only dates with a value. A bucket with none is `null`. It smooths out the long periods.
4. **Precipitation at reading times**: bars of day and night precipitation. Not recommended: the stored value is a short-term amount at 12am/12pm, so a "precipitation total" would misrepresent rainfall. A useful version needs daily totals collected (a future spec).
5. **Temperature calendar heatmap**: not recommended for 0003. Chart.js has no built-in heatmap, so it would need a second library (a plugin) or a hand-built grid.

**Colors, dark mode, accessibility**
- Chart colors come from the CSS tokens, read with `getComputedStyle(document.documentElement)` when a chart is built.
- Charts are rebuilt when the color scheme changes (the `prefers-color-scheme` change event, and the app's other dark-mode override if it changes).
- Day and night use different line styles (solid and dashed) as well as colors, so they can be told apart without color.
- Each chart has an `h3` heading.
- Each canvas has `role="img"` and an `aria-label` summary, for example "Day and night temperature, Sep 28 to Oct 27, Average. Day 12°C to 24°C, night 4°C to 15°C."
- The table is the full text alternative.
- All controls (period radios or select, date inputs, Apply, source select, table paging, Back) work by keyboard in visual order.

**States**
- *No readings in the period*: "No readings in this period. Readings are recorded at 12am and 12pm local time." The table and charts are hidden and no chart is created. Period and source stay usable.
- *Network or Supabase error* (city or readings query): "Couldn't load the history. Check your connection and try again." (`msg-error`), with a "Try again" button that repeats the same load. Earlier data for a different period isn't shown.
- *City not followed*: the city query returns no row (removed in another tab, removed then reloaded, or a hand-edited hash). The view shows "This city is no longer in your list." with only the "Back to cities" button.
- *Chart library failed to load* (`window.Chart` undefined): the charts area shows "Charts are unavailable right now." The table works as normal.
- *Slow reply*: the loading status stays until the reply arrives. There is no separate timeout beyond the supabase-js defaults.

## Acceptance criteria

Checks 1–11 run in `tests/tests.js` with `supabase-js` mocked, the clock fixed, and `window.Chart` replaced by a stub that records each `config` and `destroy()` call. Check 12 is **[real Supabase]**. Checks 9–10 apply only to the charts the owner includes.

1. Each city card has a "History for <place>" button. Activating it sets the hash to `#history/<id>/30d/avg`, shows `screen-history` with the city name heading focused, and hides the list. "Back to cities" (and a `hashchange` to an empty hash) shows the list again, with focus on that card's History button.
2. With the clock at 2026-10-27 12:00 UTC and city timezone `Pacific/Auckland` (local date Oct 28), loading `#history/<id>/7d/met-norway` queries `readings` with `eq city_id <id>`, `gte local_date 2026-10-22`, `lte local_date 2026-10-28`, and shows MET Norway selected. `#history/<id>/bogus/xyz` is replaced by `#history/<id>/30d/avg`.
3. For `12m`, a mock that returns 1000 rows and then 464 rows gets exactly two requests (`range(0, 999)` and `range(1000, 1999)`), and the table counts dates from all 1464 rows. The select string doesn't include `raw`.
4. With mocked rows for Oct 27 (both sources, both slots), Oct 26 (day only) and Oct 25 (none), plus Oct 24 (night only), the table rows read Oct 27, Oct 26, Oct 25, Oct 24 in that order. Oct 26's night cells and every Oct 25 cell show "–", and values show in °C, km/h and mm.
5. Average: day temperature Open-Meteo 20.0 and MET 22.0 shows "21°C". Open-Meteo 18.0 with MET missing shows "18°C". Feels-like Open-Meteo 17.0 with MET null shows "17°C". Conditions Open-Meteo "3" with MET "rain" shows "Cloudy".
6. Condition labels: "0" → "Clear", "63" → "Rain", "lightrainshowers_day" → "Rain", "partlycloudy_night" → "Partly cloudy", "999" → "–", null → "–".
7. After `Wx.unit` changes to `F` and the account-change listeners fire, the table shows °F, mph and in, and the main chart is destroyed and rebuilt with Fahrenheit values. Switching the source to Open-Meteo also rebuilds the chart with that source's values. Neither change makes a Supabase call.
8. The main chart config has labels oldest first, datasets labelled "Day (12pm)" and "Night (12am)" with `null` where a reading is missing, and border colors equal to the computed `--chart-day` and `--chart-night` values. The canvas has `role="img"` and an `aria-label` that contains the period's first and last dates.
9. (If charts 1 and 2 are included) For a date with day 20 °C and night 12 °C, the spread dataset value is 8. For a date with Open-Meteo day 20.0 and MET day 21.5, the source comparison day value is −1.5. A date missing either value gives `null` in both charts.
10. (If chart 3 is included) The 7d and 30d periods create no averages chart. A 12m period creates one with one label per calendar month in the range, and each month's day value is the mean of that month's non-missing day temperatures.
11. States:
    - With no readings, "No readings in this period." shows and no `Chart` is constructed.
    - A readings error shows "Couldn't load the history." and "Try again", and pressing it repeats the query.
    - A city query that returns no row shows "This city is no longer in your list."
    - With `window.Chart` undefined, the table still renders and "Charts are unavailable right now." shows.
    - Custom range: `from` after `to`, or a range over 366 days, shows an inline error and makes no query. A valid range of 2026-09-01 to 2026-09-30 sets the hash to `#history/<id>/2026-09-01..2026-09-30/avg`.
12. **[real Supabase]** Signed in as user A, querying `readings` for a city that only user B follows returns 0 rows. A 12-month load for a followed city with collected data returns every row across both pages, with no duplicates.

## Decisions (owner, 2026-10-27)

1. Extra charts: only **period averages** (weekly up to 120 days, monthly beyond, shown only for periods over 31 days). The day–night spread, source comparison, precipitation and heatmap charts are **not** included. Acceptance check 9 is dropped, and check 10 applies.
2. Average of sources: when only one source has a value, use that value (as drafted).
3. CSV export: not in 0003. It may come in a later spec.
4. Defaults as drafted: Average is the default source, the table scrolls inside its own box on phones with a sticky Date column, custom ranges are at most 366 days, and the chart library is Chart.js 4 (UMD from jsDelivr, pinned exact version).

Spec approved by the owner on 2026-10-27.
