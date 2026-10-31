// Weather test suite. Loads ../index.html into a same-origin iframe with fetch and supabase-js mocked (no network),
// drives it through DOM events and writes a summary to #test-results.
// tests/run.sh reads that summary from headless Chrome; opening /tests/ in a browser shows the same report.
(function () {
  "use strict";
  const $results = document.getElementById("test-results");
  const $log = document.getElementById("log");
  const $stage = document.getElementById("stage");
  const STORE = /^wx-/;

  // --- Fixtures ---
  // Add API reply fixtures here, keyed by URL prefix in WxTest.respond.
  // Supabase error objects as supabase-js returns them, for use in sb.replies (e.g. { data: null, error: SB_ERR.network }).
  const SB_ERR = {
    network: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 },
    invalid: { name: "AuthApiError", message: "Invalid login credentials", status: 400, code: "invalid_credentials" },
    unconfirmed: { name: "AuthApiError", message: "Email not confirmed", status: 400, code: "email_not_confirmed" },
    duplicate: { message: 'duplicate key value violates unique constraint "user_cities_pkey"', code: "23505", details: null, hint: null },
    cityLimit: { message: "city_limit", code: "P0001", details: null, hint: "A user can follow up to 10 cities." }
  };
  // Open-Meteo geocoding replies (spec 0002), for mock.fetch[GEO_URL]. The last "par" result has no timezone, so the page drops it.
  const GEO_URL = "https://geocoding-api.open-meteo.com/v1/search";
  const GEO = {
    par: { results: [
      { id: 2988507, name: "Paris", latitude: 48.85341, longitude: 2.3488, country_code: "FR", admin1: "Île-de-France", country: "France", timezone: "Europe/Paris" },
      { id: 4717560, name: "Paris", latitude: 33.66094, longitude: -95.55551, country_code: "US", admin1: "Texas", country: "United States", timezone: "America/Chicago" },
      { id: 3171457, name: "Parma", latitude: 44.79935, longitude: 10.32618, country_code: "IT", admin1: "Emilia-Romagna", country: "Italy", timezone: "Europe/Rome" },
      { id: 6942553, name: "Paradise", latitude: 36.09719, longitude: -115.14666, country_code: "US", country: "United States" }
    ], generationtime_ms: 0.6 },
    none: { generationtime_ms: 0.4 }
  };

  // --- Mocks, called from inside the page by the script injected below ---
  //   mock.calls    every fetched URL. mock.fetch: URL prefix -> reply object (sent as JSON) or a function (url, init) returning
  //                 one, reset before each group. Unmatched URLs and null replies fail like a network error.
  //   mock.requests every fetch as { url, method, body } (body as the page sent it, e.g. a JSON string).
  //   mock.search   the page's query string (e.g. "?unsubscribe=abc"), set before loadPage. A srcdoc page has none, so the
  //                 page reads it from window.WX_TEST_SEARCH (spec 0004's unsubscribe link). Reset before each group.
  const mock = { calls: [], requests: [], errors: [], fetch: {}, search: null };
  // Mocked supabase-js, reset before each group. Set sb.replies before loadPage when the page reads them on load.
  //   sb.calls      every call: { method, args }. Methods are "createClient", "auth.<name>", "rpc.<function>" (args[0] is
  //                 the parameters object) and "<table>.<first op>" (e.g. "profiles.select", "user_cities.delete",
  //                 "latest_readings.select"; args[0] is the chain, [{ op, args }, ...], including filters like eq).
  //   sb.replies    method -> { data, error }, a function (...args) returning one, or a Promise of one (slow replies).
  //                 Unscripted methods reply { data: null, error: null }.
  //   sb.config     the page's window.WX_CONFIG; sb.loaded = false simulates the CDN script failing to load.
  //   fireAuth(event, session) calls the page's onAuthStateChange listeners.
  //   Readings are paged with range(); script them with sb.replies["readings.select"] = pages(rows), and the history
  //   view's city with sb.replies["cities.select"] = { data: cityRow or null, error } (its chain ends with maybeSingle).
  let sb = null;
  function resetSupabase() {
    sb = { calls: [], replies: {}, listeners: [], loaded: true,
      config: { supabaseUrl: "https://mock.supabase.co", supabaseAnonKey: "mock-anon-key" } };
  }
  resetSupabase();
  const sbCalls = method => sb.calls.filter(c => c.method === method);
  // The arguments of every op in a query chain, e.g. ops(chain, "eq") -> [["city_id", 5]].
  const ops = (chain, op) => chain.filter(c => c.op === op).map(c => c.args);
  // A reply function that serves rows the way PostgREST pages them: range(a, b) gets rows a..b, at most 1000 per reply.
  const pages = rows => chain => {
    const r = ops(chain, "range")[0] || [0, 999];
    return { data: rows.slice(r[0], Math.min(r[1], r[0] + 999) + 1), error: null };
  };
  // Chart.js stand-in, reset before each group. chart.loaded = false leaves window.Chart undefined (CDN failure).
  //   chart.made    every chart constructed: { canvas, config, destroyed }, in order.
  let chart = null;
  function resetChart() { chart = { loaded: true, made: [] }; }
  resetChart();
  const liveCharts = () => chart.made.filter(c => !c.destroyed);
  // Fixed clock for the page, reset before each group: set clock.now (ms, e.g. Date.UTC(2026, 9, 27, 12)) before loadPage.
  // new Date() and Date.now() in the page then return that moment.
  let clock = { now: null };
  const fireAuth = (event, session) => sb.listeners.forEach(cb => cb(event, session));
  window.WxTest = {
    // Returns the reply body as JSON text, or null for a network failure.
    respond(url, init) {
      mock.calls.push(url);
      mock.requests.push({ url, method: (init && init.method) || "GET", body: init ? init.body : undefined });
      const prefix = Object.keys(mock.fetch).find(p => url.startsWith(p));
      const reply = prefix === undefined ? null : mock.fetch[prefix];
      const body = typeof reply === "function" ? reply(url, init) : reply;
      return body == null ? null : JSON.stringify(body);
    },
    error(msg) { mock.errors.push(msg); },
    search() { return mock.search; },
    sbSetup() { return { loaded: sb.loaded, config: sb.config }; },
    sbCall(method, args) {
      sb.calls.push({ method, args });
      const r = sb.replies[method];
      return (typeof r === "function" ? r.apply(null, args) : r) || { data: null, error: null };
    },
    sbListen(cb) { sb.listeners.push(cb); },
    chartSetup() { return chart.loaded; },
    chartMade(canvas, config) { const c = { canvas, config, destroyed: false }; chart.made.push(c); return c; },
    clockNow() { return clock.now; }
  };
  const INJECT = `<base href="../"><script>
(function () {
  var T = parent.WxTest;
  window.addEventListener("error", function (e) { T.error("error: " + e.message); });
  window.addEventListener("unhandledrejection", function (e) { T.error("unhandledrejection: " + ((e.reason && e.reason.message) || e.reason)); });
  var consoleError = console.error;
  console.error = function () { T.error("console.error: " + Array.prototype.join.call(arguments, " ")); return consoleError.apply(console, arguments); };
  // Fixed clock: argument-less new Date() and Date.now() return clock.now.
  var now = T.clockNow();
  if (now != null) {
    var RealDate = Date;
    window.Date = class extends RealDate {
      constructor() { if (arguments.length) super(...arguments); else super(now); }
      static now() { return now; }
    };
  }
  // Stand-in for the Chart.js CDN script (stripped from the page): records each config and destroy().
  if (T.chartSetup()) {
    window.Chart = function (canvas, config) { this.record = T.chartMade(canvas, config); this.config = config; };
    window.Chart.prototype.destroy = function () { this.record.destroyed = true; };
  }
  window.fetch = function (url, init) {
    var text = T.respond(String(url), init);
    if (text === null) return Promise.reject(new TypeError("Failed to fetch (mocked)"));
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(JSON.parse(text)); } });
  };
  var search = T.search();
  if (search != null) window.WX_TEST_SEARCH = search;
  // Stand-ins for config.js and the supabase-js CDN script (both stripped from the page); calls go to WxTest.sbCall.
  var setup = T.sbSetup();
  window.WX_CONFIG = { supabaseUrl: setup.config.supabaseUrl, supabaseAnonKey: setup.config.supabaseAnonKey };
  if (!setup.loaded) return;
  window.supabase = { createClient: function () {
    T.sbCall("createClient", Array.prototype.slice.call(arguments));
    function call(method, args) { return Promise.resolve(T.sbCall(method, Array.prototype.slice.call(args))); }
    var auth = {
      onAuthStateChange: function (cb) { T.sbListen(cb); return { data: { subscription: { unsubscribe: function () {} } } }; }
    };
    ["getSession", "getUser", "signInWithPassword", "signUp", "signOut", "resetPasswordForEmail", "updateUser", "resend"].forEach(function (name) {
      auth[name] = function () { return call("auth." + name, arguments); };
    });
    function from(table) {
      var chain = [], q = {};
      ["select", "insert", "update", "upsert", "delete", "eq", "neq", "gt", "gte", "lt", "lte", "in", "is", "match", "order",
        "limit", "range", "single", "maybeSingle"].forEach(function (op) {
        q[op] = function () { chain.push({ op: op, args: Array.prototype.slice.call(arguments) }); return q; };
      });
      q.then = function (done, fail) { return call(table + "." + (chain[0] ? chain[0].op : "select"), [chain]).then(done, fail); };
      return q;
    }
    function rpc(name, params) { return call("rpc." + name, [params]); }
    return { auth: auth, from: from, rpc: rpc };
  } };
})();
<\/script>`;

  // --- Page driver ---
  let pageSrc = "";
  let win = null, doc = null;
  const $ = id => doc.getElementById(id);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // Loads a fresh copy of the page at the given width; resolves once its scripts ran and mocked replies settled.
  function loadPage(width) {
    return new Promise(resolve => {
      $stage.textContent = "";
      sb.listeners = [];
      const f = document.createElement("iframe");
      f.title = "Page under test";
      f.style.width = width + "px";
      f.addEventListener("load", () => { win = f.contentWindow; doc = f.contentDocument; wait(150).then(resolve); }, { once: true });
      f.srcdoc = pageSrc;
      $stage.appendChild(f);
    });
  }
  const key = (target, k) => target.dispatchEvent(new win.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  function type(input, text) {
    input.value = text;
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
  }
  function clearStore() {
    Object.keys(localStorage).filter(k => STORE.test(k)).forEach(k => localStorage.removeItem(k));
  }

  // --- Checks ---
  const checks = [];
  let group = "";
  function ok(name, cond, detail) {
    const pass = !!cond;
    checks.push({ group, name, pass, detail });
    const li = document.createElement("li");
    li.className = pass ? "pass" : "fail";
    li.textContent = (pass ? "PASS " : "FAIL ") + name + (pass || !detail ? "" : " (" + detail + ")");
    $log.appendChild(li);
  }
  function eq(name, actual, expected) {
    ok(name, actual === expected, "got " + JSON.stringify(actual) + ", expected " + JSON.stringify(expected));
  }

  // --- Groups ---
  async function page() {
    await loadPage(1280);
    ok("page has an h1", doc.querySelector("h1") && doc.querySelector("h1").textContent.trim() === "Weather Insights");
    ok("window.Wx is defined", win.Wx && typeof win.Wx === "object");
  }

  async function layout() {
    await loadPage(375);
    const de = doc.documentElement;
    ok("no sideways scroll at 375px", de.scrollWidth <= de.clientWidth, "scrollWidth " + de.scrollWidth + ", clientWidth " + de.clientWidth);
  }

  // Accounts (spec 0001, criteria 1-11; 12 needs a real Supabase project)
  async function accounts() {
    const U = { id: "u1", email: "ann@example.com" };
    const SESSION = { user: U };
    const GOOD = "Abcdefghi1";
    const shown = id => !$("screen-" + id).hidden;
    const text = id => $(id).textContent;
    const submit = id => $(id).dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    const click = id => $(id).click();
    const settle = () => wait(60);
    const signedIn = async () => { sb.replies["auth.getSession"] = { data: { session: SESSION }, error: null }; await loadPage(1280); };

    // 1. No session
    sb.replies["auth.getSession"] = { data: { session: null }, error: null };
    await loadPage(1280);
    ok("1 no session shows Landing", shown("landing") && !shown("signin") && !shown("shell") && !shown("settings"));
    ok("1 Sign in form has its controls", $("signin-email") && $("signin-password") && text("signin-submit") === "Sign in" &&
      text("to-forgot") === "Forgot password?" && text("to-signup") === "Create an account");
    ok("1 account header hidden", $("account").hidden);

    // 2. Stored session; sign-in form never visible while loading
    sb.replies["auth.getSession"] = { data: { session: SESSION }, error: null };
    await loadPage(1280);
    ok("2 shell shows email", shown("shell") && text("account-email") === U.email && !$("account").hidden);
    ok("2 shell has Settings, Sign out, cities placeholder", text("settings-open") === "Settings" && text("sign-out") === "Sign out" &&
      text("cities-title") === "Your cities" && $("screen-shell").textContent.includes("No cities yet."));
    ok("2 sign in not visible after load", !shown("signin"));
    sb.replies["auth.getSession"] = new Promise(() => {});
    await loadPage(1280);
    ok("2 loading screen while session pending", shown("loading") && !shown("signin"));

    // 3. Sign up validation
    sb.replies["auth.getSession"] = { data: { session: null }, error: null };
    await loadPage(1280);
    click("to-signup");
    const RULE = "Use at least 10 characters, with upper case, lower case and a digit.";
    for (const [label, pw] of [["short", "Abcdef1"], ["no upper", "abcdefghi1"], ["no lower", "ABCDEFGHI1"], ["no digit", "Abcdefghij"]]) {
      type($("signup-email"), "new@example.com"); type($("signup-password"), pw); type($("signup-confirm"), pw);
      submit("signup-form"); await settle();
      eq("3 rule message, " + label, text("signup-msg"), RULE);
    }
    type($("signup-password"), GOOD); type($("signup-confirm"), GOOD + "x");
    submit("signup-form"); await settle();
    eq("3 mismatch message", text("signup-msg"), "Passwords don't match.");
    eq("3 signUp not called", sbCalls("auth.signUp").length, 0);

    // 4. Valid sign up, then unconfirmed sign in
    type($("signup-confirm"), GOOD);
    sb.replies["auth.signUp"] = { data: { user: U, session: null }, error: null };
    submit("signup-form"); await settle();
    const su = sbCalls("auth.signUp");
    eq("4 signUp called once", su.length, 1);
    ok("4 signUp has typed email and password", su[0] && su[0].args[0].email === "new@example.com" && su[0].args[0].password === GOOD);
    eq("4 check-your-email message", text("signup-msg"), "Check your email to confirm your account.");
    click("signup-to-signin");
    sb.replies["auth.signInWithPassword"] = { data: null, error: SB_ERR.unconfirmed };
    type($("signin-email"), "new@example.com"); type($("signin-password"), GOOD);
    submit("signin-form"); await settle();
    eq("4 unconfirmed message", text("signin-msg"), "Please confirm your email first.");
    ok("4 resend button shown", !$("signin-resend").hidden && text("signin-resend") === "Resend confirmation email");

    // 5. Invalid credentials
    sb.replies["auth.signInWithPassword"] = { data: null, error: SB_ERR.invalid };
    type($("signin-password"), "wrong");
    submit("signin-form"); await settle();
    eq("5 invalid message", text("signin-msg"), "Email or password is incorrect.");
    eq("5 email kept", $("signin-email").value, "new@example.com");
    eq("5 password cleared", $("signin-password").value, "");

    // 6. Network failure, then double submit
    sb.replies["auth.signInWithPassword"] = { data: null, error: SB_ERR.network };
    type($("signin-password"), "x");
    submit("signin-form"); await settle();
    eq("6 network message", text("signin-msg"), "Can't reach the server. Check your connection and try again.");
    ok("6 Sign in button re-enabled", !$("signin-submit").disabled);
    sb.calls = [];
    sb.replies["auth.signInWithPassword"] = new Promise(() => {});
    submit("signin-form"); submit("signin-form"); await settle();
    eq("6 double submit calls signIn once", sbCalls("auth.signInWithPassword").length, 1);
    ok("6 button disabled while pending", $("signin-submit").disabled);

    // 7. Sign out
    await signedIn();
    click("sign-out"); await settle();
    eq("7 signOut called", sbCalls("auth.signOut").length, 1);
    ok("7 back on Landing, no email", shown("landing") && text("account-email") === "" && $("account").hidden);

    // 8. Forgot password
    sb.replies["auth.getSession"] = { data: { session: null }, error: null };
    await loadPage(1280);
    click("to-forgot");
    type($("forgot-email"), "who@example.com");
    const SENT = "If an account exists for that email, we've sent a reset link.";
    submit("forgot-form"); await settle();
    const rp = sbCalls("auth.resetPasswordForEmail");
    ok("8 reset called with email and redirectTo", rp.length === 1 && rp[0].args[0] === "who@example.com" &&
      rp[0].args[1].redirectTo === new win.URL(".", win.document.baseURI).href, JSON.stringify(rp[0] && rp[0].args));
    eq("8 same message on success", text("forgot-msg"), SENT);
    sb.replies["auth.resetPasswordForEmail"] = { data: null, error: { name: "AuthApiError", message: "User not found", status: 400, code: "user_not_found" } };
    submit("forgot-form"); await settle();
    eq("8 same message on user not found", text("forgot-msg"), SENT);

    // 9. Password recovery
    await loadPage(1280);
    fireAuth("PASSWORD_RECOVERY", SESSION); await settle();
    ok("9 recovery shows Set a new password", shown("reset") && text("reset-title") === "Set a new password");
    sb.replies["auth.updateUser"] = { data: { user: U }, error: null };
    type($("reset-password"), GOOD); type($("reset-confirm"), GOOD);
    submit("reset-form"); await settle();
    const uu = sbCalls("auth.updateUser");
    ok("9 updateUser called with password", uu.length === 1 && uu[0].args[0].password === GOOD);
    ok("9 shell with Password updated.", shown("shell") && text("shell-msg") === "Password updated.");

    // 10. Unit preference
    sb.replies["profiles.select"] = { data: null, error: null };
    await signedIn();
    click("settings-open");
    ok("10 no profile row selects C", doc.querySelector('input[name="unit"][value="C"]').checked);
    const f = doc.querySelector('input[name="unit"][value="F"]');
    f.checked = true; f.dispatchEvent(new win.Event("change", { bubbles: true })); await settle();
    const up = sbCalls("profiles.upsert");
    ok("10 upsert writes unit F for user", up.length === 1 && JSON.stringify(up[0].args[0][0].args[0]) === JSON.stringify({ id: "u1", unit: "F" }));
    eq("10 Saved shown", text("unit-msg"), "Saved");
    sb.replies["profiles.select"] = { data: { unit: "F" }, error: null };
    await signedIn();
    click("settings-open");
    ok("10 reload with profile F selects F", doc.querySelector('input[name="unit"][value="F"]').checked);

    // 11. 400px layout and labels
    const noScroll = name => ok("11 no sideways scroll: " + name, doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
      doc.documentElement.scrollWidth + " > " + doc.documentElement.clientWidth);
    const labelled = name => ok("11 every input labelled: " + name,
      [...doc.querySelectorAll("input")].every(i => i.labels && i.labels.length), "an input has no label");
    sb.replies["auth.getSession"] = { data: { session: null }, error: null };
    await loadPage(400);
    noScroll("landing"); labelled("all screens");
    click("header-signin"); noScroll("sign in");
    click("to-signup"); noScroll("sign up");
    await signedIn(); await loadPage(400);
    noScroll("shell");
    click("settings-open"); noScroll("settings");

    // Config missing
    sb.replies = {}; sb.config = { supabaseUrl: "", supabaseAnonKey: "" };
    await loadPage(1280);
    ok("unavailable screen when config is empty", shown("unavailable") && !shown("signin") &&
      text("screen-unavailable").includes("Accounts are unavailable right now. Please reload the page later."));
  }

  // Cities (spec 0002, criteria 1-7; 8-9 are Deno tests, 10-12 need a real Supabase project)
  async function cities() {
    const U = { id: "u1", email: "ann@example.com" };
    const settle = () => wait(60);
    const text = id => $(id).textContent;
    const submit = id => $(id).dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    const search = async q => { type($("city-query"), q); submit("city-search"); await settle(); };
    const row = (id, name, admin1) => ({ city_id: id, added_at: "2026-10-2" + (id % 10) + "T00:00:00Z",
      cities: { id, name, admin1, country: "France", lat: 48.85, lon: 2.35, timezone: "Europe/Paris" } });
    const rd = (city_id, source, slot, t, f) => ({ city_id, source, slot, local_date: "2026-10-24", temperature_c: t, feels_like_c: f,
      humidity_pct: 60, wind_speed_ms: 5, precipitation_mm: 0.4 });
    const open = async (userCities, latest, width) => {
      sb.replies["auth.getSession"] = { data: { session: { user: U } }, error: null };
      sb.replies["user_cities.select"] = { data: userCities, error: null };
      sb.replies["latest_readings.select"] = { data: latest || [], error: null };
      mock.fetch[GEO_URL] = GEO.par;
      await loadPage(width || 1280);
    };
    const cards = () => [...doc.querySelectorAll("#city-list > li")];
    const btn = label => [...doc.querySelectorAll("button")].find(b => (b.getAttribute("aria-label") || b.textContent) === label);
    const paris = "Paris, Île-de-France, France";

    // 1. Search
    await open([]);
    await search("Par");
    ok("1 geocoding URL has name=Par", mock.calls.some(u => u.startsWith(GEO_URL) && u.includes("name=Par") && u.includes("count=10")), mock.calls.join(" "));
    const items = [...doc.querySelectorAll("#city-results li")];
    eq("1 three results (no-timezone one dropped)", items.length, 3);
    ok("1 results show name, region, country", items[0] && items[0].textContent.includes(paris) && items[2].textContent.includes("Parma, Emilia-Romagna, Italy"));
    ok("1 each result has an Add button", items.every(li => li.querySelector("button") && li.querySelector("button").textContent === "Add"));
    mock.fetch[GEO_URL] = GEO.none;
    await search("Par");
    eq("1 no results message", text("search-msg"), 'No places found for "Par".');
    mock.fetch[GEO_URL] = null;
    await search("Par");
    eq("1 fetch failure message", text("search-msg"), "Can't search right now. Check your connection and try again.");
    eq("1 query kept after failure", $("city-query").value, "Par");
    mock.calls = [];
    await search("P");
    eq("1 short query message", text("search-msg"), "Type at least 2 letters.");
    eq("1 short query makes no request", mock.calls.length, 0);

    // 2. Add
    await open([]);
    eq("2 count starts at 0 of 10", text("cities-count"), "0 of 10 cities");
    await search("Par");
    btn("Add " + paris).click(); await settle();
    const fc = sbCalls("rpc.follow_city");
    eq("2 follow_city called once", fc.length, 1);
    eq("2 follow_city params", JSON.stringify(fc[0] && fc[0].args[0]), JSON.stringify({ p_id: 2988507, p_name: "Paris", p_admin1: "Île-de-France",
      p_country: "France", p_lat: 48.85341, p_lon: 2.3488, p_timezone: "Europe/Paris" }));
    eq("2 one card added", cards().length, 1);
    ok("2 card has empty-readings text", cards()[0] && cards()[0].textContent.includes("No readings yet. First reading at 12am/12pm local time."));
    eq("2 count is 1 of 10", text("cities-count"), "1 of 10 cities");
    const added = doc.querySelector('#city-results button[data-id="2988507"]');
    ok("2 result shows disabled Added", added && added.textContent === "Added" && added.disabled);
    eq("2 Added Paris. announced", text("cities-msg"), "Added Paris.");

    // 2b. Readings of a newly added city that already has some
    await open([]);
    sb.replies["latest_readings.select"] = chain => ({ data: chain.some(c => c.op === "eq") ? [rd(2988507, "open-meteo", "day", 18.2, 17)] : [], error: null });
    await search("Par");
    btn("Add " + paris).click(); await settle();
    ok("2 new card shows existing readings, not No readings yet", cards()[0] && cards()[0].textContent.includes("18°C") && !cards()[0].textContent.includes("No readings yet"));

    // 3. Already followed, and a 23505 error
    await open([row(2988507, "Paris", "Île-de-France")]);
    await search("Par");
    const have = doc.querySelector('#city-results button[data-id="2988507"]');
    ok("3 followed result shows disabled Added", have && have.textContent === "Added" && have.disabled);
    await open([]);
    sb.replies["rpc.follow_city"] = { data: null, error: SB_ERR.duplicate };
    await search("Par");
    btn("Add " + paris).click(); await settle();
    eq("3 duplicate message", text("cities-msg"), "Paris is already in your list.");
    eq("3 no card added", cards().length, 0);

    // 4. Limit
    const ten = Array.from({ length: 10 }, (_, i) => row(100 + i, "City" + i, "Region"));
    await open(ten);
    await search("Par");
    ok("4 all Add buttons disabled at 10", [...doc.querySelectorAll("#city-results button")].every(b => b.disabled));
    ok("4 limit message shown", !$("cities-limit").hidden && text("cities-limit") === "You can follow up to 10 cities. Remove one to add another.");
    await open([]);
    sb.replies["rpc.follow_city"] = { data: null, error: SB_ERR.cityLimit };
    await search("Par");
    btn("Add " + paris).click(); await settle();
    eq("4 city_limit error shows limit message", text("cities-msg"), "You can follow up to 10 cities. Remove one to add another.");
    eq("4 no card added", cards().length, 0);

    // 5. Remove
    await open([row(1, "Paris", "Île-de-France"), row(2, "Lyon", "Rhône")]);
    btn("Remove " + paris).click(); await settle();
    const del = sbCalls("user_cities.delete")[0];
    const eqs = del ? del.args[0].filter(c => c.op === "eq").map(c => c.args.join("=")) : [];
    eq("5 delete filtered by user and city", eqs.join(","), "user_id=u1,city_id=1");
    eq("5 card removed", cards().length, 1);
    eq("5 count goes down", text("cities-count"), "1 of 10 cities");
    btn("Remove Lyon, Rhône, France").click(); await settle();
    ok("5 empty message after last removal", text("cities-status") === "No cities yet. Search for a city to add it." && !$("cities-status").hidden);
    ok("5 focus moves to the search input", doc.activeElement === $("city-query"));

    // 6. Readings and units
    await open([row(1, "Paris", "Île-de-France")], [rd(1, "open-meteo", "day", 21.4, 19), rd(1, "met-norway", "day", 20.6, null), rd(1, "open-meteo", "night", 12.0, 10)]);
    const entries = () => [...doc.querySelectorAll("#city-list .reading")];
    const vals = e => [...e.querySelectorAll("dd")].map(d => d.textContent);
    eq("6 four entries", entries().length, 4);
    eq("6 OM day temp", vals(entries()[0])[0], "21°C");
    eq("6 MET day temp", vals(entries()[1])[0], "21°C");
    eq("6 MET feels-like is a dash", vals(entries()[1])[1], "–");
    eq("6 OM night temp", vals(entries()[2])[0], "12°C");
    ok("6 MET night has no reading", entries()[3].textContent.includes("No reading yet"));
    eq("6 metric wind and rain", vals(entries()[0]).slice(3).join(" | "), "18 km/h | 0.4 mm");
    sb.calls = []; const fetches = mock.calls.length;
    const f = doc.querySelector('input[name="unit"][value="F"]');
    f.checked = true; f.dispatchEvent(new win.Event("change", { bubbles: true })); await settle();
    eq("6 OM day temp in F", vals(entries()[0])[0], "71°F");
    eq("6 MET day temp in F", vals(entries()[1])[0], "69°F");
    eq("6 OM night temp in F", vals(entries()[2])[0], "54°F");
    eq("6 imperial wind and rain", vals(entries()[0]).slice(3).join(" | "), "11 mph | 0.02 in");
    eq("6 unit change makes no new reads", sb.calls.filter(c => /^(user_cities|latest_readings|rpc)/.test(c.method)).length, 0);
    eq("6 unit change makes no fetch", mock.calls.length, fetches);

    // 7. 400px layout and labels
    const many = Array.from({ length: 10 }, (_, i) => row(200 + i, "A very long city name number " + i, "Some Long Region Name"));
    const lots = many.flatMap(r => [rd(r.city_id, "open-meteo", "day", 20, 19), rd(r.city_id, "met-norway", "day", 20, null),
      rd(r.city_id, "open-meteo", "night", 10, 9), rd(r.city_id, "met-norway", "night", 10, null)]);
    await open(many, lots, 400);
    mock.fetch[GEO_URL] = { results: Array.from({ length: 10 }, (_, i) => ({ id: 900 + i, name: "Springfield" + i, latitude: 1, longitude: 2,
      admin1: "Some Long Region Name", country: "Some Country With A Long Name", timezone: "UTC" })) };
    await search("Spring");
    eq("7 ten results and ten cards", doc.querySelectorAll("#city-results li").length + "/" + cards().length, "10/10");
    ok("7 no sideways scroll at 400px", doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
      doc.documentElement.scrollWidth + " > " + doc.documentElement.clientWidth);
    ok("7 search input has a label", $("city-query").labels && $("city-query").labels.length === 1 && $("city-query").labels[0].textContent === "Search for a city");
    ok("7 every Remove name includes its place", cards().every(li => /^Remove A very long city name number \d, Some Long Region Name, France$/.test(li.querySelector("[data-remove]").getAttribute("aria-label"))));
    ok("7 every Add name includes its place", [...doc.querySelectorAll("#city-results button")].every(b => /^(Add|Added) Springfield\d, Some Long Region Name, Some Country/.test(b.getAttribute("aria-label"))));
    const form = $("city-search");
    ok("7 input sits in a form with a submit button (Enter submits)", form.contains($("city-query")) && form.querySelector('button[type="submit"]'));
    mock.calls = [];
    form.requestSubmit(); await settle();
    ok("7 submitting the form searches", mock.calls.some(u => u.includes("name=Spring")));
  }

  // History regressions (spec 0003 review findings)
  async function historyRegressions() {
    clock.now = Date.UTC(2026, 9, 27, 12);
    sb.replies["auth.getSession"] = { data: { session: { user: { id: "u1", email: "ann@example.com" } } }, error: null };
    sb.replies["cities.select"] = { data: { id: 5, name: "Paris", admin1: "Île-de-France", country: "France", timezone: "Europe/Paris" }, error: null };
    sb.replies["readings.select"] = pages([{ source: "open-meteo", slot: "day", local_date: "2026-10-26", temperature_c: 12 }]);
    await loadPage(1280);
    win.location.hash = "#history/5/constructor/avg";
    await wait(150);
    eq("an inherited key as period becomes 30d", win.location.hash, "#history/5/30d/avg");
    const q = sbCalls("readings.select");
    ok("readings are queried for the last 30 days", q.length && ops(q[q.length - 1].args[0], "gte")[0][1] === "2026-09-28",
      q.length ? JSON.stringify(ops(q[q.length - 1].args[0], "gte")) : "no readings query");
    ok("the view leaves Loading", $("history-status").textContent === "" && $("history-error").hidden);
  }

  // History (spec 0003, criteria 1-8, 10, 11; 9 was dropped, 12 needs a real Supabase project)
  async function history() {
    const U = { id: "u1", email: "ann@example.com" };
    const PARIS = { id: 5, name: "Paris", admin1: "Île-de-France", country: "France", timezone: "Europe/Paris" };
    const AKL = { id: 5, name: "Auckland", admin1: "Auckland", country: "New Zealand", timezone: "Pacific/Auckland" };
    const rd = (source, slot, d, t, extra) => Object.assign({ source, slot, local_date: d, temperature_c: t, feels_like_c: null,
      humidity_pct: 60, wind_speed_ms: 5, precipitation_mm: 0.4, weather_code: null }, extra);
    // Opens the page signed in with the city followed, then sets the hash and waits. Resets sb.calls and chart.made after the load.
    const open = async (hash, readings, cityRow, unit) => {
      clock.now = Date.UTC(2026, 9, 27, 12);
      sb.replies["auth.getSession"] = { data: { session: { user: U } }, error: null };
      sb.replies["profiles.select"] = { data: unit ? { unit } : null, error: null };
      sb.replies["user_cities.select"] = { data: [{ city_id: 5, added_at: "2026-10-01T00:00:00Z",
        cities: { id: 5, name: "Paris", admin1: "Île-de-France", country: "France", lat: 48.8, lon: 2.3, timezone: "Europe/Paris" } }], error: null };
      sb.replies["cities.select"] = { data: cityRow === undefined ? PARIS : cityRow, error: null };
      sb.replies["readings.select"] = pages(readings || []);
      await loadPage(1280);
      sb.calls = []; chart.made = [];
      if (hash) { win.location.hash = hash; await wait(150); }
    };
    const readingQueries = () => sbCalls("readings.select").map(c => c.args[0]);
    const rows = () => [...doc.querySelectorAll("#history-table tbody tr")].map(tr => [...tr.children].map(c => c.textContent));
    const shown = id => !$(id).hidden;
    const byCanvas = id => liveCharts().find(c => c.canvas.id === id);
    const FIX = [
      rd("open-meteo", "day", "2026-10-27", 20, { feels_like_c: 17, weather_code: "3" }), rd("met-norway", "day", "2026-10-27", 22, { weather_code: "rain" }),
      rd("open-meteo", "night", "2026-10-27", 10), rd("met-norway", "night", "2026-10-27", 12),
      rd("open-meteo", "day", "2026-10-26", 18),
      rd("open-meteo", "night", "2026-10-24", 8)
    ];

    // 1. Open and back
    await open("", []);
    const hb = doc.querySelector('button[data-history="5"]');
    eq("1 card button label", hb && hb.getAttribute("aria-label"), "History for Paris, Île-de-France, France");
    hb.click(); await wait(150);
    eq("1 click sets the hash", win.location.hash, "#history/5/30d/avg");
    ok("1 history shown, list hidden", shown("screen-history") && !shown("screen-shell"));
    ok("1 city heading focused", doc.activeElement === $("history-title") && $("history-title").textContent.startsWith("Paris"));
    $("history-back").click(); await wait(150);
    ok("1 Back shows the list, focus on the History button", shown("screen-shell") && !shown("screen-history") && doc.activeElement === doc.querySelector('button[data-history="5"]'));
    win.location.hash = "#history/5/30d/avg"; await wait(150);
    win.location.hash = ""; await wait(150);
    ok("1 hashchange to empty shows the list", shown("screen-shell") && !shown("screen-history"));

    // 2. Period, source and invalid hash
    await open("", []);
    sb.replies["cities.select"] = { data: AKL, error: null };
    win.location.hash = "#history/5/7d/met-norway"; await wait(150);
    const q = readingQueries()[0] || [];
    eq("2 eq city_id", JSON.stringify(ops(q, "eq")), '[["city_id",5]]');
    eq("2 gte is the city's local today minus 6", JSON.stringify(ops(q, "gte")), '[["local_date","2026-10-22"]]');
    eq("2 lte is the city's local today", JSON.stringify(ops(q, "lte")), '[["local_date","2026-10-28"]]');
    eq("2 MET Norway selected", $("history-source").value, "met-norway");
    win.location.hash = "#history/5/bogus/xyz"; await wait(150);
    eq("2 invalid hash is replaced", win.location.hash, "#history/5/30d/avg");

    // 3. Paging for 12 months
    const big = [];
    for (let i = 0; i < 366; i++) {
      const d = new Date(Date.UTC(2025, 9, 27 + i)).toISOString().slice(0, 10);
      ["open-meteo", "met-norway"].forEach(src => ["day", "night"].forEach(slot => big.push(rd(src, slot, d, 10))));
    }
    await open("#history/5/12m/avg", big);
    const bq = readingQueries();
    eq("3 two requests", bq.length, 2);
    eq("3 ranges", JSON.stringify(bq.map(c => ops(c, "range")[0])), "[[0,999],[1000,1999]]");
    ok("3 select has no raw", bq.every(c => !String(ops(c, "select")[0][0]).includes("raw")));
    eq("3 table counts dates from all 1464 rows", $("history-page-info").textContent, "Days 1–31 of 366");

    // 4 and 5. Table and average
    await open("#history/5/7d/avg", FIX);
    const t = rows();
    eq("4 date order", t.map(r => r[0]).join(","), "Oct 27,Oct 26,Oct 25,Oct 24");
    eq("4 Oct 26 night cells are dashes", t[1].slice(7).join(""), "––––––");
    eq("4 Oct 25 is all dashes", t[2].slice(1).join(""), "––––––––––––");
    eq("4 metric values", t[0].slice(1, 7).join(" | "), "21°C | 17°C | 60% | 18 km/h | 0.4 mm | Cloudy");
    eq("4 Oct 24 night only", t[3].slice(1, 7).join("") + "|" + t[3][7], "––––––|8°C");
    eq("5 one source only is used", t[1][1], "18°C");
    eq("5 feels-like with MET null", t[0][2], "17°C");
    eq("5 average night", t[0][7], "11°C");

    // 6. Condition labels
    const cond = win.Wx.condition;
    eq("6 codes", ["0", "63", "lightrainshowers_day", "partlycloudy_night", "999", null].map(cond).join(","), "Clear,Rain,Rain,Partly cloudy,–,–");

    // 8. Main chart
    const c8 = byCanvas("history-temp-chart");
    ok("8 one main chart, no averages for 7d", liveCharts().length === 1 && c8);
    eq("8 labels oldest first", JSON.stringify(c8.config.data.labels), '["Oct 24","Oct 25","Oct 26","Oct 27"]');
    eq("8 dataset labels", c8.config.data.datasets.map(d => d.label).join("|"), "Day (12pm)|Night (12am)");
    eq("8 day values with nulls", JSON.stringify(c8.config.data.datasets[0].data), "[null,null,18,21]");
    eq("8 night values with nulls", JSON.stringify(c8.config.data.datasets[1].data), "[8,null,null,11]");
    const css = win.getComputedStyle(doc.documentElement);
    ok("8 border colors are the tokens", css.getPropertyValue("--chart-day").trim() !== "" &&
      c8.config.data.datasets[0].borderColor === css.getPropertyValue("--chart-day").trim() &&
      c8.config.data.datasets[1].borderColor === css.getPropertyValue("--chart-night").trim());
    const al = c8.canvas.getAttribute("aria-label");
    ok("8 canvas role and label with first and last dates", c8.canvas.getAttribute("role") === "img" && al.includes("Oct 21") && al.includes("Oct 27"), al);

    // 7. Unit and source changes
    const made = chart.made.length;
    sb.calls = [];
    const f = doc.querySelector('input[name="unit"][value="F"]');
    f.checked = true; f.dispatchEvent(new win.Event("change", { bubbles: true })); await wait(150);
    eq("7 table in F", rows()[0].slice(1, 7).join(" | "), "70°F | 63°F | 60% | 11 mph | 0.02 in | Cloudy");
    ok("7 chart rebuilt with F values", chart.made.length > made && chart.made[made - 0].config.data.datasets[0].data[3] === 69.8 &&
      liveCharts().length === 1 && chart.made.filter(c => !c.destroyed)[0] !== c8 && c8.destroyed);
    const made2 = chart.made.length;
    $("history-source").value = "open-meteo"; $("history-source").dispatchEvent(new win.Event("change", { bubbles: true })); await wait(150);
    ok("7 source change rebuilds with that source's values", chart.made.length > made2 && byCanvas("history-temp-chart").config.data.datasets[0].data[3] === 68);
    eq("7 no Supabase calls from unit or source change", sb.calls.filter(c => /^(readings|cities)/.test(c.method)).length, 0);

    // 10. Period averages
    await open("#history/5/30d/avg", FIX);
    eq("10 30d has no averages chart", liveCharts().length, 1);
    const yr = [rd("open-meteo", "day", "2026-03-10", 10), rd("open-meteo", "day", "2026-03-20", 20), rd("open-meteo", "day", "2026-03-25", null),
      rd("open-meteo", "day", "2026-10-26", 12)];
    await open("#history/5/12m/avg", yr);
    const av = byCanvas("history-avg-chart");
    ok("10 12m has an averages chart", av);
    eq("10 one label per month", av && av.config.data.labels.length, 13);
    eq("10 label names", av && av.config.data.labels[0] + "," + av.config.data.labels[12], "Oct 2025,Oct 2026");
    eq("10 March day mean ignores missing values", av && av.config.data.datasets[0].data[5], 15);

    // 11. States
    await open("#history/5/30d/avg", []);
    ok("11 empty state, no chart", shown("history-empty") && !shown("history-content") && chart.made.length === 0 &&
      $("history-empty").textContent.startsWith("No readings in this period."));
    await open("", []);
    sb.replies["readings.select"] = { data: null, error: SB_ERR.network };
    win.location.hash = "#history/5/30d/avg"; await wait(150);
    ok("11 error with Try again", shown("history-error") && $("history-error").textContent.startsWith("Couldn't load the history.") && shown("history-retry"));
    const before = readingQueries().length;
    $("history-retry").click(); await wait(150);
    eq("11 Try again repeats the query", readingQueries().length, before + 1);
    await open("", [], null);
    win.location.hash = "#history/5/30d/avg"; await wait(150);
    ok("11 city not followed", shown("history-gone") && $("history-gone").textContent === "This city is no longer in your list.");
    chart.loaded = false;
    await open("#history/5/7d/avg", FIX);
    ok("11 no Chart: table renders, message shows", rows().length === 4 && shown("history-charts-msg") &&
      $("history-charts-msg").textContent === "Charts are unavailable right now." && chart.made.length === 0);
    chart.loaded = true;
    await open("#history/5/30d/avg", FIX);
    const custom = async (from, to) => {
      $("history-period").value = "custom"; $("history-period").dispatchEvent(new win.Event("change", { bubbles: true }));
      $("history-from").value = from; $("history-to").value = to;
      sb.calls = [];
      $("history-controls").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })); await wait(150);
    };
    await custom("2026-09-30", "2026-09-01");
    ok("11 from after to: inline error, no query", $("history-range-msg").textContent !== "" && readingQueries().length === 0);
    await custom("2025-01-01", "2026-02-01");
    ok("11 over 366 days: inline error, no query", $("history-range-msg").textContent !== "" && readingQueries().length === 0);
    await custom("2026-09-01", "2026-09-30");
    eq("11 valid range sets the hash", win.location.hash, "#history/5/2026-09-01..2026-09-30/avg");
  }

  // Notifications (spec 0004, criteria 1-7; 8-11 are Deno tests, 12 needs real Supabase + Resend)
  async function notifications() {
    const U = { id: "u1", email: "ann@example.com" };
    const settle = () => wait(60);
    const text = id => $(id).textContent;
    const submit = id => $(id).dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true }));
    const change = (e, v) => { if (v !== undefined) e.value = v; e.dispatchEvent(new win.Event("change", { bubbles: true })); };
    const ucRow = (id, name) => ({ city_id: id, added_at: "2026-10-0" + id + "T00:00:00Z", cities: { id, name } });
    const rule = (id, extra) => Object.assign({ id, city_id: 1, metric: "temperature", condition: "outside", slot: "both",
      min_value: 0, max_value: 30, created_at: "2026-10-2" + (id % 10) + "T00:00:00Z" }, extra);
    // Opens Settings signed in. o: { allowed, settings, rules, unit, width }. Resets sb.calls after Settings has loaded.
    const open = async (o) => {
      o = o || {};
      sb.replies["auth.getSession"] = { data: { session: { user: U } }, error: null };
      sb.replies["profiles.select"] = { data: o.unit ? { unit: o.unit } : null, error: null };
      sb.replies["rpc.notify_allowed"] = { data: o.allowed === undefined ? true : o.allowed, error: null };
      sb.replies["notification_settings.select"] = { data: o.settings || null, error: null };
      sb.replies["alert_rules.select"] = { data: o.rules || [], error: null };
      sb.replies["user_cities.select"] = { data: o.cities || [ucRow(1, "Lisbon"), ucRow(2, "Oslo")], error: null };
      await loadPage(o.width || 1280);
      $("settings-open").click(); await settle();
      sb.calls = [];
    };
    const fill = (min, max, metric) => {
      if (metric) change($("alert-metric"), metric);
      type($("alert-min"), min); type($("alert-max"), max);
    };
    const inserts = () => sbCalls("alert_rules.insert").map(c => ops(c.args[0], "insert")[0][0]);
    const setUnit = u => { const r = doc.querySelector('input[name="unit"][value="' + u + '"]'); r.checked = true; change(r); };

    // 1. New user: off, disabled, one upsert, Saved.
    await open();
    ok("1 switch is off", !$("notify-enabled").checked);
    ok("1 controls below are disabled", $("notify-options").disabled && $("alert-fields").disabled);
    eq("1 default hour 07:00 and Monday", $("notify-hour").value + "/" + $("notify-day").value, "7/1");
    $("notify-enabled").checked = true; change($("notify-enabled"));
    ok("1 turning the switch on enables the controls", !$("notify-options").disabled && !$("alert-fields").disabled);
    $("notify-daily").checked = true;
    submit("notify-form"); await settle();
    const ups = sbCalls("notification_settings.upsert");
    eq("1 one upsert", ups.length, 1);
    const row = ups[0] ? ops(ups[0].args[0], "upsert")[0][0] : {};
    eq("1 upsert keys", Object.keys(row).filter(k => k !== "user_id").sort().join(","),
      "daily,digest_city_ids,enabled,send_hour,timezone,weekly,weekly_day");
    ok("1 upsert values", row.enabled === true && row.daily === true && row.weekly === false && row.send_hour === 7 &&
      row.weekly_day === 1 && row.digest_city_ids === null && typeof row.timezone === "string" && row.timezone, JSON.stringify(row));
    eq("1 status reads Saved.", text("notify-msg"), "Saved.");
    // Switch off: controls disabled, Delete disabled, Save still works.
    await open({ settings: { enabled: false, timezone: "UTC", send_hour: 7, daily: false, weekly: false, weekly_day: 1, digest_city_ids: null }, rules: [rule(1)] });
    ok("1 Delete buttons disabled while off", [...doc.querySelectorAll("button[data-delete]")].every(b => b.disabled));
    ok("1 Save enabled while off", !$("notify-save").disabled);
    // Unticking one city stores the ids.
    const boxes = [...doc.querySelectorAll("#notify-city-list input")];
    eq("1 one checkbox per city, all ticked", boxes.length + "/" + boxes.filter(b => b.checked).length, "2/2");
    boxes[1].checked = false;
    submit("notify-form"); await settle();
    const r2 = ops(sbCalls("notification_settings.upsert")[0].args[0], "upsert")[0][0];
    eq("1 digest_city_ids lists ticked cities", JSON.stringify(r2.digest_city_ids), "[1]");
    // No cities selected with a digest on is blocked.
    sb.calls = [];
    $("notify-enabled").checked = true; change($("notify-enabled")); $("notify-daily").checked = true;
    boxes[0].checked = false;
    submit("notify-form"); await settle();
    eq("1 no city blocks saving", text("notify-cities-msg") + "|" + sbCalls("notification_settings.upsert").length,
      "Choose at least one city for your digests.|0");

    // 2. Not allowed
    await open({ allowed: false });
    ok("2 notice shown, form hidden", !$("notify-denied").hidden && $("notify-body").hidden);
    ok("2 notice text", text("notify-denied").startsWith("Email notifications aren't available for your account yet."));
    ok("2 body fieldset disabled", $("notify-body").disabled);
    $("notify-body").hidden = false;
    ok("2 no control can be changed", [...$("notify-body").querySelectorAll("input,select,button")].every(c => c.matches(":disabled")));
    await open({ allowed: "yes" });
    ok("2 a non-true reply fails closed", !$("notify-denied").hidden);

    // 3. Validation
    const on = { settings: { enabled: true, timezone: "UTC", send_hour: 7, daily: false, weekly: false, weekly_day: 1, digest_city_ids: null } };
    await open(on);
    fill("30", "10"); submit("alert-form"); await settle();
    eq("3 min >= max message", text("alert-min-error"), "Min must be less than Max.");
    fill("5", "5"); submit("alert-form"); await settle();
    eq("3 equal bounds rejected", text("alert-min-error"), "Min must be less than Max.");
    fill("", "10"); submit("alert-form"); await settle();
    ok("3 empty Min shows an error", text("alert-min-error") !== "");
    fill("1", ""); submit("alert-form"); await settle();
    ok("3 empty Max shows an error", text("alert-max-error") !== "");
    fill("10", "120", "humidity"); submit("alert-form"); await settle();
    ok("3 humidity 120 shows an error", text("alert-max-error") !== "");
    eq("3 no insert call", inserts().length, 0);
    ok("3 error linked with aria-describedby", $("alert-min").getAttribute("aria-describedby") === "alert-min-error" &&
      $("alert-max").getAttribute("aria-describedby") === "alert-max-error");

    // 4. Units
    await open(Object.assign({ unit: "F" }, on));
    fill("86", "104"); submit("alert-form"); await settle();
    let ins = inserts()[0] || {};
    ok("4 86-104 F stored as 30-40 C", Math.abs(ins.min_value - 30) < 1e-9 && Math.abs(ins.max_value - 40) < 1e-9, JSON.stringify(ins));
    eq("4 labels in F", text("alert-min-label"), "Min (°F)");
    sb.replies["alert_rules.insert"] = { data: rule(7, { metric: "wind", min_value: 0, max_value: 10 }), error: null };
    fill("0", "36", "wind"); submit("alert-form"); await settle();
    ins = inserts()[1] || {};
    ok("4 wind in mph is converted to m/s", ins.metric === "wind" && Math.abs(ins.max_value - 36 * 0.44704) < 1e-9, JSON.stringify(ins));
    fill("0", "1", "precipitation"); submit("alert-form"); await settle();
    ins = inserts()[2] || {};
    ok("4 1 in stored as 25.4 mm", ins.metric === "precipitation" && Math.abs(ins.max_value - 25.4) < 1e-9, JSON.stringify(ins));
    // Wind entered in km/h (C) is 36 -> 10 m/s
    await open(on);
    sb.replies["alert_rules.insert"] = { data: rule(8, { metric: "wind", min_value: 0, max_value: 10 }), error: null };
    fill("0", "36", "wind"); submit("alert-form"); await settle();
    ins = inserts()[0] || {};
    ok("4 36 km/h stored as 10 m/s", Math.abs(ins.max_value - 10) < 1e-9, JSON.stringify(ins));
    await open(Object.assign({ unit: "F", rules: [rule(1, { min_value: 30, max_value: 40 })] }, on));
    ok("4 list shows F", $("alert-list").textContent.includes("86.0–104.0 °F"), $("alert-list").textContent);
    setUnit("C"); await settle();
    ok("4 after switching to C the list shows 30.0–40.0 °C", $("alert-list").textContent.includes("30.0–40.0 °C"), $("alert-list").textContent);
    ok("4 list line has city, measure and slot", $("alert-list").textContent.startsWith("Lisbon · Temperature outside"), $("alert-list").textContent);
    eq("4 unit change stores nothing", sbCalls("alert_rules.insert").length + sbCalls("alert_rules.update").length, 0);

    // 5. Limit
    const twenty = Array.from({ length: 20 }, (_, i) => rule(i + 1));
    await open(Object.assign({ rules: twenty }, on));
    ok("5 Add disabled at 20", $("alert-add").disabled);
    eq("5 limit message", $("alert-limit").hidden ? "hidden" : text("alert-limit"), "You can have up to 20 alerts. Delete one to add another.");
    await open(on);
    sb.replies["alert_rules.insert"] = { data: null, error: { message: "alert_limit", code: "P0001", hint: "You can have up to 20 alerts." } };
    fill("1", "2"); submit("alert-form"); await settle();
    eq("5 server alert_limit shows the same message", text("alert-msg"), "You can have up to 20 alerts. Delete one to add another.");

    // 6. Failed save keeps values; layout; keyboard
    await open(on);
    sb.replies["notification_settings.upsert"] = { data: null, error: SB_ERR.network };
    $("notify-hour").value = "9"; $("notify-daily").checked = true; $("notify-weekly").checked = true; $("notify-day").value = "5";
    submit("notify-form"); await settle();
    ok("6 failed save message", text("notify-msg").startsWith("Couldn't save."), text("notify-msg"));
    eq("6 values kept", $("notify-hour").value + $("notify-day").value + $("notify-daily").checked + $("notify-weekly").checked, "95truetrue");
    sb.replies["notification_settings.upsert"] = null;
    await open(Object.assign({ width: 400, rules: [rule(1), rule(2, { city_id: 2 })] }, on));
    ok("6 no sideways scroll at 400px", doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
      doc.documentElement.scrollWidth + " > " + doc.documentElement.clientWidth);
    ok("6 every notification control is labelled", [...$("notify").querySelectorAll("input,select")].every(i => i.labels && i.labels.length));
    ok("6 controls are in the tab order", [...$("notify").querySelectorAll("input,select,button[type]")].every(c => c.tabIndex >= 0));
    // Keyboard: Enter in a field submits the form (it has a submit button); Delete is a native button.
    ok("6 alert form submits with Enter", $("alert-form").querySelector('button[type="submit"]') && $("alert-min").form === $("alert-form"));
    sb.replies["alert_rules.insert"] = { data: rule(9), error: null };
    fill("1", "2"); $("alert-form").requestSubmit(); await settle();
    eq("6 alert added via the form", $("alert-list").querySelectorAll("li").length, 3);
    const del = () => [...doc.querySelectorAll("button[data-delete]")];
    ok("6 Delete names include city and measure", del().every(b => /^Delete alert: (Lisbon|Oslo), Temperature$/.test(b.getAttribute("aria-label"))));
    del()[0].click(); await settle();
    eq("6 delete filtered by id and user", JSON.stringify(sbCalls("alert_rules.delete").map(c => ops(c.args[0], "eq"))), '[[["id",1],["user_id","u1"]]]');
    eq("6 one alert removed", del().length, 2);
    ok("6 focus moves to the next Delete button", doc.activeElement === del()[0]);
    del()[0].click(); await settle(); del()[0].click(); await settle();
    ok("6 focus moves to the add form when none are left", doc.activeElement === $("alert-city"));

    // 7. Unsubscribe
    const FN = "https://mock.supabase.co/functions/v1/unsubscribe";
    const unsubUi = () => !$("unsubscribe").hidden;
    sb.replies["auth.getSession"] = { data: { session: null }, error: null };
    mock.search = "?unsubscribe=abc.def"; mock.fetch[FN] = { unsubscribed: true };
    await loadPage(1280);
    const posts = mock.requests.filter(r => r.url === FN);
    eq("7 one POST with the token", posts.length + posts.map(p => p.method + p.body).join(""), '1POST{"token":"abc.def"}');
    ok("7 shows Email notifications are off, without sign-in", unsubUi() && text("unsubscribe-msg").startsWith("Email notifications are off.") &&
      !sbCalls("auth.signInWithPassword").length);
    ok("7 parameter removed from the address", !/unsubscribe/.test(win.WX_TEST_SEARCH || ""));
    mock.requests = []; mock.search = null; await loadPage(1280);
    eq("7 no parameter makes no POST", mock.requests.filter(r => r.url === FN).length, 0);
    mock.search = "?unsubscribe=bad"; mock.fetch[FN] = { error: "invalid_token" };
    await loadPage(1280);
    ok("7 rejected token message", text("unsubscribe-msg").startsWith("This unsubscribe link isn't valid."), text("unsubscribe-msg"));
    mock.fetch[FN] = null;
    await loadPage(1280);
    ok("7 network error message and Try again", text("unsubscribe-msg") === "Couldn't reach the server. Try the link again." && !$("unsubscribe-retry").hidden);
    mock.fetch[FN] = { unsubscribed: true };
    $("unsubscribe-retry").click(); await settle();
    ok("7 Try again succeeds", text("unsubscribe-msg").startsWith("Email notifications are off."), text("unsubscribe-msg"));
  }

  // Landing and the Weather Insights look (spec 0005). Not automatable here: real prefers-reduced-motion, real dark mode,
  // blocked or slow web fonts, visible focus rings, contrast (see docs/qa/0005-weather-insights-look.md).
  async function landing() {
    const U = { id: "u1", email: "ann@example.com" };
    const shown = id => !$("screen-" + id).hidden;
    const visible = el => !!el && el.getClientRects().length > 0;
    const visText = () => doc.body.innerText;
    const btnsIn = root => [...root.querySelectorAll("button")].filter(visible).map(b => b.textContent.trim());
    const signedOut = async w => { sb.replies["auth.getSession"] = { data: { session: null }, error: null }; await loadPage(w || 1280); };
    const signedIn = async w => {
      sb.replies["auth.getSession"] = { data: { session: { user: U } }, error: null };
      sb.replies["user_cities.select"] = { data: [{ city_id: 5, added_at: "2026-10-01T00:00:00Z",
        cities: { id: 5, name: "Paris", admin1: "Île-de-France", country: "France", lat: 48.8, lon: 2.3, timezone: "Europe/Paris" } }], error: null };
      sb.replies["cities.select"] = { data: { id: 5, name: "Paris", admin1: "Île-de-France", country: "France", timezone: "Europe/Paris" }, error: null };
      await loadPage(w || 1280);
    };
    const hero = () => $("screen-landing").querySelector(".hero");
    const settle = () => wait(60);
    const html = await (await fetch("../index.html", { cache: "no-store" })).text();
    const css = await (await fetch("../style.css", { cache: "no-store" })).text();

    // 1. Title, favicon, header
    await signedOut();
    eq("1 title", doc.title, "Weather Insights");
    const fav = doc.querySelector('link[rel="icon"]');
    ok("1 favicon linked from assets/", fav && /^assets\/.+\.svg$/.test(fav.getAttribute("href")), fav && fav.getAttribute("href"));
    eq("1 h1 text", doc.querySelector("h1").textContent.trim(), "Weather Insights");
    ok("1 header has the logo mark", !!doc.querySelector("h1 img"));

    // 2. Signed out start
    ok("2 opens on Landing", shown("landing") && !shown("signin") && !shown("shell"));
    eq("2 headline", $("landing-title").textContent.trim(), "Weather, remembered.");
    ok("2 subhead", visible(hero().querySelector(".hero-sub")) && hero().querySelector(".hero-sub").textContent.trim().length > 10);
    eq("2 hero buttons", btnsIn(hero()).join("|"), "Get started|Sign in");
    ok("2 header Sign in shown, account hidden", visible($("header-signin")) && $("account").hidden);
    ok("2 closing Get started", btnsIn(doc.querySelector(".closing")).join("|") === "Get started");
    ok("2 landing makes no API calls", mock.calls.length === 0, mock.calls.join(","));

    // 3. Signed-out navigation and focus
    hero().querySelector('[data-go="signup"]').click(); await settle();
    ok("3 Get started opens sign up, heading focused", shown("signup") && doc.activeElement === $("signup-title"));
    await signedOut();
    doc.querySelector(".closing [data-go=signup]").click(); await settle();
    ok("3 closing Get started opens sign up", shown("signup"));
    await signedOut();
    hero().querySelector('[data-go="signin"]').click(); await settle();
    ok("3 hero Sign in opens sign in, heading focused", shown("signin") && doc.activeElement === $("signin-title"));
    await signedOut();
    $("header-signin").click(); await settle();
    ok("3 header Sign in opens sign in, heading focused", shown("signin") && doc.activeElement === $("signin-title"));
    $("brand-link").click(); await settle();
    ok("3 logo from sign in shows Landing", shown("landing") && !shown("signin"));

    // 4. Sign out returns to Landing
    await signedIn(); $("sign-out").click(); await settle();
    ok("4 sign out shows Landing with Get started", shown("landing") && btnsIn(hero()).join("|") === "Get started|Sign in" && $("account").hidden);

    // 5. Feature text, note, steps
    await signedOut();
    const lt = $("screen-landing").innerText;
    for (const t of ["10 cities", "12am", "12pm", "Open-Meteo", "MET Norway", "table", "charts", "digest", "alert", "°C", "°F", "Email notifications are in testing"]) {
      ok("4 landing mentions " + t, lt.includes(t));
    }
    ok("4 testing note is visible text", visible([...doc.querySelectorAll("#screen-landing *")].find(e => e.children.length === 0 && e.textContent.trim() === "Email notifications are in testing")));
    eq("4 exactly 3 steps", doc.querySelectorAll("#screen-landing .step-list > li").length, 3);
    ok("4 each feature band has an illustration and a heading", doc.querySelectorAll("#screen-landing .feature").length >= 4 &&
      [...doc.querySelectorAll("#screen-landing .feature")].every(f => f.querySelector("img") && f.querySelector("h3")));

    // 6. Footer
    const links = () => [...doc.querySelectorAll("footer a")].map(a => a.getAttribute("href"));
    for (const href of ["https://open-meteo.com/", "https://api.met.no/", "https://github.com/treefinderer/weather"]) {
      ok("5 footer links " + href + " on Landing", links().includes(href) && visible(doc.querySelector('footer a[href="' + href + '"]')));
    }
    await signedIn();
    ok("5 footer visible on signed-in screens", visible(doc.querySelector("footer")) && links().length === 3);
    $("settings-open").click();
    ok("5 footer visible on Settings", visible(doc.querySelector("footer")));

    // 7. Pictures
    const imgs = [...doc.querySelectorAll("img")];
    ok("6 all img src under assets/", imgs.length > 0 && imgs.every(i => /^assets\/[^/]+\.svg$/.test(i.getAttribute("src"))), imgs.map(i => i.getAttribute("src")).join(","));
    ok("6 every img has width and height", imgs.every(i => i.getAttribute("width") && i.getAttribute("height")));
    ok("6 no external image or url() in css/html", !/<img[^>]+src="https?:/.test(html) && !/url\(\s*["']?https?:/.test(css));
    ok("6 no visible Apple", !/apple/i.test(doc.body.innerText), "found in visible text");
    ok("7 illustrations have alt=\"\"", imgs.every(i => i.getAttribute("alt") === ""));
    ok("7 no img is focusable", imgs.every(i => !i.hasAttribute("tabindex") && (!i.closest("a, button") || i.closest("a, button") === $("brand-link"))));
    eq("7 logo link accessible name", $("brand-link").textContent.trim(), "Weather Insights");
    ok("7 brand link is a link with an href", $("brand-link").tagName === "A" && $("brand-link").getAttribute("href"));
    await signedOut();
    const focusables = [...doc.querySelectorAll("a[href], button, input, select, textarea, [tabindex='0']")].filter(e => visible(e) && !e.disabled);
    ok("8 Tab order: logo first, hero buttons, closing, footer last",
      focusables[0] === $("brand-link") && focusables.indexOf(hero().querySelector("button")) < focusables.indexOf(doc.querySelector(".closing button")) &&
      focusables.indexOf(doc.querySelector(".closing button")) < focusables.indexOf(doc.querySelector("footer a")) &&
      focusables[focusables.length - 1].closest("footer"), focusables.map(e => e.textContent.trim().slice(0, 12)).join("|"));

    // 8. Signed-in logo from each screen
    const logoCheck = async (name, openIt) => {
      await signedIn(); await openIt();
      $("brand-link").click(); await wait(150);
      ok("13 " + name + ": logo shows Landing without reload", shown("landing") && !shown("shell") && !shown("settings") && !shown("history"));
      eq("13 " + name + ": hero shows only Go to your cities", btnsIn(hero()).join("|"), "Go to your cities");
      ok("13 " + name + ": no Get started or Sign in anywhere", !visible($("header-signin")) && !btnsIn(doc.querySelector(".closing")).includes("Get started"));
      ok("13 " + name + ": account controls shown", !$("account").hidden && $("account-email").textContent === U.email &&
        visible($("settings-open")) && visible($("sign-out")));
      eq("13 " + name + ": closing shows Go to your cities", btnsIn(doc.querySelector(".closing")).join("|"), "Go to your cities");
      hero().querySelector(".when-in button").click(); await wait(150);
      ok("13 " + name + ": Go to your cities opens the list, heading focused", shown("shell") && !shown("landing") && !shown("history") && doc.activeElement === $("cities-title"));
    };
    await logoCheck("Your cities", async () => {});
    await logoCheck("Settings", async () => { $("settings-open").click(); });
    await logoCheck("History", async () => {
      clock.now = Date.UTC(2026, 9, 27, 12);
      win.location.hash = "#history/5/30d/avg"; await wait(150);
      ok("13 History is open before the click", shown("history") || !$("screen-history").hidden);
    });
    await signedIn();
    doc.querySelector('.closing [data-go="shell"]').click(); await settle();
    ok("2 closing Go to your cities from signed-in Landing", shown("shell"));
    await signedIn();
    $("brand-link").click(); await settle();
    doc.querySelector('.closing [data-go="shell"]').click(); await settle();
    ok("13 closing Go to your cities opens the list", shown("shell") && doc.activeElement === $("cities-title"));

    // 9. Logo edge cases
    sb.replies["auth.getSession"] = new Promise(() => {});
    await loadPage(1280);
    $("brand-link").click(); await settle();
    ok("logo does nothing while Loading", shown("loading") && !shown("landing"));
    sb.replies = {}; sb.config = { supabaseUrl: "", supabaseAnonKey: "" };
    await loadPage(1280);
    $("brand-link").click(); await settle();
    ok("logo does nothing on Accounts unavailable", shown("unavailable") && !shown("landing"));
    resetSupabase();
    await signedOut();
    await loadPage(1280);
    fireAuth("PASSWORD_RECOVERY", { user: U }); await settle();
    ok("logo on Set a new password shows signed-out Landing", (() => { if (!shown("reset")) return false; $("brand-link").click(); return true; })());
    await settle();
    ok("logo on reset: Landing signed out, Get started and Sign in", shown("landing") && !shown("reset") && btnsIn(hero()).join("|") === "Get started|Sign in");

    // 10. 400px
    await signedOut(400);
    ok("9 no sideways scroll, signed-out Landing at 400px", doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
      doc.documentElement.scrollWidth + " > " + doc.documentElement.clientWidth);
    ok("9 hero headline not clipped at 400px", $("landing-title").scrollWidth <= $("landing-title").clientWidth + 1 && $("landing-title").getBoundingClientRect().right <= 400);
    await signedIn(400); $("brand-link").click(); await settle();
    ok("9 no sideways scroll, signed-in Landing at 400px", doc.documentElement.scrollWidth <= doc.documentElement.clientWidth,
      doc.documentElement.scrollWidth + " > " + doc.documentElement.clientWidth);

    // 11. Color tokens and font
    const block = sel => { const i = css.indexOf(sel); const o = css.indexOf("{", i), c = css.indexOf("}", o); return css.slice(o + 1, c); };
    const defs = b => new Set([...b.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
    const root = defs(block(":root {")), dark1 = defs(block(':root:not([data-theme="light"])')), dark2 = defs(block(':root[data-theme="dark"]'));
    const used = new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
    const undef = [...used].filter(v => !root.has(v));
    ok("12 every var(--x) used is defined in :root", undef.length === 0, undef.join(","));
    const colorTokens = [...root].filter(v => v !== "--font" && /#|rgba?\(/.test(block(":root {").match(new RegExp(v + "\\s*:([^;]+);"))[1]));
    ok("12 every :root color token is in the prefers-color-scheme dark block", colorTokens.every(v => dark1.has(v)), colorTokens.filter(v => !dark1.has(v)).join(","));
    ok("12 every :root color token is in the data-theme=dark block", colorTokens.every(v => dark2.has(v)), colorTokens.filter(v => !dark2.has(v)).join(","));
    ok("12 both dark blocks define the same tokens", [...dark1].every(v => dark2.has(v)) && [...dark2].every(v => dark1.has(v)));
    eq("12 exactly one fonts.googleapis.com stylesheet link", (html.match(/<link[^>]+rel="stylesheet"[^>]+fonts\.googleapis\.com[^>]*>/g) || []).length, 1);
    const fl = html.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/);
    ok("12 one family, display=swap", fl && (fl[0].match(/family=/g) || []).length === 1 && /display=swap/.test(fl[0]), fl && fl[0]);
    ok("12 preconnect links present", /rel="preconnect"[^>]+fonts\.googleapis\.com/.test(html) && /rel="preconnect"[^>]+fonts\.gstatic\.com/.test(html));
    const font = block(":root {").match(/--font\s*:([^;]+);/)[1];
    ok("12 --font ends in a generic family", /,\s*(sans-serif|system-ui)\s*$/.test(font.trim()) && /system-ui|-apple-system|Segoe UI/.test(font), font);
    ok("12 reduced-motion rule removes animations and transitions", /prefers-reduced-motion:\s*reduce[\s\S]*?(animation|transition)[^;]*(none|0(\.\d+)?s|0\.01ms)/.test(css));
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1].replace(/^https:\/\/cdn\.jsdelivr\.net\/npm\//, "cdn:"));
    eq("12 script tags unchanged", scripts.join(","), "cdn:@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js,config.js,common.js,auth.js,cities.js,cdn:chart.js@4.5.1/dist/chart.umd.min.js,history.js,notifications.js");
  }

  // Cities and Settings redesign (spec 0006). Not automatable here: real dark mode, focus rings, contrast, reduced motion,
  // how glyphs and the illustration look (see docs/qa/0006-cities-settings-redesign.md).
  async function redesign() {
    const U = { id: "u1", email: "ann@example.com" };
    const settle = () => wait(60);
    const text = id => $(id).textContent;
    const visible = el => !!el && el.getClientRects().length > 0;
    const css = await (await fetch("../style.css", { cache: "no-store" })).text();
    const html = await (await fetch("../index.html", { cache: "no-store" })).text();
    const row = (id, name) => ({ city_id: id, added_at: "2026-10-2" + (id % 10) + "T00:00:00Z",
      cities: { id, name: name || "Paris", admin1: "Île-de-France", country: "France", lat: 48.85, lon: 2.35, timezone: "Europe/Paris" } });
    const rd = (city_id, source, slot, t, code) => ({ city_id, source, slot, local_date: "2026-10-24", temperature_c: t, feels_like_c: 1,
      humidity_pct: 60, wind_speed_ms: 5, precipitation_mm: 0.4, weather_code: code });
    const open = async (userCities, latest, width) => {
      sb.replies["auth.getSession"] = { data: { session: { user: U } }, error: null };
      sb.replies["user_cities.select"] = { data: userCities, error: null };
      sb.replies["latest_readings.select"] = { data: latest || [], error: null };
      mock.fetch[GEO_URL] = GEO.par;
      await loadPage(width || 1280);
    };
    const card = () => doc.querySelector("#city-list > li");
    const q = sel => card().querySelector(sel);
    const setUnit = u => { const r = doc.querySelector('input[name="unit"][value="' + u + '"]'); r.checked = true; r.dispatchEvent(new win.Event("change", { bubbles: true })); };
    const src = img => img.getAttribute("src");

    // 1, 2. Titles, summary, unit switch
    await open([row(1)], [rd(1, "open-meteo", "day", 21.4, 3), rd(1, "met-norway", "day", 20.6, "cloudy")]);
    const title = $("cities-title");
    eq("1 title text", title.textContent, "Your cities");
    ok("1 count line directly under the title", title.nextElementSibling === $("cities-count") && text("cities-count") === "1 of 10 cities");
    ok("1 title is the largest heading text", parseFloat(win.getComputedStyle(title).fontSize) >= 32, win.getComputedStyle(title).fontSize);
    eq("2 large temp", q(".city-temp").textContent, "21°C");
    eq("2 condition label", q(".city-cond").textContent.trim(), "Cloudy");
    eq("2 cloudy glyph", src(q(".city-glyph")), "assets/wx-cloudy.svg");
    eq("2 caption", q(".city-caption").textContent, "Average of Open-Meteo and MET Norway · Day (12pm), Oct 24");
    ok("2 temp is the largest text on the card", parseFloat(win.getComputedStyle(q(".city-temp")).fontSize) >= 40);
    const n = mock.calls.length, sbn = sb.calls.length;
    setUnit("F"); await settle();
    eq("2 large temp in F", q(".city-temp").textContent, "70°F");
    ok("2 unit switch makes no new fetch or reads", mock.calls.length === n && sb.calls.slice(sbn).every(c => !/^(user_cities|latest_readings|rpc)/.test(c.method)));

    // 3. Missing temperature and unmapped codes
    await open([row(1)], [rd(1, "open-meteo", "night", null, null), rd(1, "met-norway", "night", 18.6, "cloudy")].map(r => r));
    eq("3 MET-only temp", q(".city-temp").textContent, "19°C");
    eq("3 MET-only label", q(".city-cond").textContent.trim(), "Cloudy");
    eq("3 MET-only caption", q(".city-caption").textContent, "MET Norway · Night (12am), Oct 24");
    setUnit("F"); await settle();
    eq("3 MET-only temp in F", q(".city-temp").textContent, "65°F");
    await open([row(1)], [rd(1, "open-meteo", "day", 10, 3), rd(1, "met-norway", "day", 10, "rain")]);
    eq("3 Open-Meteo wins over MET", q(".city-cond").textContent.trim() + "|" + src(q(".city-glyph")), "Cloudy|assets/wx-cloudy.svg");
    await open([row(1)], [rd(1, "open-meteo", "day", 10, 999), rd(1, "met-norway", "day", 10, null)]);
    ok("3 unmapped codes show no label and no glyph", !q(".city-cond") && !q(".city-glyph"));
    ok("3 temperature and caption still shown", q(".city-temp").textContent === "10°C" && !!q(".city-caption"));

    // 4. Night / day glyph
    await open([row(1)], [rd(1, "open-meteo", "night", 10, 0), rd(1, "met-norway", "night", 10, null)]);
    eq("4 night clear glyph", src(q(".city-glyph")), "assets/wx-clear-night.svg");
    await open([row(1)], [rd(1, "open-meteo", "day", 10, 0), rd(1, "open-meteo", "night", 10, 0)]);
    eq("4 day clear glyph", src(q(".city-glyph")), "assets/wx-clear-day.svg");

    // 5. Detail tiles and no-readings card
    await open([row(1), row(2, "Lyon")], [rd(1, "open-meteo", "day", 21, 3), rd(1, "met-norway", "day", 20, 3), rd(1, "open-meteo", "night", 12, 3), rd(1, "met-norway", "night", 11, 3)]);
    const tiles = [...q(".slots").querySelectorAll(".reading")];
    eq("5 four reading tiles", tiles.length, 4);
    eq("5 tile order", tiles.map(t => t.textContent.slice(0, 12)).join("|").replace(/\d{1,2}/g, "").length > 0 && tiles.map(t => t.closest(".slot").querySelector(".slot-title").textContent).join("|"),
      "Day (12pm)|Day (12pm)|Night (12am)|Night (12am)");
    eq("5 dl order", [...tiles[0].querySelectorAll("dt")].map(d => d.textContent).join("|"), "Temperature|Feels like|Humidity|Wind|Precipitation");
    const lone = doc.querySelectorAll("#city-list > li")[1];
    ok("5 no-readings card has text and no summary", lone.textContent.includes("No readings yet. First reading at 12am/12pm local time.") && !lone.querySelector(".city-summary, .city-temp"));

    // 6. Empty-state art
    sb.replies["user_cities.select"] = new Promise(() => {});
    sb.replies["auth.getSession"] = { data: { session: { user: U } }, error: null };
    await loadPage(1280);
    ok("6 art hidden while loading", !visible($("cities-empty-art")));
    await open([]);
    ok("6 art and text shown when empty", visible($("cities-empty-art")) && visible($("cities-status")) && text("cities-status") === "No cities yet. Search for a city to add it.");
    const art = $("cities-empty-art");
    ok("6 art decorative, sized, from assets/, not focusable", art.getAttribute("alt") === "" && art.getAttribute("width") && art.getAttribute("height") && /^assets\//.test(src(art)) && art.tabIndex < 0);
    sb.replies["user_cities.select"] = { data: null, error: SB_ERR.network };
    sb.replies["auth.getSession"] = { data: { session: { user: U } }, error: null };
    await loadPage(1280);
    ok("6 art hidden on load error", !visible($("cities-empty-art")) && visible($("cities-retry")));
    await open([row(1)]);
    ok("6 art hidden with a city", !visible($("cities-empty-art")));

    // 8, 9. Settings
    await open([row(1)], [], 1280);
    $("settings-open").click(); await settle();
    const st = $("screen-settings");
    eq("8 title", $("settings-title").textContent, "Settings");
    ok("8 Back follows the title on the same row", $("settings-title").parentElement === $("settings-back").parentElement &&
      !!($("settings-title").compareDocumentPosition($("settings-back")) & 4));
    const kids = [...st.children].filter(e => e.matches(".units, #notify, #password-form"));
    eq("8 cards in order", kids.map(e => e.matches(".units") ? "units" : e.id).join(">"), "units>notify>password-form");
    ok("8 screen itself is not a .card", !st.classList.contains("card") && !st.querySelector(".card"));
    eq("8 three cards have surface backgrounds", kids.map(e => win.getComputedStyle(e).backgroundColor).filter(c => c !== "rgba(0, 0, 0, 0)").length, 3);
    const fs = st.querySelector("fieldset.units");
    eq("9 fieldset legend", fs && fs.querySelector("legend").textContent, "Temperature unit");
    const radios = [...fs.querySelectorAll('input[type=radio][name=unit]')];
    eq("9 two native radios C, F", radios.map(r => r.value).join(","), "C,F");
    ok("9 radios not display:none or hidden", radios.every(r => !r.hidden && win.getComputedStyle(r).display !== "none" && win.getComputedStyle(r).visibility !== "hidden"));
    ok("9 radios are inside a segmented wrapper", radios.every(r => r.closest(".segmented")));
    ok("9 C checked, its label is the selected segment", radios[0].checked && radios[0].parentElement.matches(":has(input:checked)"));
    const noMotion = doc.createElement("style"); noMotion.textContent = "*{transition:none!important}"; doc.head.appendChild(noMotion);
    const bg = r => win.getComputedStyle(r.parentElement).backgroundColor;
    const before = bg(radios[0]);
    setUnit("F"); await wait(300);
    eq("9 Saved shown", text("unit-msg"), "Saved");
    ok("9 checked segment moves and looks selected", radios[1].checked && bg(radios[1]) !== bg(radios[0]) && before !== bg(radios[0]), bg(radios[1]) + " vs " + bg(radios[0]));

    // 10. 400px layout
    const many = Array.from({ length: 10 }, (_, i) => row(200 + i, "A very long city name number " + i));
    const lots = many.flatMap(r => [rd(r.city_id, "open-meteo", "day", 20, 3), rd(r.city_id, "met-norway", "day", 20, "rain"),
      rd(r.city_id, "open-meteo", "night", 10, 0), rd(r.city_id, "met-norway", "night", 10, null)]);
    await open(many, lots, 400);
    mock.fetch[GEO_URL] = { results: Array.from({ length: 10 }, (_, i) => ({ id: 900 + i, name: "Springfield" + i, latitude: 1, longitude: 2,
      admin1: "Some Long Region Name", country: "Some Country With A Long Name", timezone: "UTC" })) };
    type($("city-query"), "Spring"); $("city-search").dispatchEvent(new win.Event("submit", { bubbles: true, cancelable: true })); await settle();
    const de = doc.documentElement;
    eq("10 ten results", doc.querySelectorAll("#city-results li").length, 10);
    ok("10 cities page: no sideways scroll at 400px", de.scrollWidth <= de.clientWidth, de.scrollWidth + " > " + de.clientWidth);
    ok("10 result rows keep their Add pill inside the row", [...doc.querySelectorAll("#city-results li")].every(li => li.getBoundingClientRect().right <= de.clientWidth && li.querySelector("button").getBoundingClientRect().right <= de.clientWidth));
    ok("10 large temps and captions fit the card", [...doc.querySelectorAll(".city-temp, .city-caption")].every(e => e.scrollWidth <= e.clientWidth + 1));
    const rules = [{ id: 1, city_id: 1, metric: "temperature", condition: "outside", slot: "both", min_value: 0, max_value: 30, created_at: "2026-10-21T00:00:00Z" },
      { id: 2, city_id: 1, metric: "humidity", condition: "above", slot: "day", min_value: null, max_value: 80, created_at: "2026-10-22T00:00:00Z" }];
    sb.replies["profiles.select"] = { data: null, error: null };
    sb.replies["rpc.notify_allowed"] = { data: true, error: null };
    sb.replies["notification_settings.select"] = { data: { enabled: true, timezone: "UTC", send_hour: 7, daily: true, weekly: false, weekly_day: 1, digest_city_ids: null }, error: null };
    sb.replies["alert_rules.select"] = { data: rules, error: null };
    await open([row(1, "A very long city name number 1")], [], 400);
    $("settings-open").click(); await settle();
    ok("10 settings has two alerts", doc.querySelectorAll("button[data-delete]").length === 2);
    ok("10 settings: no sideways scroll at 400px", de.scrollWidth <= de.clientWidth, de.scrollWidth + " > " + de.clientWidth);

    // 11. Glyphs and illustration
    await open([row(1)], [rd(1, "open-meteo", "day", 10, 0)]);
    const pics = [...doc.querySelectorAll("#screen-shell img")];
    ok("11 every picture on Your cities is alt='' from assets/ and not focusable", pics.length >= 2 && pics.every(i => i.getAttribute("alt") === "" && /^assets\/.+\.svg$/.test(src(i)) && i.tabIndex < 0));
    ok("11 glyph has width and height", q(".city-glyph").getAttribute("width") && q(".city-glyph").getAttribute("height"));
    ok("11 no pictures inside links or buttons on the cities screen", pics.every(i => !i.closest("a, button")));
    const sImgs = [...html.matchAll(/<img\b[^>]*>/g)].map(m => m[0]).filter(t => /assets\/(search|empty|wx-)/.test(t));
    ok("11 index.html pictures for this spec have alt=\"\"", sImgs.length >= 1 && sImgs.every(t => /alt=""/.test(t)), sImgs.join(" "));

    // 12. Tokens, scripts
    const block = sel => { const i = css.indexOf(sel); const o = css.indexOf("{", i), c = css.indexOf("}", o); return css.slice(o + 1, c); };
    for (const [name, sel] of [[":root", ":root {"], ["prefers-color-scheme dark", ':root:not([data-theme="light"])'], ["data-theme dark", ':root[data-theme="dark"]']]) {
      const b = block(sel);
      ok("12 --seg-track and --seg-hover in " + name, /--seg-track\s*:/.test(b) && /--seg-hover\s*:/.test(b));
    }
    const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1].replace(/^https:\/\/cdn\.jsdelivr\.net\/npm\//, "cdn:"));
    eq("12 script tags unchanged", scripts.join(","), "cdn:@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js,config.js,common.js,auth.js,cities.js,cdn:chart.js@4.5.1/dist/chart.umd.min.js,history.js,notifications.js");
  }

  // --- Runner ---
  const GROUPS = [["Page", page], ["Layout", layout], ["Accounts", accounts], ["Cities", cities],
    ["History regressions", historyRegressions], ["History", history], ["Notifications", notifications], ["Landing", landing], ["Cities and Settings redesign", redesign]];

  async function run() {
    const saved = {};
    Object.keys(localStorage).filter(k => STORE.test(k)).forEach(k => { saved[k] = localStorage.getItem(k); });
    try {
      pageSrc = (await (await fetch("../index.html", { cache: "no-store" })).text())
        // Offline: no web fonts (the fallback stacks apply).
        .replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g, "")
        // Offline: no supabase-js or Chart.js from the CDN and no real config; INJECT provides stand-ins for all three.
        .replace(/<script[^>]+cdn\.jsdelivr\.net[^>]*><\/script>/g, "")
        .replace(/<script src="config\.js"><\/script>/, "")
        .replace(/<head>/i, "<head>" + INJECT);
      for (const [name, fn] of GROUPS) {
        group = name;
        const h = document.createElement("li");
        h.className = "group";
        h.textContent = name;
        $log.appendChild(h);
        clearStore();
        Object.assign(mock, { calls: [], requests: [], fetch: {}, search: null });
        resetSupabase();
        resetChart();
        clock = { now: null };
        try { await fn(); } catch (e) { ok("group ran to the end", false, e && e.stack ? e.stack.split("\n")[0] : String(e)); }
      }
      group = "Console";
      eq("no uncaught errors or console errors", mock.errors.join(" | "), "");
    } catch (e) {
      group = "Setup";
      ok("test page loaded", false, String(e));
    }
    $stage.textContent = "";
    clearStore();
    Object.keys(saved).forEach(k => localStorage.setItem(k, saved[k]));
    const failed = checks.filter(c => !c.pass);
    const passed = checks.length - failed.length;
    $results.textContent = failed.map(c => "FAIL [" + c.group + "] " + c.name + (c.detail ? ": " + c.detail : "")).join("\n") +
      (failed.length ? "\n" : "") +
      (failed.length ? "RESULT: FAIL " + passed + "/" + checks.length + " (" + failed.length + " failed)" : "RESULT: PASS " + passed + "/" + checks.length);
  }
  run();
})();
