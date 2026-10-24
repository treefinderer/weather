// Shared helpers for the feature scripts, on window.Wx. Load before any feature file.
(function () {
  "use strict";
  const PREFIX = "wx-";
  window.Wx = {
    // localStorage that never throws (private windows, blocked storage).
    load(key, fallback) {
      try { const v = localStorage.getItem(PREFIX + key); return v === null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
    },
    save(key, value) {
      try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ }
    }
  };
})();
