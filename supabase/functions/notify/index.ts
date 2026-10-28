// Notification Edge Function (spec 0004). pg_cron calls it at minute 20 of every UTC hour with the x-collect-secret
// header (the same secret as collect). For each enabled, allowlisted user it works out the due daily and weekly
// digests and the range alerts that fired, claims each email in notification_log, and sends it through Resend.
// Deploy with JWT verification off. Replies with counts only, never addresses.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  addDays, buildAlert, buildDaily, buildWeekly, classifySend, digestCities, digestDue, groupFired, isDone, matchAlerts,
  sameSecret, unsubToken, type AlertRule, type City, type Email, type Fired, type ReadingRow, type Unit
} from "./logic.ts";

const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 15000;
const SEND_GAP_MS = 600;        // under Resend's 2 requests per second
const MAX_PER_RUN = 40;
const PAGE = 1000;
const READING_COLS = "city_id, source, slot, local_date, fetched_at, temperature_c, feels_like_c, humidity_pct, " +
  "wind_speed_ms, precipitation_mm, weather_code";

interface Recipient {
  user_id: string; email: string; unit: string; timezone: string; send_hour: number; daily: boolean; weekly: boolean;
  weekly_day: number; digest_city_ids: number[] | null; unsub_id: string;
}
interface Job {
  user: Recipient;
  kind: "daily" | "weekly" | "alert";
  keys: string[];               // the log period_keys to claim
  oneClick: string;             // the List-Unsubscribe URL
  build: (leased: Set<string>) => Email | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

Deno.serve(async (req) => {
  const secret = Deno.env.get("COLLECT_SECRET") || "";
  const given = req.headers.get("x-collect-secret") || "";
  if (!secret || !given || !sameSecret(given, secret)) return json({ error: "unauthorized" }, 401);

  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const unsubSecret = Deno.env.get("UNSUBSCRIBE_SECRET") || "";
  if (!apiKey || !unsubSecret) {
    console.error("notify: RESEND_API_KEY or UNSUBSCRIBE_SECRET is not set");
    return json({ error: "not configured" }, 500);
  }
  const from = Deno.env.get("EMAIL_FROM") || "Weather <onboarding@resend.dev>";
  const appUrl = Deno.env.get("APP_URL") || "https://treefinderer.github.io/weather/";
  const cap = Number(Deno.env.get("NOTIFY_DAILY_CAP")) > 0 ? Number(Deno.env.get("NOTIFY_DAILY_CAP")) : 100;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const unsubFn = supabaseUrl.replace(/\/$/, "") + "/functions/v1/unsubscribe";

  // The service role bypasses RLS; Supabase provides both values to every function.
  const db = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const now = new Date();
  const counts = { due: 0, sent: 0, failed: 0, skipped: 0, deferred: 0 };

  // 1. Enabled users that pass the allowlist.
  const rec = await db.rpc("notify_recipients");
  if (rec.error) {
    console.error("notify: can't read recipients", rec.error);
    return json({ error: "can't read recipients" }, 500);
  }
  const users = ((rec.data || []) as Recipient[]).filter(u => {
    try { new Intl.DateTimeFormat("en-US", { timeZone: u.timezone }); return true; } catch (_) {
      console.error("notify: skipping a user with an invalid timezone:", u.timezone);
      return false;
    }
  });
  if (!users.length) return json(counts);
  const ids = users.map(u => u.user_id);

  // 2. Their cities, alerts, recent log rows and the readings of those cities.
  const [uc, al, lg] = await Promise.all([
    db.from("user_cities").select("user_id, added_at, cities(id, name, country, timezone)").in("user_id", ids)
      .order("added_at", { ascending: true }),
    db.from("alert_rules").select("id, user_id, city_id, metric, condition, slot, min_value, max_value, created_at").in("user_id", ids),
    db.from("notification_log").select("user_id, kind, period_key, status, attempts").in("user_id", ids)
      .gte("created_at", new Date(now.getTime() - 72 * 3600 * 1000).toISOString())
  ]);
  if (uc.error || al.error || lg.error) {
    console.error("notify: can't read cities, alerts or the log", uc.error || al.error || lg.error);
    return json({ error: "can't read user data" }, 500);
  }
  const cityOf = new Map<string, City[]>();
  for (const row of uc.data || []) {
    // deno-lint-ignore no-explicit-any
    const c = (row as any).cities;
    if (!c) continue;
    const list = cityOf.get(row.user_id) || [];
    list.push({ id: Number(c.id), name: c.name, country: c.country || "", timezone: c.timezone });
    cityOf.set(row.user_id, list);
  }
  const alertsOf = new Map<string, AlertRule[]>();
  for (const a of al.data || []) {
    const list = alertsOf.get(a.user_id) || [];
    list.push({ ...a, id: Number(a.id), city_id: Number(a.city_id) } as AlertRule);
    alertsOf.set(a.user_id, list);
  }
  const done = new Set((lg.data || []).filter(isDone).map(r => r.user_id + "|" + r.kind + "|" + r.period_key));

  const cityIds = [...new Set([...cityOf.values()].flat().map(c => c.id))];
  const rows: ReadingRow[] = [];
  if (cityIds.length) {
    // 9 UTC days back covers the weekly digest's 7 local dates in every timezone.
    const since = addDays(now.toISOString().slice(0, 10), -9);
    for (let start = 0; ; start += PAGE) {
      const res = await db.from("readings").select(READING_COLS).in("city_id", cityIds).gte("local_date", since)
        .order("id", { ascending: true }).range(start, start + PAGE - 1);
      if (res.error) {
        console.error("notify: can't read readings", res.error);
        return json({ error: "can't read readings" }, 500);
      }
      rows.push(...((res.data || []) as ReadingRow[]));
      if (!res.data || res.data.length < PAGE) break;
    }
  }

  // 3. The due emails. Each job builds its email only after the claim, from the keys this run leased.
  const jobs: Job[] = [];
  for (const user of users) {
    const unit: Unit = user.unit === "F" ? "F" : "C";
    const followed = cityOf.get(user.user_id) || [];
    let token: string;
    try { token = await unsubToken(unsubSecret, user.unsub_id); } catch (e) {
      console.error("notify: can't sign an unsubscribe token:", message(e));
      continue;
    }
    const links = { appUrl, unsubscribeUrl: appUrl + (appUrl.includes("?") ? "&" : "?") + "unsubscribe=" + encodeURIComponent(token) };
    const oneClick = unsubFn + "?t=" + encodeURIComponent(token);
    const add = (kind: Job["kind"], keys: string[], build: Job["build"]) => {
      const open = keys.filter(k => !done.has(user.user_id + "|" + kind + "|" + k));
      if (open.length) jobs.push({ user, kind, keys: open, oneClick, build });
    };
    const digest = digestCities(followed, user.digest_city_ids);
    if (user.daily) {
      const date = digestDue(now, user.timezone, user.send_hour);
      if (date) add("daily", [date], () => buildDaily(date, digest, rows, unit, now, links));
    }
    if (user.weekly) {
      const date = digestDue(now, user.timezone, user.send_hour, user.weekly_day);
      if (date) add("weekly", [date], () => buildWeekly(date, digest, rows, unit, links));
    }
    const alerts = alertsOf.get(user.user_id) || [];
    for (const city of followed) {
      let fired: Fired[];
      try { fired = matchAlerts(alerts, rows, city, now); } catch (e) {
        console.error("notify: city " + city.id + " skipped:", message(e));
        continue;
      }
      for (const group of groupFired(fired)) {
        // An alert email lists only the alerts this run leased (others were sent or are being sent elsewhere).
        add("alert", group.map(f => f.key), leased => {
          const mine = group.filter(f => leased.has(f.key));
          return mine.length ? buildAlert(city, mine, rows, unit, links) : null;
        });
      }
    }
  }
  counts.due = jobs.length;

  // Emails sent in the past 24 hours, for the daily cap. Alert emails have a row per alert, so count resend ids.
  const recent = await db.from("notification_log").select("id, resend_id").eq("status", "sent")
    .gte("sent_at", new Date(now.getTime() - 24 * 3600 * 1000).toISOString());
  if (recent.error) {
    console.error("notify: can't count recent emails", recent.error);
    return json({ error: "can't read the log" }, 500);
  }
  let sentToday = new Set((recent.data || []).map(r => r.resend_id || "row " + r.id)).size;

  // 4-6. Claim, send one at a time, and record the result.
  let stop = false, attempted = 0;
  for (const job of jobs) {
    if (stop || attempted >= MAX_PER_RUN || sentToday >= cap) { counts.deferred++; continue; }
    const claim = await db.rpc("notify_claim", { p_user: job.user.user_id, p_kind: job.kind, p_keys: job.keys });
    if (claim.error) {
      console.error("notify: claim failed", claim.error);
      counts.failed++;
      continue;
    }
    const leased = (claim.data || []) as { id: number; period_key: string }[];
    if (!leased.length) { counts.skipped++; continue; }
    const logIds = leased.map(r => Number(r.id)).sort((a, b) => a - b);

    // A digest with no followed digest city is logged as skipped.
    const email = job.build(new Set(leased.map(r => r.period_key)));
    if (!email) {
      await db.from("notification_log").update({ status: "skipped", claimed_at: null }).in("id", logIds);
      counts.skipped++;
      continue;
    }

    if (attempted) await sleep(SEND_GAP_MS);
    attempted++;
    let status: number | null = null, body: { id?: string; message?: string } = {};
    try {
      const res = await fetch(RESEND_URL, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + apiKey,
          "Content-Type": "application/json",
          "Idempotency-Key": "wx-" + logIds.join("-")
        },
        body: JSON.stringify({
          from, to: [job.user.email], subject: email.subject, html: email.html, text: email.text,
          headers: {
            "List-Unsubscribe": "<" + job.oneClick + ">",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
          }
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
      });
      status = res.status;
      body = await res.json().catch(() => ({}));
    } catch (e) {
      body = { message: message(e) };
    }

    const outcome = classifySend(status);
    if (outcome === "sent") {
      await db.from("notification_log").update({ status: "sent", resend_id: body.id || null, sent_at: new Date().toISOString(),
        last_error: null }).in("id", logIds);
      counts.sent++;
      sentToday++;
      continue;
    }
    const error = ((status === null ? "network" : "HTTP " + status) + ": " + (body.message || "")).slice(0, 500);
    console.error("notify: send failed:", error);
    counts.failed++;
    if (outcome === "rate_limited") {
      // A 429 doesn't use up an attempt: give it back, release the lease and stop this run.
      const rel = await db.rpc("notify_release_rate_limited", { p_ids: logIds, p_error: error });
      if (rel.error) console.error("notify: can't release rate-limited rows", rel.error);
      stop = true;
      continue;
    }
    const update: Record<string, unknown> = { status: "failed", last_error: error, claimed_at: null };
    if (outcome === "permanent") update.attempts = 5;
    await db.from("notification_log").update(update).in("id", logIds);
  }

  return json(counts);
});
