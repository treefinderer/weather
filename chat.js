// Chat assistant (spec 0012): the round button at the bottom right and the "Ask Weather Insights" panel. Questions go
// to the chat Edge Function (never to Cloudflare directly), with the user's access token when signed in. The
// conversation lives only in this page: nothing is stored, and signing in or out clears it. Replies are plain text.
// Reads Wx.supabase, Wx.user and Wx.onAccountChange from auth.js; shares nothing.
(function () {
  "use strict";
  const Wx = window.Wx;
  const $ = id => document.getElementById(id);
  const launcher = $("chat-open"), panel = $("chat-panel"), scrim = $("chat-scrim"), closeBtn = $("chat-close");
  const log = $("chat-log"), form = $("chat-form"), input = $("chat-input"), send = $("chat-send"), count = $("chat-count");
  if (!launcher || !panel) return;

  const TIMEOUT_MS = 30000;
  const TURNS = 10;
  const LIMIT = 5;
  const MSG = {
    greetOut: "Ask me about Weather Insights. Sign in to ask about your cities.",
    greetIn: "Ask me about Weather Insights or your cities' history.",
    thinking: "Thinking…",
    unavailable: "The assistant is unavailable right now, try later.",
    busy: "The assistant is busy today, try again tomorrow.",
    limit: at => "You've used today's " + LIMIT + " questions. You can ask again at " + at + "."
  };
  const phone = window.matchMedia ? window.matchMedia("(max-width: 600px)") : { matches: false };

  let turns = [];          // { role, content } sent to the function; the greeting and notices aren't in it
  let pending = null;      // the question in flight; one at a time
  let gen = 0;             // conversation number, so a reply for a cleared conversation is dropped
  let who = null;          // the signed-in user id the conversation belongs to
  let locked = false;      // limit or busy: input and Send stay disabled
  let unlockTimer = 0;
  let statusAsked = false; // the status call runs once per conversation, on the first open

  // --- Messages ---
  function bubble(kind, text) {
    const p = document.createElement("p");
    p.className = "chat-msg chat-msg-" + kind;
    const who = document.createElement("span");
    who.className = "visually-hidden";
    who.textContent = kind === "user" ? "You: " : "Assistant: ";
    p.appendChild(who);
    p.appendChild(document.createTextNode(text));
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
    return p;
  }
  const notice = text => bubble("notice", text);
  function setCount(remaining) {
    count.hidden = false;
    count.textContent = remaining == null ? "…" : remaining + (remaining === 1 ? " question" : " questions") + " left today";
  }
  function setEnabled(on) {
    input.disabled = !on;
    send.disabled = !on;
  }
  function lock(text, resetsAt, zero) {
    locked = true;
    setEnabled(false);
    if (zero) setCount(0);
    notice(text);
    clearTimeout(unlockTimer);
    const ms = Date.parse(resetsAt) - Date.now();
    // Re-enable once the reset passes while the page is open (timers longer than a day aren't needed).
    if (ms > 0 && ms < 26 * 3600 * 1000) unlockTimer = setTimeout(() => { locked = false; setEnabled(true); status(); }, ms + 1000);
  }
  function resetTime(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "midnight UTC" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  // A new conversation: on load, and whenever the signed-in user changes.
  function reset() {
    gen++;
    who = Wx.user ? Wx.user.id : null;
    turns = [];
    pending = null;
    locked = false;
    clearTimeout(unlockTimer);
    log.textContent = "";
    bubble("assistant", Wx.user ? MSG.greetIn : MSG.greetOut);
    setEnabled(true);
    input.value = "";
    setCount(null);
    statusAsked = false;
    if (!panel.hidden) status();
  }

  // --- Requests ---
  // POSTs to the chat function and resolves to { status, body } (body null when it isn't JSON). Rejects on a network
  // error or after 30 seconds.
  async function call(messages) {
    const cfg = window.WX_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error("not configured");
    let token = cfg.supabaseAnonKey;
    if (Wx.user && Wx.supabase) {
      // getSession refreshes an expired access token first.
      const res = await Wx.supabase.auth.getSession();
      const s = res && res.data && res.data.session;
      if (s && s.access_token) token = s.access_token;
    }
    const ctrl = window.AbortController ? new AbortController() : null;
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => { if (ctrl) ctrl.abort(); reject(new Error("timeout")); }, TIMEOUT_MS); });
    try {
      const res = await Promise.race([fetch(cfg.supabaseUrl.replace(/\/+$/, "") + "/functions/v1/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": cfg.supabaseAnonKey, "Authorization": "Bearer " + token },
        body: JSON.stringify({ messages }),
        signal: ctrl ? ctrl.signal : undefined
      }), timeout]);
      let body = null;
      try { body = await res.json(); } catch (e) { body = null; }
      return { status: res.status, body };
    } finally {
      clearTimeout(timer);
    }
  }

  // The counter on open. A failure hides the counter and says the assistant is unavailable; the input stays usable.
  async function status() {
    statusAsked = true;
    const g = gen;
    setCount(null);
    let r = null;
    try { r = await call([]); } catch (e) { r = null; }
    if (g !== gen) return;
    const b = r && r.body;
    if (b && !b.error && typeof b.remaining === "number") {
      setCount(Math.max(0, Math.floor(b.remaining)));
      if (b.remaining <= 0 && !locked) lock(MSG.limit(resetTime(b.resets_at)), b.resets_at, true);
      return;
    }
    count.hidden = true;
    const last = log.lastElementChild;
    if (!last || last.lastChild.textContent !== MSG.unavailable) notice(MSG.unavailable);
  }

  async function ask(text) {
    const mine = {}, g = gen;
    pending = mine;
    const hadFocus = panel.contains(document.activeElement);
    turns.push({ role: "user", content: text });
    bubble("user", text);
    const thinking = bubble("assistant", MSG.thinking);
    thinking.classList.add("chat-msg-thinking");
    setEnabled(false);
    let r = null;
    try { r = await call(turns.slice(-TURNS)); } catch (e) { r = null; }
    if (g !== gen || pending !== mine) return;  // the conversation was cleared meanwhile
    pending = null;
    thinking.remove();
    const b = (r && r.body) || {};
    if (typeof b.reply === "string" && b.reply.trim()) {
      turns.push({ role: "assistant", content: b.reply });
      bubble("assistant", b.reply);
      if (typeof b.remaining === "number") setCount(Math.max(0, Math.floor(b.remaining)));
      setEnabled(true);
    } else if (b.error === "limit") {
      turns.pop();
      lock(MSG.limit(resetTime(b.resets_at)), b.resets_at, true);
    } else if (b.error === "busy") {
      turns.pop();
      lock(MSG.busy, b.resets_at, false);
    } else {
      turns.pop();  // not answered, so it isn't part of the conversation sent next time
      notice(MSG.unavailable);
      setEnabled(true);
    }
    if (hadFocus && !input.disabled) input.focus();
    else if (hadFocus) panel.focus();
  }

  form.addEventListener("submit", e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || pending || locked) return;
    input.value = "";
    ask(text);
  });

  // --- Open and close ---
  const outside = () => [document.querySelector(".topbar"), document.querySelector(".footer"), launcher,
    ...[...document.querySelectorAll("main.app > *")].filter(el => el !== panel && el !== scrim && el !== launcher)].filter(Boolean);
  // The phone sheet covers the page: the page doesn't scroll and is inert, so Tab stays in the sheet.
  function sheet(on) {
    document.documentElement.classList.toggle("chat-sheet-open", on);
    scrim.hidden = !on;
    outside().forEach(el => { if (on) el.setAttribute("inert", ""); else el.removeAttribute("inert"); });
    if (!on) { panel.style.height = ""; panel.style.bottom = ""; }
    else fitKeyboard();
  }
  // Keeps the composer above the on-screen keyboard while the sheet is open.
  function fitKeyboard() {
    const vv = window.visualViewport;
    if (!vv || panel.hidden || !phone.matches) return;
    const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    panel.style.height = Math.min(window.innerHeight * 0.85, vv.height - 8) + "px";
    panel.style.bottom = hidden + "px";
  }
  if (window.visualViewport) window.visualViewport.addEventListener("resize", fitKeyboard);
  const onMedia = () => { if (!panel.hidden) sheet(phone.matches); };
  if (phone.addEventListener) phone.addEventListener("change", onMedia);

  function open() {
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
    sheet(phone.matches);
    if (!input.disabled) input.focus(); else closeBtn.focus();
    if (!statusAsked && !pending) status();
  }
  function close() {
    if (panel.hidden) return;
    sheet(false);
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus();
  }
  panel.tabIndex = -1;
  launcher.addEventListener("click", () => { if (panel.hidden) open(); else close(); });
  closeBtn.addEventListener("click", close);
  scrim.addEventListener("click", close);
  // Escape closes from anywhere in the panel, and also when focus fell to the page because the input was disabled.
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape" || panel.hidden) return;
    const t = e.target;
    if (panel.contains(t) || t === document.body || t === document.documentElement || t === launcher) { e.preventDefault(); close(); }
  });

  // Signing in or out (or another account) starts over; a unit change alone doesn't.
  if (typeof Wx.onAccountChange === "function") Wx.onAccountChange(user => { if ((user ? user.id : null) !== who) reset(); });
  reset();
})();
