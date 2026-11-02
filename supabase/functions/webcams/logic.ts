// Webcam lookup logic (spec 0010): which cities are due, the Windy Webcams API v3 request, choosing a camera from the
// reply, the retry delay, and the whole run. No network or database access of its own: index.ts passes in fetch and
// the two database calls, so logic_test.ts can drive every case with recorded fixtures and a mocked fetch.

export const WINDY_URL = "https://api.windy.com/webcams/api/v3/webcams";
export const RADIUS_KM = 25;          // owner decision, 2026-11-01
export const STALE_HOURS = 48;        // a camera not updated for longer is skipped
export const REFRESH_DAYS = 7;        // a looked-up city is looked up again after a week
export const BATCH = 10;              // cities per run, oldest due first; the rest wait for the next run
export const AT_A_TIME = 5;           // Windy requests in flight at once
export const FETCH_TIMEOUT_MS = 10000;
const HOUR_MS = 3600 * 1000;
const RETRY_MAX_MS = 24 * HOUR_MS;

export type Status = "found" | "none";

// A followed city as index.ts reads it from public.cities.
export interface CityRow {
  id: number;
  lat: number;
  lon: number;
  webcam_status: Status | null;
  webcam_checked_at: string | null;
  webcam_next_try_at: string | null;
  webcam_failures: number | null;
}

export interface Camera {
  webcam_id: number;
  webcam_title: string;
  webcam_page_url: string;
  webcam_player_url: string;
}

// The columns one lookup writes. A failure writes only the retry fields, so the stored camera and status stay.
export type Patch =
  | (Camera & { webcam_status: "found"; webcam_checked_at: string; webcam_next_try_at: null; webcam_failures: 0 })
  | { webcam_id: null; webcam_title: null; webcam_page_url: null; webcam_player_url: null;
      webcam_status: "none"; webcam_checked_at: string; webcam_next_try_at: null; webcam_failures: 0 }
  | { webcam_next_try_at: string; webcam_failures: number };

export interface Failure { city_id: number; error: string }

// --- Which cities ---

const time = (v: string | null | undefined): number => {
  const t = v ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : NaN;
};

// When a city is next due, in ms. A pending retry decides alone (so a failing first lookup backs off too);
// otherwise a city never looked up is due at once, and a looked-up one a week after its last check.
export function dueAt(c: CityRow): number {
  const retry = time(c.webcam_next_try_at);
  if (Number.isFinite(retry)) return retry;
  const checked = time(c.webcam_checked_at);
  if (!c.webcam_status || !Number.isFinite(checked)) return 0;
  return checked + REFRESH_DAYS * 24 * HOUR_MS;
}

// The followed cities due now, one entry per city id (a city followed by several users is still one row), oldest
// due first, at most `batch`.
export function dueCities(rows: CityRow[], now: Date, batch = BATCH): CityRow[] {
  const seen = new Set<number>();
  const due: CityRow[] = [];
  for (const c of rows) {
    if (!c || seen.has(c.id)) continue;
    seen.add(c.id);
    if (dueAt(c) <= now.getTime()) due.push(c);
  }
  return due.sort((a, b) => dueAt(a) - dueAt(b) || a.id - b.id).slice(0, batch);
}

// --- Request ---

// The API's nearby pattern takes plain decimals only (no exponent), so coordinates are rounded to 4 places.
const coord = (n: number) => String(Math.round(n * 1e4) / 1e4);

// limit=50 is the API's maximum, so every camera in the radius (up to 50) is compared here, sorted by popularity.
export function webcamsUrl(lat: number, lon: number): string {
  return WINDY_URL + "?nearby=" + coord(lat) + "," + coord(lon) + "," + RADIUS_KM +
    "&include=location,player,urls&sortKey=popularity&sortDirection=desc&limit=50";
}

export const windyHeaders = (key: string): Record<string, string> => ({ "x-windy-api-key": key, "Accept": "application/json" });

// --- Choosing a camera ---

// deno-lint-ignore no-explicit-any
type Json = any;

// Only https URLs on windy.com or its subdomains are stored, since the browser puts them in an iframe and a link.
function windyUrl(v: unknown): string | null {
  if (typeof v !== "string" || v.length > 500) return null;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && (u.hostname === "windy.com" || u.hostname.endsWith(".windy.com")) ? u.href : null;
  } catch {
    return null;
  }
}

// Great-circle distance in km.
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lon2 - lon1) * rad / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// The most viewed camera that is active, updated within 48 hours (when the API gives a time) and embeddable; the
// closer one wins a tie, then the lower id. The live player is preferred; cameras without one fall back to the day
// timelapse player. Returns null when none qualifies. Throws when the reply isn't the documented shape.
export function chooseCamera(body: Json, lat: number, lon: number, now: Date): Camera | null {
  if (!body || typeof body !== "object" || !Array.isArray(body.webcams)) throw new Error("bad reply");
  const picks: { cam: Camera; views: number; km: number }[] = [];
  for (const w of body.webcams) {
    if (!w || w.status !== "active") continue;
    const id = Number(w.webcamId);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    const updated = time(w.lastUpdatedOn);
    if (Number.isFinite(updated) && now.getTime() - updated > STALE_HOURS * HOUR_MS) continue;
    const player = windyUrl(w.player && w.player.live) || windyUrl(w.player && w.player.day);
    const page = windyUrl(w.urls && w.urls.detail);
    if (!player || !page) continue;
    const title = (typeof w.title === "string" ? w.title.trim() : "").slice(0, 300) || "Webcam " + id;
    const loc = w.location || {};
    const km = typeof loc.latitude === "number" && typeof loc.longitude === "number"
      ? distanceKm(lat, lon, loc.latitude, loc.longitude) : Infinity;
    const views = typeof w.viewCount === "number" && Number.isFinite(w.viewCount) ? w.viewCount : 0;
    picks.push({ cam: { webcam_id: id, webcam_title: title, webcam_page_url: page, webcam_player_url: player }, views, km });
  }
  picks.sort((a, b) => b.views - a.views || a.km - b.km || a.cam.webcam_id - b.cam.webcam_id);
  return picks.length ? picks[0].cam : null;
}

// --- Results ---

export function foundPatch(cam: Camera, now: Date): Patch {
  return { ...cam, webcam_status: "found", webcam_checked_at: now.toISOString(), webcam_next_try_at: null, webcam_failures: 0 };
}

export function nonePatch(now: Date): Patch {
  return { webcam_id: null, webcam_title: null, webcam_page_url: null, webcam_player_url: null,
    webcam_status: "none", webcam_checked_at: now.toISOString(), webcam_next_try_at: null, webcam_failures: 0 };
}

// 1, 2, 4, 8, 16, then 24 hours: the delay doubles with each failure in a row, capped at a day.
export function retryDelayMs(failuresBefore: number): number {
  const n = Math.max(0, Math.min(10, Math.floor(failuresBefore || 0)));
  return Math.min(RETRY_MAX_MS, HOUR_MS * 2 ** n);
}

export function failurePatch(c: CityRow, now: Date): Patch {
  const before = c.webcam_failures || 0;
  return { webcam_next_try_at: new Date(now.getTime() + retryDelayMs(before)).toISOString(), webcam_failures: Math.min(before + 1, 1000) };
}

// --- One lookup ---

const message = (e: unknown) =>
  e instanceof DOMException && e.name === "TimeoutError" ? "timeout" : e instanceof Error ? e.message : String(e);

// Looks up one city. Throws on a network error, the timeout (index.ts adds it to fetch), a non-2xx status (429
// included) or a reply that isn't the documented JSON. The key goes only into the request header.
export async function lookup(c: CityRow, key: string, fetchFn: typeof fetch, now: Date): Promise<Patch> {
  const res = await fetchFn(webcamsUrl(c.lat, c.lon), { headers: windyHeaders(key) });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error("HTTP " + res.status);
  }
  let body: Json;
  try {
    body = await res.json();
  } catch {
    throw new Error("bad reply");
  }
  const cam = chooseCamera(body, c.lat, c.lon, now);
  return cam ? foundPatch(cam, now) : nonePatch(now);
}

// --- The run ---

// Compares two strings in time that doesn't depend on where they first differ.
export function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export interface Deps {
  env(name: string): string | undefined;
  fetch: typeof fetch;                              // index.ts passes fetch with a FETCH_TIMEOUT_MS timeout
  loadCities(): Promise<CityRow[]>;                 // the followed cities; throws when the read fails
  save(id: number, patch: Patch): Promise<void>;    // throws when the update fails
  now?: () => Date;
  log?: (...args: unknown[]) => void;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// The whole request: 401 without the right x-collect-secret, 500 without WINDY_API_KEY (no call, no write), else
// looks up the due cities and replies 200 with counts and failures. No reply or log line contains the key.
export async function handle(req: Request, deps: Deps): Promise<Response> {
  const secret = deps.env("COLLECT_SECRET") || "";
  const given = req.headers.get("x-collect-secret") || "";
  if (!secret || !given || !sameSecret(given, secret)) return json({ error: "unauthorized" }, 401);
  const key = deps.env("WINDY_API_KEY") || "";
  if (!key) return json({ error: "WINDY_API_KEY is not set" }, 500);
  const log = deps.log || (() => {});
  const now = deps.now ? deps.now() : new Date();

  let rows: CityRow[];
  try {
    rows = await deps.loadCities();
  } catch (e) {
    log("webcams: can't read the city list:", message(e));
    return json({ error: "can't read the city list" }, 500);
  }

  const due = dueCities(rows || [], now);
  const failed: Failure[] = [];
  let found = 0, none = 0;

  async function one(c: CityRow) {
    let patch: Patch;
    try {
      patch = await lookup(c, key, deps.fetch, now);
    } catch (e) {
      const error = message(e);
      log("webcams: city " + c.id + " lookup failed:", error);
      failed.push({ city_id: c.id, error });
      patch = failurePatch(c, now);
    }
    try {
      await deps.save(c.id, patch);
      if ("webcam_status" in patch) { if (patch.webcam_status === "found") found++; else none++; }
    } catch (e) {
      log("webcams: city " + c.id + " update failed:", message(e));
      failed.push({ city_id: c.id, error: "update: " + message(e) });
    }
  }

  for (let i = 0; i < due.length; i += AT_A_TIME) await Promise.all(due.slice(i, i + AT_A_TIME).map(one));
  return json({ due: due.length, found, none, failed });
}
