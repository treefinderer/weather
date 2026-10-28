// Pure notification logic (spec 0004): send windows, settled slots, alert matching, digest and alert emails,
// unit formatting, HTML escaping and unsubscribe tokens. No network or database access here, so logic_test.ts can
// check it against the fixtures. The unsubscribe function keeps its own copy of the token code (functions are
// deployed from the dashboard editor and can't import across folders); keep the two in step.

export type Unit = "C" | "F";
export type Slot = "day" | "night";
export type Metric = "temperature" | "feels_like" | "wind" | "precipitation" | "humidity";

export interface ReadingRow {
  city_id: number;
  source: string; // "open-meteo" | "met-norway"
  slot: Slot;
  local_date: string; // YYYY-MM-DD in the city's timezone
  fetched_at: string; // ISO time
  temperature_c: number | null;
  feels_like_c: number | null;
  humidity_pct: number | null;
  wind_speed_ms: number | null;
  precipitation_mm: number | null;
  weather_code: string | null;
}

export interface City { id: number; name: string; country: string; timezone: string }

export interface AlertRule {
  id: number;
  city_id: number;
  metric: Metric;
  condition: "inside" | "outside";
  slot: Slot | "both";
  min_value: number;
  max_value: number;
  created_at: string;
}

export interface Fired {
  alert: AlertRule;
  city_id: number;
  local_date: string;
  slot: Slot;
  value: number;
  key: string; // <alert_id>|<city_id>|<local_date>: one email per alert and city-local day
}

export interface Email { subject: string; html: string; text: string }

export interface Links { appUrl: string; unsubscribeUrl: string }

export const SOURCES = ["open-meteo", "met-norway"];
const NONE = "–";
const HOUR_MS = 3600 * 1000;

// --- Local time ---

export interface Local { date: string; hour: number; weekday: number } // weekday: ISO, 1 = Monday

// The calendar date, hour and ISO weekday in an IANA timezone. Throws a RangeError for an unknown timezone.
export function localParts(nowUtc: Date, timezone: string): Local {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit"
  }).formatToParts(nowUtc);
  const part = (type: string) => (parts.find(p => p.type === type) || { value: "" }).value;
  const date = `${part("year")}-${part("month")}-${part("day")}`;
  return { date, hour: Number(part("hour")) % 24, weekday: isoWeekday(date) };
}

const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export function addDays(iso: string, n: number): string {
  return new Date(toUtc(iso) + n * 24 * HOUR_MS).toISOString().slice(0, 10);
}
export function isoWeekday(iso: string): number {
  const d = new Date(toUtc(iso)).getUTCDay();
  return d === 0 ? 7 : d;
}

// --- Send windows ---

const WINDOW_HOURS = 3;

// The local date a digest is due for, or null. Due in local hours send_hour to send_hour + 2 (wrapping past midnight,
// where the date stays the one the window opened on). Weekly digests are due only when that date is weeklyDay.
export function digestDue(nowUtc: Date, timezone: string, sendHour: number, weeklyDay: number | null = null): string | null {
  const l = localParts(nowUtc, timezone);
  const offset = (l.hour - sendHour + 24) % 24;
  if (offset >= WINDOW_HOURS) return null;
  const date = l.hour < sendHour ? addDays(l.date, -1) : l.date;
  if (weeklyDay !== null && isoWeekday(date) !== weeklyDay) return null;
  return date;
}

// --- Slots and the Average rule ---

export interface SlotGroup { city_id: number; local_date: string; slot: Slot; rows: ReadingRow[]; fetched: number }

// Readings grouped by city, local date and slot; fetched is the newest fetched_at in ms.
export function groupSlots(rows: ReadingRow[]): SlotGroup[] {
  const map = new Map<string, SlotGroup>();
  for (const r of rows) {
    if (!r || (r.slot !== "day" && r.slot !== "night") || !SOURCES.includes(r.source)) continue;
    const k = r.city_id + "|" + r.local_date + "|" + r.slot;
    let g = map.get(k);
    if (!g) map.set(k, g = { city_id: Number(r.city_id), local_date: r.local_date, slot: r.slot, rows: [], fetched: -Infinity });
    g.rows.push(r);
    const t = Date.parse(r.fetched_at);
    if (!isNaN(t) && t > g.fetched) g.fetched = t;
  }
  return [...map.values()];
}

type Field = "temperature_c" | "feels_like_c" | "humidity_pct" | "wind_speed_ms" | "precipitation_mm";
export const METRIC_FIELD: Record<Metric, Field> = {
  temperature: "temperature_c", feels_like: "feels_like_c", wind: "wind_speed_ms",
  precipitation: "precipitation_mm", humidity: "humidity_pct"
};

// 0003's Average: the mean of the sources that have a value (one value is used as is), or null when none has.
export function average(rows: ReadingRow[], field: Field): number | null {
  const vals = rows.map(r => r[field]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// Conditions can't be averaged: Open-Meteo's code, or MET Norway's when Open-Meteo has none.
export function slotCode(rows: ReadingRow[]): string | null {
  const get = (s: string) => {
    const r = rows.find(x => x.source === s);
    return r && r.weather_code != null && r.weather_code !== "" ? r.weather_code : null;
  };
  return get("open-meteo") ?? get("met-norway");
}

// A slot is final once both sources have a row, or once 0002's catch-up window for it has ended in the city's
// timezone (local hour 3 for night, 15 for day, on the slot's date or any later date).
export function isSettled(g: SlotGroup, nowUtc: Date, timezone: string): boolean {
  if (SOURCES.every(s => g.rows.some(r => r.source === s))) return true;
  const l = localParts(nowUtc, timezone);
  if (l.date > g.local_date) return true;
  return l.date === g.local_date && l.hour >= (g.slot === "night" ? 3 : 15);
}

// --- Alerts ---

const ALERT_MAX_AGE_MS = 48 * HOUR_MS;

export const alertKey = (alertId: number, cityId: number, localDate: string) => alertId + "|" + cityId + "|" + localDate;

// The alerts that fire for one city's readings. A slot is checked when it is settled, of the alert's type, fetched
// after the alert was created and within the last 48 hours. Inside: min <= v <= max; outside: v < min or v > max.
// Each alert fires at most once per city-local day: the night slot comes first, so a matching day slot is dropped.
export function matchAlerts(alerts: AlertRule[], rows: ReadingRow[], city: City, nowUtc: Date): Fired[] {
  const groups = groupSlots(rows.filter(r => Number(r.city_id) === city.id))
    .filter(g => g.fetched > nowUtc.getTime() - ALERT_MAX_AGE_MS && isSettled(g, nowUtc, city.timezone))
    .sort((a, b) => (a.local_date < b.local_date ? -1 : a.local_date > b.local_date ? 1 : a.slot === "night" ? -1 : 1));
  const fired: Fired[] = [];
  const seen = new Set<string>();
  for (const alert of alerts) {
    if (Number(alert.city_id) !== city.id) continue;
    const created = Date.parse(alert.created_at);
    for (const g of groups) {
      if (alert.slot !== "both" && alert.slot !== g.slot) continue;
      if (isNaN(created) || g.fetched <= created) continue;
      const key = alertKey(alert.id, city.id, g.local_date);
      if (seen.has(key)) continue;
      const v = average(g.rows, METRIC_FIELD[alert.metric]);
      if (v === null) continue;
      const inside = v >= alert.min_value && v <= alert.max_value;
      if (alert.condition === "inside" ? !inside : inside) continue;
      seen.add(key);
      fired.push({ alert, city_id: city.id, local_date: g.local_date, slot: g.slot, value: v, key });
    }
  }
  return fired;
}

// --- Formats (the user's unit at send time, as in the app) ---

const fixed = (n: number, d: number) => {
  const s = n.toFixed(d);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
export const fmt = {
  temp: (c: number | null, u: Unit) => (c == null ? NONE : u === "F" ? fixed(c * 9 / 5 + 32, 1) + " °F" : fixed(c, 1) + " °C"),
  wind: (ms: number | null, u: Unit) => (ms == null ? NONE : u === "F" ? fixed(ms / 0.44704, 1) + " mph" : fixed(ms * 3.6, 1) + " km/h"),
  rain: (mm: number | null, u: Unit) => (mm == null ? NONE : u === "F" ? fixed(mm / 25.4, 2) + " in" : fixed(mm, 1) + " mm"),
  pct: (v: number | null) => (v == null ? NONE : Math.round(v) + "%")
};
export function fmtMetric(metric: Metric, v: number | null, u: Unit): string {
  if (metric === "temperature" || metric === "feels_like") return fmt.temp(v, u);
  if (metric === "wind") return fmt.wind(v, u);
  if (metric === "precipitation") return fmt.rain(v, u);
  return fmt.pct(v);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// "2026-10-28" -> "28 Oct"
export const shortDate = (iso: string) => +iso.slice(8, 10) + " " + MONTHS[+iso.slice(5, 7) - 1];

// Weather code labels, the same tables as common.js (Wx.condition).
const WMO: [number[], string][] = [[[0], "Clear"], [[1], "Mostly clear"], [[2], "Partly cloudy"], [[3], "Cloudy"], [[45, 48], "Fog"],
  [[51, 57], "Drizzle"], [[61, 67], "Rain"], [[80, 82], "Rain"], [[71, 77], "Snow"], [[85, 86], "Snow"], [[95, 99], "Thunderstorm"]];
const MET: [(s: string) => boolean, string][] = [[s => s.includes("thunder"), "Thunderstorm"], [s => s.includes("sleet"), "Sleet"],
  [s => s.includes("snow"), "Snow"], [s => s.includes("rain"), "Rain"], [s => s === "fog", "Fog"],
  [s => s === "partlycloudy", "Partly cloudy"], [s => s === "cloudy", "Cloudy"], [s => s === "fair", "Mostly clear"],
  [s => s === "clearsky", "Clear"]];
export function condition(code: string | null): string {
  if (code == null) return NONE;
  const s = String(code).trim().toLowerCase();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const hit = WMO.find(([r]) => n >= r[0] && n <= r[r.length - 1]);
    return hit ? hit[1] : NONE;
  }
  const base = s.replace(/_(day|night|polartwilight)$/, "");
  const hit = MET.find(([test]) => test(base));
  return hit ? hit[1] : NONE;
}

// --- Escaping ---

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ESC[c]);
// Control characters and line breaks removed, spaces collapsed.
// deno-lint-ignore no-control-regex
export const cleanSubject = (s: string) => s.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();

// --- Email layout ---
// One column, fixed light colors and inline styles (mail clients ignore the app's CSS and dark mode).

const FOOTER = "You get this because email notifications are on in Settings.";
const S = {
  body: "margin:0;padding:16px;background:#f4f6f8;color:#1d2329;font:15px/1.5 Arial,Helvetica,sans-serif",
  card: "max-width:560px;margin:0 auto;padding:20px;background:#ffffff;border-radius:8px",
  h1: "margin:0 0 16px;font-size:20px",
  h2: "margin:20px 0 8px;font-size:17px",
  p: "margin:0 0 8px",
  muted: "margin:0 0 8px;color:#5b6670",
  table: "border-collapse:collapse;width:100%;font-size:14px",
  td: "padding:4px 8px 4px 0;border-bottom:1px solid #d5dbe0;vertical-align:top",
  link: "color:#2f6fdf",
  foot: "margin:20px 0 0;padding-top:12px;border-top:1px solid #d5dbe0;font-size:13px;color:#5b6670"
};

// A block of content written once and rendered to both parts.
type Block =
  | { t: "h2"; text: string }
  | { t: "p"; text: string; muted?: boolean }
  | { t: "rows"; rows: [string, string][] };

function render(title: string, blocks: Block[], links: Links): { html: string; text: string } {
  const html: string[] = [], text: string[] = [title, ""];
  for (const b of blocks) {
    if (b.t === "h2") {
      html.push(`<h2 style="${S.h2}">${escapeHtml(b.text)}</h2>`);
      text.push("", b.text);
    } else if (b.t === "p") {
      html.push(`<p style="${b.muted ? S.muted : S.p}">${escapeHtml(b.text)}</p>`);
      text.push(b.text);
    } else {
      html.push(`<table role="presentation" style="${S.table}">` +
        b.rows.map(([k, v]) => `<tr><td style="${S.td}">${escapeHtml(k)}</td><td style="${S.td}">${escapeHtml(v)}</td></tr>`).join("") +
        "</table>");
      b.rows.forEach(([k, v]) => text.push("  " + k + ": " + v));
    }
  }
  const app = escapeHtml(links.appUrl), unsub = escapeHtml(links.unsubscribeUrl);
  const out = `<!doctype html><html><body style="${S.body}"><div style="${S.card}">` +
    `<h1 style="${S.h1}">${escapeHtml(title)}</h1>` + html.join("") +
    `<p style="${S.p}"><a style="${S.link}" href="${app}">Open the Weather app</a></p>` +
    `<p style="${S.foot}">${escapeHtml(FOOTER)} <a style="${S.link}" href="${app}">Weather app</a> · ` +
    `<a style="${S.link}" href="${unsub}">Unsubscribe</a></p></div></body></html>`;
  text.push("", "Open the Weather app: " + links.appUrl, "", "--", FOOTER,
    "Weather app: " + links.appUrl, "Unsubscribe: " + links.unsubscribeUrl);
  return { html: out, text: text.join("\n") + "\n" };
}

const place = (c: City) => [c.name, c.country].filter(Boolean).join(", ");
const SLOT_NAME: Record<Slot, string> = { day: "Day (12pm)", night: "Night (12am)" };

function readingRows(rows: ReadingRow[], u: Unit): [string, string][] {
  return [
    ["Temperature", fmt.temp(average(rows, "temperature_c"), u)],
    ["Feels like", fmt.temp(average(rows, "feels_like_c"), u)],
    ["Wind", fmt.wind(average(rows, "wind_speed_ms"), u)],
    ["Precipitation", fmt.rain(average(rows, "precipitation_mm"), u)],
    ["Humidity", fmt.pct(average(rows, "humidity_pct"))],
    ["Conditions", condition(slotCode(rows))]
  ];
}

// --- Digests ---

const DIGEST_WINDOW_MS = 36 * HOUR_MS;

// The digest cities in followed order: all followed cities when ids is null, else the followed ones in ids.
export function digestCities(followed: City[], ids: number[] | null): City[] {
  if (ids == null) return followed;
  const want = new Set(ids.map(Number));
  return followed.filter(c => want.has(c.id));
}

// The daily digest for the given local date, or null when no digest city is followed (the run logs it skipped).
// Per city: the newest settled Day and Night slot fetched in the last 36 hours.
export function buildDaily(date: string, cities: City[], rows: ReadingRow[], unit: Unit, nowUtc: Date, links: Links): Email | null {
  if (!cities.length) return null;
  const blocks: Block[] = [];
  for (const c of cities) {
    blocks.push({ t: "h2", text: place(c) });
    const groups = groupSlots(rows.filter(r => Number(r.city_id) === c.id))
      .filter(g => g.fetched > nowUtc.getTime() - DIGEST_WINDOW_MS && isSettled(g, nowUtc, c.timezone));
    let any = false;
    for (const slot of ["day", "night"] as Slot[]) {
      const g = groups.filter(x => x.slot === slot).sort((a, b) => (a.local_date < b.local_date ? 1 : -1))[0];
      if (!g) continue;
      any = true;
      blocks.push({ t: "p", text: SLOT_NAME[slot] + ", " + shortDate(g.local_date) });
      blocks.push({ t: "rows", rows: readingRows(g.rows, unit) });
    }
    if (!any) blocks.push({ t: "p", text: "No readings in the last day.", muted: true });
  }
  const title = "Daily digest, " + shortDate(date);
  return { subject: cleanSubject("Weather: daily digest, " + shortDate(date)), ...render(title, blocks, links) };
}

// "21–27 Oct", or "28 Sep–4 Oct" across months.
export function weekLabel(from: string, to: string): string {
  return from.slice(5, 7) === to.slice(5, 7) ? +from.slice(8, 10) + "–" + shortDate(to) : shortDate(from) + "–" + shortDate(to);
}

// The weekly summary sent on date: for each city, the 7 city-local dates before it, a Day and a Night row with the
// min, max and average of each day's Average temperature, and how many of the 7 days had one.
export function buildWeekly(date: string, cities: City[], rows: ReadingRow[], unit: Unit, links: Links): Email | null {
  if (!cities.length) return null;
  const from = addDays(date, -7), to = addDays(date, -1);
  const blocks: Block[] = [];
  for (const c of cities) {
    blocks.push({ t: "h2", text: place(c) });
    const groups = groupSlots(rows.filter(r => Number(r.city_id) === c.id && r.local_date >= from && r.local_date <= to));
    for (const slot of ["day", "night"] as Slot[]) {
      const temps = groups.filter(g => g.slot === slot).map(g => average(g.rows, "temperature_c")).filter((v): v is number => v !== null);
      const label = SLOT_NAME[slot];
      if (!temps.length) { blocks.push({ t: "p", text: label + ": No readings", muted: true }); continue; }
      const avg = temps.reduce((a, b) => a + b, 0) / temps.length;
      blocks.push({ t: "p", text: label + ", " + temps.length + " of 7 days" });
      blocks.push({ t: "rows", rows: [["Min", fmt.temp(Math.min(...temps), unit)], ["Max", fmt.temp(Math.max(...temps), unit)],
        ["Average", fmt.temp(avg, unit)]] });
    }
  }
  const week = weekLabel(from, to);
  return { subject: cleanSubject("Weather: week of " + week), ...render("Week of " + week, blocks, links) };
}

// --- Alert emails ---

export const METRIC_NAME: Record<Metric, string> = {
  temperature: "Temperature", feels_like: "Feels like", wind: "Wind", precipitation: "Precipitation", humidity: "Humidity"
};

// The alerts that fired for one user, grouped into one email per city, local date and slot.
export function groupFired(fired: Fired[]): Fired[][] {
  const map = new Map<string, Fired[]>();
  for (const f of fired) {
    const k = f.city_id + "|" + f.local_date + "|" + f.slot;
    const list = map.get(k);
    if (list) list.push(f); else map.set(k, [f]);
  }
  return [...map.values()];
}

// One email for alerts that fired for the same city, local date and slot. The subject names the first one.
export function buildAlert(city: City, fired: Fired[], rows: ReadingRow[], unit: Unit, links: Links): Email {
  const first = fired[0];
  const blocks: Block[] = [{ t: "p", text: SLOT_NAME[first.slot] + " reading, " + shortDate(first.local_date) }];
  for (const f of fired) {
    const a = f.alert;
    blocks.push({ t: "p", text: METRIC_NAME[a.metric] + " is " + fmtMetric(a.metric, f.value, unit) + ", " + a.condition +
      " your range " + rangeText(a, unit) + "." });
  }
  const slotRows = rows.filter(r => Number(r.city_id) === city.id && r.local_date === first.local_date && r.slot === first.slot);
  blocks.push({ t: "rows", rows: readingRows(slotRows, unit) });
  const subject = "Weather alert: " + city.name + ", " + METRIC_NAME[first.alert.metric].toLowerCase() + " " +
    fmtMetric(first.alert.metric, first.value, unit);
  return { subject: cleanSubject(subject), ...render("Weather alert: " + place(city), blocks, links) };
}

// "0.0–30.0 °C", "5.0–10.0 km/h", "0.00–1.00 in", "20.0–80.0 %"
export function rangeText(a: AlertRule, unit: Unit): string {
  const lo = fmtMetric(a.metric, a.min_value, unit), hi = fmtMetric(a.metric, a.max_value, unit);
  if (a.metric === "humidity") return fixed(a.min_value, 1) + "–" + fixed(a.max_value, 1) + " %";
  const sp = lo.lastIndexOf(" ");
  return lo.slice(0, sp) + "–" + hi;
}

// --- Sending ---

// What a Resend reply means for the log row: sent, retry on a later run, or give up (attempts set to 5).
export function classifySend(status: number | null): "sent" | "retry" | "rate_limited" | "permanent" {
  if (status === null) return "retry"; // network error or timeout
  if (status >= 200 && status < 300) return "sent";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "retry";
  return "permanent";
}

// Whether a log row already settles its key, so the run doesn't need to claim it.
export function isDone(row: { status: string; attempts: number }): boolean {
  return row.status === "sent" || row.status === "skipped" || row.attempts >= 5;
}

// --- Unsubscribe tokens ---
// <unsub_id>.<base64url(HMAC-SHA256(secret, "unsub:" + unsub_id))>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(secret: string, unsubId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("unsub:" + unsubId))));
}

// Compares two strings in time that doesn't depend on where they first differ.
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export async function unsubToken(secret: string, unsubId: string): Promise<string> {
  if (!secret) throw new Error("no unsubscribe secret");
  return unsubId + "." + await sign(secret, unsubId);
}

// The unsub_id of a valid token, or null for a malformed, tampered or differently signed one.
export async function verifyUnsubToken(secret: string, token: unknown): Promise<string | null> {
  if (!secret || typeof token !== "string" || token.length > 200) return null;
  const dot = token.indexOf(".");
  const id = token.slice(0, dot), sig = token.slice(dot + 1);
  if (dot < 0 || !UUID.test(id) || !sig) return null;
  return sameSecret(sig, await sign(secret, id)) ? id : null;
}
