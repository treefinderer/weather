// Deno unit tests for logic.ts (spec 0002, checks 8 and 9; spec 0009, checks 2 to 5). Run by hand (Deno isn't part of tests/run.sh):
//   deno test --allow-read supabase/functions/collect/logic_test.ts
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  dueSlot, metUrl, parseMet, parseOpenMeteo, passDate, PICTURE_LAYERS, pictureBox, picturePlan, pictureProblem, pictureUrl
} from "./logic.ts";

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

// --- Spec 0009: satellite pictures ---

const near = (actual: number, expected: number, what: string) => {
  if (Math.abs(actual - expected) > 0.01) throw new Error(what + ": " + actual + " is not within 0.01 of " + expected);
};

Deno.test("pictureBox: lat 60, lon 10.75 is 58.65-61.35 by 8.05-13.45", () => {
  const b = pictureBox(60, 10.75);
  near(b.minLat, 58.65, "minLat");
  near(b.maxLat, 61.35, "maxLat");
  near(b.minLon, 8.05, "minLon");
  near(b.maxLon, 13.45, "maxLon");
});

Deno.test("pictureBox: a city at lon 179.5 is shifted inward, not wrapped", () => {
  const b = pictureBox(-16.5, 179.5);
  assertEquals(b.maxLon <= 180, true);
  assertEquals(b.minLon < 179.5 && b.minLon >= -180, true);
  const w = pictureBox(-16.5, -179.5);
  assertEquals(w.minLon >= -180, true);
});

Deno.test("pictureBox: latitudes are clamped at the poles and the width is capped at 40 degrees", () => {
  const b = pictureBox(89.5, 0);
  assertEquals(b.maxLat, 90);
  assertEquals(b.maxLon - b.minLon <= 40, true);
  assertEquals(pictureBox(-90, 0).minLat, -90);
});

Deno.test("pictureUrl is a keyless GIBS WMS 1.3.0 GetMap at 512 x 512 JPEG", () => {
  const url = new URL(pictureUrl([PICTURE_LAYERS.night.layer, "Coastlines_15m"], pictureBox(60, 10.75), "2026-10-25"));
  assertEquals(url.origin + url.pathname, "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi");
  const q = url.searchParams;
  assertEquals(q.get("SERVICE"), "WMS");
  assertEquals(q.get("REQUEST"), "GetMap");
  assertEquals(q.get("VERSION"), "1.3.0");
  assertEquals(q.get("CRS"), "EPSG:4326");
  assertEquals(q.get("WIDTH"), "512");
  assertEquals(q.get("HEIGHT"), "512");
  assertEquals(q.get("FORMAT"), "image/jpeg");
  assertEquals(q.get("LAYERS"), "VIIRS_NOAA20_Brightness_Temp_BandI5_Night,Coastlines_15m");
  assertEquals(q.get("TIME"), "2026-10-25");
  assertEquals(q.get("BBOX"), "58.6525,8.0551,61.3475,13.4449");
  assertEquals([...q.keys()].some(k => /key|token|login/i.test(k)), false);
});

Deno.test("passDate: the polar orbiter's GIBS day, shifted near the date line", () => {
  assertEquals(passDate("2026-10-25", 10.75, 13.5), "2026-10-25");
  assertEquals(passDate("2026-10-25", 10.75, 1.5), "2026-10-25");
  assertEquals(passDate("2026-10-25", 179.5, 1.5), "2026-10-24");
  assertEquals(passDate("2026-10-25", -170, 13.5), "2026-10-26");
});

Deno.test("picturePlan: a night-window run plans the previous date's day and night pictures", () => {
  const plan = picturePlan(3143244, 59.91, 10.75, { slot: "night", localDate: "2026-10-26", catchUp: false });
  assertEquals(plan.map(p => [p.slot, p.localDate, p.layer, p.time, p.path]), [
    ["day", "2026-10-25", "VIIRS_NOAA20_CorrectedReflectance_TrueColor", "2026-10-25", "3143244/2026-10-25/day.jpg"],
    ["night", "2026-10-25", "VIIRS_NOAA20_Brightness_Temp_BandI5_Night", "2026-10-25", "3143244/2026-10-25/night.jpg"]
  ]);
  // The first of the month steps back into the previous month.
  assertEquals(picturePlan(1, 0, 0, { slot: "night", localDate: "2026-11-01", catchUp: true })[0].localDate, "2026-10-31");
});

Deno.test("picturePlan: the day window plans nothing", () => {
  assertEquals(picturePlan(1, 60, 10.75, { slot: "day", localDate: "2026-10-25", catchUp: false }), []);
});

Deno.test("pictureProblem: accepts a JPEG of 4 KB or more", () => {
  const jpeg = new Uint8Array(5000);
  jpeg[0] = 0xff; jpeg[1] = 0xd8;
  assertEquals(pictureProblem("image/jpeg", jpeg), null);
  assertEquals(pictureProblem("image/jpeg; charset=binary", jpeg), null);
});

Deno.test("pictureProblem: rejects GIBS's XML error, a blank JPEG and a missing content type", () => {
  const xml = Deno.readFileSync(new URL("./fixtures/gibs-error.xml", import.meta.url));
  const blank = Deno.readFileSync(new URL("./fixtures/gibs-blank.jpg", import.meta.url));
  assertEquals(typeof pictureProblem("text/xml; charset=UTF-8", xml), "string");
  assertEquals(typeof pictureProblem("image/jpeg", xml), "string");
  assertEquals(typeof pictureProblem("image/jpeg", blank), "string");
  assertEquals(typeof pictureProblem(null, blank), "string");
});
