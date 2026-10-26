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

  // --- Runner ---
  const GROUPS = [["Page", page], ["Layout", layout], ["Accounts", accounts]];

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
