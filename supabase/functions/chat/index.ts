// Chat assistant Edge Function (spec 0012), called by the browser (not by cron). Deploy with JWT verification off:
// visitors call it with the anon key, signed-in users with their access token. Answers short questions about the site
// and, for a signed-in user, about their own cities' history, through Cloudflare Workers AI. 5 questions per user id
// or salted IP hash per UTC day, plus a global cap. No conversation is stored.
// CF_ACCOUNT_ID, CF_API_TOKEN and CHAT_SALT exist only as Edge Function secrets; CHAT_GLOBAL_DAILY_LIMIT and
// CHAT_MODEL (a Workers AI model name, used instead of the default in logic.ts) are optional.
// The user's data is read with a client carrying the user's token, so RLS applies. The service role is used only for
// public.chat_usage (chat_take, chat_refund, today's count for the status call, and the cleanup).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { AI_TIMEOUT_MS, handle, HISTORY_DAYS, KEEP_DAYS, type PictureRow, type ReadingRow, type Take, type UserData } from "./logic.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const NO_SESSION = { persistSession: false, autoRefreshToken: false };
const READING_COLS = "city_id, source, slot, local_date, temperature_c, feels_like_c, humidity_pct, wind_speed_ms, precipitation_mm, weather_code";

let service: ReturnType<typeof createClient> | null = null;
const admin = () => service ??= createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: NO_SESSION });
const asUser = (token: string) =>
  createClient(URL_, ANON, { auth: NO_SESSION, global: { headers: { Authorization: "Bearer " + token } } });
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

Deno.serve((req) => handle(req, {
  env: (name) => Deno.env.get(name),
  fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(AI_TIMEOUT_MS) }),
  model: Deno.env.get("CHAT_MODEL"),

  async getUser(token) {
    const res = await asUser(token).auth.getUser(token);
    return res.error || !res.data.user ? null : { id: res.data.user.id };
  },

  // Everything through the user's own client: RLS limits each query to their rows and the cities they follow.
  async loadUserData(token, userId) {
    const db = asUser(token);
    const profile = must(await db.from("profiles").select("unit").eq("id", userId).maybeSingle()) as { unit?: string } | null;
    const follows = must(await db.from("user_cities").select("cities(id, name, country, timezone, webcam_status)").eq("user_id", userId)) as
      unknown as { cities: UserData["cities"][number] | null }[];
    const cities = (follows || []).map(f => f.cities).filter((c): c is UserData["cities"][number] => !!c);
    if (!cities.length) return { unit: profile?.unit === "F" ? "F" : "C", cities: [], readings: [], pictures: [] };
    const ids = cities.map(c => c.id);
    // A day of slack on each side for time zones; logic.ts keeps exactly each city's last 14 local dates.
    const since = daysAgo(HISTORY_DAYS + 1);
    const readings = must(await db.from("readings").select(READING_COLS).in("city_id", ids).gte("local_date", since)
      .order("local_date", { ascending: false }).limit(1000)) as unknown as ReadingRow[];
    const pictures = must(await db.from("city_pictures").select("city_id, local_date, slot").in("city_id", ids).gte("local_date", since)
      .limit(1000)) as unknown as PictureRow[];
    return { unit: profile?.unit === "F" ? "F" : "C", cities, readings: readings || [], pictures: pictures || [] };
  },

  async used(key) {
    const row = must(await admin().from("chat_usage").select("count").eq("key", key).eq("day", today()).maybeSingle()) as { count?: number } | null;
    return row?.count ?? 0;
  },

  async take(key, limit, globalLimit) {
    const rows = must(await admin().rpc("chat_take", { p_key: key, p_limit: limit, p_global_limit: globalLimit })) as unknown as
      { ok: boolean; used: number; hit: Take["hit"] }[];
    const r = Array.isArray(rows) ? rows[0] : rows;
    if (!r) throw new Error("no row");
    return { ok: !!r.ok, used: Number(r.used) || 0, hit: r.hit };
  },

  async refund(key) {
    return Number(must(await admin().rpc("chat_refund", { p_key: key }))) || 0;
  },

  async cleanup() {
    must(await admin().from("chat_usage").delete().lt("day", daysAgo(KEEP_DAYS)));
  },

  // Only status codes, error kinds, durations and token counts reach here (see logic.ts).
  log: (...args) => console.error(...args)
}));
