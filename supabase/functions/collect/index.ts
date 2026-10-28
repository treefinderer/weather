// Collector Edge Function (spec 0002). pg_cron calls it at minute 5 of every UTC hour with the x-collect-secret
// header. For each followed city whose local hour is in the 12am or 12pm window, it fetches the sources that
// have no row yet for that slot and stores one reading per source. Deploy with JWT verification off.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  dueSlot, MET_USER_AGENT, metUrl, openMeteoUrl, parseMet, parseOpenMeteo,
  type Due, type Reading, type Source
} from "./logic.ts";

const FETCH_TIMEOUT_MS = 10000;
const CITIES_AT_A_TIME = 5;
const SOURCES: Source[] = ["open-meteo", "met-norway"];

interface City { id: number; lat: number; lon: number; timezone: string }
interface Failure { city_id: number; source: Source | null; error: string }

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

const rowKey = (cityId: number, source: string, localDate: string, slot: string) => [cityId, source, localDate, slot].join("|");
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

  // due, inserted and skipped count (city, source) pairs: due = inserted + skipped + source failures.
  let pairs = 0, inserted = 0, skipped = 0;

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
  }

  for (let i = 0; i < due.length; i += CITIES_AT_A_TIME) {
    await Promise.all(due.slice(i, i + CITIES_AT_A_TIME).map(collectCity));
  }

  return json({ due: pairs, inserted, skipped, failed });
});
