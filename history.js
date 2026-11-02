// Weather history: one city's daily day and night readings for a chosen period and source, as a table, a temperature
// graph, period averages and summary tiles, in the user's unit (specs 0003 and 0007), with a satellite picture viewer linked
// to the graph and the table (spec 0009). Opened by #history/<cityId>/<period>/<source> hashes.
// Uses Wx.supabase, Wx.user, Wx.unit, Wx.onAccountChange, Wx.fmt, Wx.condition and Wx.pic, plus the global Chart (Chart.js 4).
(function () {
  "use strict";
  const Wx = window.Wx;
  const $ = id => document.getElementById(id);
  const NONE = "–";
  const PAGE_SIZE = 1000;    // PostgREST's default row cap, so readings are requested in pages of this size
  const MAX_PAGES = 10;      // a safety stop; 12 months needs 2
  const TABLE_ROWS = 31;
  const MAX_DAYS = 366;
  const PRESETS = { "7d": 7, "30d": 30, "90d": 90, "12m": 365 };
  // Own keys only, so hash parts like "constructor" or "toString" aren't taken for presets.
  const isPreset = p => Object.prototype.hasOwnProperty.call(PRESETS, p);
  const SOURCES = { avg: "Average", "open-meteo": "Open-Meteo", "met-norway": "MET Norway" };
  const SLOTS = [["day", "Day (12pm)"], ["night", "Night (12am)"]];
  const FIELDS = [["temperature_c", "Temperature", "temp"], ["feels_like_c", "Feels like", "temp"], ["humidity_pct", "Humidity", "pct"],
    ["wind_speed_ms", "Wind", "wind"], ["precipitation_mm", "Precipitation", "rain"], ["weather_code", "Conditions", null]];
  const COLS = "source, slot, local_date, temperature_c, feels_like_c, humidity_pct, wind_speed_ms, precipitation_mm, weather_code";
  const PIC_COLS = "local_date, slot, layer, bbox, storage_path";
  const PIC_MAX_AGE_MS = 50 * 60e3; // signed URLs last an hour, so older ones are made again on the next load
  // Auth screens that take the place of the city list; while one shows, the history view is hidden too.
  const OTHER_SCREENS = ["loading", "unavailable", "landing", "signin", "signup", "forgot", "reset", "settings"];
  const MSG = {
    loading: "Loading history…",
    both: "Choose both a start and an end date.",
    order: "The start date must be on or before the end date.",
    future: "The end date can't be after today in this city",
    long: "Choose a range of at most 366 days.",
    picFailed: "Picture unavailable"
  };

  // --- State, reset whenever the signed-in user changes ---
  let userId = null;
  let route = null;          // the parsed history hash { cityId, period, source }, or null
  let city = null;           // the route's city once loaded: { id, name, admin1, country, timezone }
  let cache = {};            // "cityId|from|to" -> readings rows
  let rows = null;           // the rows of the period on show
  let range = null;          // { from, to } of the period on show, city-local dates
  let view = "idle";         // "loading" | "error" | "gone" | "ready"
  let seq = 0;               // bumped on every load and reset, so older replies are dropped
  let page = 0;
  let pageKey = "";
  let lastCityId = null;     // whose History button gets focus back
  let customOpen = false;    // the Custom range panel was opened over a preset period, so it stays open until left
  let charts = [];
  let picCache = {};         // "cityId|from|to" -> { rows, urls, failed, at }: the period's pictures and their signed URLs
  let pics = null;           // the picCache entry of the period on show
  let sel = null;            // the viewer's { date, slot }, kept across source and unit changes
  let selKey = "";           // the period sel belongs to; a new period selects the newest again
  let shown = null;          // what render() drew: { g, steps, dates }, for selection changes without a full render
  let tempChart = null;      // the temperature chart, for its selected point and keyboard tooltip
  const viewer = { frame: $("history-pic-frame"), text: $("history-pic-empty"), img: null, marker: null };
  let viewerKey = null;      // the picture in the viewer ("path|url"), so re-renders don't reload it
  let viewerFailed = false;  // that picture failed to load

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const place = c => [c.name, c.admin1, c.country].filter(Boolean).join(", ");
  const setHidden = (node, hide) => { if (node.hidden !== hide) node.hidden = hide; };

  // Runs a Supabase call and always resolves to { data, error }. Throws and rejections become errors.
  function request(fn) {
    return Promise.resolve().then(fn)
      .catch(e => ({ data: null, error: { network: true, message: String((e && e.message) || e) } }))
      .then(res => res || { data: null, error: null });
  }

  // --- Dates (ISO "YYYY-MM-DD" strings, worked out in UTC so no local offset applies) ---
  function parseIso(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null;
    const d = new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
    return d.toISOString().slice(0, 10) === s ? d : null;
  }
  function addDays(s, n) {
    const d = parseIso(s);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  const span = (from, to) => Math.round((parseIso(to) - parseIso(from)) / 864e5) + 1;
  // The current date in an IANA time zone.
  function todayIn(tz) {
    let parts;
    try {
      parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
    const get = t => (parts.find(p => p.type === t) || {}).value;
    return get("year") + "-" + get("month") + "-" + get("day");
  }
  // "2026-10" -> "Oct 2026"
  const monthLabel = ym => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1))
    .toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  // The Monday on or before a date.
  const monday = s => addDays(s, -((parseIso(s).getUTCDay() + 6) % 7));

  // --- Routing ---
  function customRange(period) {
    const m = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(period || "");
    if (!m || !parseIso(m[1]) || !parseIso(m[2]) || m[1] > m[2] || span(m[1], m[2]) > MAX_DAYS) return null;
    return { from: m[1], to: m[2] };
  }
  const hashFor = (cityId, period, source) => "#history/" + cityId + "/" + period + "/" + source;
  // Only "#history/<digits>..." is a history hash; anything else (auth hashes, empty) belongs to the city list.
  function parse(hash) {
    if (!/^#history\//.test(hash)) return null;
    const parts = hash.slice(9).split("/");
    if (!/^\d+$/.test(parts[0])) return null;
    const period = isPreset(parts[1]) || customRange(parts[1]) ? parts[1] : "30d";
    const source = Object.prototype.hasOwnProperty.call(SOURCES, parts[2]) ? parts[2] : "avg";
    return { cityId: Number(parts[0]), period, source };
  }
  const pageUrl = () => location.href.split("#")[0];
  // Corrects the hash in place, without a new history entry.
  function replaceHash(hash) {
    try { history.replaceState(history.state, "", pageUrl() + hash); } catch (e) { /* the hash stays as it was */ }
  }
  function go(period, source) {
    if (route) location.hash = hashFor(route.cityId, period, source);
  }

  function apply() {
    const r = parse(location.hash);
    if (r) {
      const fixed = hashFor(r.cityId, r.period, r.source);
      if (fixed !== location.hash) replaceHash(fixed);
    }
    // A different city (or the list) starts from a fresh city query, so a removed city is noticed.
    if (city && (!r || r.cityId !== city.id)) city = null;
    if (!r || !route || r.cityId !== route.cityId) customOpen = false;
    route = r;
    const wasOpen = !$("screen-history").hidden;
    sync();
    if (wasOpen && !$("screen-history").hidden) refresh();
  }

  // Shows the history view in place of the city list while a history hash is set, someone is signed in and
  // auth.js is on the list (not on settings or a sign-in screen). Runs again whenever a screen is shown or hidden.
  function sync() {
    const screen = $("screen-history"), shell = $("screen-shell");
    const other = OTHER_SCREENS.some(s => !$("screen-" + s).hidden);
    const want = !!(userId && route && !other);
    if (want) {
      setHidden(shell, true);
      if (screen.hidden) {
        screen.hidden = false;
        lastCityId = route.cityId;
        refresh();
        $("history-title").focus();
      }
    } else if (!screen.hidden) {
      screen.hidden = true;
      destroyCharts();
      if (!other && userId) {
        setHidden(shell, false);
        const btn = $("city-list").querySelector('button[data-history="' + lastCityId + '"]');
        (btn || $("cities-title")).focus();
      }
    }
  }

  // --- Loading ---
  async function fetchRows(sb, cityId, from, to) {
    const seen = new Set();
    const all = [];
    for (let p = 0; p < MAX_PAGES; p++) {
      const start = p * PAGE_SIZE;
      // source and slot after local_date make the order total, so pages can't overlap.
      const res = await request(() => sb.from("readings").select(COLS).eq("city_id", cityId)
        .gte("local_date", from).lte("local_date", to)
        .order("local_date", { ascending: false }).order("source", { ascending: true }).order("slot", { ascending: true })
        .range(start, start + PAGE_SIZE - 1));
      if (res.error) return { error: res.error };
      const got = Array.isArray(res.data) ? res.data : [];
      got.forEach(r => {
        const k = r && r.source + "|" + r.slot + "|" + r.local_date;
        if (k && !seen.has(k)) { seen.add(k); all.push(r); }
      });
      if (got.length < PAGE_SIZE) break;
    }
    return { data: all };
  }

  // The period's pictures and one batch of signed URLs. A failure leaves the history as it is: the viewer then shows
  // "Picture unavailable" for the pictures it knows of (all of them when the list itself failed).
  async function fetchPictures(sb, cityId, from, to) {
    const out = { rows: [], urls: {}, failed: false, at: Date.now() };
    const res = await request(() => sb.from("city_pictures").select(PIC_COLS).eq("city_id", cityId)
      .gte("local_date", from).lte("local_date", to).order("local_date", { ascending: true }));
    if (res.error) { out.failed = true; return out; }
    out.rows = (Array.isArray(res.data) ? res.data : []).filter(p => p && p.storage_path && parseIso(p.local_date) &&
      (p.slot === "day" || p.slot === "night"));
    if (out.rows.length) {
      const signed = await request(() => Wx.pic.sign(sb, out.rows.map(p => p.storage_path)).then(data => ({ data, error: null })));
      if (signed.error) out.failed = true; else out.urls = signed.data;
    }
    return out;
  }

  // Any unexpected error ends in the error state with Try again, never an unhandled rejection.
  async function refresh() {
    const s = ++seq, r = route;
    try {
      await load(s, r);
    } catch (e) {
      if (s === seq && route === r && r) setView("error");
    }
  }

  async function load(s, r) {
    const sb = Wx.supabase;
    // A reply for a route that is no longer on show (a newer load, another city or back to the list) is dropped.
    const stale = () => s !== seq || route !== r;
    if (!r || !sb) return;
    renderControls();
    if (!city || city.id !== r.cityId) {
      city = null;
      renderHeader();
      setView("loading");
      const res = await request(() => sb.from("cities").select("id, name, admin1, country, lat, lon, timezone").eq("id", r.cityId).maybeSingle());
      if (stale()) return;
      if (res.error) return setView("error");
      if (!res.data) return setView("gone");
      const c = res.data;
      city = { id: Number(c.id), name: c.name || "", admin1: c.admin1 || "", country: c.country || "", lat: c.lat, lon: c.lon,
        timezone: c.timezone || "UTC" };
      renderHeader();
    }
    const today = todayIn(city.timezone);
    let rg = isPreset(r.period) ? { from: addDays(today, -(PRESETS[r.period] - 1)), to: today } : customRange(r.period);
    if (!rg || rg.to > today) {
      // A custom range that ends after the city's today is invalid, so it becomes the default period.
      r.period = "30d";
      replaceHash(hashFor(r.cityId, r.period, r.source));
      rg = { from: addDays(today, -29), to: today };
    }
    range = rg;
    renderControls();
    const key = r.cityId + "|" + rg.from + "|" + rg.to;
    const freshPics = picCache[key] && Date.now() - picCache[key].at < PIC_MAX_AGE_MS;
    if (!cache[key]) {
      setView("loading");
      const [res, pr] = await Promise.all([fetchRows(sb, r.cityId, rg.from, rg.to), freshPics ? null : fetchPictures(sb, r.cityId, rg.from, rg.to)]);
      if (stale()) return;
      if (res.error) return setView("error");
      cache[key] = res.data;
      if (pr) picCache[key] = pr;
    } else if (!freshPics) {
      const pr = await fetchPictures(sb, r.cityId, rg.from, rg.to);
      if (stale()) return;
      picCache[key] = pr;
    }
    rows = cache[key];
    pics = picCache[key];
    if (key !== selKey) { selKey = key; sel = null; }
    // A new period or source starts on the first table page; a unit change or a reopen keeps the page.
    if (key + "|" + r.source !== pageKey) { pageKey = key + "|" + r.source; page = 0; }
    setView("ready");
  }

  function reset() {
    seq++;
    city = null;
    cache = {};
    picCache = {};
    pics = null;
    sel = null;
    selKey = "";
    rows = null;
    range = null;
    page = 0;
    pageKey = "";
    customOpen = false;
    setView("idle");
    renderHeader();
  }

  // --- Values ---
  // Groups rows by date and lists every date from the newest with a reading or a picture back to the oldest, newest first.
  // pic holds the period's pictures by date and slot.
  function group(list, picRows) {
    const by = {}, pic = {};
    (list || []).forEach(r => {
      if (!r || !SOURCES[r.source] || r.source === "avg" || (r.slot !== "day" && r.slot !== "night") || !parseIso(r.local_date)) return;
      const d = by[r.local_date] || (by[r.local_date] = {});
      (d[r.source] = d[r.source] || {})[r.slot] = r;
    });
    (picRows || []).forEach(p => { (pic[p.local_date] = pic[p.local_date] || {})[p.slot] = p; });
    const keys = Object.keys(by).concat(Object.keys(pic)).sort();
    const dates = [];
    if (keys.length) for (let d = keys[keys.length - 1]; d >= keys[0]; d = addDays(d, -1)) dates.push(d);
    return { by, pic, dates };
  }
  const groupShown = () => group(rows, pics && pics.rows);
  // The viewer's steps: every date and slot with a reading from any source or a picture, oldest first (night, then day).
  function steps(g) {
    const out = [];
    g.dates.slice().reverse().forEach(d => {
      ["night", "day"].forEach(slot => {
        const rec = g.by[d];
        if ((rec && Object.keys(rec).some(src => rec[src][slot])) || (g.pic[d] && g.pic[d][slot])) out.push({ date: d, slot });
      });
    });
    return out;
  }
  const stepIndex = (list, s) => (s ? list.findIndex(x => x.date === s.date && x.slot === s.slot) : -1);
  // One field of one slot for the chosen source. Average: the mean of the sources that have a value;
  // conditions can't be averaged, so Open-Meteo's is used, or MET Norway's when Open-Meteo has none.
  function value(rec, slot, field, source) {
    const get = src => {
      const r = rec && rec[src] && rec[src][slot];
      const v = r ? r[field] : null;
      return v == null || v === "" ? null : field === "weather_code" ? v : Number(v);
    };
    if (source !== "avg") return get(source);
    const a = get("open-meteo"), b = get("met-norway");
    if (field === "weather_code") return a != null ? a : b;
    if (a != null && b != null) return (a + b) / 2;
    return a != null ? a : b;
  }
  // A Celsius value in the user's unit, to 1 decimal, for the charts.
  const chartTemp = c => (c == null ? null : Math.round((Wx.unit === "F" ? c * 9 / 5 + 32 : c) * 10) / 10);
  const cell = (fmt, v) => (fmt ? Wx.fmt[fmt](v) : Wx.condition(v));

  // --- Rendering ---
  function renderHeader() {
    $("history-title").textContent = city ? place(city) : "History";
    $("history-tz").textContent = city ? city.timezone : "";
  }
  function renderControls() {
    if (!route) return;
    const custom = !isPreset(route.period) || customOpen;
    $("history-period").value = custom ? "custom" : route.period;
    sourceRadios().forEach(r => { r.checked = r.value === route.source; });
    setHidden($("history-source-hint"), route.source !== "avg");
    setHidden($("history-custom"), !custom);
    // While the panel is open its typed dates are kept (a source change mustn't reset them).
    const cr = customOpen ? null : customRange(route.period);
    if (cr) { $("history-from").value = cr.from; $("history-to").value = cr.to; }
    const max = city ? todayIn(city.timezone) : "";
    $("history-from").max = max;
    $("history-to").max = max;
  }
  const sourceRadios = () => Array.from(document.querySelectorAll('#history-source input[name="history-source"]'));
  function setView(v) {
    view = v;
    $("history-status").textContent = v === "loading" ? MSG.loading : "";
    setHidden($("history-error"), v !== "error");
    setHidden($("history-retry"), v !== "error");
    setHidden($("history-gone"), v !== "gone");
    setHidden($("history-controls"), v === "gone");
    render();
  }

  function render() {
    const ready = view === "ready" && !$("screen-history").hidden;
    const g = ready ? groupShown() : { dates: [] };
    setHidden($("history-empty"), !(ready && !g.dates.length));
    setHidden($("history-content"), !g.dates.length);
    if (!g.dates.length) {
      shown = null;
      destroyCharts();
      return;
    }
    const list = steps(g);
    if (stepIndex(list, sel) < 0) sel = list.length ? list[list.length - 1] : null;
    shown = { g, steps: list, dates: g.dates.slice().reverse() };
    renderStats(g);
    renderTable(g);
    renderCharts(g);
    renderPicture();
  }

  // Period summary tiles over the whole loaded period for the chosen source, from memory (spec 0007).
  // Highs and lows take the newest date on a tie; dates are newest first, so only a strictly better value replaces one.
  function renderStats(g) {
    const source = route.source;
    const stat = slot => {
      let best = null, bestDate = null, low = null, lowDate = null, sum = 0, n = 0;
      g.dates.forEach(d => {
        const v = value(g.by[d], slot, "temperature_c", source);
        if (v == null || !isFinite(v)) return;
        if (best == null || v > best) { best = v; bestDate = d; }
        if (low == null || v < low) { low = v; lowDate = d; }
        sum += v;
        n++;
      });
      return { best, bestDate, low, lowDate, mean: n ? sum / n : null, n };
    };
    const day = stat("day"), night = stat("night");
    const days = n => n + (n === 1 ? " day" : " days");
    const tiles = [
      ["day", "Day high", day.best, day.best == null ? "" : Wx.fmt.day(day.bestDate)],
      ["night", "Night low", night.low, night.low == null ? "" : Wx.fmt.day(night.lowDate)],
      ["day", "Day average", day.mean, day.n ? days(day.n) : ""],
      ["night", "Night average", night.mean, night.n ? days(night.n) : ""]
    ];
    const list = $("history-stats");
    list.textContent = "";
    tiles.forEach(([slot, label, v, caption]) => {
      const li = el("li", "stat stat-" + slot);
      li.appendChild(el("p", "stat-label", label));
      li.appendChild(el("p", "stat-value" + (v == null ? " stat-none" : ""), Wx.fmt.temp(v)));
      if (caption) li.appendChild(el("p", "stat-caption", caption));
      list.appendChild(li);
    });
  }

  function renderTable(g) {
    const source = route.source;
    const pages = Math.max(1, Math.ceil(g.dates.length / TABLE_ROWS));
    page = Math.min(page, pages - 1);
    const first = page * TABLE_ROWS;
    const onPage = g.dates.slice(first, first + TABLE_ROWS);
    const table = $("history-table");
    table.textContent = "";
    table.appendChild(el("caption", "visually-hidden", "Daily readings, " + SOURCES[source] + ", newest first"));
    const head = el("thead");
    const top = el("tr");
    const dateTh = el("th", "date", "Date");
    dateTh.scope = "col";
    dateTh.rowSpan = 2;
    top.appendChild(dateTh);
    const sub = el("tr");
    SLOTS.forEach(([, label]) => {
      const th = el("th", "slot-start", label);
      th.scope = "colgroup";
      th.colSpan = FIELDS.length;
      top.appendChild(th);
      FIELDS.forEach(([, name], i) => {
        const h = el("th", i ? "" : "slot-start", name);
        h.scope = "col";
        sub.appendChild(h);
      });
    });
    head.appendChild(top);
    head.appendChild(sub);
    table.appendChild(head);
    const body = el("tbody");
    onPage.forEach(d => {
      const tr = el("tr");
      tr.dataset.date = d;
      const th = el("th", "date", Wx.fmt.day(d));
      th.scope = "row";
      tr.appendChild(th);
      SLOTS.forEach(([slot]) => {
        FIELDS.forEach(([field, , fmt], i) => {
          const td = el("td", i ? "" : "slot-start", cell(fmt, value(g.by[d], slot, field, source)));
          td.dataset.slot = slot;
          tr.appendChild(td);
        });
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    $("history-page-info").textContent = "Days " + (first + 1) + "–" + (first + onPage.length) + " of " + g.dates.length;
    $("history-newer").disabled = page === 0;
    $("history-older").disabled = page >= pages - 1;
    markTable();
  }
  // Outlines the selected date's Day or Night cells, when that row is on this page.
  function markTable() {
    $("history-table").querySelectorAll(".is-pick, .is-pick-date").forEach(c => c.classList.remove("is-pick", "is-pick-first", "is-pick-last", "is-pick-date"));
    if (!sel) return;
    const tr = Array.from($("history-table").querySelectorAll("tbody tr")).find(t => t.dataset.date === sel.date);
    if (!tr) return;
    tr.querySelector("th").classList.add("is-pick-date");
    const cells = Array.from(tr.querySelectorAll("td")).filter(td => td.dataset.slot === sel.slot);
    cells.forEach((td, i) => {
      td.classList.add("is-pick");
      if (i === 0) td.classList.add("is-pick-first");
      if (i === cells.length - 1) td.classList.add("is-pick-last");
    });
  }

  // --- Satellite picture viewer ---
  function renderPicture() {
    if (!shown || !sel) return;
    const i = stepIndex(shown.steps, sel);
    const when = Wx.pic.when(sel.date, sel.slot);
    if ($("history-pic-label").textContent !== when) $("history-pic-label").textContent = when;
    const older = $("history-pic-older"), newer = $("history-pic-newer");
    const had = document.activeElement;
    older.disabled = i <= 0;
    newer.disabled = i < 0 || i >= shown.steps.length - 1;
    // A button that was focused and is now disabled hands focus to the other one, so focus isn't lost.
    if (had === older && older.disabled && !newer.disabled) newer.focus();
    if (had === newer && newer.disabled && !older.disabled) older.focus();
    const row = shown.g.pic[sel.date] && shown.g.pic[sel.date][sel.slot];
    const url = row && pics && !pics.failed ? pics.urls[row.storage_path] || null : null;
    const caption = $("history-pic-caption");
    if (url) {
      const k = row.storage_path + "|" + url;
      if (k !== viewerKey) {
        viewerKey = k;
        viewerFailed = false;
        Wx.pic.show(viewer, { url, row, city, failText: MSG.picFailed,
          onFail: () => { if (viewerKey === k) { viewerFailed = true; caption.textContent = Wx.pic.CREDIT; } } });
      }
      caption.textContent = viewerFailed ? Wx.pic.CREDIT : Wx.pic.caption(row);
      return;
    }
    viewerKey = null;
    caption.textContent = Wx.pic.CREDIT;
    Wx.pic.show(viewer, { text: row || (pics && pics.failed) ? MSG.picFailed : "No satellite picture for " + when });
  }
  // Selects a date and slot from the viewer buttons, the chart or the table, and updates all three.
  // fromKeys shows that point's tooltip on the chart.
  function select(s, fromKeys) {
    if (!shown || stepIndex(shown.steps, s) < 0) return;
    const same = sel && sel.date === s.date && sel.slot === s.slot;
    sel = { date: s.date, slot: s.slot };
    if (!same) { markTable(); renderPicture(); }
    if (!same || fromKeys) updateChart(fromKeys);
  }
  function step(by, fromKeys) {
    if (!shown) return;
    const i = stepIndex(shown.steps, sel), next = shown.steps[i + by];
    if (next) select(next, fromKeys);
  }

  // --- Charts ---
  function destroyCharts() {
    charts.forEach(c => { try { c.destroy(); } catch (e) { /* already gone */ } });
    charts = [];
    tempChart = null;
  }
  function colors() {
    const css = getComputedStyle(document.documentElement);
    const v = name => css.getPropertyValue(name).trim();
    return { day: v("--chart-day"), night: v("--chart-night"), grid: v("--chart-grid"), text: v("--chart-text"), pick: v("--pick") };
  }
  // The temperature chart's selected point as { dataset, index } in its data (day is dataset 0, night 1), or null.
  function chartPick() {
    if (!shown || !sel) return null;
    const index = shown.dates.indexOf(sel.date);
    return index < 0 ? null : { dataset: sel.slot === "day" ? 0 : 1, index };
  }
  // A line chart of day (solid) and night (dashed) temperatures; gaps where a value is missing.
  // With pick, the selected point is drawn larger with a --pick ring, over a dashed --pick guide line (spec 0009).
  function lineConfig(labels, day, night, c, points, pick) {
    const radius = points || labels.length <= 45 ? 3 : 0;
    const picked = ctx => {
      const p = pick && chartPick();
      return !!p && ctx.type === "data" && ctx.datasetIndex === p.dataset && ctx.dataIndex === p.index;
    };
    const dataset = (label, data, color, dash, style) => ({
      label, data, borderColor: color, backgroundColor: color, borderWidth: 2.5, borderDash: dash, pointStyle: style,
      pointRadius: pick ? ctx => (picked(ctx) ? 6 : radius) : radius, pointHoverRadius: pick ? ctx => (picked(ctx) ? 6 : 5) : 5,
      pointBorderWidth: pick ? ctx => (picked(ctx) ? 3 : 0) : 0, pointBorderColor: pick ? ctx => (picked(ctx) ? c.pick : color) : color,
      pointHoverBorderWidth: pick ? ctx => (picked(ctx) ? 3 : 0) : 0, pointHoverBorderColor: pick ? ctx => (picked(ctx) ? c.pick : color) : color,
      pointHitRadius: 8, spanGaps: false, tension: 0
    });
    const font = { family: getComputedStyle(document.body).fontFamily, size: 12 };
    const ticks = extra => Object.assign({ color: c.text, font }, extra);
    const config = {
      type: "line",
      data: { labels, datasets: [dataset("Day (12pm)", day, c.day, [], "circle"), dataset("Night (12am)", night, c.night, [6, 4], "rect")] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: "index", intersect: false },
        // The legend is HTML in the card head (it shows the real dash and marker), so Chart.js's own is off.
        plugins: {
          legend: { display: false },
          tooltip: { usePointStyle: true, borderColor: c.grid, borderWidth: 1, padding: 10, boxPadding: 4 }
        },
        scales: {
          x: { grid: { display: false }, border: { color: c.grid }, ticks: ticks({ autoSkip: true, autoSkipPadding: 16, maxRotation: 0 }) },
          y: { grid: { color: c.grid }, border: { display: false }, ticks: ticks({ padding: 8, maxTicksLimit: 6, callback: v => v + "°" }) }
        }
      }
    };
    if (pick) {
      // Pointing at a point (or tapping near one) selects its date and slot in the viewer.
      const choose = (evt, chart, intersect) => {
        const hit = chart.getElementsAtEventForMode(evt, "nearest", { intersect }, false)[0];
        const date = hit && shown && shown.dates[hit.index];
        if (date && hit.element && !hit.element.skip) select({ date, slot: hit.datasetIndex === 0 ? "day" : "night" });
      };
      config.options.onHover = (evt, active, chart) => choose(evt, chart, true);
      config.options.onClick = (evt, active, chart) => choose(evt, chart, false);
      config.plugins = [{
        id: "wxPickLine",
        beforeDatasetsDraw(chart) {
          const p = chartPick(), area = chart.chartArea;
          if (!p || !area || !chart.scales.x) return;
          const x = chart.scales.x.getPixelForValue(p.index), ctx = chart.ctx;
          ctx.save();
          ctx.strokeStyle = c.pick;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x, area.top);
          ctx.lineTo(x, area.bottom);
          ctx.stroke();
          ctx.restore();
        }
      }];
    }
    return config;
  }
  // Redraws the selected point and guide line. From the keyboard it also shows that point's tooltip, when it has a value.
  // Hover and taps redraw on the next tick, outside Chart.js's own event handling.
  function updateChart(fromKeys) {
    const chart = tempChart;
    if (!chart || typeof chart.update !== "function") return;
    if (!fromKeys) {
      Promise.resolve().then(() => { if (chart === tempChart) chart.update("none"); });
      return;
    }
    const p = chartPick();
    const meta = p && chart.getDatasetMeta(p.dataset);
    const point = meta && meta.data[p.index];
    const has = p && chart.data.datasets[p.dataset].data[p.index] != null;
    const active = has ? [{ datasetIndex: p.dataset, index: p.index }] : [];
    chart.setActiveElements(active);
    if (chart.tooltip) chart.tooltip.setActiveElements(active, point ? { x: point.x, y: point.y } : { x: 0, y: 0 });
    chart.update();
  }
  // "Day and night temperature, Sep 28 to Oct 27, Average. Day 12°C to 24°C, night 4°C to 15°C."
  function summary(title, day, night) {
    const t = v => Math.round(v) + "°" + (Wx.unit === "F" ? "F" : "C");
    const spread = list => {
      const v = list.filter(x => x != null);
      return v.length ? t(Math.min(...v)) + " to " + t(Math.max(...v)) : "no readings";
    };
    return title + ", " + Wx.fmt.day(range.from) + " to " + Wx.fmt.day(range.to) + ", " + SOURCES[route.source] +
      ". Day " + spread(day) + ", night " + spread(night) + ".";
  }
  function draw(canvas, config, label) {
    canvas.setAttribute("aria-label", label);
    const chart = new window.Chart(canvas, config);
    charts.push(chart);
    return chart;
  }

  function renderCharts(g) {
    destroyCharts();
    const source = route.source;
    const len = span(range.from, range.to);
    const usable = typeof window.Chart === "function";
    setHidden($("history-charts-msg"), usable);
    setHidden($("history-temp-card"), !usable);
    setHidden($("history-avg-card"), !usable || len <= 31);
    if (!usable) return;
    const c = colors();
    try {
      // Main graph: the table's dates, oldest first.
      const dates = g.dates.slice().reverse();
      const temps = slot => dates.map(d => chartTemp(value(g.by[d], slot, "temperature_c", source)));
      const day = temps("day"), night = temps("night");
      tempChart = draw($("history-temp-chart"), lineConfig(dates.map(Wx.fmt.day), day, night, c, false, true),
        summary("Day and night temperature", day, night));

      // Period averages: weeks from Monday up to 120 days, calendar months beyond, over the whole period.
      if (len > 31) {
        const weekly = len <= 120;
        const buckets = [];
        for (let d = range.from; d <= range.to; d = addDays(d, 1)) {
          const k = weekly ? monday(d) : d.slice(0, 7);
          if (!buckets.length || buckets[buckets.length - 1].key !== k) buckets.push({ key: k, dates: [] });
          buckets[buckets.length - 1].dates.push(d);
        }
        const mean = (b, slot) => {
          const v = b.dates.map(d => value(g.by[d], slot, "temperature_c", source)).filter(x => x != null);
          return v.length ? chartTemp(v.reduce((a, x) => a + x, 0) / v.length) : null;
        };
        const title = weekly ? "Weekly averages" : "Monthly averages";
        $("history-avg-title").textContent = title;
        const aDay = buckets.map(b => mean(b, "day")), aNight = buckets.map(b => mean(b, "night"));
        const labels = buckets.map(b => (weekly ? "Week of " + Wx.fmt.day(b.key) : monthLabel(b.key)));
        draw($("history-avg-chart"), lineConfig(labels, aDay, aNight, c, true),
          summary((weekly ? "Weekly" : "Monthly") + " average temperature", aDay, aNight));
      }
    } catch (e) {
      destroyCharts();
      setHidden($("history-charts-msg"), false);
      setHidden($("history-temp-card"), true);
      setHidden($("history-avg-card"), true);
    }
  }

  // --- Controls ---
  $("history-back").addEventListener("click", () => {
    try { history.pushState(null, "", pageUrl()); } catch (e) { location.hash = ""; return; }
    apply();
  });
  // The header logo (auth.js shows Landing) leaves History the way Back to cities does, so Go to your cities opens the list.
  $("brand-link").addEventListener("click", () => {
    if (!route || $("screen-landing").hidden) return;
    try { history.pushState(null, "", pageUrl()); } catch (e) { replaceHash(""); }
    apply();
  });
  $("history-retry").addEventListener("click", refresh);
  $("history-period").addEventListener("change", () => {
    const v = $("history-period").value;
    if (v !== "custom") { customOpen = false; return go(v, route.source); }
    // Custom starts from the period on show; the hash changes on Apply.
    customOpen = true;
    $("history-custom").hidden = false;
    $("history-range-msg").textContent = "";
    if (range) { $("history-from").value = range.from; $("history-to").value = range.to; }
  });
  // Source radios: a change (click or arrow keys) moves the hash, which re-renders from memory.
  $("history-source").addEventListener("change", e => {
    if (route && e.target.name === "history-source" && e.target.checked) go(route.period, e.target.value);
  });
  $("history-controls").addEventListener("submit", e => {
    e.preventDefault();
    if (!route || $("history-custom").hidden) return;
    const from = $("history-from").value, to = $("history-to").value;
    const msg = $("history-range-msg");
    const today = city ? todayIn(city.timezone) : null;
    let problem = "";
    if (!parseIso(from) || !parseIso(to)) problem = MSG.both;
    else if (from > to) problem = MSG.order;
    else if (today && to > today) problem = MSG.future + " (" + Wx.fmt.day(today) + ").";
    else if (span(from, to) > MAX_DAYS) problem = MSG.long;
    msg.textContent = problem;
    if (!problem) { customOpen = false; go(from + ".." + to, route.source); }
  });
  // Paging redraws only the table; the charts and the picture viewer always cover the whole period.
  $("history-newer").addEventListener("click", () => { page = Math.max(0, page - 1); renderTable(groupShown()); });
  $("history-older").addEventListener("click", () => { page++; renderTable(groupShown()); });

  // Picture viewer: Older and Newer step one slot; with the chart focused, Left and Right do the same.
  $("history-pic-older").addEventListener("click", () => step(-1));
  $("history-pic-newer").addEventListener("click", () => step(1));
  $("history-temp-chart").addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    step(e.key === "ArrowLeft" ? -1 : 1, true);
  });
  // Clicking or tapping a row's Day or Night cells selects that date and slot (the keyboard uses the viewer and chart).
  $("history-table").addEventListener("click", e => {
    const td = e.target.closest && e.target.closest("tbody td[data-slot]");
    const tr = td && td.closest("tr");
    if (tr && tr.dataset.date) select({ date: tr.dataset.date, slot: td.dataset.slot });
  });

  // Chart colors come from the CSS tokens, so the charts are rebuilt when the color scheme changes.
  const scheme = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  if (scheme && scheme.addEventListener) scheme.addEventListener("change", render);
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  // auth.js shows and hides the screens; the history view follows along.
  const screens = new MutationObserver(sync);
  OTHER_SCREENS.concat("shell").forEach(s => screens.observe($("screen-" + s), { attributes: true, attributeFilter: ["hidden"] }));
  window.addEventListener("hashchange", apply);

  // --- Account changes ---
  // Signing out or switching account closes the view and drops its data; a unit-only change re-renders from memory.
  function onAccount(user) {
    const id = user ? user.id : null;
    if (id !== userId) {
      const had = userId !== null;
      reset();
      userId = id;
      // The next person to sign in shouldn't land on this user's city.
      if (had && route) { replaceHash(""); route = null; }
      sync();
    } else {
      render();
    }
  }
  Wx.onAccountChange(onAccount);
  apply();
  if (Wx.user) onAccount(Wx.user);
})();
