// Pure collector logic (spec 0002): slot selection, source URLs, and parsing each source's reply into a row.
// Spec 0009 adds the satellite picture plan: the GIBS layers, the box around a city, the GetMap URL and the reply check.
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

// --- Satellite pictures (spec 0009) ---

// NASA GIBS WMS, keyless and public domain. Layer names were checked against GetCapabilities on 2026-11-02.
// Both layers are daily global mosaics from the NOAA-20 polar orbiter, which passes about 1:30pm and 1:30am local
// solar time. GIBS has no global sub-daily infrared layer (its geostationary layers leave out Europe, Africa and
// western Asia), so the night picture also comes from the polar orbiter: the infrared pass of the night of date D.
export const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
export const PICTURE_LAYERS: Record<Slot, { layer: string; passHour: number }> = {
  day: { layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", passHour: 13.5 },
  night: { layer: "VIIRS_NOAA20_Brightness_Temp_BandI5_Night", passHour: 1.5 }
};
// Coastlines, drawn on top so the area is recognisable (GIBS's Reference_Features_15m borders barely show at this
// scale). It has no time dimension.
export const PICTURE_OVERLAY = "Coastlines_15m";
export const PICTURE_SIZE = 512;
// GIBS answers a time or place with no data with a blank JPEG of about 2 KB (more with the overlay drawn on it).
export const MIN_PICTURE_BYTES = 4096;
export const PICTURE_BUCKET = "city-pictures";

export interface Box { minLat: number; minLon: number; maxLat: number; maxLon: number }

export interface PicturePlan {
  slot: Slot;
  localDate: string; // the date the picture is stored under
  layer: string;
  time: string; // the TIME asked of GIBS, a UTC date
  box: Box;
  path: string; // object name in the bucket
}

const HALF_KM = 150;
const KM_PER_DEG_LAT = 111.32;
const MAX_HALF_LON = 20;

// About 300 x 300 km centred on the city. Latitudes are clamped to +-90; a box that would cross +-180 longitude is
// shifted inward rather than wrapped, so the city is then off centre.
export function pictureBox(lat: number, lon: number): Box {
  const halfLat = HALF_KM / KM_PER_DEG_LAT;
  const cos = Math.cos(lat * Math.PI / 180);
  const halfLon = cos > 0 ? Math.min(halfLat / cos, MAX_HALF_LON) : MAX_HALF_LON;
  let minLon = lon - halfLon, maxLon = lon + halfLon;
  if (maxLon > 180) { minLon -= maxLon - 180; maxLon = 180; }
  if (minLon < -180) { maxLon += -180 - minLon; minLon = -180; }
  return {
    minLat: round4(Math.max(-90, lat - halfLat)), minLon: round4(minLon),
    maxLat: round4(Math.min(90, lat + halfLat)), maxLon: round4(maxLon)
  };
}

// The GIBS day (a UTC date) that holds the polar orbiter's pass near passHour local solar time on localDate.
// For most places that is localDate itself; near the date line the pass falls on the UTC day before or after.
export function passDate(localDate: string, lon: number, passHour: number): string {
  const [y, m, d] = localDate.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) + (passHour - lon / 15) * 3600e3;
  return new Date(ms).toISOString().slice(0, 10);
}

// WMS 1.3.0 GetMap. With EPSG:4326, BBOX is minLat,minLon,maxLat,maxLon. No key or login.
export function pictureUrl(layers: string[], box: Box, time: string): string {
  return GIBS_WMS + "?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0" +
    "&LAYERS=" + layers.join(",") + "&STYLES=" +
    "&CRS=EPSG:4326&BBOX=" + [box.minLat, box.minLon, box.maxLat, box.maxLon].join(",") +
    "&WIDTH=" + PICTURE_SIZE + "&HEIGHT=" + PICTURE_SIZE + "&FORMAT=image/jpeg&TIME=" + time;
}

export const picturePath = (cityId: number, localDate: string, slot: Slot) => cityId + "/" + localDate + "/" + slot + ".jpg";

// The pictures to fetch for a city at this run: only in the night window, both slots of the previous local date,
// because GIBS publishes each pass a few hours after it happens. Other runs fetch nothing.
export function picturePlan(cityId: number, lat: number, lon: number, due: Due): PicturePlan[] {
  if (due.slot !== "night") return [];
  const [y, m, d] = due.localDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
  const box = pictureBox(lat, lon);
  return (["day", "night"] as Slot[]).map(slot => ({
    slot, localDate: date, layer: PICTURE_LAYERS[slot].layer, time: passDate(date, lon, PICTURE_LAYERS[slot].passHour),
    box, path: picturePath(cityId, date, slot)
  }));
}

// Why a GIBS reply can't be stored, or null when it's a usable JPEG. GIBS sends XML errors with status 200.
export function pictureProblem(contentType: string | null, body: Uint8Array): string | null {
  const type = (contentType || "").split(";")[0].trim().toLowerCase();
  if (type !== "image/jpeg") return "not a JPEG: " + (type || "no content type");
  if (body.length < 2 || body[0] !== 0xff || body[1] !== 0xd8) return "not a JPEG: bad header";
  if (body.length < MIN_PICTURE_BYTES) return "blank picture (" + body.length + " bytes)";
  return null;
}
