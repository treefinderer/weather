# 0004 Email notifications

## Request

> "There should be also an option to enable email notifications with the daily weather readings, weekly readings or in case weather is within or outside certain ranges."

Fixed decisions (owner, 2026-10-28):
- Mail goes out through Resend's HTTP API from a Supabase Edge Function.
- `RESEND_API_KEY` exists only as a Supabase secret.
- There is no verified domain yet, so Resend delivers only to the owner's own address until a domain is added.
- The sender address can be changed without a code change.
- Units follow the user's °C/°F setting.
- Emailed values follow 0003's Average rule: when only one source has a value, use that value.

## Goal

Signed-in users can opt in to emails with their cities' weather: a daily digest, a weekly summary, and alerts when a reading is inside or outside a range they set. Every email has a link that turns notifications off without signing in.

## Scope

In:
- A **Notifications** section in Settings, off by default, with:
  - a master switch
  - send time and timezone
  - a daily digest
  - a weekly digest with a day of the week
  - the cities included in digests
  - range alerts (add, list, delete)
- A new migration `supabase/migrations/0003_notifications.sql` with:
  - notification settings
  - alert rules and their limit
  - a sent-log
  - the allowlist check
  - the cron job
- A new Edge Function `supabase/functions/notify/` that builds and sends emails. Its pure logic lives in `logic.ts`, with Deno tests next to it.
- A small public Edge Function `supabase/functions/unsubscribe/`.
- An unsubscribe landing state in the app, `?unsubscribe=<token>`.
- A new `notifications.js` IIFE that shares only through `window.Wx`, plus markup in `index.html` and styles in `style.css`.

Out:
- SMS or push notifications.
- CSV export.
- Changing the address mail goes to (it is always the account email).
- Editing an alert in place (delete it and add it again).
- A per-alert quiet period (see Open questions).
- Email preview in the app.
- Bounce or complaint webhooks from Resend.

## Behavior

### Settings: Notifications section

The section sits below "Temperature unit", headed "Email notifications". Before it shows its controls, it checks `notify_allowed()` (see "No verified domain" below). If the user isn't allowed, the section shows only this notice: "Email notifications aren't available for your account yet. While the app is in testing, emails can only go to approved addresses." Every control is disabled.

Controls, in order:
1. **"Send me email notifications"**: a checkbox, off by default. When it is off, the controls below stay visible but disabled, and nothing is sent. Turning it off keeps the alert rules.
2. **Send time** (a select from 00:00 to 23:00, default 07:00) and **Timezone** (a select of IANA names from `Intl.supportedValuesOf('timeZone')`). Timezone defaults to the browser's on first save. If a stored timezone differs from the device's, a hint says so and offers "Use this device's timezone". The send time applies to both digests.
3. **Daily digest**: a checkbox.
4. **Weekly digest**: a checkbox, plus a day-of-week select (Monday to Sunday, default Monday).
5. **Cities in digests**: one checkbox per followed city, in the order of the city list. All are checked by default. Storing `null` means "all followed cities", so cities added later are included. If all are unchecked while a digest is on, saving is blocked with "Choose at least one city for your digests."
6. A **Save notifications** button saves items 1–5 in one upsert. A status line (`aria-live="polite"`) shows "Saved." or "Couldn't save. Check your connection and try again." On error the form keeps its values.
7. **Range alerts** (see below). Alerts save on their own, when added or deleted.

If the user follows no cities, items 5 and 7 show "Add a city first to choose digest cities and alerts." Their controls are hidden.

### Range alerts

The add form has these fields:
- **City**: the followed cities.
- **Measure**: Temperature, Feels like, Wind, Precipitation or Humidity.
- **When**: "outside the range" (default) or "inside the range".
- **Reading**: Day (12pm), Night (12am) or Both (default).
- **Min** and **Max**: number inputs, each labeled with the unit (°C/°F, km/h/mph, mm/in, %).
- An **Add alert** button.

Validation runs on submit and shows an inline error next to the field. Nothing is sent to the server while there are errors.
- Min and Max are both required numbers, and Min must be less than Max: "Min must be less than Max."
- Allowed ranges, checked in the user's units after conversion:

  | Measure | Allowed range |
  |---|---|
  | Temperature | −90 to 60 °C (−130 to 140 °F) |
  | Feels like | −100 to 70 °C (−148 to 158 °F) |
  | Wind | 0 to 360 km/h (0 to 224 mph) |
  | Precipitation | 0 to 500 mm (0 to 19.7 in) |
  | Humidity | 0 to 100 % |

**Storage is metric**, matching `readings`: °C, m/s, mm and %.
- Conversions: °F→°C `(f−32)×5/9`, km/h→m/s `÷3.6`, mph→m/s `×0.44704`, in→mm `×25.4`.
- Stored values keep full precision. Displayed values are converted back and rounded to 1 decimal place (2 for inches), so a value entered with up to that many decimals shows unchanged.
- Changing °C/°F redraws the alert list in the new units. Stored values don't change.

**Limit: 20 alerts per user** (proposed, see Open questions). This applies:
- Client side: once the user has 20, the Add button is disabled and the form shows "You can have up to 20 alerts. Delete one to add another."
- Server side: a trigger enforces it. Its `alert_limit` error shows the same message.

**List:** each alert shows on one line that wraps on phones, for example "Lisbon · Temperature outside 0.0–30.0 °C · Both". Each has a **Delete** button with an accessible name that includes the city and measure. Deleting asks for no confirmation. Focus moves to the next alert's Delete button, or to the Add form when none are left.

**Unfollowing a city deletes its alerts** through the cascade. Its id stays in the stored digest city list but is ignored when sending.

### When alerts fire

- An alert is checked against the **Average** value for its city, local date and slot, per 0003's rule. If no source has the value (for example feels-like with only MET), the alert doesn't fire.
- Inside means `min ≤ v ≤ max`. Outside means `v < min` or `v > max`.
- **Settled slot:** a slot is checked only once it is final. That means both sources have a row, or the 0002 catch-up window for that slot has ended in the city's timezone (local hour 3 or later for night, 15 or later for day). This way a late second source can't change a value that was already emailed.
- **Only new readings:** a slot is checked against an alert only if its newest reading was fetched after the alert was created. A new alert therefore doesn't fire for old data. Slots fetched more than 48 hours ago are never checked.
- **De-duplication (per Decision 5):** each alert has one sent-log row per city-local day, `kind = 'alert'`, `period_key = '<alert_id>|<city_id>|<local_date>'`. An alert therefore emails at most once a day: if night and day both match, only the first (night) sends. Alerts that match the same city, date and slot still go out together in one email.

### When digests send

Each user's send time is computed in **their stored timezone** (`notification_settings.timezone`), because cities have different timezones.
- **Daily:** due when the user's local date has no daily sent-log row (`period_key` = that local date, `YYYY-MM-DD`) and the local hour is between `send_hour` and `send_hour + 2`. The 3-hour catch-up window covers missed runs and DST changes. After it closes, that day is skipped.
- **Weekly:** works the same way on the chosen ISO weekday (1 = Monday). `period_key` is the send date.
- **Daily content:** for each digest city, the city name (escaped), country, and the newest settled Day and Night reading from the last 36 hours, each with its local date. Each reading shows:
  - temperature
  - feels like
  - wind
  - precipitation
  - humidity
  - the condition, written out from weather_code

  A city with no reading in that window shows "No readings in the last day." If none of the digest cities is still followed, nothing is sent and the log row is marked `skipped`.
- **Weekly content:** for each digest city, the 7 city-local dates before the send date (D−7 to D−1) give a Day row and a Night row, each with min, max and average temperature, plus "n of 7 days". A slot with no readings shows "No readings".
- **Formats:** values follow the user's unit setting at send time, as in the app:
  - temperatures to 1 decimal with °C/°F
  - wind in km/h or mph to 1 decimal
  - precipitation in mm (1 decimal) or in (2 decimals)
  - humidity as a whole %
  - a missing value as "–"

### Email content

- Every email has an HTML part (simple inline styles, one column, readable without images) and a plain-text part with the same content.
- City names and every other stored text are HTML-escaped (`& < > " '`). Control characters and newlines are removed from the subject.
- Subjects:
  - "Weather: daily digest, 28 Oct"
  - "Weather: week of 21–27 Oct"
  - "Weather alert: Lisbon, temperature 31.2 °C"
- Each email has a link to the app (`APP_URL`, default `https://treefinderer.github.io/weather/`).
- The footer says "You get this because email notifications are on in Settings." It is followed by a link to the app (`APP_URL`) and an **Unsubscribe** link.
- The headers include `List-Unsubscribe: <unsubscribe function URL?t=TOKEN>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.

### Unsubscribe

**Token:**
- Format: `<unsub_id>.<base64url(HMAC-SHA256(UNSUBSCRIBE_SECRET, "unsub:" + unsub_id))>`.
- `unsub_id` is a random UUID per user, stored in `notification_settings` and separate from the user id. The token therefore holds no email address, user id or city.
- The function recomputes the HMAC and compares it in constant time. Only then does it look up the row by `unsub_id` (service role) and set `enabled = false`.

**The link in the email** opens `APP_URL?unsubscribe=<token>`. The app sees the parameter before any sign-in check, POSTs the token to the `unsubscribe` function and shows the result:
- **Valid token** (also when notifications were already off, or the account no longer exists): "Email notifications are off. You can turn them on again in Settings."
- **Bad or tampered token:** "This unsubscribe link isn't valid. Sign in and turn notifications off in Settings."
- **Network error:** "Couldn't reach the server. Try the link again." with a Try again button.

The app then removes the parameter from the address bar.

**Why not GET:** Supabase serves Edge Function HTML as plain text, and mail scanners follow GET links. The function therefore acts only on **POST**, either from the app or from a mail client's one-click `List-Unsubscribe-Post`. CORS allows only the app's origin. The function's replies contain no user data.

### Delivery: the `notify` function (recommended over extending `collect`)

**Why a separate function:**
- An email outage or a slow Resend call can't delay or break the readings.
- `collect` already does a lot of work inside a 120 s cron timeout.
- `notify` can be deployed, run by hand and retried on its own.
- Running at minute 20 gives that hour's readings 15 minutes to land. Alerts arrive at most about 15 minutes later than they would inside `collect`.

**How it runs:**
- pg_cron job `notify` at `20 * * * *`, using the same pattern as 0002. The URL comes from Vault `project_url`. The header is `x-collect-secret` from Vault `collect_secret`, checked against the existing `COLLECT_SECRET` in constant time. This adds no new cron secret.
- Deploy with JWT verification off. Any other caller gets 401.

**Each run:**
1. Read the settings rows where `enabled` is on, and keep the users that pass the allowlist.
2. Work out the due digests and fired alerts.
3. For each due email, **claim** it: insert its sent-log row as `pending` (on conflict do nothing). Then take a lease with a conditional update that sets `claimed_at = now()` and `attempts = attempts + 1`, where the status is `pending` or `failed`, `attempts < 5`, and the row is unclaimed or claimed more than 10 minutes ago. Only the run that gets the row back sends it, so overlapping runs never send twice.
4. Send through `POST https://api.resend.com/emails`:
   - `from`: `EMAIL_FROM`, default `Weather <onboarding@resend.dev>`
   - `to`: the account email
   - `Idempotency-Key: wx-<log ids joined by '-'>` (`wx-<id>` for a single row), so a crash between sending and marking the row is caught by Resend
5. On success, mark the row `sent` with `resend_id` and `sent_at`.
6. On failure:
   - a 5xx, a timeout or a 429 marks the row `failed` with `last_error`, and the next run retries it
   - other 4xx replies (for example a recipient that isn't allowed without a domain) mark it `failed` with `attempts = 5`, so it isn't retried
   - a row older than 24 hours is never retried

**Rate limits (Resend free tier):**
- Emails are sent one after another, at least 600 ms apart (under 2 per second).
- At most 40 per run.
- A run stops sending once the log shows 100 `sent` rows in the past 24 hours (`NOTIFY_DAILY_CAP` secret, default 100), or after any 429. The rest wait for the next run.

**Reply:** the function returns JSON counts `{due, sent, failed, skipped, deferred}`, with no addresses.

### No verified domain: allowlist

- Vault entry `notify_allowlist` holds comma-separated emails (case-insensitive) or `*` for everyone. **A missing or empty entry allows nobody**, so the feature fails closed.
- `public.notify_allowed()` is a security definer function that returns a boolean for the caller's account email. It is granted to `authenticated` only. Settings uses it to show the notice above, and `notify` applies the same check.
- Until a domain is verified, the entry holds only the owner's address. Other users see the notice instead of controls that silently do nothing.
- After the domain is added, the owner sets the entry to `*`.

### Schema (`0003_notifications.sql`)

**Tables:**
- `notification_settings`:
  - `user_id` pk → auth.users, cascade
  - `enabled` bool, default false
  - `timezone` text, validated like `cities.timezone`
  - `send_hour` smallint 0–23, default 7
  - `daily` bool, default false
  - `weekly` bool, default false
  - `weekly_day` smallint 1–7, default 1
  - `digest_city_ids` bigint[], null = all
  - `unsub_id` uuid unique, default `gen_random_uuid()`
  - `updated_at`
- `alert_rules`:
  - `id` identity
  - `user_id`, `city_id`, with FK `(user_id, city_id)` → `user_cities` on delete cascade
  - `metric` in (`temperature`, `feels_like`, `wind`, `precipitation`, `humidity`)
  - `condition` in (`inside`, `outside`)
  - `slot` in (`day`, `night`, `both`)
  - `min_value`, `max_value` double, with check `min_value < max_value`
  - `created_at`
  - a 20-per-user limit trigger with an advisory lock, as in 0002
- `notification_log`:
  - `id`, `user_id` → auth.users, cascade
  - `kind` in (`daily`, `weekly`, `alert`)
  - `period_key` text
  - `alert_ids` bigint[]
  - `status` in (`pending`, `sent`, `failed`, `skipped`)
  - `attempts`, `last_error`, `resend_id`, `claimed_at`, `created_at`, `sent_at`
  - **unique `(user_id, kind, period_key)`**

**RLS:**
- RLS is on for all three tables, and `anon` is revoked.
- Settings: select, insert and update own (`auth.uid() = user_id`). Users can't set or change `unsub_id`: that column is not granted for update or insert.
- Alert rules: select, insert and delete own, and no update.
- Log: select own only. Only the service role writes it.

**Cron:** the `notify` cron job is at the end of the file. Re-running the file replaces the job.

### Edge cases

- **Phone width (about 400px):** the alert form stacks one field per row, and alert lines wrap. There is no sideways scroll.
- **Keyboard only:** every control can be reached with Tab and has a visible focus ring and a label. Min and Max are tied to their errors with `aria-describedby`.
- **Dark mode:** only existing color tokens are used. Emails use fixed light colors, because email clients ignore the app's CSS.
- **Slow or empty replies:** the section shows "Loading notification settings…" until settings, the allowlist check and alerts have loaded. If any of them fails, it shows an error with Try again, and the controls stay disabled. If no settings row exists, the defaults show and the first save creates the row.
- **Unknown or invalid stored timezone:** the select falls back to the device's timezone, with a hint. `notify` skips that user and logs it.

### Owner setup checklist

1. Create a Resend account with the owner's email, and create an API key with "Sending access".
2. Set the Supabase secrets:
   - `RESEND_API_KEY`
   - `UNSUBSCRIBE_SECRET` (32+ random bytes)
   - optionally `EMAIL_FROM`, `APP_URL` and `NOTIFY_DAILY_CAP`

   `COLLECT_SECRET` already exists.
3. In Vault, create `notify_allowlist` with the owner's email.
4. Run `0003_notifications.sql`. This also schedules the cron job.
5. Deploy `notify` and `unsubscribe` with JWT verification off.
6. Check `cron.job` for `notify`, and run the function once by hand with the secret header.
7. Later: add and verify a domain in Resend (DNS records), set `EMAIL_FROM` to an address on it, and set `notify_allowlist` to `*`.

## Acceptance criteria

UI checks, in `tests/tests.js` with supabase-js mocked:
1. For a new user, the Notifications switch is off, the controls below it are disabled, and Save sends one upsert with `enabled`, `send_hour`, `timezone`, `daily`, `weekly`, `weekly_day` and `digest_city_ids`, after which the status reads "Saved.".
2. When `notify_allowed()` returns false, the section shows only the "aren't available for your account yet" notice, and no control can be changed.
3. Adding an alert with Min ≥ Max, an empty field, or humidity 120 shows an inline error and makes no insert call.
4. With °F set, an alert entered as 86–104 °F is inserted as 30–40 °C, 36 km/h is stored as 10 m/s, and 1 in is stored as 25.4 mm. After switching to °C, the list shows "30.0–40.0 °C".
5. With 20 alerts, Add is disabled and the limit message shows. A server `alert_limit` error shows the same message.
6. A failed save shows "Couldn't save…" and keeps the entered values. At 400px the Settings screen has no sideways scroll, and an alert can be added and deleted using only the keyboard.
7. Opening the app with `?unsubscribe=<token>` POSTs the token and shows "Email notifications are off…" without sign-in. A rejected token shows "This unsubscribe link isn't valid…".

Deno unit tests of `notify/logic.ts`, run by hand as in 0002:

8. The send-window function returns due for local hours `send_hour` to `send_hour + 2` and not-due outside them, with the user's timezone, across a DST change, and for the weekly day only on the chosen weekday.
9. Digest building uses the Average rule, converts to the user's units, shows "–" for missing values, and HTML-escapes a city named `<b>"A&B"</b>` in the HTML part while the text part stays readable.
10. Alert matching treats the bounds as inclusive for inside, fires nothing for a null value, an unsettled slot, a slot of the other type, or a reading fetched before the alert was created, and produces the key `<alert_id>|<city_id>|<local_date>`. When night and day both match, only night is kept.
11. Unsubscribe tokens verify when signed with the right secret, and fail when any character is changed or a different secret is used.

[real Supabase / Resend]:

12. With the owner allowlisted and a daily digest due, one email arrives at the owner's address. Running `notify` again by hand sends nothing new (one `sent` log row). Its Unsubscribe link sets `enabled = false`. A second test user can't read the owner's settings, alerts or log rows.

## Decisions (owner, 2026-10-28)

1. Defaults: the daily digest goes at 07:00 in the user's timezone, and the weekly digest goes on Monday. Users can change both.
2. Weekly digest default day: Monday.
3. Alert limit: 20 per user.
4. Allowlist: the Vault entry `notify_allowlist` fails closed (only the owner's address for now). Users not on the list see the "not available yet" notice in Settings.
5. **Quiet period: each alert emails at most once per city-local day.** If both the 12am and 12pm readings match, only the first sends. The alert de-duplication key is therefore `<alert_id>|<city_id>|<local_date>`, not per slot. Several alerts matching on the same day can still be combined into one email. Acceptance check 10 is read with this key.
6. Unsubscribe: notifications turn off as soon as the app page posts the token. There is no confirmation step.

Spec approved by the owner on 2026-10-28.
