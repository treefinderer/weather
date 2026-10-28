# Supabase setup

`migrations/` holds the SQL schema and RLS policies, run in number order. `functions/` holds the Edge Functions.
No secret value belongs in this repository: secrets live only in Supabase Vault and Edge Function secrets.

## Spec 0002: cities and twice-daily collection (owner checklist)

**Before you start:** `migrations/0001_profiles.sql` (spec 0001) must already be applied. The 0002 migration
depends on it.

Do these once, after the 0002 branch is merged, in the Supabase dashboard for the project. Every step works in the
dashboard. The Supabase CLI is needed only if the dashboard editor in step 6 won't let you add the second file
(the CLI route is given there).

Replace `<project-ref>` with your project's ref, the part before `.supabase.co` in the project URL
(Project Settings → General, or the `supabaseUrl` in `config.js`).

### 1. Enable pg_cron and pg_net

Database → Extensions. Search `pg_cron` and switch it on (keep the suggested schema). Search `pg_net` and switch it
on (schema `extensions`). The migration also runs `create extension if not exists` for both, so this is a safety
step.

### 2. Generate the collector secret

In Terminal on your Mac:

```sh
openssl rand -hex 32
```

Copy the 64-character output. You paste it in steps 3 and 4, and nowhere else. Don't save it in any file in the repo.

### 3. Edge Function secret

Edge Functions → Secrets (on some dashboards: Project Settings → Edge Functions → Secrets). Add:

- Name: `COLLECT_SECRET`
- Value: the secret from step 2

Save.

### 4. Vault entries

SQL Editor → New query. Paste this, replace the two placeholders with your real values, and click Run:

```sql
select vault.create_secret('<secret from step 2>', 'collect_secret');
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
```

The URL has no trailing slash. Then clear the editor (don't save this query, because it holds the secret).
Check that both exist (this shows names only):

```sql
select name from vault.secrets where name in ('collect_secret', 'project_url');
```

To change a value later: `select vault.update_secret(id, '<new value>') from vault.secrets where name = 'collect_secret';`

### 5. Run the migration

SQL Editor → New query. Paste the whole contents of `supabase/migrations/0002_cities_readings.sql` and click Run.
It creates the `cities`, `user_cities` and `readings` tables, their RLS policies, the `latest_readings` view, the
`follow_city` function, the 10-city trigger, and the hourly `collect` cron job (its own marked section at the end
of the file). It succeeds even if the function isn't deployed yet: cron calls just fail until step 6 is done.

### 6. Deploy the collect function

**Dashboard:** Edge Functions → Deploy a new function → Via Editor.

1. Name it `collect` (exactly, because the cron job calls `/functions/v1/collect`).
2. Replace the sample `index.ts` with the contents of `supabase/functions/collect/index.ts`.
3. Add a file named `logic.ts` next to it (the "+" / Add file button in the editor's file list) with the contents of
   `supabase/functions/collect/logic.ts`. Leave out `logic_test.ts` and `fixtures/`. They're only for the tests.
4. Click Deploy function.
5. Open the function → Details (or Settings). Turn **off** "Enforce JWT verification" (it may read "Verify JWT
   with legacy secret") and save. The function checks `x-collect-secret` itself. With JWT verification on, every
   cron call is rejected.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided to the function by Supabase automatically. Don't add them.

**CLI (only if the editor can't add `logic.ts`):** from the repo folder in Terminal:

```sh
npx supabase login
npx supabase functions deploy collect --no-verify-jwt --project-ref <project-ref> --use-api
```

`--use-api` bundles on Supabase's side, so Docker isn't needed.

### 7. Check it works

1. **Rejects without the secret** (should print `HTTP/2 401`):
   ```sh
   curl -s -o /dev/null -w 'HTTP/2 %{http_code}\n' -X POST https://<project-ref>.supabase.co/functions/v1/collect
   ```
   And with a wrong secret (also 401):
   ```sh
   curl -s -o /dev/null -w 'HTTP/2 %{http_code}\n' -X POST -H 'x-collect-secret: wrong' https://<project-ref>.supabase.co/functions/v1/collect
   ```
2. **Runs with the secret.** Paste the secret only into your terminal, not into a file. A secret typed into a
   command ends up in your shell history, so read it from a hidden prompt instead (paste it, press Return):
   ```sh
   read -s COLLECT_SECRET
   curl -s -X POST -H "x-collect-secret: $COLLECT_SECRET" https://<project-ref>.supabase.co/functions/v1/collect
   unset COLLECT_SECRET
   ```
   (Or type the secret inline but start the line with a space. Bash skips such lines when `HISTCONTROL=ignorespace`
   is set; in zsh, the macOS default, run `setopt HIST_IGNORE_SPACE` first.)
   It prints something like `{"due":0,"inserted":0,"skipped":0,"failed":[]}`. `due` counts (city, source) pairs whose
   local 12am or 12pm window is open right now. It is 0 when no followed city is in its window.
3. **Cron job.** Integrations → Cron (or Database → Cron Jobs) lists `collect` with schedule `5 * * * *`. After the next
   minute 5 of an hour, its history shows a succeeded run. In SQL:
   ```sql
   select status, return_message, start_time from cron.job_run_details
   where jobid = (select jobid from cron.job where jobname = 'collect')
   order by start_time desc limit 5;

   -- The function's replies to the cron calls (pg_net keeps them for a few hours):
   select status_code, content, created from net._http_response order by created desc limit 5;
   ```
4. **Function logs.** Edge Functions → collect → Logs (or Invocations) shows 200 replies at minute 5 of each hour.
5. **Readings.** After a followed city's local 12am or 12pm hour:
   ```sql
   select c.name, r.source, r.slot, r.local_date, r.temperature_c, r.observed_at, r.fetched_at
   from readings r join cities c on c.id = r.city_id
   order by r.fetched_at desc limit 20;
   ```
   Each city, slot and local date has at most one row per source.

### Collector unit tests (run by hand)

They need [Deno](https://deno.com) (`brew install deno`) and aren't part of `tests/run.sh`:

```sh
deno test --allow-read supabase/functions/collect/logic_test.ts
```

## Spec 0004: email notifications (owner checklist)

**Before you start:** the 0001 and 0002 migrations must be applied, and the 0002 Vault entries `project_url` and
`collect_secret` and the Edge Function secret `COLLECT_SECRET` must exist. The notify cron job reuses them.

Do these once, after the 0004 branch is merged. Everything works in the browser: the Resend website and the
Supabase dashboard. No Terminal is needed except for the optional curl checks in step 8. Replace `<project-ref>` as
in the 0002 steps.

### 1. Resend account and API key

1. Go to https://resend.com and sign up with **your own email address** (the one you sign in to the Weather app
   with). Until a domain is added (step 9), Resend delivers only to this address.
2. Confirm the address from the email Resend sends.
3. In Resend: **API Keys → Create API Key**. Name it `weather-notify`, permission **Sending access**, domain
   **All domains**. Click Add.
4. Copy the key (it starts with `re_`). Resend shows it only once. You paste it in step 3 and nowhere else. Don't
   save it in any file in the repo.

### 2. Generate the unsubscribe secret

Supabase → SQL Editor → New query. Paste this and click Run:

```sql
select encode(extensions.gen_random_bytes(32), 'hex') as unsubscribe_secret;
```

Copy the 64-character result. You paste it in step 3. Then clear the editor (don't save this query).
Changing this secret later makes every unsubscribe link already sent stop working, so set it once.

### 3. Edge Function secrets

Edge Functions → Secrets (on some dashboards: Project Settings → Edge Functions → Secrets). Add each one and save:

| Name | Value | Needed |
|---|---|---|
| `RESEND_API_KEY` | the `re_…` key from step 1 | yes |
| `UNSUBSCRIBE_SECRET` | the secret from step 2 | yes |
| `EMAIL_FROM` | `Weather <onboarding@resend.dev>` (the default; change it in step 9) | no |
| `APP_URL` | `https://treefinderer.github.io/weather/` (the default) | no |
| `NOTIFY_DAILY_CAP` | `100` (the default: emails per 24 hours, Resend's free tier) | no |

`COLLECT_SECRET` already exists from 0002. Don't add it again. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
provided automatically.

### 4. Vault allowlist

SQL Editor → New query. Replace the placeholder with your own email address and click Run:

```sql
select vault.create_secret('<your email address>', 'notify_allowlist');
```

Only addresses on this list get emails and see the Notifications controls in Settings. Everyone else sees "Email
notifications aren't available for your account yet". A missing or empty entry allows nobody. Several addresses
are separated by commas (`a@example.com, b@example.com`); case doesn't matter.

To change it later:

```sql
select vault.update_secret(id, '<new list>') from vault.secrets where name = 'notify_allowlist';
```

### 5. Run the migration

SQL Editor → New query. Paste the whole contents of `supabase/migrations/0003_notifications.sql` and click Run.
It creates the `notification_settings`, `alert_rules` and `notification_log` tables with their RLS policies, the
20-alert trigger, the `notify_allowed()` check used by Settings, the helper functions the notify function calls, and
the hourly `notify` cron job (its own marked section at the end of the file). It succeeds before the functions are
deployed: cron calls just fail until step 6 is done.

### 6. Deploy the notify function

Edge Functions → Deploy a new function → Via Editor.

1. Name it `notify` (exactly, because the cron job calls `/functions/v1/notify`).
2. Replace the sample `index.ts` with the contents of `supabase/functions/notify/index.ts`.
3. Add a file named `logic.ts` next to it with the contents of `supabase/functions/notify/logic.ts`. Leave out
   `logic_test.ts` and `fixtures/`.
4. Click Deploy function.
5. Open the function → Details (or Settings). Turn **off** "Enforce JWT verification" and save. The function checks
   `x-collect-secret` itself.

### 7. Deploy the unsubscribe function

Edge Functions → Deploy a new function → Via Editor.

1. Name it `unsubscribe` (exactly, because the app and the email headers call `/functions/v1/unsubscribe`).
2. Replace the sample `index.ts` with the contents of `supabase/functions/unsubscribe/index.ts`. It is a single file.
3. Click Deploy function.
4. Turn **off** "Enforce JWT verification" and save. The function is public on purpose: it acts only on a POST with
   a validly signed token, and its replies contain no user data.

**CLI alternative** (only if the editor won't work), from the repo folder:

```sh
npx supabase functions deploy notify --no-verify-jwt --project-ref <project-ref> --use-api
npx supabase functions deploy unsubscribe --no-verify-jwt --project-ref <project-ref> --use-api
```

### 8. Check it works

1. **Cron job.** In SQL:
   ```sql
   select jobname, schedule from cron.job where jobname in ('collect', 'notify');
   ```
   It lists `notify` with `20 * * * *`.
2. **Allowlist.** Sign in to the app with your address → Settings. "Email notifications" shows its controls, not the
   "aren't available" notice.
3. **First email.** In Settings, turn on "Send me email notifications" and "Daily digest", set the send time to the
   current hour, keep your timezone, and click Save notifications. Then run the function by hand, either:
   - **SQL Editor** (no Terminal), which makes the same call as the cron job:
     ```sql
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notify',
       headers := jsonb_build_object('Content-Type', 'application/json',
         'x-collect-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collect_secret')),
       body := '{}'::jsonb, timeout_milliseconds := 120000);
     ```
     A few seconds later, read the reply:
     ```sql
     select status_code, content, created from net._http_response order by created desc limit 1;
     ```
   - or **Terminal**, as in the 0002 checks (`read -s COLLECT_SECRET`, then
     `curl -s -X POST -H "x-collect-secret: $COLLECT_SECRET" https://<project-ref>.supabase.co/functions/v1/notify`).

   The reply looks like `{"due":1,"sent":1,"failed":0,"skipped":0,"deferred":0}`, and the digest arrives in your
   inbox (check the spam folder the first time).
4. **No second send.** Run it again. The reply shows `"sent":0`, and the log has one `sent` row:
   ```sql
   select kind, period_key, status, attempts, last_error, sent_at from notification_log order by created_at desc limit 5;
   ```
5. **Rejects without the secret** (prints `HTTP/2 401`):
   ```sh
   curl -s -o /dev/null -w 'HTTP/2 %{http_code}\n' -X POST https://<project-ref>.supabase.co/functions/v1/notify
   ```
6. **Unsubscribe.** Click Unsubscribe in the email. The app says "Email notifications are off." Then:
   ```sql
   select enabled from notification_settings;
   ```
   shows `false`. Turn notifications on again in Settings if you want to keep getting emails.
7. **Logs.** Edge Functions → notify → Logs shows a 200 at minute 20 of each hour. A failed send is logged with
   its reason (for example Resend's 403 for an address that isn't yours while there is no domain), and the log row
   has `status = 'failed'` with `last_error`.

### 9. Later: add a domain

When you want to email other users:

1. Resend → **Domains → Add Domain**. Enter a domain you own (a subdomain such as `mail.example.com` is fine).
2. Add the DNS records Resend lists (SPF/MX and DKIM `TXT` records) at your domain's DNS provider. Wait until Resend
   shows the domain as **Verified**.
3. Supabase → Edge Functions → Secrets: set `EMAIL_FROM` to an address on that domain, for example
   `Weather <weather@mail.example.com>`. No code change or redeploy is needed.
4. Open the allowlist to everyone:
   ```sql
   select vault.update_secret(id, '*') from vault.secrets where name = 'notify_allowlist';
   ```
5. Optionally raise `NOTIFY_DAILY_CAP` if your Resend plan allows more than 100 emails a day.

### Notify unit tests (run by hand)

They need [Deno](https://deno.com) (`brew install deno`) and aren't part of `tests/run.sh`:

```sh
deno test --allow-read supabase/functions/notify/logic_test.ts
```
