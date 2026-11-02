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
    // Satellite pictures (spec 0009), shared by the city cards and the History viewer.
    pic: {
      CREDIT: "Imagery: NASA GIBS / EOSDIS",
      BUCKET: "city-pictures",
      SLOTS: { day: "Day (12pm)", night: "Night (12am)" },
      // The kind of imagery, from the layer the row records, so a later layer change doesn't relabel old pictures.
      infrared(row) {
        const layer = String((row && row.layer) || "");
        if (/TrueColor/i.test(layer)) return false;
        if (/Brightness_Temp|Infrared/i.test(layer)) return true;
        return !!row && row.slot === "night";
      },
      // "Night (12am), Oct 25"
      when(date, slot) { return (window.Wx.pic.SLOTS[slot] || slot) + ", " + window.Wx.fmt.day(date); },
      // Signed URLs for a batch of object names in one call, valid for an hour: { path: url }. Rejects on failure.
      async sign(sb, paths) {
        const res = await sb.storage.from(window.Wx.pic.BUCKET).createSignedUrls(paths, 3600);
        if (!res || res.error || !Array.isArray(res.data)) throw new Error((res && res.error && res.error.message) || "no signed URLs");
        const urls = {};
        res.data.forEach(d => { if (d && d.path && d.signedUrl && !d.error) urls[d.path] = d.signedUrl; });
        return urls;
      },
      // An empty picture frame: { frame, img, marker, glyph, text }. The square is reserved by CSS before anything loads.
      frame() {
        const make = (tag, cls) => { const e = document.createElement(tag); e.className = cls; return e; };
        const frame = make("div", "pic-frame");
        const empty = make("div", "pic-empty");
        const glyph = make("span", "pic-empty-glyph");
        glyph.setAttribute("aria-hidden", "true");
        const text = make("p", "pic-empty-text");
        empty.appendChild(glyph);
        empty.appendChild(text);
        frame.appendChild(empty);
        return { frame, text, img: null, marker: null };
      },
      // Shows one state in a frame: { url, row, city } for a picture, or { text } for the placeholder ("" while loading).
      // A failed image is hidden (no broken-image icon) and the placeholder reads failText; it isn't retried.
      // The marker is placed from the stored box, and hidden when the box or the city's coordinates are missing.
      show(f, opt) {
        if (f.img) { f.img.remove(); f.img = null; }
        if (f.marker) { f.marker.remove(); f.marker = null; }
        f.text.textContent = opt.url ? "" : (opt.text || "");
        f.text.hidden = !f.text.textContent;
        if (!opt.url) return;
        const row = opt.row || {};
        const img = document.createElement("img");
        img.className = "pic-img";
        img.width = 512;
        img.height = 512;
        if (opt.lazy) img.loading = "lazy";
        img.alt = "Satellite picture of the area around " + ((opt.city && opt.city.name) || "the city") + ", " +
          (window.Wx.pic.infrared(row) ? "infrared clouds" : "true color") + ", " + window.Wx.pic.when(row.local_date, row.slot);
        const marker = document.createElement("img");
        marker.className = "pic-marker";
        marker.src = "assets/pic-marker.svg";
        marker.alt = "";
        marker.setAttribute("aria-hidden", "true");
        marker.width = 24;
        marker.height = 24;
        marker.hidden = true;
        const spot = window.Wx.pic.spot(row.bbox, opt.city);
        if (spot) { marker.style.left = spot.left + "%"; marker.style.top = spot.top + "%"; }
        img.addEventListener("load", () => { img.classList.add("is-loaded"); marker.hidden = !spot; }, { once: true });
        img.addEventListener("error", () => {
          img.hidden = true;
          marker.hidden = true;
          f.text.textContent = opt.failText || "Picture unavailable";
          f.text.hidden = false;
          if (opt.onFail) opt.onFail();
        }, { once: true });
        f.frame.appendChild(img);
        f.frame.appendChild(marker);
        f.img = img;
        f.marker = marker;
        img.src = opt.url;
      },
      // The city's place in the picture as percentages from the top left, or null when it can't be worked out.
      spot(bbox, city) {
        if (!Array.isArray(bbox) || bbox.length !== 4 || !city) return null;
        const [minLat, minLon, maxLat, maxLon] = bbox.map(Number);
        const lat = Number(city.lat), lon = Number(city.lon);
        if (![minLat, minLon, maxLat, maxLon, lat, lon].every(isFinite) || maxLat <= minLat || maxLon <= minLon) return null;
        const left = (lon - minLon) / (maxLon - minLon) * 100, top = (maxLat - lat) / (maxLat - minLat) * 100;
        return left >= 0 && left <= 100 && top >= 0 && top <= 100 ? { left, top } : null;
      },
      // "Infrared · Night (12am), Oct 25 · Imagery: NASA GIBS / EOSDIS"
      caption(row) {
        return (window.Wx.pic.infrared(row) ? "Infrared" : "True color") + " · " + window.Wx.pic.when(row.local_date, row.slot) +
          " · " + window.Wx.pic.CREDIT;
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
