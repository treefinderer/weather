// Accounts: sign up, sign in, password reset and change, and the °C/°F preference (spec 0001).
// Shares the Supabase client, user and unit with later features on window.Wx.
(function () {
  "use strict";
  const Wx = window.Wx;
  const $ = id => document.getElementById(id);
  const TIMEOUT_MS = 20000;
  const MSG = {
    rule: "Use at least 10 characters, with upper case, lower case and a digit.",
    mismatch: "Passwords don't match.",
    network: "Can't reach the server. Check your connection and try again.",
    invalid: "Email or password is incorrect.",
    unconfirmed: "Please confirm your email first.",
    checkEmail: "Check your email to confirm your account.",
    resent: "Confirmation email sent.",
    resetSent: "If an account exists for that email, we've sent a reset link.",
    expired: "This reset link has expired. Request a new one.",
    updated: "Password updated.",
    changed: "Password changed.",
    wrongCurrent: "Current password is incorrect.",
    saved: "Saved",
    saveFailed: "Couldn't save the unit. Try again."
  };
  // The address reset and confirmation emails link back to: this page without query or hash.
  const APP_URL = new URL(".", document.baseURI).href;

  // --- Shared state on window.Wx ---
  const listeners = [];
  Wx.supabase = null;
  Wx.user = null;
  Wx.unit = "C";
  // Calls fn(user, unit) whenever the signed-in user or the unit changes.
  Wx.onAccountChange = fn => { listeners.push(fn); };
  function emit() {
    listeners.forEach(fn => { try { fn(Wx.user, Wx.unit); } catch (e) { setTimeout(() => { throw e; }); } });
  }

  // --- Screens ---
  const SCREENS = ["loading", "unavailable", "landing", "signin", "signup", "forgot", "reset", "shell", "settings"];
  let current = "loading";
  function show(name) {
    SCREENS.forEach(s => { $("screen-" + s).hidden = s !== name; });
    const signedIn = !!Wx.user;
    $("account").hidden = !(signedIn && (name === "shell" || name === "settings" || name === "landing"));
    // Header Sign in for signed-out visitors, except where it can't help (spec 0005).
    $("header-signin").hidden = signedIn || ["loading", "unavailable", "signin", "reset"].includes(name);
    // Landing's calls to action: Get started / Sign in when signed out, Go to your cities when signed in.
    document.querySelectorAll(".when-out").forEach(el => { el.hidden = signedIn; });
    document.querySelectorAll(".when-in").forEach(el => { el.hidden = !signedIn; });
    if (name !== current) {
      current = name;
      const h = $("screen-" + name).querySelector("h2");
      if (h) h.focus();
    }
  }
  function setMsg(id, text, kind) {
    const el = $(id);
    el.textContent = text || "";
    el.className = "msg" + (kind ? " msg-" + kind : "");
  }
  function clear(...ids) { ids.forEach(id => { $(id).value = ""; }); }

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
  function isNetwork(err) {
    return !!err && (err.network || err.name === "AuthRetryableFetchError" || err.status === 0 ||
      /failed to fetch|networkerror|load failed|network request failed/i.test(err.message || ""));
  }
  function isCode(err, code, pattern) {
    return !!err && (err.code === code || pattern.test(err.message || ""));
  }
  // Disables a button and swaps its label while fn runs; ignores clicks while it is already running.
  async function busy(btn, label, fn) {
    if (btn.disabled) return;
    const idle = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    try { await fn(); } finally { btn.disabled = false; btn.textContent = idle; }
  }
  function passwordProblem(password, confirm) {
    if (password.length < 10 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) return MSG.rule;
    if (password !== confirm) return MSG.mismatch;
    return "";
  }

  // --- Session ---
  let client = null;
  let recovery = null;      // the session from a reset link while "Set a new password" shows
  function enterApp(user, note) {
    recovery = null;
    const changed = !Wx.user || Wx.user.id !== user.id;
    Wx.user = user;
    $("account-email").textContent = user.email || "";
    $("account-email").title = user.email || "";
    setMsg("shell-msg", note || "", "ok");
    if (changed || note || (current !== "shell" && current !== "settings" && current !== "landing")) {
      show("shell");
      if (changed) { emit(); loadUnit(); }
    }
  }
  function leaveApp() {
    recovery = null;
    const had = !!Wx.user;
    Wx.user = null;
    Wx.unit = "C";
    $("account-email").textContent = "";
    $("account-email").title = "";
    clear("signin-password", "password-current", "password-new", "password-confirm");
    setUnitRadios("C");
    setMsg("unit-msg", "");
    setMsg("password-msg", "");
    show("landing");
    if (had) emit();
  }
  function showRecovery(session) {
    recovery = session || recovery || {};
    show("reset");
  }
  function showExpired(screen) {
    setMsg(screen + "-msg", MSG.expired, "error");
    $(screen + "-expired").hidden = false;
    show(screen);
  }
  function onAuthEvent(event, session) {
    // Deferred: supabase-js must not be called again from inside its own callback.
    setTimeout(() => {
      if (event === "PASSWORD_RECOVERY") showRecovery(session);
      else if (event === "SIGNED_OUT") { if (Wx.user || recovery) leaveApp(); }
      else if (event === "SIGNED_IN" && session && session.user && !recovery && current !== "loading") enterApp(session.user);
    }, 0);
  }

  async function init() {
    const cfg = window.WX_CONFIG || {};
    const lib = window.supabase;
    // Read the hash before supabase-js consumes it: a reset link carries type=recovery, an expired one an error.
    const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
    if (!lib || typeof lib.createClient !== "function" || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return show("unavailable");
    try { client = lib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey); } catch (e) { return show("unavailable"); }
    Wx.supabase = client;
    client.auth.onAuthStateChange(onAuthEvent);
    const res = await request(() => client.auth.getSession());
    const session = res.data && res.data.session;
    if (recovery) return;
    if (hash.get("error_code") === "otp_expired" || (hash.get("error") && !session)) return showExpired("signin");
    if (hash.get("type") === "recovery") return session ? showRecovery(session) : showExpired("signin");
    if (session && session.user) enterApp(session.user);
    else show("landing");
  }

  // --- Unit preference ---
  function setUnitRadios(unit) {
    document.querySelectorAll('input[name="unit"]').forEach(r => { r.checked = r.value === unit; });
  }
  async function loadUnit() {
    const user = Wx.user;
    const res = await request(() => client.from("profiles").select("unit").eq("id", user.id).maybeSingle());
    if (Wx.user !== user) return;
    // A missing row (or an unreadable one) means °C; the first save creates the row.
    const unit = res.data && res.data.unit === "F" ? "F" : "C";
    setUnitRadios(unit);
    if (unit !== Wx.unit) { Wx.unit = unit; emit(); }
  }
  async function saveUnit(unit) {
    const user = Wx.user;
    if (!user) return;
    setMsg("unit-msg", "");
    const res = await request(() => client.from("profiles").upsert({ id: user.id, unit: unit }));
    if (Wx.user !== user) return;
    if (res.error) {
      setUnitRadios(Wx.unit);
      setMsg("unit-msg", isNetwork(res.error) ? MSG.network : MSG.saveFailed, "error");
      return;
    }
    setMsg("unit-msg", MSG.saved, "ok");
    if (unit !== Wx.unit) { Wx.unit = unit; emit(); }
  }

  // --- Forms ---
  function goSignin() {
    setMsg("signin-msg", "");
    $("signin-resend").hidden = true;
    $("signin-expired").hidden = true;
    show("signin");
  }
  function goForgot() {
    setMsg("forgot-msg", "");
    if (!$("forgot-email").value) $("forgot-email").value = $("signin-email").value;
    show("forgot");
  }

  $("signin-form").addEventListener("submit", e => {
    e.preventDefault();
    const email = $("signin-email").value.trim();
    const password = $("signin-password").value;
    busy($("signin-submit"), "Signing in…", async () => {
      setMsg("signin-msg", "");
      $("signin-resend").hidden = true;
      $("signin-expired").hidden = true;
      const res = await request(() => client.auth.signInWithPassword({ email, password }));
      const err = res.error;
      if (isNetwork(err)) return setMsg("signin-msg", MSG.network, "error");
      if (isCode(err, "email_not_confirmed", /not confirmed/i)) {
        setMsg("signin-msg", MSG.unconfirmed, "error");
        $("signin-resend").hidden = false;
        return;
      }
      if (isCode(err, "invalid_credentials", /invalid login credentials/i)) {
        clear("signin-password");
        return setMsg("signin-msg", MSG.invalid, "error");
      }
      if (err) return setMsg("signin-msg", err.message || MSG.network, "error");
      const session = res.data && res.data.session;
      if (session && session.user) {
        clear("signin-password");
        enterApp(session.user);
      }
    });
  });

  $("signin-resend").addEventListener("click", () => {
    const email = $("signin-email").value.trim();
    busy($("signin-resend"), "Sending…", async () => {
      const res = await request(() => client.auth.resend({ type: "signup", email, options: { emailRedirectTo: APP_URL } }));
      if (isNetwork(res.error)) return setMsg("signin-msg", MSG.network, "error");
      if (res.error) return setMsg("signin-msg", res.error.message || MSG.network, "error");
      setMsg("signin-msg", MSG.resent, "ok");
    });
  });

  $("signup-form").addEventListener("submit", e => {
    e.preventDefault();
    const email = $("signup-email").value.trim();
    const password = $("signup-password").value;
    const problem = passwordProblem(password, $("signup-confirm").value);
    if (problem) return setMsg("signup-msg", problem, "error");
    busy($("signup-submit"), "Creating account…", async () => {
      setMsg("signup-msg", "");
      const res = await request(() => client.auth.signUp({ email, password, options: { emailRedirectTo: APP_URL } }));
      if (isNetwork(res.error)) return setMsg("signup-msg", MSG.network, "error");
      if (res.error) return setMsg("signup-msg", res.error.message || MSG.network, "error");
      const session = res.data && res.data.session;
      clear("signup-password", "signup-confirm");
      if (session && session.user) return enterApp(session.user);
      setMsg("signup-msg", MSG.checkEmail, "ok");
    });
  });

  $("forgot-form").addEventListener("submit", e => {
    e.preventDefault();
    const email = $("forgot-email").value.trim();
    busy($("forgot-submit"), "Sending…", async () => {
      setMsg("forgot-msg", "");
      const res = await request(() => client.auth.resetPasswordForEmail(email, { redirectTo: APP_URL }));
      // The same reply whether or not the address has an account.
      if (isNetwork(res.error)) return setMsg("forgot-msg", MSG.network, "error");
      setMsg("forgot-msg", MSG.resetSent, "ok");
    });
  });

  $("reset-form").addEventListener("submit", e => {
    e.preventDefault();
    const password = $("reset-password").value;
    const problem = passwordProblem(password, $("reset-confirm").value);
    $("reset-expired").hidden = true;
    if (problem) return setMsg("reset-msg", problem, "error");
    busy($("reset-submit"), "Saving…", async () => {
      setMsg("reset-msg", "");
      const res = await request(() => client.auth.updateUser({ password }));
      const err = res.error;
      if (isNetwork(err)) return setMsg("reset-msg", MSG.network, "error");
      if (err && (err.name === "AuthSessionMissingError" || err.status === 401 || err.status === 403 ||
          /otp_expired|session_not_found|session_expired|bad_jwt/.test(err.code || ""))) return showExpired("reset");
      if (err) return setMsg("reset-msg", err.message || MSG.network, "error");
      const user = (res.data && res.data.user) || (recovery && recovery.user);
      clear("reset-password", "reset-confirm");
      if (user) enterApp(user, MSG.updated);
      else showExpired("reset");
    });
  });

  $("password-form").addEventListener("submit", e => {
    e.preventDefault();
    const currentPassword = $("password-current").value;
    const password = $("password-new").value;
    const problem = passwordProblem(password, $("password-confirm").value);
    if (problem) return setMsg("password-msg", problem, "error");
    busy($("password-submit"), "Changing password…", async () => {
      setMsg("password-msg", "");
      const email = Wx.user && Wx.user.email;
      const check = await request(() => client.auth.signInWithPassword({ email, password: currentPassword }));
      if (isNetwork(check.error)) return setMsg("password-msg", MSG.network, "error");
      if (isCode(check.error, "invalid_credentials", /invalid login credentials/i)) {
        clear("password-current");
        return setMsg("password-msg", MSG.wrongCurrent, "error");
      }
      if (check.error) return setMsg("password-msg", check.error.message || MSG.network, "error");
      const res = await request(() => client.auth.updateUser({ password }));
      if (isNetwork(res.error)) return setMsg("password-msg", MSG.network, "error");
      if (res.error) return setMsg("password-msg", res.error.message || MSG.network, "error");
      clear("password-current", "password-new", "password-confirm");
      setMsg("password-msg", MSG.changed, "ok");
    });
  });

  document.querySelectorAll('input[name="unit"]').forEach(r => {
    r.addEventListener("change", () => { if (r.checked) saveUnit(r.value); });
  });

  $("sign-out").addEventListener("click", () => {
    busy($("sign-out"), "Signing out…", async () => {
      const res = await request(() => client.auth.signOut());
      // Offline, still drop the session from this browser.
      if (res.error) await request(() => client.auth.signOut({ scope: "local" }));
      leaveApp();
    });
  });

  $("to-signup").addEventListener("click", () => { setMsg("signup-msg", ""); show("signup"); });
  $("to-forgot").addEventListener("click", goForgot);
  $("signin-expired").addEventListener("click", goForgot);
  $("reset-expired").addEventListener("click", goForgot);
  $("signup-to-signin").addEventListener("click", goSignin);
  $("forgot-to-signin").addEventListener("click", goSignin);
  $("settings-open").addEventListener("click", () => {
    setMsg("unit-msg", "");
    setMsg("password-msg", "");
    setMsg("shell-msg", "");
    show("settings");
  });
  $("settings-back").addEventListener("click", () => show("shell"));

  // --- Landing (spec 0005) ---
  // The header logo shows Landing in place, for anyone. history.js closes an open History view on the same click.
  $("brand-link").addEventListener("click", e => {
    if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // let the browser open a new tab
    e.preventDefault();
    if (current === "loading" || current === "unavailable") return;
    if (current === "reset") {
      // Abandons the reset: drop the recovery session so a reload doesn't sign in with it.
      leaveApp();
      if (client) request(() => client.auth.signOut({ scope: "local" }));
      return;
    }
    show("landing");
  });
  // Landing and header buttons name the screen they open in data-go.
  document.querySelectorAll("[data-go]").forEach(btn => {
    btn.addEventListener("click", () => {
      const to = btn.dataset.go;
      if (to === "shell") { if (Wx.user) show("shell"); return; }
      if (Wx.user) return;
      if (to === "signup") { setMsg("signup-msg", ""); show("signup"); }
      else goSignin();
    });
  });

  init();
})();
