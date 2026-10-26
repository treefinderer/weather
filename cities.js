// Your cities: search (Open-Meteo geocoding), follow up to 10 cities, remove them, and show each city's
// latest day and night reading per source in the user's unit (spec 0002). Uses Wx.supabase, Wx.user and Wx.unit.
(function () {
  "use strict";
  const Wx = window.Wx;
  const $ = id => document.getElementById(id);
  const LIMIT = 10;
  const TIMEOUT_MS = 20000;
  const SEARCH_TIMEOUT_MS = 10000;
  const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const NONE = "–";
  const SOURCES = [["open-meteo", "Open-Meteo"], ["met-norway", "MET Norway"]];
  const SLOTS = [["day", "Day (12pm)"], ["night", "Night (12am)"]];
  const MSG = {
    loading: "Loading your cities…",
    loadFailed: "Can't load your cities. Check your connection and try again.",
    empty: "No cities yet. Search for a city to add it.",
    short: "Type at least 2 letters.",
    searchFailed: "Can't search right now. Check your connection and try again.",
    limit: "You can follow up to 10 cities. Remove one to add another.",
    addFailed: "Can't add the city. Check your connection and try again.",
    removeFailed: "Can't remove the city. Try again.",
    noReadings: "No readings yet. First reading at 12am/12pm local time.",
    noReading: "No reading yet"
  };

  // --- State, reset whenever the signed-in user changes ---
  let userId = null;
  let gen = 0;               // bumped on every reset, so replies for an earlier user are dropped
  let state = "idle";        // "loading" | "error" | "ready"
  let cities = [];           // followed cities in added_at order: { id, name, admin1, country, lat, lon, timezone }
  let readings = {};         // city id -> latest_readings rows
  let results = [];          // the current search results, shaped like cities
  const adding = new Set();  // result ids with a follow_city call running
  const removing = new Set();
  const removeFailed = new Set();
  let searching = false;

  function setMsg(id, text, kind) {
    const el = $(id);
    el.textContent = text || "";
    el.className = "msg" + (kind ? " msg-" + kind : "");
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const place = c => [c.name, c.admin1, c.country].filter(Boolean).join(", ");
  const follows = id => cities.some(c => c.id === id);

  // --- Requests ---
  // Runs a Supabase call and always resolves to { data, error }. Throws, rejections and timeouts become network errors.
  function request(fn) {
    let timer;
    const timeout = new Promise(resolve => {
      timer = setTimeout(() => resolve({ data: null, error: { network: true, message: "Timed out" } }), TIMEOUT_MS);
    });
    return Promise.race([Promise.resolve().then(fn), timeout])
      .catch(e => ({ data: null, error: { network: true, message: String((e && e.message) || e) } }))
      .then(res => { clearTimeout(timer); return res || { data: null, error: null }; });
  }
  // fetch with a timeout; rejects on network failure, timeout or a non-2xx reply.
  function getJson(url) {
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    let timer;
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(() => { if (ctrl) ctrl.abort(); reject(new Error("Timed out")); }, SEARCH_TIMEOUT_MS);
    });
    const go = fetch(url, ctrl ? { signal: ctrl.signal } : undefined).then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
    return Promise.race([go, timeout]).finally(() => clearTimeout(timer));
  }

  // --- Units ---
  const round = n => String(Math.round(n));
  function temp(c) {
    if (c == null) return NONE;
    return Wx.unit === "F" ? round(c * 9 / 5 + 32) + "°F" : round(c) + "°C";
  }
  function wind(ms) {
    if (ms == null) return NONE;
    return Wx.unit === "F" ? round(ms * 2.236936) + " mph" : round(ms * 3.6) + " km/h";
  }
  function rain(mm) {
    if (mm == null) return NONE;
    return Wx.unit === "F" ? (mm / 25.4).toFixed(2) + " in" : (Math.round(mm * 10) / 10) + " mm";
  }
  const pct = v => (v == null ? NONE : round(v) + "%");
  // "2026-10-24" -> "Oct 24"
  function day(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    if (!m) return "";
    return new Date(Date.UTC(+m[1], m[2] - 1, +m[3])).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }

  // --- Rendering ---
  function renderCount() {
    const ready = state === "ready";
    $("cities-count").hidden = !ready;
    $("cities-count").textContent = cities.length + " of " + LIMIT + " cities";
    $("cities-limit").hidden = !(ready && cities.length >= LIMIT);
    $("cities-retry").hidden = state !== "error";
    const status = state === "loading" ? MSG.loading : state === "error" ? MSG.loadFailed :
      ready && !cities.length ? MSG.empty : "";
    $("cities-status").textContent = status;
    $("cities-status").hidden = !status;
    $("cities-status").className = state === "error" ? "msg msg-error" : "lede";
  }

  // Sets each result's button from the state; keeps the same elements so keyboard focus stays put.
  function syncResults() {
    $("city-results").querySelectorAll("button[data-id]").forEach(btn => {
      const id = Number(btn.dataset.id);
      const r = results.find(x => x.id === id);
      if (!r) return;
      const label = follows(id) ? "Added" : adding.has(id) ? "Adding…" : "Add";
      btn.textContent = label;
      btn.setAttribute("aria-label", label + " " + place(r));
      btn.disabled = label !== "Add" || state !== "ready" || cities.length >= LIMIT;
    });
  }
  function renderResults() {
    const list = $("city-results");
    list.textContent = "";
    results.forEach(r => {
      const li = el("li", "city-result");
      li.appendChild(el("span", "city-result-name", place(r)));
      const btn = el("button", "btn-secondary", "Add");
      btn.type = "button";
      btn.dataset.id = r.id;
      btn.addEventListener("click", () => add(r));
      li.appendChild(btn);
      list.appendChild(li);
    });
    list.hidden = !results.length;
    syncResults();
  }

  function entry(sourceLabel, r) {
    const box = el("div", "reading");
    box.appendChild(el("h5", "reading-source", sourceLabel));
    if (!r) {
      box.appendChild(el("p", "reading-none", MSG.noReading));
      return box;
    }
    box.appendChild(el("p", "reading-date", day(r.local_date)));
    const dl = el("dl", "reading-values");
    [["Temperature", temp(r.temperature_c)], ["Feels like", temp(r.feels_like_c)], ["Humidity", pct(r.humidity_pct)],
      ["Wind", wind(r.wind_speed_ms)], ["Precipitation", rain(r.precipitation_mm)]].forEach(([k, v]) => {
      dl.appendChild(el("dt", "", k));
      dl.appendChild(el("dd", "", v));
    });
    box.appendChild(dl);
    return box;
  }
  function card(c) {
    const li = el("li", "city-card");
    li.dataset.id = c.id;
    const head = el("div", "city-head");
    const title = el("div", "city-title");
    title.appendChild(el("h3", "city-name", place(c)));
    title.appendChild(el("p", "city-tz", c.timezone));
    head.appendChild(title);
    const btn = el("button", "btn-secondary", "Remove");
    btn.type = "button";
    btn.dataset.remove = c.id;
    btn.setAttribute("aria-label", "Remove " + place(c));
    btn.disabled = removing.has(c.id);
    btn.addEventListener("click", () => remove(c));
    head.appendChild(btn);
    li.appendChild(head);
    li.appendChild(el("p", "msg msg-error", removeFailed.has(c.id) ? MSG.removeFailed : ""));
    const rows = readings[c.id] || [];
    if (!rows.length) {
      li.appendChild(el("p", "lede", MSG.noReadings));
      return li;
    }
    const slots = el("div", "slots");
    SLOTS.forEach(([slot, slotLabel]) => {
      const group = el("section", "slot");
      group.appendChild(el("h4", "slot-title", slotLabel));
      const entries = el("div", "readings");
      SOURCES.forEach(([source, sourceLabel]) => {
        entries.appendChild(entry(sourceLabel, rows.find(r => r.source === source && r.slot === slot)));
      });
      group.appendChild(entries);
      slots.appendChild(group);
    });
    li.appendChild(slots);
    return li;
  }
  // Rebuilds the cards, keeping focus on the same card's Remove button when it had it.
  function renderCards() {
    const active = document.activeElement;
    const focusId = active && active.dataset && active.dataset.remove;
    const list = $("city-list");
    list.textContent = "";
    if (state === "ready") cities.forEach(c => list.appendChild(card(c)));
    if (focusId) focusRemove(Number(focusId));
  }
  function focusRemove(id) {
    const btn = $("city-list").querySelector('button[data-remove="' + id + '"]');
    if (btn) btn.focus();
    return !!btn;
  }
  function renderAll() {
    renderCount();
    renderCards();
    syncResults();
  }

  // --- Loading ---
  function reset(user) {
    gen++;
    userId = user ? user.id : null;
    state = "idle";
    cities = [];
    readings = {};
    results = [];
    adding.clear();
    removing.clear();
    removeFailed.clear();
    searching = false;
    $("city-query").value = "";
    $("city-search-submit").disabled = false;
    $("city-search-submit").textContent = "Search";
    setMsg("search-msg", "");
    setMsg("cities-msg", "");
    renderResults();
    renderAll();
  }

  async function load() {
    const g = gen, uid = userId, sb = Wx.supabase;
    if (!uid || !sb) return;
    state = "loading";
    renderAll();
    const [uc, lr] = await Promise.all([
      request(() => sb.from("user_cities").select("city_id, added_at, cities(id, name, admin1, country, lat, lon, timezone)")
        .eq("user_id", uid).order("added_at", { ascending: true })),
      request(() => sb.from("latest_readings")
        .select("city_id, source, slot, local_date, temperature_c, feels_like_c, humidity_pct, wind_speed_ms, precipitation_mm"))
    ]);
    if (g !== gen) return;
    if (uc.error || lr.error) {
      state = "error";
      renderAll();
      return;
    }
    cities = (uc.data || []).filter(row => row && row.cities).map(row => ({
      id: Number(row.cities.id), name: row.cities.name, admin1: row.cities.admin1 || "", country: row.cities.country || "",
      lat: row.cities.lat, lon: row.cities.lon, timezone: row.cities.timezone
    }));
    readings = {};
    (lr.data || []).forEach(r => { (readings[r.city_id] = readings[r.city_id] || []).push(r); });
    state = "ready";
    renderAll();
  }

  // --- Search ---
  $("city-search").addEventListener("submit", async e => {
    e.preventDefault();
    if (searching) return;
    const query = $("city-query").value.trim();
    if (query.length < 2) return setMsg("search-msg", MSG.short, "error");
    const g = gen;
    const btn = $("city-search-submit");
    searching = true;
    btn.disabled = true;
    btn.textContent = "Searching…";
    setMsg("search-msg", "");
    let found = null;
    try {
      const body = await getJson(GEO_URL + "?name=" + encodeURIComponent(query) + "&count=10&language=en&format=json");
      found = Array.isArray(body && body.results) ? body.results : [];
    } catch (err) { /* found stays null */ }
    if (g !== gen) return;
    searching = false;
    btn.disabled = false;
    btn.textContent = "Search";
    if (!found) {
      results = [];
      renderResults();
      return setMsg("search-msg", MSG.searchFailed, "error");
    }
    // Places without a time zone or coordinates can't be collected, so they aren't offered.
    results = found.filter(r => r && r.id != null && r.name && r.timezone &&
        typeof r.latitude === "number" && typeof r.longitude === "number")
      .slice(0, 10)
      .map(r => ({ id: Number(r.id), name: r.name, admin1: r.admin1 || "", country: r.country || "",
        lat: r.latitude, lon: r.longitude, timezone: r.timezone }));
    renderResults();
    if (!results.length) setMsg("search-msg", 'No places found for "' + query + '".', "error");
  });

  // --- Add and remove ---
  async function add(r) {
    if (state !== "ready" || adding.has(r.id) || follows(r.id) || cities.length >= LIMIT) return;
    const g = gen;
    adding.add(r.id);
    setMsg("cities-msg", "");
    syncResults();
    const res = await request(() => Wx.supabase.rpc("follow_city", {
      p_id: r.id, p_name: r.name, p_admin1: r.admin1 || null, p_country: r.country,
      p_lat: r.lat, p_lon: r.lon, p_timezone: r.timezone
    }));
    if (g !== gen) return;
    adding.delete(r.id);
    const err = res.error;
    if (err) {
      if (err.code === "23505") setMsg("cities-msg", r.name + " is already in your list.", "error");
      else if (/city_limit/.test(err.message || "")) setMsg("cities-msg", MSG.limit, "error");
      else setMsg("cities-msg", MSG.addFailed, "error");
      syncResults();
      return;
    }
    cities.push(Object.assign({}, r));
    renderAll();
    setMsg("cities-msg", "Added " + r.name + ".", "ok");
  }

  async function remove(c) {
    if (removing.has(c.id)) return;
    const g = gen, uid = userId;
    removing.add(c.id);
    removeFailed.delete(c.id);
    const btn = $("city-list").querySelector('button[data-remove="' + c.id + '"]');
    if (btn) btn.disabled = true;
    setMsg("cities-msg", "");
    const res = await request(() => Wx.supabase.from("user_cities").delete().eq("user_id", uid).eq("city_id", c.id));
    if (g !== gen) return;
    removing.delete(c.id);
    if (res.error) {
      removeFailed.add(c.id);
      renderCards();
      focusRemove(c.id);
      return;
    }
    const i = cities.findIndex(x => x.id === c.id);
    if (i >= 0) cities.splice(i, 1);
    renderAll();
    setMsg("cities-msg", "Removed " + c.name + ".", "ok");
    const next = cities[i] || cities[cities.length - 1];
    if (!next || !focusRemove(next.id)) $("city-query").focus();
  }

  $("cities-retry").addEventListener("click", load);

  // --- Account changes ---
  // A different user (or sign-out) starts over; a unit-only change re-renders from the data already loaded.
  function onAccount(user) {
    if ((user ? user.id : null) !== userId) {
      reset(user);
      load();
    } else {
      renderCards();
    }
  }
  Wx.onAccountChange(onAccount);
  if (Wx.user) onAccount(Wx.user);
  else renderAll();
})();
