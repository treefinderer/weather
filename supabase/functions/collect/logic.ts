// Pure collector logic (spec 0002): slot selection, source URLs, and parsing each source's reply into a row.
// No network or database access here, so logic_test.ts can check it against the recorded fixtures.

export type Slot = "day" | "night";
export type Source = "open-meteo" | "met-norway";

export interface Due {
  slot: Slot;
  localDate: string; // YYYY-MM-DD, the city's calendar date at run time
  catchUp: boolean; // true in the second and third hour of the window
}

export interface Reading {
  observed_at: string; // ISO time the source gives for these values
  temperature_c: number;
  feels_like_c: number | null;
  humidity_pct: number | null;
  wind_speed_ms: number | null;
  precipitation_mm: number | null;
  weather_code: string | null;
  raw: unknown;
}

// Local hours 0-2 are the night window and 12-14 the day window; the first hour is the normal reading.
const WINDOW_HOURS = 3;

// Which slot is due for a city at this run time, or null when its local hour is outside both windows.
// Throws a RangeError for an unknown IANA time zone.
export function dueSlot(nowUtc: Date, timezone: string): Due | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit"
  }).formatToParts(nowUtc);
  const part = (type: string) => (parts.find(p => p.type === type) || { value: "" }).value;
  const hour = Number(part("hour")) % 24;
  const localDate = `${part("year")}-${part("month")}-${part("day")}`;
  if (hour < WINDOW_HOURS) return { slot: "night", localDate, catchUp: hour !== 0 };
  if (hour >= 12 && hour < 12 + WINDOW_HOURS) return { slot: "day", localDate, catchUp: hour !== 12 };
  return null;
}

// --- URLs ---

export function openMeteoUrl(lat: number, lon: number): string {
  return "https://api.open-meteo.com/v1/forecast?latitude=" + lat + "&longitude=" + lon +
    "&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation,weather_code" +
    "&wind_speed_unit=ms&timezone=UTC";
}

// MET Norway rejects coordinates with more than 4 decimals.
const round4 = (n: number) => Math.round(n * 1e4) / 1e4;
export function metUrl(lat: number, lon: number): string {
  return "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=" + round4(lat) + "&lon=" + round4(lon);
}

// MET Norway's terms ask for a User-Agent naming the app and a contact.
export const MET_USER_AGENT = "weather-history/1.0 (https://treefinderer.github.io/weather/; https://github.com/treefinderer/weather)";

// --- Parsing ---

// deno-lint-ignore no-explicit-any
type Json = any;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// An ISO time as UTC. Open-Meteo with timezone=UTC sends "2026-10-25T12:00" with no offset.
function utcTime(v: unknown): string {
  if (typeof v !== "string" || !v) throw new Error("missing time");
  const d = new Date(/(Z|[+-]\d\d:?\d\d)$/i.test(v) ? v : v + "Z");
  if (isNaN(d.getTime())) throw new Error("bad time: " + v);
  return d.toISOString();
}

// Current conditions from Open-Meteo. Throws when the temperature is missing, so no partial row is written.
export function parseOpenMeteo(body: Json): Reading {
  const cur = body && body.current;
  const temperature = num(cur && cur.temperature_2m);
  if (temperature === null) throw new Error("open-meteo: no temperature");
  const code = num(cur.weather_code);
  return {
    observed_at: utcTime(cur.time),
    temperature_c: temperature,
    feels_like_c: num(cur.apparent_temperature),
    humidity_pct: num(cur.relative_humidity_2m),
    wind_speed_ms: num(cur.wind_speed_10m),
    precipitation_mm: num(cur.precipitation),
    weather_code: code === null ? null : String(code),
    raw: body
  };
}

// The MET Norway timeseries entry with the latest time not after the run time (normally the first entry).
// Throws when there is none or it has no temperature. MET gives no feels-like, so it stays null.
export function parseMet(body: Json, nowUtc: Date): Reading {
  const props = body && body.properties;
  const series: Json[] = props && Array.isArray(props.timeseries) ? props.timeseries : [];
  let entry: Json = null;
  let entryTime = -Infinity;
  for (const e of series) {
    const t = e && typeof e.time === "string" ? Date.parse(e.time) : NaN;
    if (!isNaN(t) && t <= nowUtc.getTime() && t > entryTime) { entry = e; entryTime = t; }
  }
  if (!entry) throw new Error("met-norway: no entry at or before the run time");
  const details = entry.data && entry.data.instant && entry.data.instant.details;
  const temperature = num(details && details.air_temperature);
  if (temperature === null) throw new Error("met-norway: no temperature");
  const next = entry.data.next_1_hours;
  const symbol = next && next.summary && next.summary.symbol_code;
  return {
    observed_at: utcTime(entry.time),
    temperature_c: temperature,
    feels_like_c: null,
    humidity_pct: num(details.relative_humidity),
    wind_speed_ms: num(details.wind_speed),
    precipitation_mm: num(next && next.details && next.details.precipitation_amount),
    weather_code: typeof symbol === "string" && symbol ? symbol : null,
    // Only the chosen entry and the meta block, not the full 9-day forecast.
    raw: { meta: props.meta === undefined ? null : props.meta, entry }
  };
}
