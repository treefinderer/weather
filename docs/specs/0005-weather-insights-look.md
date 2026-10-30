# 0005 Weather Insights look and feel

## Request

> "let's work on the website look and feel now. ... I want the website look close to apple.com , we need more pictures, text about what this portal is for. Let's rename it to "Weather Insights" and create a logo"

Fixed decisions (orchestrator, 2026-10-30):
- The product is renamed **Weather Insights** everywhere it is visible on the site. Email subject lines and bodies are out of scope.
- Signed-out visitors get a landing page styled after apple.com: a large hero, full-width feature sections with illustrations, a 3-step "how it works", and a footer.
- Signed-in screens keep all their behavior and control order. They only get the new visual system.
- A new `designer` agent makes all pictures: original SVG illustrations, a logo and a favicon, in `assets/`. apple.com is a style reference only.
- One Google Font with a full fallback stack. No new JS libraries and no build step.

Fixed decisions (owner, 2026-10-30):
- The hero headline is **"Weather, remembered."**
- After **Sign out**, the visitor lands on Landing.
- Signed-in users can see Landing:
  - Clicking the header logo or "Weather Insights" takes any user, signed in or not, to Landing.
  - For a signed-in user, the hero's two buttons are replaced by one primary **Go to your cities** button.
  - Loading the page with a session still opens Your cities.
- Landing describes digests and alerts, with a short visible note: "Email notifications are in testing".

## Goal

A first-time visitor understands right away what Weather Insights does and how to start, on a polished, Apple-like page with original illustrations. Signed-in users see the same app with the new name, logo and a more refined look, and can get back to Landing from the logo.

## Scope

In:
- **Rename.** `<title>`, the header (logo mark plus the "Weather Insights" wordmark inside the `h1`), and any other visible "Weather" product name on the site.
- **Logo and favicon.** An original SVG logo in `assets/`, plus a favicon made from it and linked from `index.html`.
- **Header logo control.** The logo and wordmark together form one keyboard-reachable link or button that shows Landing.
- **Landing screen.** A new screen in the same one-screen-at-a-time system as the other screens. In order, it has:
  1. **Hero.**
     - The headline "Weather, remembered." and a one-sentence subhead.
     - Signed out: a primary **Get started** button (opens Create an account) and a secondary **Sign in** button (opens Sign in).
     - Signed in: one primary **Go to your cities** button (opens Your cities).
  2. **Feature sections.** Full-width bands. Each has one illustration and a short title and paragraph. Together they cover:
     - following up to 10 cities
     - readings recorded at 12am and 12pm local time from two independent services, Open-Meteo and MET Norway
     - history as a table and charts
     - daily or weekly email digests and range alerts, with the visible note "Email notifications are in testing"
     - °C or °F
  3. **How it works.** Exactly 3 numbered steps, for example: create an account, add your cities, watch the history build up and get emails.
  4. **Closing call to action.**
     - Signed out: it repeats **Get started**.
     - Signed in: it shows **Go to your cities**.
- **Header.**
  - Signed out: logo and wordmark, plus a **Sign in** button.
  - Signed in, on any screen including Landing: logo and wordmark, plus today's account controls (email, Settings, Sign out). There is no Sign in button.
- **Footer on every screen.**
  - Credits the data sources, with links to Open-Meteo (https://open-meteo.com/) and MET Norway (https://api.met.no/).
  - Links to the GitHub repo (https://github.com/treefinderer/weather).
- **New visual system in `style.css`** for all screens:
  - the font
  - a type scale with a large hero headline
  - generous spacing
  - refined cards, buttons, inputs and focus rings
  - colors as `:root` tokens, with both dark-mode blocks updated together
- **Test updates.** Only where wording changes on purpose (for example the "Weather" heading) or where the signed-out start screen and the after-sign-out screen move from Sign in to Landing.

Out:
- Visible product name in emails. The notify Edge Function subject lines still say "Weather:". This is a possible follow-up spec.
- Any change to sign-in, sign-up, forgot, reset, cities, history, settings or notifications behavior, element ids, or the order of controls on signed-in screens. The only additions are the logo control and Landing.
- Stock photos, raster photos, and any Apple logo, Apple product image or Apple trademark used as content.
- New JS libraries, icon fonts, scroll-animation libraries and analytics.
- URL routing or deep links for screens (for example `#signup`). The browser Back button behaves as it does today.
- A light/dark theme switch control. Theme still follows the OS, or `data-theme` where it is set.

## Behavior

**Start-up and routing**
- The page still opens on the Loading screen.
- With no session, it shows Landing instead of Sign in.
- With a session, it goes straight to Your cities, and Landing never flashes.
- Expired or invalid reset links still go to the Sign in or Set a new password screens with today's messages. Landing is skipped in those cases.
- The Accounts unavailable screen stays as it is today.
- When a screen opens, its `h2` gets focus as today. On Landing, that `h2` is the hero headline.
- Signed out:
  - **Get started** (hero and closing section) shows Create an account.
  - **Sign in** (hero and header) shows Sign in.
  - Sign-in, sign-up and forgot keep their existing links between each other.
- Signed in: **Go to your cities** (hero and closing section) shows Your cities, with focus on the "Your cities" heading.
- After **Sign out**, the signed-out Landing shows.
- The unsubscribe notice from 0004 still appears above whatever screen is showing, including Landing.

**Header logo**
- The logo is a real link or button with the accessible name "Weather Insights". It is reachable with Tab, and Enter activates it.
- Activating it shows Landing in JS without a full reload. If it is a link, its `href` (for example `./`) is only a fallback, and the JS handler prevents the reload.
- A signed-in user ends on the signed-in Landing whichever screen they started from: Your cities, History or Settings. History is managed by `history.js`, so leaving it this way must hide History as **Back to cities** does today.
- Edge cases:
  - Loading or Accounts unavailable: the logo does nothing, and the current screen stays.
  - **Set a new password** (reset flow): the logo shows the signed-out Landing and abandons the reset. The visitor can request a new link from Sign in, then **Forgot password?**.
- Unsaved input on the screen being left (for example a half-typed search or form) may be lost. This is the same as switching screens today.

**Content rules**
- The landing copy states only what the app really does:
  - It records history at 12am and 12pm local time.
  - It does not make forecasts, and it is not real-time.
  - Users can follow up to 10 cities.
  - Data comes from Open-Meteo and MET Norway, both credited by name.
- The digests and alerts section shows the note "Email notifications are in testing" as visible text, not only in a tooltip.
- The word "Apple" does not appear in visible text.

**Pictures**
- All pictures are local SVG files in `assets/`, or inline SVG. They are original work from the `designer` agent.
- Feature illustrations are decorative, because the text next to them carries the meaning. They use `alt=""` (or `aria-hidden="true"` when inline).
- The logo has the accessible name "Weather Insights".
- Each `<img>` has `width` and `height` attributes, so the layout doesn't jump while it loads.
- If a picture fails to load, the text still reads correctly and nothing overlaps.
- Illustrations and the logo must stay clear on light and dark backgrounds. That means OS dark mode, `data-theme="dark"`, and `data-theme="light"` on a dark OS. An `<img>` SVG can't read page CSS variables, so it must either look right on both themes or be inline SVG that uses the tokens.

**Font**
- One Google Fonts family, loaded with a `<link>` (plus `preconnect`) and `display=swap`.
- The `--font` token lists it first, then a full system fallback stack.
- If Google Fonts is blocked or slow, the page renders right away in the fallback font and works fully.

**Motion**
- Subtle CSS transitions, such as button hover or a gentle fade-in, are allowed.
- Content is never hidden waiting for JS or scroll to reveal it.
- Under `prefers-reduced-motion: reduce`, there are no animations or transitions.

**Phone width (about 400px)**
- No sideways scroll on any screen.
- The hero headline wraps and is not clipped.
- Hero buttons stack, or sit side by side if they fit.
- Feature sections become a single column, with the illustration above the text.
- The header logo and the signed-in account controls wrap without overflow. The email still truncates as today.
- Full-bleed bands must not use `100vw` in a way that causes overflow.

**Keyboard only**
- The Tab order follows the visual order: header (logo first), hero buttons, closing call to action, footer links.
- Every focusable element shows a visible focus ring in both themes.
- Illustrations are never focusable.

**Dark mode**
- Every new color is a `:root` token with values in both dark blocks: the `prefers-color-scheme` block and `[data-theme="dark"]`.
- Body text meets 4.5:1 contrast. Large text and UI borders meet 3:1.

**Network and APIs**
- Landing makes no API calls. Its content is static and shows even when Supabase is slow.
- The Loading screen covers the session check as today.
- Moving from Landing back to Your cities uses today's cities loading, error and retry behavior.
- All existing network-error, empty-state and timeout handling on signed-in screens is unchanged.

## Acceptance criteria

1. The browser tab title is "Weather Insights". A favicon made from the logo shows in the tab. The header shows the logo mark and an `h1` reading "Weather Insights" on every screen.
2. With no session, the page opens on Landing, not on the Sign in card. Landing shows the headline "Weather, remembered.", a subhead, **Get started** and **Sign in**. With a session, the page opens on Your cities and Landing never appears. After **Sign out**, Landing shows.
3. Signed out, **Get started** opens Create an account, and **Sign in** (hero or header) opens Sign in. In both cases focus lands on that screen's heading. Signing up, signing in, forgot password and reset password work as before.
4. Landing has feature sections, each with an illustration and text. Together they mention: up to 10 cities; 12am and 12pm local time; Open-Meteo and MET Norway; history table and charts; daily/weekly digests and range alerts, with the visible note "Email notifications are in testing"; °C/°F. Landing then shows a "How it works" with exactly 3 numbered steps.
5. The footer is visible on Landing and on signed-in screens. It has working links to open-meteo.com, api.met.no and github.com/treefinderer/weather.
6. Every picture on the page loads from `assets/` or is inline SVG. There are no external image URLs and no raster photos. No Apple logo, product image or the word "Apple" appears in visible content.
7. Each feature illustration has `alt=""` or `aria-hidden="true"`. The logo's accessible name is "Weather Insights". No illustration is reachable with Tab.
8. Using only the keyboard:
   - Signed out, a visitor can Tab from the header logo through the hero buttons to the footer links, and open Sign in and Create an account.
   - Signed in, Tab reaches the header logo, Enter on it shows Landing, and Enter on **Go to your cities** returns to Your cities.
   - Every focused element shows a visible focus ring.
9. At a 400px wide viewport, Landing (signed out and signed in), Sign in, Create an account, Your cities, History and Settings have no horizontal scrollbar, and no text is clipped.
10. With OS dark mode, and separately with `data-theme="dark"`, Landing and the signed-in screens show dark backgrounds with readable text, logo and illustrations. With `data-theme="light"` on a dark OS, the page is light.
11. With `prefers-reduced-motion: reduce`, nothing animates or transitions, and all landing content is visible without scrolling interaction or waiting.
12. Exactly one Google Fonts family is linked, and `--font` ends in a system fallback stack. With fonts.googleapis.com blocked, the page still renders and works. No new `<script>` tags are added. `tests/run.sh` prints `RESULT: PASS`, with all signed-in element ids and control order unchanged.
13. Signed in, clicking the header logo from Your cities, History or Settings:
    - shows Landing, with one **Go to your cities** button in the hero, no **Get started** or **Sign in**, and the account controls (email, Settings, Sign out) in the header
    - **Go to your cities** then opens Your cities, with focus on its heading

## Open questions

