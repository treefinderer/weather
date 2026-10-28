// Deno unit tests for logic.ts (spec 0004, checks 8 to 11). Run by hand (Deno isn't part of tests/run.sh):
//   deno test --allow-read supabase/functions/notify/logic_test.ts
import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import {
  buildAlert, buildDaily, buildWeekly, classifySend, cleanSubject, digestCities, digestDue, escapeHtml, matchAlerts,
  rangeText, unsubToken, verifyUnsubToken, type AlertRule, type City, type ReadingRow
} from "./logic.ts";

const fixture = (name: string) =>
  JSON.parse(Deno.readTextFileSync(new URL("./fixtures/" + name, import.meta.url)));
const at = (iso: string) => new Date(iso);
const ROWS: ReadingRow[] = fixture("readings.json");
const [LISBON, AB]: City[] = fixture("cities.json");
const LINKS = { appUrl: "https://treefinderer.github.io/weather/", unsubscribeUrl: "https://treefinderer.github.io/weather/?unsubscribe=t" };

// --- Check 8: send windows ---

Deno.test("digestDue: due in local hours send_hour to send_hour + 2 only", () => {
  assertEquals(digestDue(at("2026-10-28T06:20:00Z"), "Europe/Lisbon", 7), null);
  assertEquals(digestDue(at("2026-10-28T07:20:00Z"), "Europe/Lisbon", 7), "2026-10-28");
  assertEquals(digestDue(at("2026-10-28T09:20:00Z"), "Europe/Lisbon", 7), "2026-10-28");
  assertEquals(digestDue(at("2026-10-28T10:20:00Z"), "Europe/Lisbon", 7), null);
});

Deno.test("digestDue: uses the user's timezone", () => {
  // 07:20 UTC is 03:20 in New York and 16:20 in Tokyo.
  assertEquals(digestDue(at("2026-10-28T07:20:00Z"), "America/New_York", 7), null);
  assertEquals(digestDue(at("2026-10-28T11:20:00Z"), "America/New_York", 7), "2026-10-28");
  assertEquals(digestDue(at("2026-10-28T07:20:00Z"), "Asia/Tokyo", 16), "2026-10-28");
});

Deno.test("digestDue: across DST changes", () => {
  // New York falls back on Nov 1 2026 (01:00-01:59 happens twice): every window hour stays on Nov 1.
  assertEquals(digestDue(at("2026-11-01T05:20:00Z"), "America/New_York", 1), "2026-11-01"); // 01:20 EDT
  assertEquals(digestDue(at("2026-11-01T06:20:00Z"), "America/New_York", 1), "2026-11-01"); // 01:20 EST
  assertEquals(digestDue(at("2026-11-01T07:20:00Z"), "America/New_York", 1), "2026-11-01"); // 02:20 EST
  assertEquals(digestDue(at("2026-11-01T08:20:00Z"), "America/New_York", 1), "2026-11-01"); // 03:20 EST
  assertEquals(digestDue(at("2026-11-01T09:20:00Z"), "America/New_York", 1), null);         // 04:20 EST
  // Berlin skips 02:00-02:59 on Mar 28 2027: a 02:00 send time still goes out at 03:20.
  assertEquals(digestDue(at("2027-03-28T00:20:00Z"), "Europe/Berlin", 2), null);         // 01:20 CET
  assertEquals(digestDue(at("2027-03-28T01:20:00Z"), "Europe/Berlin", 2), "2027-03-28"); // 03:20 CEST
  assertEquals(digestDue(at("2027-03-28T03:20:00Z"), "Europe/Berlin", 2), null);         // 05:20 CEST
});

Deno.test("digestDue: a window past midnight keeps the date it opened on", () => {
  assertEquals(digestDue(at("2026-10-27T23:20:00Z"), "UTC", 23), "2026-10-27");
  assertEquals(digestDue(at("2026-10-28T01:20:00Z"), "UTC", 23), "2026-10-27");
  assertEquals(digestDue(at("2026-10-28T02:20:00Z"), "UTC", 23), null);
});

Deno.test("digestDue: weekly only on the chosen ISO weekday", () => {
  // Oct 28 2026 is a Wednesday (3).
  assertEquals(digestDue(at("2026-10-28T07:20:00Z"), "UTC", 7, 3), "2026-10-28");
  assertEquals(digestDue(at("2026-10-28T07:20:00Z"), "UTC", 7, 1), null);
  assertEquals(digestDue(at("2026-10-28T10:20:00Z"), "UTC", 7, 3), null);
  // Monday 00:20 in Auckland is still Sunday in UTC.
  assertEquals(digestDue(at("2026-10-25T11:20:00Z"), "Pacific/Auckland", 0, 1), "2026-10-26");
});

// --- Check 9: digests ---

Deno.test("buildDaily: Average rule, units, missing values", () => {
  const now = at("2026-10-28T15:20:00Z");
  const c = buildDaily("2026-10-28", [LISBON], ROWS, "C", now, LINKS)!;
  assertEquals(c.subject, "Weather: daily digest, 28 Oct");
  assert(c.text.includes("Temperature: 31.2 °C"), "day average of 30.0 and 32.4");
  assert(c.text.includes("Wind: 18.0 km/h"), "only Open-Meteo has wind: 5 m/s");
  assert(c.text.includes("Temperature: 14.5 °C"), "night average");
  assert(c.text.includes("Precipitation: 0.1 mm"));
  assert(c.text.includes("Conditions: Clear"));
  const f = buildDaily("2026-10-28", [LISBON], ROWS, "F", now, LINKS)!;
  assert(f.text.includes("Temperature: 88.2 °F"));
  assert(f.text.includes("Wind: 11.2 mph"));
  assert(f.text.includes("Precipitation: 0.00 in"));
  const ab = buildDaily("2026-10-28", [AB], ROWS, "C", now, LINKS)!;
  assert(ab.text.includes("Feels like: –"), "MET has no feels-like");
  assert(ab.text.includes("No readings") === false);
  assert(ab.text.includes("Night (12am)") === false, "no night reading: only the day slot shows");
});

Deno.test("buildDaily: a city with no reading in 36 hours, and no cities at all", () => {
  const d = buildDaily("2026-10-31", [LISBON], ROWS, "C", at("2026-10-31T07:20:00Z"), LINKS)!;
  assert(d.text.includes("No readings in the last day."));
  assertEquals(buildDaily("2026-10-28", [], ROWS, "C", at("2026-10-28T07:20:00Z"), LINKS), null);
});

Deno.test("buildDaily: escapes a city name in HTML, keeps the text part readable", () => {
  const e = buildDaily("2026-10-28", [AB], ROWS, "C", at("2026-10-28T15:20:00Z"), LINKS)!;
  assert(e.html.includes("&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt;, Testland"));
  assert(!e.html.includes('<b>"A&B"</b>'));
  assert(e.text.includes('<b>"A&B"</b>, Testland'));
  assertEquals(escapeHtml(`<&>"'`), "&lt;&amp;&gt;&quot;&#39;");
});

Deno.test("emails have the footer, app link and unsubscribe link", () => {
  const e = buildDaily("2026-10-28", [LISBON], ROWS, "C", at("2026-10-28T15:20:00Z"), LINKS)!;
  assert(e.text.includes("You get this because email notifications are on in Settings."));
  assert(e.html.includes('href="https://treefinderer.github.io/weather/?unsubscribe=t">Unsubscribe</a>'));
  assert(e.html.includes('href="https://treefinderer.github.io/weather/"'));
});

Deno.test("digestCities: null is all followed cities; unfollowed ids are ignored", () => {
  assertEquals(digestCities([LISBON, AB], null), [LISBON, AB]);
  assertEquals(digestCities([LISBON, AB], [2, 99]), [AB]);
  assertEquals(digestCities([LISBON], [99]), []);
});

Deno.test("buildWeekly: 7 days before the send date, n of 7, No readings", () => {
  const w = buildWeekly("2026-10-29", [LISBON, AB], ROWS, "C", LINKS)!;
  assertEquals(w.subject, "Weather: week of 22–28 Oct");
  assert(w.text.includes("Day (12pm), 1 of 7 days"));
  assert(w.text.includes("Average: 31.2 °C"));
  assert(w.text.includes("Night (12am): No readings"), "city 2 has no night reading");
  assertEquals(buildWeekly("2026-10-02", [LISBON], [], "C", LINKS)!.subject, "Weather: week of 25 Sep–1 Oct");
});

Deno.test("cleanSubject removes control characters and line breaks", () => {
  assertEquals(cleanSubject("Weather alert: A\r\nBcc: x\u0007y"), "Weather alert: A Bcc: x y");
});

// --- Check 10: alerts ---

const rule = (o: Partial<AlertRule>): AlertRule => ({
  id: 10, city_id: 1, metric: "temperature", condition: "outside", slot: "both", min_value: 0, max_value: 30,
  created_at: "2026-10-27T00:00:00Z", ...o
});
const LATE = at("2026-10-28T15:20:00Z");

Deno.test("matchAlerts: outside fires on the day slot and makes the per-day key", () => {
  const fired = matchAlerts([rule({})], ROWS, LISBON, LATE);
  assertEquals(fired.length, 1);
  assertEquals(fired[0].slot, "day");
  assertEquals(Math.round(fired[0].value * 10) / 10, 31.2);
  assertEquals(fired[0].key, "10|1|2026-10-28");
});

Deno.test("matchAlerts: inside bounds are inclusive", () => {
  assertEquals(matchAlerts([rule({ condition: "inside", slot: "night", min_value: 14.5, max_value: 20 })], ROWS, LISBON, LATE).length, 1);
  assertEquals(matchAlerts([rule({ condition: "inside", slot: "night", min_value: 10, max_value: 14.5 })], ROWS, LISBON, LATE).length, 1);
  assertEquals(matchAlerts([rule({ condition: "outside", slot: "night", min_value: 14.5, max_value: 20 })], ROWS, LISBON, LATE).length, 0);
});

Deno.test("matchAlerts: nothing for a null value", () => {
  assertEquals(matchAlerts([rule({ city_id: 2, metric: "feels_like", min_value: 50, max_value: 60 })], ROWS, AB, LATE).length, 0);
});

Deno.test("matchAlerts: nothing for an unsettled slot, then it fires once settled", () => {
  const r = rule({ city_id: 2, min_value: 10, max_value: 20 });
  assertEquals(matchAlerts([r], ROWS, AB, at("2026-10-28T12:20:00Z")).length, 0); // 13:20 in Berlin, only MET
  assertEquals(matchAlerts([r], ROWS, AB, at("2026-10-28T14:20:00Z")).length, 1); // 15:20: the window has ended
});

Deno.test("matchAlerts: nothing for a slot of the other type", () => {
  assertEquals(matchAlerts([rule({ city_id: 2, slot: "night", min_value: 10, max_value: 20 })], ROWS, AB, LATE).length, 0);
});

Deno.test("matchAlerts: nothing for a reading fetched before the alert was created", () => {
  assertEquals(matchAlerts([rule({ created_at: "2026-10-28T13:00:00Z" })], ROWS, LISBON, LATE).length, 0);
});

Deno.test("matchAlerts: nothing for slots fetched over 48 hours ago", () => {
  assertEquals(matchAlerts([rule({})], ROWS, LISBON, at("2026-10-30T13:00:00Z")).length, 0);
});

Deno.test("matchAlerts: once per city-local day; the night reading comes first", () => {
  const fired = matchAlerts([rule({ min_value: 0, max_value: 10 })], ROWS, LISBON, LATE);
  assertEquals(fired.length, 1);
  assertEquals(fired[0].slot, "night");
  assertEquals(fired[0].key, "10|1|2026-10-28");
});

Deno.test("buildAlert: subject, range text and escaping", () => {
  const fired = matchAlerts([rule({})], ROWS, LISBON, LATE);
  const e = buildAlert(LISBON, fired, ROWS, "C", LINKS);
  assertEquals(e.subject, "Weather alert: Lisbon, temperature 31.2 °C");
  assert(e.text.includes("Temperature is 31.2 °C, outside your range 0.0–30.0 °C."));
  assertEquals(rangeText(rule({ metric: "precipitation", min_value: 0, max_value: 25.4 }), "F"), "0.00–1.00 in");
  assertEquals(rangeText(rule({ metric: "humidity", min_value: 20, max_value: 80 }), "C"), "20.0–80.0 %");
});

Deno.test("classifySend", () => {
  assertEquals(classifySend(200), "sent");
  assertEquals(classifySend(null), "retry");
  assertEquals(classifySend(503), "retry");
  assertEquals(classifySend(429), "rate_limited");
  assertEquals(classifySend(403), "permanent");
});

// --- Check 11: unsubscribe tokens ---

const ID = "6f1c2a7e-3b4d-4c5e-8f90-a1b2c3d4e5f6";

Deno.test("unsubscribe tokens verify with the right secret", async () => {
  const t = await unsubToken("secret-one", ID);
  assert(t.startsWith(ID + "."));
  assertEquals(await verifyUnsubToken("secret-one", t), ID);
});

Deno.test("unsubscribe tokens fail when any character changes or the secret differs", async () => {
  const t = await unsubToken("secret-one", ID);
  for (let i = 0; i < t.length; i++) {
    const c = t[i] === "a" ? "b" : "a";
    const bad = t.slice(0, i) + c + t.slice(i + 1);
    assertNotEquals(bad, t);
    assertEquals(await verifyUnsubToken("secret-one", bad), null, "changed character " + i);
  }
  assertEquals(await verifyUnsubToken("secret-two", t), null);
  assertEquals(await verifyUnsubToken("secret-one", ""), null);
  assertEquals(await verifyUnsubToken("secret-one", ID), null);
  assertEquals(await verifyUnsubToken("", t), null);
});
