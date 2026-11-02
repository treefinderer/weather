-- 0010 live webcam: one Windy webcam per city, stored on the shared cities row (one record per city, not per user).
-- Run after 0002_cities_readings.sql. The webcams Edge Function writes these columns with the service role; signed-in
-- users read them through the existing cities_select_followed policy and still can't write cities.
-- No image is stored: only the camera's id, title, its windy.com page URL and the embeddable player URL.
-- This file holds no secret: the cron job reads the URL and the collector secret from Vault by name, as 0002 does.

-- --- Columns ---

-- webcam_status: null until the first lookup, 'found' with a camera, 'none' when no usable camera is within the radius.
-- webcam_next_try_at is set only after a failed lookup (retry time); webcam_failures counts failures in a row, so the
-- retry delay can grow from 1 hour to at most 24 hours. Both are cleared by the next successful lookup.
alter table public.cities
  add column webcam_id bigint,
  add column webcam_title text check (char_length(webcam_title) between 1 and 300),
  add column webcam_page_url text check (char_length(webcam_page_url) between 1 and 500),
  add column webcam_player_url text check (char_length(webcam_player_url) between 1 and 500),
  add column webcam_status text check (webcam_status in ('found', 'none')),
  add column webcam_checked_at timestamptz,
  add column webcam_next_try_at timestamptz,
  add column webcam_failures smallint not null default 0 check (webcam_failures >= 0),
  -- 'found' always has the four camera fields; any other status has none of them.
  add constraint cities_webcam_fields check (
    case when webcam_status = 'found'
      then webcam_id is not null and webcam_title is not null and webcam_page_url is not null and webcam_player_url is not null
      else webcam_id is null and webcam_title is null and webcam_page_url is null and webcam_player_url is null
    end
  );

-- --- Row Level Security ---
-- Unchanged from 0002, restated so this file alone shows it: RLS stays on, and users have no write access to cities.

alter table public.cities enable row level security;
revoke insert, update, delete, truncate on public.cities from authenticated;

-- ============================================================================================================
-- Cron schedule: calls the webcams Edge Function at minute 35 of every UTC hour (collect runs at 5, notify at 20).
-- Uses the same Vault entries as collect (project_url, collect_secret), so no new Vault secret is needed.
-- Safe to run before the function is deployed (those calls just fail until it exists). Re-running replaces the job.
-- ============================================================================================================

select cron.unschedule(jobid) from cron.job where jobname = 'webcams';

select cron.schedule(
  'webcams',
  '35 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/webcams',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-collect-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'collect_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $job$
);
