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
    unconfirmed: { name: "AuthApiError", message: "Email not confirmed", status: 400, code: "email_not_confirmed" }
  };

  // --- Mocks, called from inside the page by the script injected below ---
  const mock = { calls: [], errors: [] };
  // Mocked supabase-js, reset before each group. Set sb.replies before loadPage when the page reads them on load.
  //   sb.calls      every call: { method, args }. Methods are "createClient", "auth.<name>" and "<table>.<first op>"
  //                 (e.g. "profiles.select", "profiles.upsert"; args[0] is the chain, [{ op, args }, ...]).
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
      return null;
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
    return { auth: auth, from: from };
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

  // --- Runner ---
  const GROUPS = [["Page", page], ["Layout", layout]];

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
        Object.assign(mock, { calls: [] });
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
