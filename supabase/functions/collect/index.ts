// Collector Edge Function (spec 0002). pg_cron calls it at minute 5 of every UTC hour with the x-collect-secret
// header. For each followed city whose local hour is in the 12am or 12pm window, it fetches the sources that
// have no row yet for that slot and stores one reading per source. Deploy with JWT verification off.
// Spec 0009: in the night window it then stores the previous date's day and night satellite pictures from NASA GIBS,
// once per city and shared by every follower. A picture failure never blocks or undoes a reading.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  dueSlot, MET_USER_AGENT, metUrl, openMeteoUrl, parseMet, parseOpenMeteo, PICTURE_BUCKET, PICTURE_OVERLAY, pictureProblem,
  picturePlan, pictureUrl, type Due, type PicturePlan, type Reading, type Slot, type Source
} from "./logic.ts";

const FETCH_TIMEOUT_MS = 10000;
const PICTURE_TIMEOUT_MS = 15000;
const CITIES_AT_A_TIME = 5;
const SOURCES: Source[] = ["open-meteo", "met-norway"];

interface City { id: number; lat: number; lon: number; timezone: string }
interface Failure { city_id: number; source: Source | "gibs" | null; slot?: Slot; error: string }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Compares two strings in time that doesn't depend on where they first differ.
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error("HTTP " + res.status);
  }
  return await res.json();
}

async function fetchReading(source: Source, city: City, now: Date): Promise<Reading> {
  if (source === "open-meteo") return parseOpenMeteo(await getJson(openMeteoUrl(city.lat, city.lon)));
  return parseMet(await getJson(metUrl(city.lat, city.lon), { "User-Agent": MET_USER_AGENT }), now);
}

// One GetMap request. Throws on a network error, the timeout, a non-2xx status, or a reply that isn't a usable JPEG.
async function getPicture(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { "User-Agent": MET_USER_AGENT }, signal });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error("HTTP " + res.status);
  }
  const body = new Uint8Array(await res.arrayBuffer());
  const problem = pictureProblem(res.headers.get("content-type"), body);
  if (problem) throw new Error(problem);
  return body;
}

// The base layer alone first: a blank reply is small only without the overlay (coastlines drawn on black are bigger
// than the blank limit). Then base plus overlay, which is what is stored; if only that request fails, the base is kept.
async function fetchPicture(plan: PicturePlan): Promise<Uint8Array> {
  const signal = AbortSignal.timeout(PICTURE_TIMEOUT_MS);
  const base = await getPicture(pictureUrl([plan.layer], plan.box, plan.time), signal);
  try {
    return await getPicture(pictureUrl([plan.layer, PICTURE_OVERLAY], plan.box, plan.time), signal);
  } catch (e) {
    console.error("collect: overlay failed for " + plan.path + ", keeping the base layer:", message(e));
    return base;
  }
}

const rowKey = (cityId: number, source: string, localDate: string, slot: string) => [cityId, source, localDate, slot].join("|");
const picKey = (cityId: number, localDate: string, slot: string) => [cityId, localDate, slot].join("|");
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

Deno.serve(async (req) => {
  const secret = Deno.env.get("COLLECT_SECRET") || "";
  const given = req.headers.get("x-collect-secret") || "";
  if (!secret || !given || !sameSecret(given, secret)) return json({ error: "unauthorized" }, 401);

  // The service role bypasses RLS; Supabase provides both values to every function.
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const now = new Date();
  const failed: Failure[] = [];

  // Only cities that at least one user follows right now.
  const list = await db.from("cities").select("id, lat, lon, timezone, user_cities!inner(city_id)");
  if (list.error) {
    console.error("collect: can't read the city list", list.error);
    return json({ error: "can't read the city list" }, 500);
  }

  const due: { city: City; slot: Due }[] = [];
  for (const c of (list.data || []) as City[]) {
    try {
      const slot = dueSlot(now, c.timezone);
      if (slot) due.push({ city: { id: c.id, lat: c.lat, lon: c.lon, timezone: c.timezone }, slot });
    } catch (e) {
      failed.push({ city_id: c.id, source: null, error: "bad timezone: " + message(e) });
    }
  }

  // Rows that already exist for the due slots. If this read fails, fetch anyway: the insert ignores duplicates.
  const existing = new Set<string>();
  if (due.length) {
    const ids = due.map(d => d.city.id);
    const dates = [...new Set(due.map(d => d.slot.localDate))];
    const have = await db.from("readings").select("city_id, source, local_date, slot").in("city_id", ids).in("local_date", dates);
    if (have.error) console.error("collect: can't read existing readings", have.error);
    for (const r of have.data || []) existing.add(rowKey(r.city_id, r.source, r.local_date, r.slot));
  }

  // Pictures that already exist for the night-window cities, read the same way (a failed read means fetch anyway).
  const plans = new Map<number, PicturePlan[]>();
  for (const d of due) plans.set(d.city.id, picturePlan(d.city.id, d.city.lat, d.city.lon, d.slot));
  const havePics = new Set<string>();
  const planned = [...plans.values()].flat();
  if (planned.length) {
    const ids = [...new Set([...plans.keys()].filter(id => plans.get(id)!.length))];
    const dates = [...new Set(planned.map(p => p.localDate))];
    const have = await db.from("city_pictures").select("city_id, local_date, slot").in("city_id", ids).in("local_date", dates);
    if (have.error) console.error("collect: can't read existing pictures", have.error);
    for (const r of have.data || []) havePics.add(picKey(r.city_id, r.local_date, r.slot));
  }

  // due, inserted and skipped count (city, source) pairs: due = inserted + skipped + source failures.
  // The picture counts are separate: pictures_due = pictures_inserted + pictures_skipped + picture failures.
  let pairs = 0, inserted = 0, skipped = 0;
  let picsDue = 0, picsInserted = 0, picsSkipped = 0;

  // Uploads first, then the row. An object left by an earlier run whose row insert failed counts as already there,
  // and the row insert ignores duplicates, so overlapping runs can't make a second picture.
  async function storePicture(city: City, plan: PicturePlan) {
    picsDue++;
    if (havePics.has(picKey(city.id, plan.localDate, plan.slot))) { picsSkipped++; return; }
    try {
      const bytes = await fetchPicture(plan);
      const up = await db.storage.from(PICTURE_BUCKET).upload(plan.path, bytes, { contentType: "image/jpeg", upsert: false });
      // Storage answers "The resource already exists" when the object is there.
      if (up.error && !/already exists|duplicate/i.test(up.error.message)) throw new Error("upload: " + up.error.message);
      const b = plan.box;
      const res = await db.from("city_pictures")
        .upsert({ city_id: city.id, local_date: plan.localDate, slot: plan.slot, layer: plan.layer, image_time: plan.time,
          bbox: [b.minLat, b.minLon, b.maxLat, b.maxLon], storage_path: plan.path, bytes: bytes.length },
          { onConflict: "city_id,local_date,slot", ignoreDuplicates: true })
        .select("id");
      if (res.error) throw new Error("insert: " + res.error.message);
      if (res.data && res.data.length) picsInserted++; else picsSkipped++;
    } catch (e) {
      console.error("collect: city " + city.id + " picture " + plan.localDate + " " + plan.slot + " failed:", message(e));
      failed.push({ city_id: city.id, source: "gibs", slot: plan.slot, error: plan.localDate + ": " + message(e) });
    }
  }

  async function collectCity({ city, slot }: { city: City; slot: Due }) {
    await Promise.all(SOURCES.map(async (source) => {
      pairs++;
      if (existing.has(rowKey(city.id, source, slot.localDate, slot.slot))) { skipped++; return; }
      try {
        const reading = await fetchReading(source, city, now);
        const res = await db.from("readings")
          .upsert({ city_id: city.id, source, slot: slot.slot, local_date: slot.localDate, ...reading },
            { onConflict: "city_id,source,local_date,slot", ignoreDuplicates: true })
          .select("id");
        if (res.error) throw new Error("insert: " + res.error.message);
        if (res.data && res.data.length) inserted++; else skipped++;
      } catch (e) {
        console.error("collect: city " + city.id + " " + source + " failed:", message(e));
        failed.push({ city_id: city.id, source, error: message(e) });
      }
    }));
    // Pictures come after the city's readings, each in its own try/catch.
    await Promise.all((plans.get(city.id) || []).map(plan => storePicture(city, plan)));
  }

  for (let i = 0; i < due.length; i += CITIES_AT_A_TIME) {
    await Promise.all(due.slice(i, i + CITIES_AT_A_TIME).map(collectCity));
  }

  return json({ due: pairs, inserted, skipped, pictures_due: picsDue, pictures_inserted: picsInserted, pictures_skipped: picsSkipped, failed });
});
