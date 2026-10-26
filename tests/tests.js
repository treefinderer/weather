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
  //   mock.calls    every fetched URL. mock.fetch: URL prefix -> reply object (sent as JSON) or a function (url) returning one,
  //                 reset before each group. Unmatched URLs and null replies fail like a network error.
  const mock = { calls: [], errors: [], fetch: {} };
  // Mocked supabase-js, reset before each group. Set sb.replies before loadPage when the page reads them on load.
  //   sb.calls      every call: { method, args }. Methods are "createClient", "auth.<name>", "rpc.<function>" (args[0] is
  //                 the parameters object) and "<table>.<first op>" (e.g. "profiles.select", "user_cities.delete",
  //                 "latest_readings.select"; args[0] is the chain, [{ op, args }, ...], including filters like eq).
  //   sb.replies    method -> { data, error }, a function (...args) returning one, or a Promise of one (slow replies).
  //                 Unscripted methods reply { data: null, error: null }.
  //   sb.config     the page's window.WX_CONFIG; sb.loaded = false simulates the CDN script failing to load.
  //   fireAuth(event, session) calls the page's onAuthStateChange listeners.
  let sb = null;
  function resetSupabase() {
    sb = { calls: [], replies: {}, listeners: [], loaded: true,
      config: { supabaseUrl: "https://mock.supabase.co", supabaseAnonKey: "mock-anon-key" } };
  }
  resetSupabase();
  const sbCalls = method => sb.calls.filter(c => c.method === method);
  const fireAuth = (event, session) => sb.listeners.forEach(cb => cb(event, session));
  window.WxTest = {
    // Returns the reply body as JSON text, or null for a network failure.
    respond(url) {
      mock.calls.push(url);
      const prefix = Object.keys(mock.fetch).find(p => url.startsWith(p));
      const reply = prefix === undefined ? null : mock.fetch[prefix];
      const body = typeof reply === "function" ? reply(url) : reply;
      return body == null ? null : JSON.stringify(body);
    },
    error(msg) { mock.errors.push(msg); },
    sbSetup() { return { loaded: sb.loaded, config: sb.config }; },
    sbCall(method, args) {
      sb.calls.push({ method, args });
      const r = sb.replies[method];
      return (typeof r === "function" ? r.apply(null, args) : r) || { data: null, error: null };
    },
    sbListen(cb) { sb.listeners.push(cb); }
  };
  const INJECT = `<base href="../"><script>
(function () {
  var T = parent.WxTest;
  window.addEventListener("error", function (e) { T.error("error: " + e.message); });
  window.addEventListener("unhandledrejection", function (e) { T.error("unhandledrejection: " + ((e.reason && e.reason.message) || e.reason)); });
  var consoleError = console.error;
  console.error = function () { T.error("console.error: " + Array.prototype.join.call(arguments, " ")); return consoleError.apply(console, arguments); };
  window.fetch = function (url) {
    var text = T.respond(String(url));
    if (text === null) return Promise.reject(new TypeError("Failed to fetch (mocked)"));
    return Promise.resolve({ ok: true, status: 200, json: function () { return Promise.resolve(JSON.parse(text)); } });
  };
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
      ["select", "insert", "update", "upsert", "delete", "eq", "neq", "match", "order", "limit", "single", "maybeSingle"].forEach(function (op) {
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
    ok("page has an h1", doc.querySelector("h1"));
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
    ok("1 no session shows Sign in", shown("signin") && !shown("shell") && !shown("settings"));
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
    ok("7 back on Sign in, no email", shown("signin") && text("account-email") === "" && $("account").hidden);

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
    noScroll("sign in"); labelled("all screens");
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

  // --- Runner ---
  const GROUPS = [["Page", page], ["Layout", layout], ["Accounts", accounts], ["Cities", cities]];

  async function run() {
    const saved = {};
    Object.keys(localStorage).filter(k => STORE.test(k)).forEach(k => { saved[k] = localStorage.getItem(k); });
    try {
      pageSrc = (await (await fetch("../index.html", { cache: "no-store" })).text())
        // Offline: no web fonts (the fallback stacks apply).
        .replace(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g, "")
        // Offline: no supabase-js from the CDN and no real config; INJECT provides both.
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
        Object.assign(mock, { calls: [], fetch: {} });
        resetSupabase();
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
