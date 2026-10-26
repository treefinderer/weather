// Deno unit tests for logic.ts (spec 0002, checks 8 and 9). Run by hand (Deno isn't part of tests/run.sh):
//   deno test --allow-read supabase/functions/collect/logic_test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { dueSlot, metUrl, parseMet, parseOpenMeteo } from "./logic.ts";

const fixture = (name: string) =>
  JSON.parse(Deno.readTextFileSync(new URL("./fixtures/" + name, import.meta.url)));
const at = (iso: string) => new Date(iso);

// --- Check 8: dueSlot ---

Deno.test("dueSlot: Europe/Berlin 00:05 on the night the clocks go back is night of Oct 25", () => {
  assertEquals(dueSlot(at("2026-10-24T22:05:00Z"), "Europe/Berlin"), { slot: "night", localDate: "2026-10-25", catchUp: false });
});

Deno.test("dueSlot: Asia/Kolkata 12:35 is day of Oct 25", () => {
  assertEquals(dueSlot(at("2026-10-25T07:05:00Z"), "Asia/Kolkata"), { slot: "day", localDate: "2026-10-25", catchUp: false });
});

Deno.test("dueSlot: Asia/Kathmandu 00:50 is night", () => {
  assertEquals(dueSlot(at("2026-10-24T19:05:00Z"), "Asia/Kathmandu"), { slot: "night", localDate: "2026-10-25", catchUp: false });
});

Deno.test("dueSlot: America/New_York 14:05 is day catch-up, 15:05 is nothing", () => {
  assertEquals(dueSlot(at("2026-10-25T18:05:00Z"), "America/New_York"), { slot: "day", localDate: "2026-10-25", catchUp: true });
  assertEquals(dueSlot(at("2026-10-25T19:05:00Z"), "America/New_York"), null);
});

Deno.test("dueSlot: America/Santiago 01:05 on a day whose midnight is skipped is night of Sep 6", () => {
  assertEquals(dueSlot(at("2026-09-06T04:05:00Z"), "America/Santiago"), { slot: "night", localDate: "2026-09-06", catchUp: true });
});

Deno.test("dueSlot: hours outside both windows are nothing", () => {
  assertEquals(dueSlot(at("2026-10-25T03:05:00Z"), "UTC"), null);
  assertEquals(dueSlot(at("2026-10-25T11:05:00Z"), "UTC"), null);
  assertEquals(dueSlot(at("2026-10-25T23:05:00Z"), "UTC"), null);
});

Deno.test("dueSlot: an unknown time zone throws", () => {
  assertThrows(() => dueSlot(at("2026-10-25T00:05:00Z"), "Not/AZone"));
});

// --- Check 9: parsing ---

Deno.test("parseOpenMeteo maps current conditions and keeps the whole reply", () => {
  const body = fixture("open-meteo.json");
  const row = parseOpenMeteo(body);
  assertEquals(row, {
    observed_at: "2026-10-25T11:00:00.000Z",
    temperature_c: 14.3,
    feels_like_c: 12.1,
    humidity_pct: 72,
    wind_speed_ms: 4.2,
    precipitation_mm: 0.1,
    weather_code: "3",
    raw: body
  });
});

Deno.test("parseOpenMeteo throws when the temperature is missing", () => {
  assertThrows(() => parseOpenMeteo(fixture("open-meteo-no-temperature.json")));
  assertThrows(() => parseOpenMeteo({}));
});

Deno.test("parseMet uses the latest entry not after the run time and maps its fields", () => {
  const body = fixture("met-norway.json");
  const row = parseMet(body, at("2026-10-25T12:05:00Z"));
  const entry = body.properties.timeseries[1];
  assertEquals(row, {
    observed_at: "2026-10-25T12:00:00.000Z",
    temperature_c: 14.6,
    feels_like_c: null,
    humidity_pct: 73,
    wind_speed_ms: 4.4,
    precipitation_mm: 0.4,
    weather_code: "lightrain",
    raw: { meta: body.properties.meta, entry }
  });
  // raw holds only the chosen entry, not the timeseries.
  assertEquals("timeseries" in (row.raw as Record<string, unknown>), false);
  assertEquals(parseMet(body, at("2026-10-25T11:59:00Z")).observed_at, "2026-10-25T11:00:00.000Z");
});

Deno.test("parseMet without next_1_hours gives null precipitation and code", () => {
  const row = parseMet(fixture("met-norway-no-next-1-hours.json"), at("2026-10-25T11:05:00Z"));
  assertEquals(row.temperature_c, 13.8);
  assertEquals(row.precipitation_mm, null);
  assertEquals(row.weather_code, null);
  assertEquals(row.feels_like_c, null);
});

Deno.test("parseMet throws when the temperature is missing or no entry is due", () => {
  assertThrows(() => parseMet(fixture("met-norway-no-temperature.json"), at("2026-10-25T11:05:00Z")));
  assertThrows(() => parseMet(fixture("met-norway.json"), at("2026-10-25T10:05:00Z")));
  assertThrows(() => parseMet({}, at("2026-10-25T11:05:00Z")));
});

Deno.test("metUrl rounds coordinates to 4 decimals", () => {
  assertEquals(metUrl(48.856613, 2.352222), "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=48.8566&lon=2.3522");
});
