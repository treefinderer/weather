// Deno unit tests for logic.ts (spec 0010, checks 2 to 7). Run by hand (Deno isn't part of tests/run.sh):
//   deno test --allow-read supabase/functions/webcams/logic_test.ts
// fetch is always a mock: no test calls the real Windy API.
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type Camera, chooseCamera, type CityRow, dueCities, handle, lookup, type Patch, retryDelayMs, webcamsUrl, WINDY_URL
} from "./logic.ts";

const fixture = (name: string) =>
  JSON.parse(Deno.readTextFileSync(new URL("./fixtures/" + name, import.meta.url)));
const NOW = new Date("2026-11-01T12:00:00Z");
const HOUR = 3600 * 1000;
const KEY = "test-windy-key-0123456789";
const SECRET = "test-collect-secret";

const city = (id: number, extra: Partial<CityRow> & Partial<Camera> = {}): CityRow => ({
  id, lat: 47.3769, lon: 8.5417, webcam_status: null, webcam_checked_at: null, webcam_next_try_at: null, webcam_failures: 0, ...extra
});
const FOUND = {
  webcam_status: "found" as const, webcam_id: 7, webcam_title: "Old camera",
  webcam_page_url: "https://webcams.windy.com/webcams/7", webcam_player_url: "https://webcams.windy.com/webcams/public//player?webcamId=7&playerType=live"
};

type Reply = unknown | Error | { status: number };
interface Call { url: string; headers: Record<string, string> }

// A fetch that answers each call with the next reply: a JSON body, { status } for an HTTP error, or an Error to throw.
function mockFetch(replies: Reply[]) {
  const calls: Call[] = [];
  const fn = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: (init?.headers || {}) as Record<string, string> });
    const r = replies.length > 1 ? replies.shift() : replies[0];
    if (r instanceof Error) return Promise.reject(r);
    if (r && typeof r === "object" && "status" in r && Object.keys(r).length === 1) {
      return Promise.resolve(new Response("{}", { status: (r as { status: number }).status }));
    }
    return Promise.resolve(new Response(typeof r === "string" ? r : JSON.stringify(r), { status: 200 }));
  }) as typeof fetch;
  return { fn, calls };
}

// Runs handle with a mocked fetch and database. Returns the reply, its JSON, the Windy calls and the saved patches.
async function run(rows: CityRow[], replies: Reply[], opts: { secret?: string | null; key?: string | null } = {}) {
  const f = mockFetch(replies);
  const saved: { id: number; patch: Patch }[] = [];
  let loads = 0;
  const env: Record<string, string> = { COLLECT_SECRET: SECRET };
  if (opts.key !== null) env.WINDY_API_KEY = opts.key ?? KEY;
  const headers: Record<string, string> = {};
  if (opts.secret !== null) headers["x-collect-secret"] = opts.secret ?? SECRET;
  const res = await handle(new Request("http://localhost/webcams", { method: "POST", headers }), {
    env: (n) => env[n], fetch: f.fn, now: () => NOW,
    loadCities: () => { loads++; return Promise.resolve(rows); },
    save: (id, patch) => { saved.push({ id, patch }); return Promise.resolve(); }
  });
  const text = await res.text();
  return { res, text, body: JSON.parse(text), calls: f.calls, saved, loads };
}

// --- Check 2: request ---

Deno.test("request: /webcams/api/v3/webcams with nearby=<lat>,<lon>,25, include has player, key from WINDY_API_KEY", async () => {
  const { calls } = await run([city(1)], [fixture("windy-empty.json")]);
  assertEquals(calls.length, 1);
  const u = new URL(calls[0].url);
  assertEquals(u.origin + u.pathname, "https://api.windy.com/webcams/api/v3/webcams");
  assertEquals(u.searchParams.get("nearby"), "47.3769,8.5417,25");
  assert(u.searchParams.get("include")!.split(",").includes("player"));
  assertEquals(u.searchParams.get("include"), "location,player,urls");
  assertEquals(calls[0].headers["x-windy-api-key"], KEY);
});

Deno.test("webcamsUrl rounds to 4 decimals and never uses exponent notation", () => {
  assertEquals(webcamsUrl(-33.868820123, 151.209290987).split("?")[0], WINDY_URL);
  assert(webcamsUrl(-33.868820123, 151.209290987).includes("nearby=-33.8688,151.2093,25&"));
  assert(webcamsUrl(0.00000001, -0.00000001).includes("nearby=0,0,25&"));
});

// --- Check 3: choosing a camera (owner decision: most viewed, closest wins a tie) ---

Deno.test("choose: skips inactive and >48 h stale cameras, then picks the most viewed (a 40 h old update still counts)", () => {
  const cam = chooseCamera(fixture("windy-nearby.json"), 47.3769, 8.5417, NOW);
  assertEquals(cam, {
    webcam_id: 1000000003,
    webcam_title: "Zürich: Lake",
    webcam_page_url: "https://webcams.windy.com/webcams/1000000003",
    webcam_player_url: "https://webcams.windy.com/webcams/public//player?webcamId=1000000003&playerType=live"
  });
});

Deno.test("choose: equal views, the closer camera wins; equal views and distance, the lower id", () => {
  const body = fixture("windy-nearby.json");
  const [, , lake, airport] = body.webcams;
  airport.viewCount = lake.viewCount;
  airport.location = { ...airport.location, latitude: 47.3770, longitude: 8.5418 }; // closer than the lake camera
  assertEquals(chooseCamera({ webcams: [lake, airport] }, 47.3769, 8.5417, NOW)!.webcam_id, 1000000004);
  airport.location = { ...lake.location };
  assertEquals(chooseCamera({ webcams: [airport, lake] }, 47.3769, 8.5417, NOW)!.webcam_id, 1000000003);
});

Deno.test("choose: a camera with no live player uses its day player", () => {
  const airport = fixture("windy-nearby.json").webcams[3];
  assertEquals(chooseCamera({ webcams: [airport] }, 47.3769, 8.5417, NOW)!.webcam_player_url,
    "https://webcams.windy.com/webcams/public//player?webcamId=1000000004&playerType=day");
});

Deno.test("choose: URLs off windy.com or not https are not used", () => {
  const lake = fixture("windy-nearby.json").webcams[2];
  lake.player = { day: "https://evil.example/player" };
  assertEquals(chooseCamera({ webcams: [lake] }, 47.3769, 8.5417, NOW), null);
  const lake2 = fixture("windy-nearby.json").webcams[2];
  lake2.urls.detail = "http://webcams.windy.com/webcams/1000000003";
  assertEquals(chooseCamera({ webcams: [lake2] }, 47.3769, 8.5417, NOW), null);
});

Deno.test("found: stores id, title, page URL and player URL with status found and no retry", async () => {
  const { saved, res } = await run([city(1, { webcam_failures: 3 })], [fixture("windy-nearby.json")]);
  assertEquals(res.status, 200);
  assertEquals(saved, [{ id: 1, patch: {
    webcam_id: 1000000003, webcam_title: "Zürich: Lake",
    webcam_page_url: "https://webcams.windy.com/webcams/1000000003",
    webcam_player_url: "https://webcams.windy.com/webcams/public//player?webcamId=1000000003&playerType=live",
    webcam_status: "found", webcam_checked_at: NOW.toISOString(), webcam_next_try_at: null, webcam_failures: 0
  } }]);
});

// --- Check 4: no camera ---

Deno.test("none: an empty reply clears the camera fields and sets status none and checked_at", async () => {
  const { saved, body } = await run([city(1, { ...FOUND, webcam_checked_at: "2026-10-20T00:00:00Z" })], [fixture("windy-empty.json")]);
  assertEquals(saved, [{ id: 1, patch: {
    webcam_id: null, webcam_title: null, webcam_page_url: null, webcam_player_url: null,
    webcam_status: "none", webcam_checked_at: NOW.toISOString(), webcam_next_try_at: null, webcam_failures: 0
  } }]);
  assertEquals(body, { due: 1, found: 0, none: 1, failed: [] });
});

Deno.test("none: every camera filtered out is also none", async () => {
  const body = fixture("windy-nearby.json");
  body.webcams = body.webcams.slice(0, 2); // the inactive one and the 50 h stale one
  const { saved } = await run([city(1)], [body]);
  assertEquals((saved[0].patch as { webcam_status: string }).webcam_status, "none");
});

// --- Check 5: failures ---

for (const [name, reply] of [
  ["HTTP 429", { status: 429 }], ["HTTP 500", { status: 500 }],
  ["timeout", new DOMException("Signal timed out.", "TimeoutError")], ["unparseable JSON", "not json{"],
  ["a reply without webcams", { total: 0 }]
] as [string, Reply][]) {
  Deno.test("failure (" + name + "): camera fields unchanged, retry in 1 hour, next city still processed, 200", async () => {
    const { res, body, saved, calls } = await run(
      // City 1 is due first (checked longer ago), so it gets the failing reply and city 2 the empty one.
      [city(1, { ...FOUND, webcam_checked_at: "2026-10-20T00:00:00Z" }), city(2, { webcam_status: "none", webcam_checked_at: "2026-10-24T00:00:00Z" })],
      [reply, fixture("windy-empty.json")]
    );
    assertEquals(res.status, 200);
    assertEquals(calls.length, 2);
    const first = saved.find(s => s.id === 1)!.patch;
    assertEquals(first, { webcam_next_try_at: new Date(NOW.getTime() + HOUR).toISOString(), webcam_failures: 1 });
    assertEquals((saved.find(s => s.id === 2)!.patch as { webcam_status: string }).webcam_status, "none");
    assertEquals(body.failed.length, 1);
    assertEquals(body.failed[0].city_id, 1);
  });
}

Deno.test("failure: the retry delay doubles from 1 hour up to 24 hours", () => {
  assertEquals([0, 1, 2, 3, 4, 5, 6, 50].map(n => retryDelayMs(n) / HOUR), [1, 2, 4, 8, 16, 24, 24, 24]);
});

Deno.test("failure: a third failure in a row waits 4 hours", async () => {
  const { saved } = await run([city(1, { webcam_next_try_at: "2026-11-01T11:00:00Z", webcam_failures: 2 })], [{ status: 503 }]);
  assertEquals(saved[0].patch, { webcam_next_try_at: new Date(NOW.getTime() + 4 * HOUR).toISOString(), webcam_failures: 3 });
});

Deno.test("lookup throws on HTTP errors rather than writing none", async () => {
  const f = mockFetch([{ status: 429 }]);
  let err = "";
  try { await lookup(city(1), KEY, f.fn, NOW); } catch (e) { err = (e as Error).message; }
  assertEquals(err, "HTTP 429");
});

// --- Check 6: which cities ---

Deno.test("due: never looked up, checked over 7 days ago, or a retry whose time has passed", () => {
  const rows = [
    city(1),                                                                                  // never looked up
    city(2, { ...FOUND, webcam_checked_at: "2026-10-30T12:00:00Z" }),                          // found 2 days ago: not due
    city(3, { webcam_status: "none", webcam_checked_at: "2026-10-24T11:00:00Z" }),             // 8 days ago
    city(4, { webcam_next_try_at: "2026-11-01T11:30:00Z", webcam_failures: 1 }),               // retry time passed
    city(5, { webcam_next_try_at: "2026-11-01T13:00:00Z", webcam_failures: 1 }),               // retry later: not due
    city(6, { ...FOUND, webcam_checked_at: "2026-10-30T12:00:00Z", webcam_next_try_at: "2026-11-01T11:59:00Z" })
  ];
  assertEquals(dueCities(rows, NOW).map(c => c.id), [1, 3, 4, 6]);
});

Deno.test("due: at most 10 per run, oldest due first", () => {
  const rows = Array.from({ length: 14 }, (_, i) =>
    city(i + 1, { webcam_status: "none", webcam_checked_at: new Date(NOW.getTime() - (8 + i) * 24 * HOUR).toISOString() }));
  assertEquals(dueCities(rows, NOW).map(c => c.id), [14, 13, 12, 11, 10, 9, 8, 7, 6, 5]);
});

Deno.test("a city followed by two users makes exactly one Windy request and one update", async () => {
  const { calls, saved } = await run([city(1), city(1)], [fixture("windy-nearby.json")]);
  assertEquals(calls.length, 1);
  assertEquals(saved.length, 1);
});

Deno.test("a city checked 2 days ago with status found makes no request", async () => {
  const { calls, saved, body } = await run([city(2, { ...FOUND, webcam_checked_at: "2026-10-30T12:00:00Z" })], [fixture("windy-nearby.json")]);
  assertEquals(calls.length, 0);
  assertEquals(saved.length, 0);
  assertEquals(body, { due: 0, found: 0, none: 0, failed: [] });
});

Deno.test("a missing or wrong x-collect-secret returns 401 and does nothing else", async () => {
  for (const secret of [null, "", "wrong"]) {
    const r = await run([city(1)], [fixture("windy-nearby.json")], { secret });
    assertEquals(r.res.status, 401);
    assertEquals([r.calls.length, r.saved.length, r.loads], [0, 0, 0]);
  }
});

// --- Check 7: the key ---

Deno.test("a missing WINDY_API_KEY makes no call, writes nothing and returns an error", async () => {
  const r = await run([city(1)], [fixture("windy-nearby.json")], { key: null });
  assertEquals(r.res.status, 500);
  assertEquals([r.calls.length, r.saved.length, r.loads], [0, 0, 0]);
});

Deno.test("no reply contains the key, also when lookups fail", async () => {
  for (const reply of [fixture("windy-nearby.json"), { status: 401 }, new Error("connection reset")]) {
    const r = await run([city(1), city(2)], [reply]);
    assert(!r.text.includes(KEY));
    assert(r.calls.every(c => !c.url.includes(KEY)));
  }
});
