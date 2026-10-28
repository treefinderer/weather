// Shared helpers for the feature scripts, on window.Wx. Load before any feature file.
(function () {
  "use strict";
  const PREFIX = "wx-";
  const NONE = "–";
  const round = n => String(Math.round(n));
  // Weather code labels (spec 0003). Open-Meteo stores WMO numbers, MET Norway symbol codes.
  const WMO = [[[0], "Clear"], [[1], "Mostly clear"], [[2], "Partly cloudy"], [[3], "Cloudy"], [[45, 48], "Fog"],
    [[51, 57], "Drizzle"], [[61, 67], "Rain"], [[80, 82], "Rain"], [[71, 77], "Snow"], [[85, 86], "Snow"], [[95, 99], "Thunderstorm"]];
  const MET = [[s => s.includes("thunder"), "Thunderstorm"], [s => s.includes("sleet"), "Sleet"], [s => s.includes("snow"), "Snow"],
    [s => s.includes("rain"), "Rain"], [s => s === "fog", "Fog"], [s => s === "partlycloudy", "Partly cloudy"],
    [s => s === "cloudy", "Cloudy"], [s => s === "fair", "Mostly clear"], [s => s === "clearsky", "Clear"]];

  window.Wx = {
    // localStorage that never throws (private windows, blocked storage).
    load(key, fallback) {
      try { const v = localStorage.getItem(PREFIX + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    save(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    },
    // Metric values formatted in the user's unit (Wx.unit, set by auth.js); missing values show "–".
    fmt: {
      temp(c) {
        if (c == null) return NONE;
        return window.Wx.unit === "F" ? round(c * 9 / 5 + 32) + "°F" : round(c) + "°C";
      },
      wind(ms) {
        if (ms == null) return NONE;
        return window.Wx.unit === "F" ? round(ms * 2.236936) + " mph" : round(ms * 3.6) + " km/h";
      },
      rain(mm) {
        if (mm == null) return NONE;
        return window.Wx.unit === "F" ? (mm / 25.4).toFixed(2) + " in" : (Math.round(mm * 10) / 10) + " mm";
      },
      pct: v => (v == null ? NONE : round(v) + "%"),
      // "2026-10-24" -> "Oct 24"
      day(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
        if (!m) return "";
        return new Date(Date.UTC(+m[1], m[2] - 1, +m[3])).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
      }
    },
    // A readable label for an Open-Meteo WMO code or a MET Norway symbol code; null or unknown codes give "–".
    condition(code) {
      if (code == null) return NONE;
      const s = String(code).trim().toLowerCase();
      if (/^\d+$/.test(s)) {
        const n = Number(s);
        const hit = WMO.find(([r]) => n >= r[0] && n <= r[r.length - 1]);
        return hit ? hit[1] : NONE;
      }
      const base = s.replace(/_(day|night|polartwilight)$/, "");
      const hit = MET.find(([test]) => test(base));
      return hit ? hit[1] : NONE;
    }
  };
})();
