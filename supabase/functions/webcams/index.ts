// Webcam lookup Edge Function (spec 0010). pg_cron calls it at minute 35 of every UTC hour with the x-collect-secret
// header (the same secret and Vault entries as collect). It finds one Windy webcam per followed city that is due
// (never looked up, checked over a week ago, or a retry whose time has come), at most 10 cities per run, and stores
// it on the shared cities row. No image is stored. Deploy with JWT verification off.
// WINDY_API_KEY exists only as an Edge Function secret; it is sent only in the Windy request header.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { FETCH_TIMEOUT_MS, handle, type CityRow, type Patch } from "./logic.ts";

const CITY_COLS = "id, lat, lon, webcam_status, webcam_checked_at, webcam_next_try_at, webcam_failures, user_cities!inner(city_id)";

Deno.serve((req) => {
  // The service role bypasses RLS; Supabase provides both values to every function. Created only after the secret
  // check inside handle has passed, by the first database call.
  let client: ReturnType<typeof createClient> | null = null;
  const db = () => client ??= createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  return handle(req, {
    env: (name) => Deno.env.get(name),
    fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }),
    // Only cities that at least one user follows right now (the inner join drops the others).
    async loadCities() {
      const res = await db().from("cities").select(CITY_COLS);
      if (res.error) throw new Error(res.error.message);
      return (res.data || []) as unknown as CityRow[];
    },
    async save(id: number, patch: Patch) {
      const res = await db().from("cities").update(patch).eq("id", id);
      if (res.error) throw new Error(res.error.message);
    },
    log: (...args) => console.error(...args)
  });
});
