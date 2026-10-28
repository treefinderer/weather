// Unsubscribe Edge Function (spec 0004), public. Turns email notifications off for the token's owner.
// Acts only on POST: from the app (JSON body { "token": "..." }) or from a mail client's one-click
// List-Unsubscribe-Post (token in the ?t= query). GET and other methods do nothing, because mail scanners follow links.
// CORS allows only the app's origin. Replies carry no user data. Deploy with JWT verification off.
// The token code is a copy of notify/logic.ts (functions can't import across folders); keep the two in step.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const APP_URL = Deno.env.get("APP_URL") || "https://treefinderer.github.io/weather/";
const ORIGIN = new URL(APP_URL).origin;
const CORS = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// --- Tokens: <unsub_id>.<base64url(HMAC-SHA256(secret, "unsub:" + unsub_id))> ---

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
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// The unsub_id of a valid token, or null for a malformed, tampered or differently signed one.
async function verifyUnsubToken(secret: string, token: unknown): Promise<string | null> {
  if (!secret || typeof token !== "string" || token.length > 200) return null;
  const dot = token.indexOf(".");
  const id = token.slice(0, dot), sig = token.slice(dot + 1);
  if (dot < 0 || !UUID.test(id) || !sig) return null;
  return sameSecret(sig, await sign(secret, id)) ? id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("UNSUBSCRIBE_SECRET") || "";
  if (!secret) {
    console.error("unsubscribe: UNSUBSCRIBE_SECRET is not set");
    return json({ error: "not_configured" }, 500);
  }

  // The app sends JSON; a one-click mail client posts "List-Unsubscribe=One-Click" with the token in the URL.
  let token: unknown = new URL(req.url).searchParams.get("t");
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    try {
      const body = await req.json();
      if (body && typeof body.token === "string") token = body.token;
    } catch (_) { /* no usable body: the query token, if any, is used */ }
  }

  const unsubId = await verifyUnsubToken(secret, token);
  if (!unsubId) return json({ error: "invalid_token" }, 400);

  // Only now, with a verified token, look the row up. A missing row (account deleted) is still a success.
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const res = await db.from("notification_settings").update({ enabled: false }).eq("unsub_id", unsubId);
  if (res.error) {
    console.error("unsubscribe: update failed", res.error);
    return json({ error: "server_error" }, 500);
  }
  return json({ unsubscribed: true });
});
