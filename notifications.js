// Email notifications (spec 0004): the Notifications section in Settings (switch, send time, timezone, digests,
// digest cities, range alerts) and the ?unsubscribe=<token> landing state, which works without signing in.
// Uses Wx.supabase, Wx.user, Wx.unit and Wx.onAccountChange.
(function () {
  "use strict";
  const Wx = window.Wx;
  const $ = id => document.getElementById(id);
  const TIMEOUT_MS = 20000;
  const ALERT_LIMIT = 20;
  const MSG = {
    loading: "Loading notification settings…",
    loadFailed: "Couldn't load notification settings. Check your connection and try again.",
    saved: "Saved.",
    saveFailed: "Couldn't save. Check your connection and try again.",
    noCities: "Choose at least one city for your digests.",
    number: "Enter a number.",
    order: "Min must be less than Max.",
    limit: "You can have up to 20 alerts. Delete one to add another.",
    added: "Alert added.",
    addFailed: "Couldn't add the alert. Check your connection and try again.",
    deleteFailed: "Couldn't delete the alert. Try again.",
    unsubBusy: "Turning email notifications off…",
    unsubOk: "Email notifications are off. You can turn them on again in Settings.",
    unsubInvalid: "This unsubscribe link isn't valid. Sign in and turn notifications off in Settings.",
    unsubNetwork: "Couldn't reach the server. Try the link again."
  };
  const SETTINGS_COLS = "enabled, timezone, send_hour, daily, weekly, weekly_day, digest_city_ids";
  const ALERT_COLS = "id, city_id, metric, condition, slot, min_value, max_value, created_at";
  // Allowed ranges in the user's units; values are stored metric (°C, m/s, mm, %), like readings.
  const METRICS = {
    temperature: { label: "Temperature", kind: "temp", C: [-90, 60], F: [-130, 140] },
    feels_like: { label: "Feels like", kind: "temp", C: [-100, 70], F: [-148, 158] },
    wind: { label: "Wind", kind: "wind", C: [0, 360], F: [0, 224] },
    precipitation: { label: "Precipitation", kind: "rain", C: [0, 500], F: [0, 19.7] },
    humidity: { label: "Humidity", kind: "pct", C: [0, 100], F: [0, 100] }
  };
  const SLOT_LABEL = { day: "Day", night: "Night", both: "Both" };

  function setMsg(id, text, kind) {
    const el = $(id);
    el.textContent = text || "";
    el.className = el.className.replace(/\s*msg-(ok|error)\b/g, "") + (kind ? " msg-" + kind : "");
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

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

  // --- Units ---
  const unitLabel = (kind, u) => kind === "temp" ? (u === "F" ? "°F" : "°C") : kind === "wind" ? (u === "F" ? "mph" : "km/h") :
    kind === "rain" ? (u === "F" ? "in" : "mm") : "%";
  function toMetric(kind, v, u) {
    if (kind === "temp") return u === "F" ? (v - 32) * 5 / 9 : v;
    if (kind === "wind") return u === "F" ? v * 0.44704 : v / 3.6;
    if (kind === "rain") return u === "F" ? v * 25.4 : v;
    return v;
  }
  function fromMetric(kind, v, u) {
    if (kind === "temp") return u === "F" ? v * 9 / 5 + 32 : v;
    if (kind === "wind") return u === "F" ? v / 0.44704 : v * 3.6;
    if (kind === "rain") return u === "F" ? v / 25.4 : v;
    return v;
  }
  // A stored value in the user's unit, 1 decimal (2 for inches).
  function shown(kind, v, u) {
    const s = fromMetric(kind, Number(v), u).toFixed(kind === "rain" && u === "F" ? 2 : 1);
    return /^-0\.0+$/.test(s) ? s.slice(1) : s;
  }
  const signed = n => String(n).replace("-", "−");

  // --- Timezones ---
  function validZone(tz) {
    if (!tz || typeof tz !== "string") return false;
    try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch (e) { return false; }
  }
  function deviceZone() {
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* very old browser */ }
    return validZone(tz) ? tz : "UTC";
  }
  let zones = null;
  function zoneList() {
    if (!zones) {
      try { zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone").slice() : []; } catch (e) { zones = []; }
      if (!zones.includes("UTC")) zones.push("UTC");
    }
    return zones;
  }
  // Fills the timezone select, adding the device's and the selected zone when the browser's list lacks them.
  function fillZones(selected) {
    const list = zoneList().slice();
    [deviceZone(), selected].forEach(z => { if (z && !list.includes(z)) list.push(z); });
    list.sort();
    const sel = $("notify-tz");
    sel.textContent = "";
    list.forEach(z => { const o = el("option", "", z.replace(/_/g, " ")); o.value = z; sel.appendChild(o); });
    sel.value = selected;
  }

  // --- State, reset whenever the signed-in user changes ---
  let userId = null;
  let gen = 0;              // bumped on every reset and load, so stale replies are dropped
  let state = "idle";       // "loading" | "error" | "denied" | "ready"
  let settings = null;      // the stored row, or null before the first save
  let storedZoneBad = false;
  let cities = [];          // followed cities in list order: { id, name }
  let alerts = [];          // alert_rules rows, oldest first
  let adding = false;
  let saving = false;
  const deleting = new Set();

  const cityName = id => { const c = cities.find(x => x.id === Number(id)); return c ? c.name : "Removed city"; };

  // --- Rendering ---
  function renderState() {
    const ready = state === "ready";
    const status = state === "loading" ? MSG.loading : state === "error" ? MSG.loadFailed : "";
    $("notify-status").textContent = status;
    $("notify-status").hidden = !status;
    $("notify-status").className = state === "error" ? "msg msg-error" : "lede";
    $("notify-retry").hidden = state !== "error";
    $("notify-denied").hidden = state !== "denied";
    $("notify-body").hidden = !ready;
    $("notify-body").disabled = !ready;
  }

  function syncDisabled() {
    const on = $("notify-enabled").checked;
    $("notify-options").disabled = !on;
    $("alert-fields").disabled = !on;
    $("alert-add").disabled = adding || alerts.length >= ALERT_LIMIT;
    $("alert-limit").hidden = alerts.length < ALERT_LIMIT;
    $("notify-save").disabled = saving;
    $("alert-list").querySelectorAll("button[data-delete]").forEach(b => {
      b.disabled = !on || deleting.has(Number(b.dataset.delete));
    });
  }

  function renderZoneHint() {
    const device = deviceZone(), value = $("notify-tz").value;
    const differs = value !== device;
    let text = "";
    if (storedZoneBad) text = "Your saved timezone (" + settings.timezone + ") isn't recognized, so this device's timezone is selected. Save to use it.";
    else if (differs) text = "This isn't this device's timezone (" + device.replace(/_/g, " ") + ").";
    $("notify-tz-hint").textContent = text;
    $("notify-tz-box").hidden = !text;
    $("notify-tz-device").hidden = !differs;
  }

  function renderUnits() {
    const m = METRICS[$("alert-metric").value] || METRICS.temperature;
    const u = unitLabel(m.kind, Wx.unit);
    $("alert-min-label").textContent = "Min (" + u + ")";
    $("alert-max-label").textContent = "Max (" + u + ")";
  }

  function renderCities() {
    const has = cities.length > 0;
    $("notify-cities-none").hidden = has;
    $("alerts-none").hidden = has;
    $("notify-city-list").hidden = !has;
    $("alerts-area").hidden = !has;
    const ids = settings && Array.isArray(settings.digest_city_ids) ? settings.digest_city_ids.map(Number) : null;
    const list = $("notify-city-list");
    list.textContent = "";
    cities.forEach(c => {
      const label = el("label", "check");
      const box = el("input");
      box.type = "checkbox";
      box.value = c.id;
      box.checked = ids === null || ids.includes(c.id);
      label.appendChild(box);
      label.appendChild(document.createTextNode(" " + c.name));
      list.appendChild(label);
    });
    const sel = $("alert-city"), keep = sel.value;
    sel.textContent = "";
    cities.forEach(c => { const o = el("option", "", c.name); o.value = c.id; sel.appendChild(o); });
    if (cities.some(c => String(c.id) === keep)) sel.value = keep;
  }

  function alertText(a) {
    const m = METRICS[a.metric] || METRICS.temperature;
    const u = Wx.unit;
    return cityName(a.city_id) + " · " + m.label + " " + a.condition + " " + shown(m.kind, a.min_value, u) + "–" +
      shown(m.kind, a.max_value, u) + " " + unitLabel(m.kind, u) + " · " + (SLOT_LABEL[a.slot] || a.slot);
  }
  function renderAlerts() {
    const list = $("alert-list");
    list.textContent = "";
    alerts.forEach(a => {
      const li = el("li", "alert-item");
      li.appendChild(el("span", "alert-text", alertText(a)));
      const btn = el("button", "btn-secondary", "Delete");
      btn.type = "button";
      btn.dataset.delete = a.id;
      btn.setAttribute("aria-label", "Delete alert: " + cityName(a.city_id) + ", " + (METRICS[a.metric] || METRICS.temperature).label);
      btn.addEventListener("click", () => removeAlert(a));
      li.appendChild(btn);
      list.appendChild(li);
    });
    list.hidden = !alerts.length;
    syncDisabled();
  }

  // Puts the stored settings (or the defaults) into the form.
  function fillForm() {
    const s = settings || {};
    $("notify-enabled").checked = !!s.enabled;
    $("notify-hour").value = String(Number.isInteger(s.send_hour) ? s.send_hour : 7);
    storedZoneBad = !!settings && !validZone(s.timezone);
    fillZones(settings && !storedZoneBad ? s.timezone : deviceZone());
    $("notify-daily").checked = !!s.daily;
    $("notify-weekly").checked = !!s.weekly;
    $("notify-day").value = String(Number.isInteger(s.weekly_day) ? s.weekly_day : 1);
    setMsg("notify-msg", "");
    setMsg("notify-cities-msg", "");
    setMsg("alert-msg", "");
    clearFieldErrors();
    renderZoneHint();
    renderCities();
    renderUnits();
    renderAlerts();
  }

  // --- Loading ---
  function reset(user) {
    gen++;
    userId = user ? user.id : null;
    state = "idle";
    settings = null;
    cities = [];
    alerts = [];
    adding = false;
    saving = false;
    deleting.clear();
    renderState();
  }

  async function load() {
    const uid = userId, sb = Wx.supabase;
    if (!uid || !sb) return;
    const g = ++gen;
    adding = false;
    saving = false;
    deleting.clear();
    state = "loading";
    renderState();
    const [allowed, set, rules, uc] = await Promise.all([
      request(() => sb.rpc("notify_allowed")),
      request(() => sb.from("notification_settings").select(SETTINGS_COLS).eq("user_id", uid).maybeSingle()),
      request(() => sb.from("alert_rules").select(ALERT_COLS).eq("user_id", uid)
        .order("created_at", { ascending: true }).order("id", { ascending: true })),
      request(() => sb.from("user_cities").select("city_id, added_at, cities(id, name)").eq("user_id", uid)
        .order("added_at", { ascending: true }))
    ]);
    if (g !== gen) return;
    if (allowed.error || set.error || rules.error || uc.error) {
      state = "error";
      renderState();
      return;
    }
    // Fails closed: anything but true means not allowed.
    if (allowed.data !== true) {
      state = "denied";
      renderState();
      return;
    }
    settings = set.data && typeof set.data === "object" ? set.data : null;
    alerts = Array.isArray(rules.data) ? rules.data.filter(a => a && a.id != null) : [];
    cities = (Array.isArray(uc.data) ? uc.data : []).filter(r => r && r.cities)
      .map(r => ({ id: Number(r.cities.id), name: r.cities.name }));
    state = "ready";
    fillForm();
    renderState();
    syncDisabled();
  }

  // --- Saving settings ---
  $("notify-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (state !== "ready" || saving) return;
    setMsg("notify-msg", "");
    setMsg("notify-cities-msg", "");
    const daily = $("notify-daily").checked, weekly = $("notify-weekly").checked;
    let ids = settings && Array.isArray(settings.digest_city_ids) ? settings.digest_city_ids : null;
    if (cities.length) {
      const boxes = Array.from($("notify-city-list").querySelectorAll("input[type=checkbox]"));
      const checked = boxes.filter(b => b.checked).map(b => Number(b.value));
      if (!checked.length && (daily || weekly)) {
        setMsg("notify-cities-msg", MSG.noCities, "error");
        if ($("notify-options").disabled) $("notify-save").focus(); else boxes[0].focus();
        return;
      }
      ids = checked.length === boxes.length ? null : checked;
    }
    const row = {
      user_id: userId,
      enabled: $("notify-enabled").checked,
      send_hour: Number($("notify-hour").value),
      timezone: $("notify-tz").value,
      daily: daily,
      weekly: weekly,
      weekly_day: Number($("notify-day").value),
      digest_city_ids: ids
    };
    const g = gen, btn = $("notify-save");
    saving = true;
    btn.textContent = "Saving…";
    syncDisabled();
    const res = await request(() => Wx.supabase.from("notification_settings").upsert(row, { onConflict: "user_id" }));
    if (g !== gen) return;
    saving = false;
    btn.textContent = "Save notifications";
    syncDisabled();
    // On error the form keeps the entered values.
    if (res.error) return setMsg("notify-msg", MSG.saveFailed, "error");
    settings = Object.assign({}, settings, row);
    storedZoneBad = false;
    renderZoneHint();
    setMsg("notify-msg", MSG.saved, "ok");
  });

  $("notify-enabled").addEventListener("change", syncDisabled);
  $("notify-tz").addEventListener("change", renderZoneHint);
  $("notify-tz-device").addEventListener("click", () => {
    fillZones(deviceZone());
    storedZoneBad = false;
    renderZoneHint();
    $("notify-tz").focus();
  });

  // --- Range alerts ---
  const FIELDS = ["min", "max"];
  function clearFieldErrors() {
    FIELDS.forEach(f => { setMsg("alert-" + f + "-error", ""); $("alert-" + f).removeAttribute("aria-invalid"); });
  }
  function fieldError(f, text) {
    setMsg("alert-" + f + "-error", text, "error");
    $("alert-" + f).setAttribute("aria-invalid", "true");
  }

  $("alert-metric").addEventListener("change", renderUnits);

  $("alert-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (state !== "ready" || adding || !cities.length) return;
    setMsg("alert-msg", "");
    clearFieldErrors();
    if (alerts.length >= ALERT_LIMIT) return;
    const metric = $("alert-metric").value;
    const m = METRICS[metric];
    const u = Wx.unit;
    const range = m[u === "F" ? "F" : "C"];
    const values = {};
    const bad = [];
    FIELDS.forEach(f => {
      const input = $("alert-" + f);
      const raw = input.value.trim();
      const n = Number(raw);
      if (raw === "" || (input.validity && input.validity.badInput) || !Number.isFinite(n)) {
        fieldError(f, MSG.number);
        bad.push(f);
      } else if (n < range[0] || n > range[1]) {
        fieldError(f, "Enter a value from " + signed(range[0]) + " to " + signed(range[1]) + " " + unitLabel(m.kind, u) + ".");
        bad.push(f);
      } else values[f] = n;
    });
    if (!bad.length && !(values.min < values.max)) {
      fieldError("min", MSG.order);
      bad.push("min");
    }
    if (bad.length) { $("alert-" + bad[0]).focus(); return; }

    const row = {
      user_id: userId,
      city_id: Number($("alert-city").value),
      metric: metric,
      condition: $("alert-condition").value,
      slot: $("alert-slot").value,
      min_value: toMetric(m.kind, values.min, u),
      max_value: toMetric(m.kind, values.max, u)
    };
    const g = gen, btn = $("alert-add");
    adding = true;
    btn.textContent = "Adding…";
    syncDisabled();
    const res = await request(() => Wx.supabase.from("alert_rules").insert(row).select(ALERT_COLS).single());
    if (g !== gen) return;
    adding = false;
    btn.textContent = "Add alert";
    const err = res.error;
    if (err) {
      setMsg("alert-msg", /alert_limit/.test((err.message || "") + " " + (err.hint || "")) ? MSG.limit : MSG.addFailed, "error");
      syncDisabled();
      return;
    }
    if (res.data && res.data.id != null) alerts.push(res.data);
    else await reloadAlerts(g);
    if (g !== gen) return;
    $("alert-min").value = "";
    $("alert-max").value = "";
    renderAlerts();
    setMsg("alert-msg", MSG.added, "ok");
    if (btn.disabled) $("alert-city").focus();
  });

  // Re-reads the alert list, for an insert whose reply didn't include the new row.
  async function reloadAlerts(g) {
    const res = await request(() => Wx.supabase.from("alert_rules").select(ALERT_COLS).eq("user_id", userId)
      .order("created_at", { ascending: true }).order("id", { ascending: true }));
    if (g === gen && !res.error && Array.isArray(res.data)) alerts = res.data.filter(a => a && a.id != null);
  }

  async function removeAlert(a) {
    const id = Number(a.id);
    if (deleting.has(id)) return;
    const g = gen;
    deleting.add(id);
    setMsg("alert-msg", "");
    syncDisabled();
    const res = await request(() => Wx.supabase.from("alert_rules").delete().eq("id", id).eq("user_id", userId));
    if (g !== gen) return;
    deleting.delete(id);
    if (res.error) {
      setMsg("alert-msg", MSG.deleteFailed, "error");
      syncDisabled();
      const again = $("alert-list").querySelector('button[data-delete="' + id + '"]');
      if (again) again.focus();
      return;
    }
    const i = alerts.findIndex(x => Number(x.id) === id);
    if (i >= 0) alerts.splice(i, 1);
    renderAlerts();
    // Focus the next alert's Delete button (the new last one if this was last), or the add form when none are left.
    const buttons = $("alert-list").querySelectorAll("button[data-delete]");
    const next = buttons[Math.min(i, buttons.length - 1)];
    if (next && !next.disabled) next.focus();
    else $("alert-city").focus();
  }

  // --- Opening Settings and account changes ---
  for (let h = 0; h < 24; h++) {
    const o = el("option", "", (h < 10 ? "0" : "") + h + ":00");
    o.value = String(h);
    $("notify-hour").appendChild(o);
  }
  $("settings-open").addEventListener("click", load);
  $("notify-retry").addEventListener("click", load);

  // A different user (or sign-out) starts over; a unit change redraws the alert list and unit labels.
  Wx.onAccountChange(user => {
    if ((user ? user.id : null) !== userId) reset(user);
    else if (state === "ready") { renderUnits(); renderAlerts(); }
  });
  reset(Wx.user);

  // --- Unsubscribe link: ?unsubscribe=<token>, handled before and without sign-in ---
  // The test suite's srcdoc page can't have a query string, so it sets window.WX_TEST_SEARCH instead.
  const testSearch = typeof window.WX_TEST_SEARCH === "string";
  const query = new URLSearchParams(testSearch ? window.WX_TEST_SEARCH : location.search);
  const token = query.get("unsubscribe");

  // Removes the parameter from the address bar, keeping the rest of the address.
  function dropParam() {
    if (testSearch) {
      query.delete("unsubscribe");
      window.WX_TEST_SEARCH = query.toString() ? "?" + query.toString() : "";
      return;
    }
    try {
      const url = new URL(location.href);
      url.searchParams.delete("unsubscribe");
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    } catch (e) { /* the address keeps the parameter */ }
  }

  // POSTs the token to the unsubscribe function. Resolves to "ok", "invalid" or "network".
  async function postToken() {
    const cfg = window.WX_CONFIG || {};
    if (!token) return "invalid";
    if (!cfg.supabaseUrl) return "network";
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => { if (ctrl) ctrl.abort(); }, TIMEOUT_MS);
    try {
      const res = await fetch(cfg.supabaseUrl.replace(/\/$/, "") + "/functions/v1/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token }),
        signal: ctrl ? ctrl.signal : undefined
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body && body.unsubscribed === true) return "ok";
      if (body && body.error === "invalid_token") return "invalid";
      return "network";
    } catch (e) {
      return "network";
    } finally {
      clearTimeout(timer);
    }
  }

  let unsubscribing = false;
  async function unsubscribe() {
    if (unsubscribing) return;
    unsubscribing = true;
    $("unsubscribe").hidden = false;
    $("unsubscribe-retry").hidden = true;
    setMsg("unsubscribe-msg", MSG.unsubBusy);
    const result = await postToken();
    unsubscribing = false;
    dropParam();
    if (result === "ok") setMsg("unsubscribe-msg", MSG.unsubOk, "ok");
    else if (result === "invalid") setMsg("unsubscribe-msg", MSG.unsubInvalid, "error");
    else {
      setMsg("unsubscribe-msg", MSG.unsubNetwork, "error");
      $("unsubscribe-retry").hidden = false;
    }
    // Settings loaded earlier would still show the switch on, so they reload.
    if (result === "ok" && state === "ready") load();
  }
  $("unsubscribe-retry").addEventListener("click", () => {
    unsubscribe().then(() => { if (!$("unsubscribe-retry").hidden) $("unsubscribe-retry").focus(); });
  });
  if (token !== null) unsubscribe();
})();
