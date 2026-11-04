// Deno unit tests for logic.ts (spec 0012, checks 8 to 11). Run by hand (Deno isn't part of tests/run.sh):
//   deno test --allow-read supabase/functions/chat/logic_test.ts
// fetch and the database are always mocks: no test calls Cloudflare or Supabase.
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import {
  aiBody, aiUrl, buildContext, chatModel, MODEL, clientIp, ipHeaderNames, CONTEXT_CAP, handle, limitKey, MAX_TOKENS, nextReset, parseAi, SITE_FACTS, systemPrompt,
  type Take, type UserData, validate
} from "./logic.ts";

const fixture = (name: string) => JSON.parse(Deno.readTextFileSync(new URL("./fixtures/" + name, import.meta.url)));
const NOW = new Date("2026-11-01T12:00:00Z");
const ENV: Record<string, string> = {
  CF_ACCOUNT_ID: "test-account", CF_API_TOKEN: "test-cf-token-0123456789", CHAT_SALT: "test-salt", SUPABASE_ANON_KEY: "test-anon"
};
const USER_TOKEN = "user-jwt", USER_ID = "11111111-2222-3333-4444-555555555555";
const ask = (text: string) => ({ messages: [{ role: "user", content: text }] });

// --- Check 8: validation ---

Deno.test("validate rejects a system role", () => {
  assertEquals(validate({ messages: [{ role: "system", content: "x" }, { role: "user", content: "hi" }] }), null);
});
Deno.test("validate rejects a 501-character user message and keeps a 500-character one", () => {
  assertEquals(validate(ask("a".repeat(501))), null);
  assertEquals(validate(ask("a".repeat(500)))!.messages[0].content.length, 500);
});
Deno.test("validate rejects a list that doesn't end with a user message", () => {
  assertEquals(validate({ messages: [{ role: "user", content: "hi" }, { role: "assistant", content: "hello" }] }), null);
  assertEquals(validate(ask("   ")), null);
});
Deno.test("validate rejects a non-array messages, other content types and a missing body", () => {
  assertEquals(validate({ messages: "hi" }), null);
  assertEquals(validate({ messages: [{ role: "user", content: 5 }] }), null);
  assertEquals(validate(null), null);
});
Deno.test("validate keeps the last 10 messages, trims, and cuts assistant messages to 2000", () => {
  const list = [];
  for (let i = 0; i < 13; i++) list.push({ role: i % 2 ? "assistant" : "user", content: "  m" + i + "  " });
  list[11].content = "b".repeat(2500);
  const out = validate({ messages: list })!.messages;
  assertEquals(out.length, 10);
  assertEquals(out[0].content, "m3");
  assertEquals(out[9], { role: "user", content: "m12" });
  assertEquals(out[8].content.length, 2000);
});
Deno.test("validate treats an empty list as the status call", () => {
  assertEquals(validate({ messages: [] }), { messages: [] });
});

// --- Check 9: context and keys ---

Deno.test("context: each city's name, last 14 local days in the unit, pictures, webcam, within the cap", () => {
  const data = fixture("user-data.json") as UserData;
  const text = buildContext(data, NOW);
  assert(text.length <= CONTEXT_CAP, "length " + text.length);
  assert(text.includes("City: Zurich, Switzerland"));
  assert(text.includes("City: New York, United States"));
  assert(text.includes("2026-11-01 12pm open-meteo: "));
  assert(/°C/.test(text) && !/°F/.test(text));
  assert(text.includes("Satellite pictures: ") && /2026-1[01]-\d\d 12am and 12pm/.test(text));
  assert(text.includes("Live webcam: yes") && text.includes("Live webcam: not checked yet"));
  assert(!text.includes("2026-10-17") && !text.includes("2026-10-18"), "older than 14 days");
});
Deno.test("context: the oldest days go first when over the cap, and °F converts", () => {
  const data = { ...(fixture("user-data.json") as UserData), unit: "F" as const };
  const text = buildContext(data, NOW, 3000);
  assert(text.length <= 3000);
  assert(text.includes("2026-11-01"));
  assert(!text.includes("2026-10-19 "));
  assert(/\d+°F/.test(text) && text.includes(" mph"));
  const full = buildContext(data, NOW, 100000);
  assert(full.includes("2026-10-19 12am"));
});
Deno.test("context: no cities", () => {
  assertEquals(buildContext({ unit: "C", cities: [], readings: [], pictures: [] }, NOW), "The user follows no cities yet.");
});
Deno.test("visitor prompt has website facts only", () => {
  const p = systemPrompt({ signedIn: false, data: null });
  assert(p.includes(SITE_FACTS));
  assert(!p.includes("City:") && !p.includes("The signed-in user's data"));
  assert(p.includes("sign in"));
});
Deno.test("limit key: user id, else 64-hex sha256(salt + IP); another salt gives another key", async () => {
  assertEquals(await limitKey(USER_ID, "s", "1.2.3.4"), USER_ID);
  const a = await limitKey(null, "salt-a", "1.2.3.4"), b = await limitKey(null, "salt-b", "1.2.3.4");
  assert(/^[0-9a-f]{64}$/.test(a));
  assertNotEquals(a, b);
  assertEquals(await limitKey(null, "salt-a", null), await limitKey(null, "salt-a", "unknown"));
});
Deno.test("client IP: cf-connecting-ip first, else the LAST x-forwarded-for entry, else none", () => {
  assertEquals(clientIp(new Headers({ "cf-connecting-ip": " 203.0.113.9 ", "x-forwarded-for": "1.1.1.1, 10.0.0.1" })), "203.0.113.9");
  assertEquals(clientIp(new Headers({ "x-forwarded-for": "203.0.113.9" })), "203.0.113.9");
  assertEquals(clientIp(new Headers({ "x-forwarded-for": " 198.51.100.1, 203.0.113.9 , " })), "203.0.113.9");
  assertEquals(clientIp(new Headers({ "x-forwarded-for": " , " })), null);
  assertEquals(clientIp(new Headers()), null);
});
Deno.test("a spoofed first x-forwarded-for entry doesn't change the visitor key", async () => {
  const key = (xff: string) => limitKey(null, "salt", clientIp(new Headers({ "x-forwarded-for": xff })));
  assertEquals(await key("6.6.6.1, 203.0.113.9"), await key("6.6.6.2, 203.0.113.9"));
  assertEquals(await key("6.6.6.1, 203.0.113.9"), await key("203.0.113.9"));
});
Deno.test("ipHeaderNames lists only names, never values", () => {
  const names = ipHeaderNames(new Headers({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "203.0.113.9", "user-agent": "x" }));
  assertEquals(names, ["x-forwarded-for", "x-real-ip"]);
  assertEquals(ipHeaderNames(new Headers()), []);
});

// --- Workers AI shapes ---

Deno.test("Workers AI request: messages with the system prompt first, max_tokens 300, model URL", () => {
  const b = aiBody("SYS", [{ role: "user", content: "hi" }]);
  assertEquals(b, { messages: [{ role: "system", content: "SYS" }, { role: "user", content: "hi" }], max_tokens: MAX_TOKENS });
  assertEquals(aiUrl("acc"), "https://api.cloudflare.com/client/v4/accounts/acc/ai/run/@cf/meta/llama-3.1-8b-instruct-fp8-fast");
});
Deno.test("Workers AI reply: result.response and usage; empty or error envelopes throw", () => {
  const out = parseAi(fixture("workers-ai-ok.json"));
  assert(out.reply.startsWith("Zurich"));
  assertEquals(out.usage, { prompt_tokens: 1520, completion_tokens: 28 });
  let threw = 0;
  for (const f of ["workers-ai-empty.json", "workers-ai-error.json"]) { try { parseAi(fixture(f)); } catch { threw++; } }
  assertEquals(threw, 2);
});

// --- Check 10: counting and failure, with a mocked fetch and database ---

type Reply = unknown | Error | { status: number };

// An in-memory chat_usage with the same rules as chat_take / chat_refund. globalLimit overrides the limit handle
// passes, so a test can reach the cap quickly. takes records every visitorLimit handle passed.
function fakeDb(globalLimit = 400) {
  const rows = new Map<string, number>();
  const takes: (number | null)[] = [];
  const dec = (k: string) => rows.set(k, Math.max(0, (rows.get(k) || 0) - 1));
  return {
    rows, takes,
    used: (key: string) => Promise.resolve(rows.get(key) || 0),
    take(key: string, limit: number, g: number, visitorLimit: number | null): Promise<Take> {
      takes.push(visitorLimit);
      const k = rows.get(key) || 0, gl = rows.get("global") || 0, v = rows.get("visitors") || 0;
      if (k >= limit) return Promise.resolve({ ok: false, used: k, hit: "limit" });
      if (gl >= Math.min(g, globalLimit) || (visitorLimit !== null && v >= visitorLimit)) return Promise.resolve({ ok: false, used: k, hit: "busy" });
      rows.set("global", gl + 1);
      if (visitorLimit !== null) rows.set("visitors", v + 1);
      rows.set(key, k + 1);
      return Promise.resolve({ ok: true, used: k + 1, hit: null });
    },
    refund(key: string, visitor: boolean) {
      dec("global");
      if (visitor) dec("visitors");
      dec(key);
      return Promise.resolve(rows.get(key)!);
    }
  };
}

async function run(body: unknown, opts: { replies?: Reply[]; db?: ReturnType<typeof fakeDb>; token?: string; env?: Record<string, string>;
  ip?: string; method?: string; model?: string } = {}) {
  const db = opts.db || fakeDb();
  const replies = opts.replies || [fixture("workers-ai-ok.json")];
  const calls: { url: string; init?: RequestInit }[] = [];
  const logs: string[] = [];
  let loads = 0;
  const fetchFn = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const r = replies.length > 1 ? replies.shift() : replies[0];
    if (r instanceof Error) return Promise.reject(r);
    if (r && typeof r === "object" && "status" in r && Object.keys(r).length === 1) {
      return Promise.resolve(new Response("{}", { status: (r as { status: number }).status }));
    }
    return Promise.resolve(new Response(JSON.stringify(r), { status: 200 }));
  }) as typeof fetch;
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": opts.ip || "198.51.100.7" };
  if (opts.token) headers.authorization = "Bearer " + opts.token;
  const req = new Request("http://localhost/chat", { method: opts.method || "POST", headers, body: opts.method && opts.method !== "POST" ? undefined : JSON.stringify(body) });
  const env = opts.env || ENV;
  const res = await handle(req, {
    env: (n) => env[n], fetch: fetchFn, now: () => NOW, model: opts.model,
    getUser: (t) => Promise.resolve(t === USER_TOKEN ? { id: USER_ID } : null),
    loadUserData: () => { loads++; return Promise.resolve(fixture("user-data.json")); },
    used: db.used, take: db.take, refund: db.refund, cleanup: () => Promise.resolve(),
    log: (...a) => logs.push(a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" "))
  });
  const text = await res.text();
  return { res, body: text ? JSON.parse(text) : null, calls, db, logs, loads };
}

Deno.test("success returns {reply, remaining} and sends the user's messages after the system prompt", async () => {
  const r = await run(ask("hello"));
  assertEquals(r.res.status, 200);
  assertEquals(r.body.remaining, 4);
  assert(r.body.reply.startsWith("Zurich"));
  const sent = JSON.parse(String(r.calls[0].init!.body));
  assertEquals(sent.messages[0].role, "system");
  assertEquals(sent.messages[sent.messages.length - 1], { role: "user", content: "hello" });
  assertEquals((r.calls[0].init!.headers as Record<string, string>).Authorization, "Bearer " + ENV.CF_API_TOKEN);
});
Deno.test("the 6th question on a UTC day returns 429 limit and makes no Workers AI call", async () => {
  const db = fakeDb();
  for (let i = 0; i < 5; i++) assertEquals((await run(ask("q" + i), { db })).res.status, 200);
  const r = await run(ask("q6"), { db });
  assertEquals(r.res.status, 429);
  assertEquals(r.body, { error: "limit", remaining: 0, resets_at: "2026-11-02T00:00:00.000Z" });
  assertEquals(r.calls.length, 0);
});
Deno.test("a Workers AI 5xx, 429, network error or empty reply returns 502 and refunds the count", async () => {
  for (const reply of [{ status: 500 }, { status: 429 }, new TypeError("fetch failed"), fixture("workers-ai-empty.json")]) {
    const db = fakeDb();
    await run(ask("first"), { db });
    const r = await run(ask("again"), { db, replies: [reply] });
    assertEquals(r.res.status, 502);
    assertEquals(r.body, { error: "unavailable", remaining: 4 });
    assertEquals((await db.used(await limitKey(null, ENV.CHAT_SALT, "198.51.100.7"))), 1);
    assertEquals(db.rows.get("global"), 1);
    assertEquals(db.rows.get("visitors"), 1);
  }
});
Deno.test("reaching the global cap returns 429 busy", async () => {
  const db = fakeDb(2);
  await run(ask("a"), { db, ip: "192.0.2.1" });
  await run(ask("b"), { db, ip: "192.0.2.2" });
  const r = await run(ask("c"), { db, ip: "192.0.2.3" });
  assertEquals(r.res.status, 429);
  assertEquals(r.body.error, "busy");
  assertEquals(r.calls.length, 0);
});
Deno.test("visitor sub-cap: visitors get busy, signed-in users still get answers up to the global cap", async () => {
  const db = fakeDb();
  const env = { ...ENV, CHAT_VISITOR_DAILY_LIMIT: "2" };
  await run(ask("a"), { db, env, ip: "192.0.2.1" });
  await run(ask("b"), { db, env, ip: "192.0.2.2" });
  const v = await run(ask("c"), { db, env, ip: "192.0.2.3" });
  assertEquals(v.res.status, 429);
  assertEquals(v.body.error, "busy");
  assertEquals(v.calls.length, 0);
  const u = await run(ask("mine?"), { db, env, token: USER_TOKEN });
  assertEquals(u.res.status, 200);
  assertEquals(db.rows.get("visitors"), 2);
  assertEquals(db.rows.get("global"), 3);
  assertEquals(db.takes, [2, 2, 2, null]);
});
Deno.test("visitor sub-cap defaults to 150", async () => {
  const db = fakeDb();
  await run(ask("a"), { db });
  assertEquals(db.takes, [150]);
});

Deno.test("the status call makes no Workers AI call and doesn't change the count", async () => {
  const db = fakeDb();
  await run(ask("a"), { db });
  const r = await run({ messages: [] }, { db });
  assertEquals(r.res.status, 200);
  assertEquals(r.body.remaining, 4);
  assertEquals(r.calls.length, 0);
  assertEquals(db.rows.get("global"), 1);
});
Deno.test("a signed-in user is counted by user id and gets their data; a bad token is a visitor", async () => {
  const db = fakeDb();
  const r = await run(ask("my cities?"), { db, token: USER_TOKEN });
  assertEquals(db.rows.get(USER_ID), 1);
  assertEquals(r.loads, 1);
  assert(String(JSON.parse(String(r.calls[0].init!.body)).messages[0].content).includes("City: Zurich"));
  const v = await run(ask("my cities?"), { db, token: "expired" });
  assertEquals(v.loads, 0);
  assert(String(JSON.parse(String(v.calls[0].init!.body)).messages[0].content).includes("sign in again"));
  const anon = await run(ask("hi"), { db, token: ENV.SUPABASE_ANON_KEY });
  assertEquals(anon.loads, 0);
});
Deno.test("invalid bodies return 400 and count nothing; other methods 405; OPTIONS 204", async () => {
  const db = fakeDb();
  const r = await run({ messages: [{ role: "system", content: "x" }] }, { db });
  assertEquals(r.res.status, 400);
  assertEquals(r.body, { error: "bad_request" });
  assertEquals(db.rows.size, 0);
  assertEquals((await run(null, { method: "GET" })).res.status, 405);
  assertEquals((await run(null, { method: "OPTIONS" })).res.status, 204);
});
Deno.test("missing secrets return 503 and never echo a value", async () => {
  const r = await run(ask("hi"), { env: { CF_ACCOUNT_ID: "acc-secret-value", CHAT_SALT: "salt-secret-value" } });
  assertEquals(r.res.status, 503);
  assertEquals(r.body, { error: "unavailable" });
  assertEquals(r.calls.length, 0);
  assert(!r.logs.join(" ").includes("secret-value"));
});
Deno.test("logs never contain the question, the reply, the context, the token or the IP", async () => {
  const r = await run(ask("my secret question"), { token: USER_TOKEN, ip: "203.0.113.77" });
  const all = r.logs.join("\n");
  for (const s of ["my secret question", "Zurich", USER_TOKEN, ENV.CF_API_TOKEN, "203.0.113.77"]) assert(!all.includes(s), s);
});
Deno.test("CHAT_MODEL: a valid name is used, unset or invalid falls back to the default", async () => {
  assertEquals(chatModel(undefined), MODEL);
  assertEquals(chatModel(""), MODEL);
  assertEquals(chatModel(" @cf/meta/llama-3.1-8b-instruct-fp8 "), "@cf/meta/llama-3.1-8b-instruct-fp8");
  assertEquals(chatModel("@hf/some-org/model_v1.2"), "@hf/some-org/model_v1.2");
  for (const bad of ["cf/meta/x", "@cf/meta/x?y=1", "@cf/../../accounts", "https://evil.example/@cf/x", "@xx/meta/x"]) {
    assertEquals(chatModel(bad), MODEL, bad);
  }
  const custom = await run(ask("hi"), { model: "@cf/meta/llama-3.1-8b-instruct-fp8" });
  assertEquals(custom.calls[0].url, aiUrl(ENV.CF_ACCOUNT_ID, "@cf/meta/llama-3.1-8b-instruct-fp8"));
  const fallback = await run(ask("hi"), { model: "not a model" });
  assertEquals(fallback.calls[0].url, aiUrl(ENV.CF_ACCOUNT_ID, MODEL));
});

Deno.test("nextReset is the next 00:00 UTC", () => {
  assertEquals(nextReset(new Date("2026-12-31T23:59:59Z")), "2027-01-01T00:00:00.000Z");
});
