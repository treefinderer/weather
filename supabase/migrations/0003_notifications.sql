-- 0003 email notifications: per-user settings, range alerts, the sent-log, the allowlist check and the hourly
-- notify schedule (spec 0004). Run after 0001 and 0002, and after the Vault entry `notify_allowlist` exists
-- (supabase/README.md). This file holds no secret: the allowlist and the cron secret are read from Vault by name.

-- --- Tables ---

-- One row per user, created by the first save in Settings. digest_city_ids null means "all followed cities".
-- unsub_id goes into unsubscribe links instead of the user id; users can't set or change it.
create table public.notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  timezone text not null,
  send_hour smallint not null default 7 check (send_hour between 0 and 23),
  daily boolean not null default false,
  weekly boolean not null default false,
  weekly_day smallint not null default 1 check (weekly_day between 1 and 7),
  digest_city_ids bigint[] check (digest_city_ids is null or cardinality(digest_city_ids) <= 10),
  unsub_id uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- check_city_timezone (0002) only reads new.timezone, so it validates this table's IANA name too.
create trigger notification_settings_check_timezone
  before insert or update of timezone on public.notification_settings
  for each row execute function public.check_city_timezone();

create trigger notification_settings_set_updated_at
  before update on public.notification_settings
  for each row execute function public.set_updated_at();

-- Range alerts, stored in metric units like readings (°C, m/s, mm, %). Unfollowing a city deletes its alerts.
create table public.alert_rules (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  city_id bigint not null,
  metric text not null check (metric in ('temperature', 'feels_like', 'wind', 'precipitation', 'humidity')),
  condition text not null check (condition in ('inside', 'outside')),
  slot text not null check (slot in ('day', 'night', 'both')),
  min_value double precision not null,
  max_value double precision not null,
  created_at timestamptz not null default now(),
  check (min_value < max_value),
  foreign key (user_id, city_id) references public.user_cities (user_id, city_id) on delete cascade
);
create index alert_rules_user_city_idx on public.alert_rules (user_id, city_id);

-- At most 20 alerts per user. The per-user lock makes two adds at the same moment queue, so they can't make 21.
create function public.enforce_alert_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('alert_rules:' || new.user_id::text, 0));
  if (select count(*) from public.alert_rules where user_id = new.user_id) >= 20 then
    raise exception 'alert_limit' using hint = 'A user can have up to 20 alerts.';
  end if;
  return new;
end;
$$;

revoke execute on function public.enforce_alert_limit() from public, anon, authenticated;

create trigger alert_rules_limit
  before insert on public.alert_rules
  for each row execute function public.enforce_alert_limit();

-- One row per email (digests) or per alert and city-local day (alerts), written only by the notify function.
-- period_key: daily and weekly 'YYYY-MM-DD' (the send date), alert '<alert_id>|<city_id>|<local_date>'.
-- The unique key is what stops a second send, also across overlapping runs.
create table public.notification_log (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly', 'alert')),
  period_key text not null,
  alert_ids bigint[],
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  resend_id text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_log_period_unique unique (user_id, kind, period_key)
);
create index notification_log_sent_at_idx on public.notification_log (sent_at) where status = 'sent';

-- --- Row Level Security ---
-- Settings: own row, select/insert/update, never unsub_id. Alerts: own rows, select/insert/delete, no update.
-- Log: select own only; the notify function writes it with the service role.

alter table public.notification_settings enable row level security;
alter table public.alert_rules enable row level security;
alter table public.notification_log enable row level security;

revoke all on public.notification_settings, public.alert_rules, public.notification_log from anon;
revoke insert, update, delete, truncate on public.notification_settings from authenticated;
grant insert (user_id, enabled, timezone, send_hour, daily, weekly, weekly_day, digest_city_ids)
  on public.notification_settings to authenticated;
grant update (user_id, enabled, timezone, send_hour, daily, weekly, weekly_day, digest_city_ids)
  on public.notification_settings to authenticated;
revoke update, truncate on public.alert_rules from authenticated;
revoke insert, update, delete, truncate on public.notification_log from authenticated;

create policy "notification_settings_select_own" on public.notification_settings
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "notification_settings_insert_own" on public.notification_settings
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notification_settings_update_own" on public.notification_settings
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "alert_rules_select_own" on public.alert_rules
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "alert_rules_insert_own" on public.alert_rules
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "alert_rules_delete_own" on public.alert_rules
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "notification_log_select_own" on public.notification_log
  for select to authenticated using ((select auth.uid()) = user_id);

-- --- Allowlist ---
-- Vault `notify_allowlist`: comma-separated emails (any case) or `*`. A missing or empty entry allows nobody.

create function public.notify_email_allowed(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(pg_catalog.btrim(p_email), '') <> '' and exists (
    select 1
    from vault.decrypted_secrets s,
      unnest(pg_catalog.string_to_array(s.decrypted_secret, ',')) as e(v)
    where s.name = 'notify_allowlist'
      and pg_catalog.btrim(e.v) <> ''
      and (pg_catalog.btrim(e.v) = '*' or pg_catalog.lower(pg_catalog.btrim(e.v)) = pg_catalog.lower(pg_catalog.btrim(p_email)))
  );
$$;

revoke execute on function public.notify_email_allowed(text) from public, anon, authenticated;
grant execute on function public.notify_email_allowed(text) to service_role;

-- Whether the signed-in caller's account email is on the allowlist. Settings shows a notice when it isn't.
create function public.notify_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.notify_email_allowed((select u.email::text from auth.users u where u.id = auth.uid()));
$$;

revoke execute on function public.notify_allowed() from public, anon;
grant execute on function public.notify_allowed() to authenticated;

-- --- Service-role helpers for the notify function ---

-- Enabled, allowlisted users with their account email and unit.
create function public.notify_recipients()
returns table (
  user_id uuid, email text, unit text, timezone text, send_hour smallint, daily boolean, weekly boolean,
  weekly_day smallint, digest_city_ids bigint[], unsub_id uuid
)
language sql stable security definer set search_path = '' as $$
  select s.user_id, u.email::text, coalesce(p.unit, 'C'), s.timezone, s.send_hour, s.daily, s.weekly,
    s.weekly_day, s.digest_city_ids, s.unsub_id
  from public.notification_settings s
  join auth.users u on u.id = s.user_id
  left join public.profiles p on p.id = s.user_id
  where s.enabled and public.notify_email_allowed(u.email::text);
$$;

revoke execute on function public.notify_recipients() from public, anon, authenticated;
grant execute on function public.notify_recipients() to service_role;

-- Claims emails before sending: inserts each period_key's log row as pending (existing rows are kept), then takes a
-- lease on the rows that are pending or failed, have fewer than 5 attempts, are under 24 hours old, and are unclaimed
-- or were claimed over 10 minutes ago. Returns only the leased rows, so overlapping runs never send the same row.
-- Alert keys start with the alert id, which is stored in alert_ids.
create function public.notify_claim(p_user uuid, p_kind text, p_keys text[])
returns table (id bigint, period_key text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
begin
  insert into public.notification_log (user_id, kind, period_key, alert_ids)
    select p_user, p_kind, k,
      case when p_kind = 'alert' then array[pg_catalog.split_part(k, '|', 1)::bigint] end
    from unnest(p_keys) as k
    on conflict on constraint notification_log_period_unique do nothing;
  return query
    update public.notification_log l
      set claimed_at = now(), attempts = l.attempts + 1
    where l.user_id = p_user and l.kind = p_kind and l.period_key = any (p_keys)
      and l.status in ('pending', 'failed') and l.attempts < 5
      and l.created_at > now() - interval '24 hours'
      and (l.claimed_at is null or l.claimed_at < now() - interval '10 minutes')
    returning l.id, l.period_key;
end;
$$;

revoke execute on function public.notify_claim(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.notify_claim(uuid, text, text[]) to service_role;

-- ============================================================================================================
-- Cron schedule: calls the notify Edge Function at minute 20 of every UTC hour, 15 minutes after collect.
-- Same pattern as 0002: the URL and the secret (the existing collect_secret) are read from Vault by name when
-- each run starts. Safe to run before the function is deployed. Re-running this section replaces the job.
-- ============================================================================================================

select cron.unschedule(jobid) from cron.job where jobname = 'notify';

select cron.schedule(
  'notify',
  '20 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-collect-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collect_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
