// Live view (spec 0010): the webcam block at the bottom of each city card on Your cities. The webcams Edge Function
// finds the camera server-side and stores it on the city; this only embeds the stored Windy player URL, and only
// once the visitor opens it. Never calls the Windy API. Loaded before cities.js, so the block is ready for the first
// render of the cards even when their data arrives at once.
// Shares Wx.webcam: block(city) returns the city's block (or null), forget(id) and clear() drop kept blocks.
(function () {
  "use strict";
  const Wx = window.Wx;
  // Windy's required credit (terms of use): "Webcams provided by windy.com - add new webcam", both parts linked.
  const CREDIT_HOME = "https://www.windy.com/";
  const CREDIT_ADD = "https://www.windy.com/webcams/add";
  const MSG = { open: "Live view", close: "Hide live view", none: "No webcam nearby" };
  const blocks = new Map(); // city id -> { key, box }, kept across card re-renders so an open player stays open

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function link(href, text) {
    const a = el("a", "link", text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }
  const https = u => typeof u === "string" && /^https:\/\//i.test(u);

  function build(c) {
    const box = el("div", "webcam");
    if (c.webcam_status === "none") {
      box.appendChild(el("p", "webcam-none", MSG.none));
      return box;
    }
    const name = c.webcam_title || "Webcam";
    const btn = el("button", "btn-secondary", MSG.open);
    btn.type = "button";
    const player = el("div", "webcam-player");
    player.id = "webcam-player-" + c.id;
    player.hidden = true;
    btn.setAttribute("aria-controls", player.id);
    // The iframe exists only while open, so nothing loads from windy.com until the visitor asks.
    function set(open) {
      btn.textContent = open ? MSG.close : MSG.open;
      btn.setAttribute("aria-expanded", String(open));
      btn.setAttribute("aria-label", (open ? MSG.close : MSG.open) + ": " + name);
      player.textContent = "";
      player.hidden = !open;
      if (!open) return;
      const frame = el("div", "webcam-frame");
      const iframe = el("iframe");
      iframe.title = "Live webcam: " + name;
      iframe.loading = "lazy";
      iframe.allowFullscreen = true;
      iframe.src = c.webcam_player_url;
      frame.appendChild(iframe);
      player.appendChild(frame);
    }
    set(false);
    btn.addEventListener("click", () => set(btn.getAttribute("aria-expanded") !== "true"));
    box.appendChild(btn);
    box.appendChild(player);
    const title = el("p", "webcam-name");
    title.appendChild(link(c.webcam_page_url, name));
    box.appendChild(title);
    const credit = el("p", "webcam-credit", "Webcams provided by ");
    credit.appendChild(link(CREDIT_HOME, "windy.com"));
    credit.appendChild(document.createTextNode(" - "));
    credit.appendChild(link(CREDIT_ADD, "add new webcam"));
    box.appendChild(credit);
    return box;
  }

  // A camera shows only with status found and both stored URLs; status none shows one quiet line; status null (not
  // looked up yet) shows nothing. The same block is returned while the city's camera fields are unchanged.
  function block(c) {
    const found = c.webcam_status === "found" && https(c.webcam_player_url) && https(c.webcam_page_url);
    if (!found && c.webcam_status !== "none") {
      blocks.delete(c.id);
      return null;
    }
    const key = found ? ["found", c.webcam_id, c.webcam_title, c.webcam_page_url, c.webcam_player_url].join("|") : "none";
    let b = blocks.get(c.id);
    if (!b || b.key !== key) {
      b = { key, box: build(c) };
      blocks.set(c.id, b);
    }
    return b.box;
  }

  Wx.webcam = {
    block,
    forget: id => { blocks.delete(id); },
    clear: () => { blocks.clear(); }
  };
})();
