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
