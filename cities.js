// Your cities: search (Open-Meteo geocoding), follow up to 10 cities, remove them, and show each city's
// latest day and night reading per source in the user's unit (spec 0002). Uses Wx.supabase, Wx.user, Wx.unit and Wx.fmt.
(function () {
  "use strict";
  const Wx = window.Wx;
  const $ = id => document.getElementById(id);
  const LIMIT = 10;
  const TIMEOUT_MS = 20000;
  const SEARCH_TIMEOUT_MS = 10000;
  const DEBOUNCE_MS = 300;
  const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const SOURCES = [["open-meteo", "Open-Meteo"], ["met-norway", "MET Norway"]];
  const SLOTS = [["day", "Day (12pm)"], ["night", "Night (12am)"]];
  // Condition label -> glyph file in assets/ (spec 0006). Clear and partly cloudy have night variants.
  const GLYPHS = { "Clear": "clear", "Mostly clear": "clear", "Partly cloudy": "partly-cloudy", "Cloudy": "cloudy", "Fog": "fog",
    "Rain": "rain", "Drizzle": "rain", "Snow": "snow", "Sleet": "snow", "Thunderstorm": "thunderstorm" };
  const DAY_NIGHT = ["clear", "partly-cloudy"];
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
  let results = [];          // the current suggestions, shaped like cities
  const adding = new Set();  // result ids with a follow_city call running
  const removing = new Set();
  const removeFailed = new Set();
  let searchSeq = 0;         // bumped by every search and every clear, so a late reply for an older search is dropped
  let searchTimer = null;    // the debounce timer of the next search
  let pendingQuery = null;   // the query of the search still running
  let shownQuery = null;     // the query whose suggestions are in the list
  let active = -1;           // index of the highlighted suggestion, -1 for none

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

  // --- Units (shared with the history view) ---
  const { temp, wind, rain, pct, day } = Wx.fmt;

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
    $("cities-status").className = state === "error" ? "msg msg-error" : status === MSG.empty ? "lede cities-empty" : "lede";
    $("cities-empty-art").hidden = status !== MSG.empty;
  }

  // A suggestion can be chosen when the list is ready, nothing is being added, and it isn't followed or over the limit.
  const choosable = r => state === "ready" && !adding.size && !follows(r.id) && cities.length < LIMIT;
  // Sets each suggestion's status, disabled state and accessible name from the state; keeps the same elements.
  function syncResults() {
    const list = $("city-results");
    list.classList.toggle("is-busy", adding.size > 0);
    list.classList.toggle("is-full", state === "ready" && cities.length >= LIMIT);
    list.querySelectorAll("li[data-id]").forEach(li => {
      const r = results[Number(li.dataset.index)];
      if (!r) return;
      const status = follows(r.id) ? "Added" : adding.has(r.id) ? "Adding…" : "";
      const tag = li.querySelector(".city-result-status");
      tag.textContent = status;
      tag.hidden = !status;
      li.setAttribute("aria-label", place(r) + (status === "Added" ? ", already added" : status ? ", adding" : ""));
      li.setAttribute("aria-disabled", String(!choosable(r)));
    });
  }
  function renderResults() {
    const list = $("city-results");
    list.textContent = "";
    active = -1;
    $("city-query").removeAttribute("aria-activedescendant");
    results.forEach((r, i) => {
      const li = el("li", "city-result");
      li.id = "city-option-" + i;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.dataset.id = r.id;
      li.dataset.index = i;
      const text = el("span", "city-result-text");
      text.appendChild(el("span", "city-result-name", r.name));
      const rest = [r.admin1, r.country].filter(Boolean).join(", ");
      if (rest) text.appendChild(el("span", "city-result-region", rest));
      li.appendChild(text);
      li.appendChild(el("span", "city-result-status"));
      // Keeps focus in the input, so the click isn't lost to its blur.
      li.addEventListener("mousedown", e => e.preventDefault());
      li.addEventListener("click", () => { if (choosable(r)) add(r); });
      list.appendChild(li);
    });
    if (!results.length) setOpen(false);
    syncResults();
  }
  // Opens or closes the list; the drop-in animation plays only when it goes from closed to open.
  function setOpen(open) {
    const list = $("city-results");
    open = open && results.length > 0;
    if (open && list.hidden) {
      list.classList.remove("is-opening");
      void list.offsetWidth;
      list.classList.add("is-opening");
    }
    list.hidden = !open;
    $("city-query").setAttribute("aria-expanded", String(open));
    if (!open) setActive(-1);
  }
  const isOpen = () => !$("city-results").hidden;
  // Highlights suggestion i (-1 for none); DOM focus stays in the input.
  function setActive(i) {
    active = i;
    const input = $("city-query");
    $("city-results").querySelectorAll("li[role=option]").forEach((li, n) => li.setAttribute("aria-selected", String(n === i)));
    const li = i >= 0 ? $("city-option-" + i) : null;
    if (li) {
      input.setAttribute("aria-activedescendant", li.id);
      li.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
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
  // The newest reading (by date; day is newer than night on the same date) as a large average temperature,
  // a condition and a caption naming the sources (spec 0006).
  function summary(rows) {
    const rank = r => (r.local_date || "") + (r.slot === "day" ? "1" : "0");
    const known = rows.filter(r => SOURCES.some(([source]) => source === r.source));
    if (!known.length) return null;
    const top = known.reduce((a, r) => (rank(r) > rank(a) ? r : a));
    const at = SOURCES.map(([source, label]) => [label, rows.find(r => r.source === source && r.slot === top.slot &&
      r.local_date === top.local_date)]).filter(([, r]) => r);
    const withTemp = at.filter(([, r]) => r.temperature_c != null);
    const avg = withTemp.length ? withTemp.reduce((sum, [, r]) => sum + Number(r.temperature_c), 0) / withTemp.length : null;
    const box = el("div", "city-summary");
    const line = el("div", "city-summary-row");
    line.appendChild(el("p", "city-temp", temp(avg)));
    // Open-Meteo's code wins when it maps to a condition; otherwise MET Norway's.
    let cond = "–";
    at.forEach(([, r]) => { if (cond === "–") cond = Wx.condition(r.weather_code); });
    if (cond !== "–") {
      const p = el("p", "city-cond");
      const glyph = GLYPHS[cond];
      if (glyph) {
        const img = el("img", "city-glyph");
        img.src = "assets/wx-" + glyph + (DAY_NIGHT.includes(glyph) ? (top.slot === "night" ? "-night" : "-day") : "") + ".svg";
        img.alt = "";
        img.width = 40;
        img.height = 40;
        p.appendChild(img);
      }
      p.appendChild(el("span", "", cond));
      line.appendChild(p);
    }
    box.appendChild(line);
    const names = (withTemp.length ? withTemp : at).map(([label]) => label);
    const who = names.length > 1 ? (withTemp.length ? "Average of " : "") + names.join(" and ") : names[0];
    const slotLabel = SLOTS.find(([slot]) => slot === top.slot);
    box.appendChild(el("p", "city-caption", who + " · " + (slotLabel ? slotLabel[1] : top.slot) + ", " + day(top.local_date)));
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
    const actions = el("div", "city-actions");
    // history.js opens the view from the hash and returns focus to this button.
    const hist = el("button", "btn-secondary", "History");
    hist.type = "button";
    hist.dataset.history = c.id;
    hist.setAttribute("aria-label", "History for " + place(c));
    hist.addEventListener("click", () => { location.hash = "#history/" + c.id + "/30d/avg"; });
    actions.appendChild(hist);
    const btn = el("button", "btn-secondary", "Remove");
    btn.type = "button";
    btn.dataset.remove = c.id;
    btn.setAttribute("aria-label", "Remove " + place(c));
    btn.disabled = removing.has(c.id);
    btn.addEventListener("click", () => remove(c));
    actions.appendChild(btn);
    head.appendChild(actions);
    li.appendChild(head);
    const fail = el("p", "msg msg-error", removeFailed.has(c.id) ? MSG.removeFailed : "");
    fail.setAttribute("aria-live", "polite");
    li.appendChild(fail);
    const rows = readings[c.id] || [];
    if (!rows.length) {
      li.appendChild(el("p", "lede", MSG.noReadings));
      return li;
    }
    const sum = summary(rows);
    if (sum) li.appendChild(sum);
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
  const READING_COLS = "city_id, source, slot, local_date, temperature_c, feels_like_c, humidity_pct, wind_speed_ms, precipitation_mm, weather_code";

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
    $("city-query").value = "";
    clearSearch();
    setMsg("cities-msg", "");
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
      request(() => sb.from("latest_readings").select(READING_COLS))
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
  // Autocomplete (spec 0008): typing 2+ characters searches after a short pause, and the latest reply fills the list.
  const queryText = () => $("city-query").value.trim();
  async function search(query) {
    const g = gen, seq = ++searchSeq;
    pendingQuery = query;
    let found = null;
    try {
      const body = await getJson(GEO_URL + "?name=" + encodeURIComponent(query) + "&count=10&language=en&format=json");
      found = Array.isArray(body && body.results) ? body.results : [];
    } catch (err) { /* found stays null */ }
    if (g !== gen || seq !== searchSeq) return;
    pendingQuery = null;
    if (!found) {
      results = [];
      shownQuery = null;
      renderResults();
      $("city-results-status").textContent = "";
      return setMsg("search-msg", MSG.searchFailed, "error");
    }
    // Places without a time zone or coordinates can't be collected, so they aren't offered.
    results = found.filter(r => r && r.id != null && r.name && r.timezone &&
        typeof r.latitude === "number" && typeof r.longitude === "number")
      .slice(0, 10)
      .map(r => ({ id: Number(r.id), name: r.name, admin1: r.admin1 || "", country: r.country || "",
        lat: r.latitude, lon: r.longitude, timezone: r.timezone }));
    shownQuery = query;
    renderResults();
    if (!results.length) {
      $("city-results-status").textContent = "";
      return setMsg("search-msg", 'No places found for "' + query + '".', "error");
    }
    setMsg("search-msg", "");
    setOpen(true);
    $("city-results-status").textContent = results.length === 1 ? "1 suggestion available." : results.length + " suggestions available.";
  }
  // Runs the debounced search now. The same query as the list (or the one running) sends no request.
  function runSearch() {
    clearTimeout(searchTimer);
    searchTimer = null;
    const query = queryText();
    if (query.length < 2 || query === pendingQuery) return;
    if (query === shownQuery) {
      // Back to the shown query: a reply for a longer query still running must not replace it.
      searchSeq++;
      pendingQuery = null;
      return setOpen(true);
    }
    search(query);
  }

  // Closes the list, clears the search messages, and drops the pending search and any reply still running.
  function clearSearch() {
    clearTimeout(searchTimer);
    searchTimer = null;
    searchSeq++;
    pendingQuery = null;
    shownQuery = null;
    results = [];
    renderResults();
    setMsg("search-msg", "");
    $("city-results-status").textContent = "";
  }
  // Each edit (typing, paste, cut, autofill, the native clear button) restarts the pause; under 2 characters clears.
  $("city-query").addEventListener("input", () => {
    setActive(-1);
    if (queryText().length < 2) return clearSearch();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, DEBOUNCE_MS);
  });
  // Enter with nothing highlighted: runs a pending search at once, or asks for 2 letters. Never reloads the page.
  function enterWithoutHighlight() {
    if (queryText().length < 2) return setMsg("search-msg", MSG.short, "error");
    if (searchTimer) runSearch();
  }
  $("city-search").addEventListener("submit", e => {
    e.preventDefault();
    enterWithoutHighlight();
  });
  // Combobox keys: Down/Up move the highlight, Enter chooses, Escape and Tab close.
  $("city-query").addEventListener("keydown", e => {
    const open = isOpen();
    if (e.key === "ArrowDown") {
      if (open) {
        e.preventDefault();
        setActive(Math.min(active + 1, results.length - 1));
      } else if (results.length && queryText() === shownQuery) {
        e.preventDefault();
        setOpen(true);
      }
    } else if (e.key === "ArrowUp") {
      if (open && active >= 0) {
        e.preventDefault();
        setActive(active - 1);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && active >= 0) {
        const r = results[active];
        if (r && choosable(r)) add(r);
      } else {
        enterWithoutHighlight();
      }
    } else if (e.key === "Escape") {
      // With the list closed, the native type="search" Escape is left alone.
      if (!open) return;
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      if (open) setOpen(false);
    }
  });
  // Clicking back into the input reopens the list it already has, without a request.
  $("city-query").addEventListener("click", () => {
    if (!isOpen() && results.length && queryText() === shownQuery) setOpen(true);
  });
  // Clicking or tapping outside the input and the list closes the list.
  document.addEventListener("click", e => {
    if (isOpen() && !e.target.closest(".city-search-row")) setOpen(false);
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
    $("city-query").value = "";
    clearSearch();
    renderAll();
    setMsg("cities-msg", "Added " + r.name + ".", "ok");
    $("city-query").focus();
    loadReadings(r.id);
  }

  // Fetches a newly added city's latest readings, so one that already has readings (followed by someone else,
  // or removed and re-added) shows them at once. On failure the card keeps "No readings yet".
  async function loadReadings(id) {
    const g = gen;
    const res = await request(() => Wx.supabase.from("latest_readings").select(READING_COLS).eq("city_id", id));
    if (g !== gen || res.error || !follows(id)) return;
    const rows = (res.data || []).filter(row => row && Number(row.city_id) === id);
    if (!rows.length) return;
    readings[id] = rows;
    renderCards();
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
