# 0005 Weather Insights look: design brief

Spec: `docs/specs/0005-weather-insights-look.md`.

Owner decisions (2026-10-30), folded in below:
- Hero headline is final: **"Weather, remembered."**
- After **Sign out**, visitors see Landing.
- The header logo link takes **any** user to Landing. For a signed-in user, the hero shows one primary **Go to your cities** button instead of **Get started** / **Sign in**. The closing call to action follows the same rule (see Layout, Landing step 4).
- The email feature section carries a small visible note, "Email notifications are in testing", styled as a quiet badge.

## Direction

Calm, confident and product-like. The page borrows apple.com's restraint: very large, tightly tracked headlines; a lot of whitespace; full-width bands that alternate white and near-white (black and near-black in dark mode); a centered hero; pill buttons, with a filled primary and a link-style secondary with a chevron; a slim translucent header; and a quiet small-print footer. Color comes only from the illustrations, which sit on their own soft-gradient tiles. Everything else is neutral, with one blue accent. The signed-in screens use the same system in a quieter form: neutral page, white rounded cards, pill buttons and the same type scale.

## Tokens

All colors are `:root` tokens. The dark values go into **both** dark blocks (`@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`). Existing token names stay, so current rules keep working. New tokens are marked *new*.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | `#f5f5f7` | `#000000` | Page background (signed-in and auth screens), input and reading-tile fill inside cards |
| `--surface` | `#ffffff` | `#1c1c1e` | Cards, table wrapper, chart cards |
| `--band` *new* | `#ffffff` | `#000000` | Landing bands: hero, features 2 and 4, closing call to action |
| `--band-alt` *new* | `#f5f5f7` | `#161617` | Landing bands: features 1 and 3, How it works; also the footer |
| `--text` | `#1d1d1f` | `#f5f5f7` | Body text, headings, badge text |
| `--muted` | `#6e6e73` | `#a1a1a6` | Subheads, feature paragraphs, hints, footer text |
| `--accent` | `#0066cc` | `#2997ff` | Links, secondary-button text and border, chevron, eyebrows, checked controls (`accent-color`) |
| `--btn-bg` *new* | `#0071e3` | `#0071e3` | Primary pill fill, step-number discs |
| `--btn-bg-hover` *new* | `#0062c4` | `#0062c4` | Primary pill hover and active |
| `--on-accent` | `#ffffff` | `#ffffff` | Text on `--btn-bg` (the dark value changes from `#0b1220`) |
| `--focus` *new* | `#0066cc` | `#2997ff` | Focus ring |
| `--border` | `#86868b` | `#7c7c80` | Input, select and secondary-button borders (UI, needs 3:1) |
| `--hairline` *new* | `#d2d2d7` | `#38383a` | Decorative separators only: header bottom line, list row dividers, footer top line, Settings section lines |
| `--danger` | `#b3261e` | `#ff6961` | Error text, invalid-input border |
| `--ok` | `#1e7a3a` | `#30d158` | Success text |
| `--badge-bg` *new* | `#e8e8ed` | `#2c2c2e` | Quiet "in testing" badge fill, hover fill for secondary and header buttons |
| `--header-bg` *new* | `rgba(255,255,255,0.8)` | `rgba(22,22,23,0.8)` | Translucent header (with backdrop blur) |
| `--header-solid` *new* | `#ffffff` | `#161617` | Header fallback where `backdrop-filter` is unsupported |
| `--shadow` *new* | `rgba(0,0,0,0.08)` | `rgba(0,0,0,0)` | Card shadow color (dark mode uses no shadow) |
| `--chart-day` | `#c2410c` | `#ffa94d` | unchanged |
| `--chart-night` | `#3b5bdb` | `#91a7ff` | unchanged |
| `--chart-grid` | `#e5e5ea` | `#38383a` | Chart grid and table cell lines |
| `--chart-text` | `#6e6e73` | `#a1a1a6` | Chart axis text (same as `--muted`) |
| `--font` | see Type | | |

Contrast (WCAG 2.x relative luminance, rounded):

| Pair | Light | Dark | Needs |
|---|---|---|---|
| `--text` on `--band` / `--surface` | 16.8 | 19.3 (on #000) / 15.6 (on #1c1c1e) | 4.5 |
| `--text` on `--bg` / `--band-alt` | 15.5 | 19.3 / 16.6 (on #161617) | 4.5 |
| `--muted` on `--band` / `--surface` | 5.07 | 8.16 / 6.61 | 4.5 |
| `--muted` on `--bg` / `--band-alt` | 4.66 | 8.16 / 7.03 | 4.5 |
| `--accent` on `--band` / `--surface` | 5.56 | 6.97 / 5.64 | 4.5 |
| `--accent` on `--bg` / `--band-alt` | 5.11 | 6.97 / 6.00 | 4.5 |
| `--on-accent` on `--btn-bg` | 4.70 | 4.70 | 4.5 |
| `--on-accent` on `--btn-bg-hover` | 5.93 | 5.93 | 4.5 |
| `--btn-bg` against the page (button edge) | 4.70 on white, 4.31 on #f5f5f7 | 4.47 on #000, 3.62 on #1c1c1e | 3 |
| `--focus` ring on any background above | at least 5.11 | at least 5.64 | 3 |
| `--border` on `--surface` / `--bg` | 3.62 / 3.33 | 4.09 / 5.05 | 3 |
| `--danger` on `--surface` / `--bg` | 6.54 / 6.00 | 6.03 / 7.45 | 4.5 |
| `--ok` on `--surface` / `--bg` | 5.38 / 4.95 | 8.4 / 10.4 | 4.5 |
| Badge: `--text` on `--badge-bg` | 13.8 | 12.8 | 4.5 (`--muted` would only reach 4.15 here, so the badge uses `--text`) |
| Chart day / night on `--surface` | 5.18 / 5.66 | 8.94 / 7.43 | 3 (graphics) |

Notes:
- `--hairline` is decorative only and never the only boundary of a control. Inputs and secondary buttons use `--border`.
- `.link` buttons sit inside sentences ("Already have an account? Sign in"), and in dark mode the accent against `--text` is under 3:1. So `.link` stays **underlined**. Only the landing chevron link, the header **Sign in** and the brand link go without an underline, because each stands alone.

## Type

Font: **Inter** from Google Fonts, one family, weights 400, 500, 600 and 700.
- `<link rel="preconnect" href="https://fonts.googleapis.com">` and `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`
- `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap`
- `--font: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;`
- Numbers in tables and readings keep `font-variant-numeric: tabular-nums`. `-webkit-font-smoothing: antialiased` on body is fine.

| Style | Phone (~400px) | Desktop (≥1069px) | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|
| Hero headline (Landing `h2`) | 44px | 80px | 700 | 1.05 | -0.02em phone, -0.03em desktop |
| Hero subhead | 19px | 24px | 400 | 1.35 | -0.01em |
| Section headline (feature, How it works, closing) | 32px | 48px | 700 | 1.08 | -0.02em |
| Eyebrow (above feature headline) | 15px | 17px | 600 | 1.3 | 0 |
| Feature paragraph | 17px | 19px | 400 | 1.45 | -0.01em |
| Step title | 19px | 21px | 600 | 1.25 | -0.01em |
| Step text | 17px | 17px | 400 | 1.47 | -0.01em |
| Step number (in disc) | 17px | 17px | 600 | 1 | 0 |
| Header wordmark (`h1`) | 17px | 19px | 600 | 1 | -0.01em |
| Signed-in screen `h2` | 28px | 34px | 700 | 1.15 | -0.02em |
| Signed-in `h3` (and `.city-name`) | 19px | 21px | 600 | 1.25 | -0.01em |
| `h4`, slot title, chart-card `h3` | 17px | 17px | 600 | 1.3 | -0.01em |
| Body, inputs, buttons | 17px | 17px | 400 (buttons 500) | 1.47 | -0.01em |
| Labels, legends | 15px | 15px | 600 | 1.35 | 0 |
| Hints, reading values, table | 14px | 14px | 400 | 1.43 | 0 |
| Badge | 13px | 13px | 600 | 1 | 0.01em |
| Footer | 13px | 13px | 400 | 1.5 | 0 |

Between phone and desktop, sizes scale with `clamp()`. For example, the hero is `clamp(44px, 5.4vw + 22px, 80px)`. At 400px, "Weather, remembered." wraps to two lines at 44px, so it isn't clipped. Inputs stay at 17px at every width, which also stops iOS from zooming on focus.

## Layout

Breakpoint: **≤734px** is the phone layout. Anything wider uses the desktop layout, with fluid sizes in between. No element uses `100vw`. Bands are ordinary full-width blocks inside a full-width `main`, and their content is centered in an inner column. So `.app` should no longer cap the whole page at 960px. Each screen or band caps its own content instead.

**Content column** (used by the header, footer, signed-in screens and band contents): max width 980px, centered, side padding 22px (16px on phone).

### Header (every screen)
- Sticky at the top, full width, height 52px (48px on phone). Background `--header-bg` with `backdrop-filter: saturate(180%) blur(20px)`, or `--header-solid` where unsupported. Bottom line 1px `--hairline`. z-index above content.
- Left: the brand link to `./`. It holds the logo mark at 28px (24px on phone), an 8px gap, then the wordmark. Recommended structure: the `h1` wraps the link, and the link wraps `<img src="assets/logo.svg" alt="" width="28" height="28">` plus the text "Weather Insights". The link's accessible name is then exactly "Weather Insights", and so is the `h1` text, with no double announcement. The brand link has no underline and uses `--text`.
- Right, signed out: **Sign in** as a compact text button. 14px, weight 500, `--text`, padding 6px 12px, pill radius, transparent background. Hover fill is `--badge-bg`.
- Right, signed in: the existing `#account` block (email, Settings, Sign out) in the same order. The email is 14px `--muted` and truncates with an ellipsis. Settings and Sign out use the compact secondary pill (see States).
- At 400px signed in, the brand and the account block may wrap onto two rows. Row gap 4px, vertical padding 8px, so the header grows to about 92px. When it wraps, the header should stop being sticky so it doesn't cover content (for example, `.topbar:has(#account:not([hidden]))` becomes `position: static` at ≤734px). Brand text never truncates.

### Unsubscribe notice
Sits in the content column, 16px below the header. It is a card with max width 560px, padding 20px 24px and radius 18px. On Landing it comes before the hero band.

### Landing
1. **Hero band** (`--band`). Centered text in a 760px column. Padding: 96px top on desktop, 56px on phone.
   - The headline `h2` "Weather, remembered." receives focus with `tabindex="-1"`, like the other screen headings.
   - Subhead 16px below, `--muted`, max width 34ch, centered. Suggested: "Follow up to 10 cities and build a twice-daily weather history from two independent sources."
   - Buttons row 32px below, centered, gap 28px, wraps. Signed out: **Get started** (primary pill) and **Sign in** (chevron link). Signed in: only **Go to your cities** (primary pill). At 400px both signed-out buttons fit side by side (about 150px + 90px). If they wrap, they stack centered with a 16px gap.
   - Hero image 56px below the buttons (40px on phone): `assets/hero.svg`, `width="1200" height="640"`. It renders at 100% of the content column, up to 980px wide, with `height: auto`. The image column is wider than the text column (980px vs 760px). Bottom padding of the band is 96px on desktop and 48px on phone.
2. **Feature bands**, four of them, alternating backgrounds: 1 `--band-alt`, 2 `--band`, 3 `--band-alt`, 4 `--band`. Each band has 120px padding top and bottom on desktop and 72px on phone, with an inner grid in the 980px column.
   - Desktop: two columns, illustration 7fr and text 5fr, gap 64px, vertically centered. The illustration is on the left in bands 1 and 3 and on the right in bands 2 and 4. Reverse the grid order in CSS; the DOM order stays image then text.
   - Phone: one column, illustration first, then a 32px gap, then the text, centered. The illustration is full column width.
   - Text block: eyebrow in `--accent`, 8px gap, section headline `h3`, 16px gap, paragraph in `--muted` (max width 30em). Text is left-aligned on desktop.
   - Images: `width="640" height="480"`, `alt=""`, `height: auto`, `max-width: 100%`, `display: block`.
   - Suggested copy. It is factual; the developer and owner may tune it.
     1. Cities, `feature-cities.svg`. Eyebrow "Your cities". Headline "Up to 10 cities. One calm list." Paragraph "Search for a city and add it. Weather Insights keeps a separate history for each one, in its own local time."
     2. Readings, `feature-readings.svg`. Eyebrow "Twice a day". Headline "Recorded at 12am and 12pm." Paragraph "At midnight and midday local time, each city gets a reading from two independent services, Open-Meteo and MET Norway, stored side by side. It's a record of what happened, not a forecast."
     3. History and units, `feature-history.svg`. Eyebrow "History". Headline "See how it really was." Paragraph "Browse daily readings in a table, or follow day and night temperatures on charts, from the last week to the last year. Show everything in °C or °F."
     4. Email, `feature-email.svg`. Eyebrow "Email". Headline "Digests and alerts, on your schedule." Paragraph "Get a daily or weekly digest of your cities, and an alert when a reading goes outside, or inside, a range you set." Then, after a 16px gap, the **badge** "Email notifications are in testing".
   - **Badge**: an inline-block pill, padding 6px 12px, radius 980px, background `--badge-bg`, text `--text`, 13px weight 600. It is plain text (a `<p>` or `<span>`), not focusable, and has no icon. On phone it is centered with the text.
3. **How it works** (`--band-alt`, the band after feature 4). Padding 120px on desktop, 72px on phone. A centered section headline "How it works", then a 56px gap, then an `<ol>` of exactly 3 steps.
   - Desktop: three equal columns, gap 40px. Phone: one column, gap 40px. Each step is centered.
   - Each step: a 44px disc (`--btn-bg`, number in `--on-accent`), 20px gap, step title, 8px gap, step text in `--muted` (max width 22em). The list has no browser markers (`list-style: none`). The discs show the numbers, and the `ol` keeps the semantics.
   - Suggested steps: 1 "Create an account": "Sign up with your email and a password." 2 "Add your cities": "Search and follow up to 10." 3 "Watch your history grow": "Readings arrive twice a day. Check the charts, or let a digest bring them to you."
4. **Closing call to action** (`--band`). Padding 120px top and bottom (72px on phone). Centered.
   - `assets/logo.svg` at 64px (`width="64" height="64" alt=""`), 24px gap, headline "Start your weather history today.", 12px gap, a `--muted` line "Your first readings arrive at the next 12am or 12pm in each city.", 32px gap, then **Get started** (primary pill). For a signed-in user, the button is **Go to your cities** instead.
5. The footer follows.

### Footer (every screen)
Full width, background `--band-alt`, top line 1px `--hairline`. Content column, padding 20px top and 32px bottom. 13px `--muted`. Two short lines that wrap freely:
- "Weather data from [Open-Meteo](https://open-meteo.com/) and [MET Norway](https://api.met.no/). Weather Insights records past readings; it doesn't forecast."
- "[Source code on GitHub](https://github.com/treefinderer/weather)"

Links are `--text`, underlined with offset 3px and thickness 1px. The underline hides on hover. Links open in the same tab. On signed-in screens the footer sits after the screen content, with at least 64px of space above it. The body is a min-height column (`min-height: 100vh` on a flex column, which doesn't cause sideways scroll), so the footer sits at the bottom of short screens.

### Signed-in and auth screens
- Page background `--bg`. Screen content sits in the content column, padding 40px top and 80px bottom (24px and 48px on phone).
- **Loading**: muted text, centered, 96px top padding.
- **Auth cards** (sign in, sign up, forgot, reset, unavailable): centered in the column (`margin-inline: auto`), max width 440px, padding 32px (24px on phone), radius 18px, `--surface`, shadow `0 4px 24px var(--shadow)`. In dark mode the shadow is transparent and a 1px `--hairline` border defines the card. `h2` at 28px with 24px below it. Fields 16px apart. Full-width primary pill. `.links` row 20px below the form, centered.
- **Your cities**: the `h2` uses the screen `h2` style. The count line sits 4px below the `h2`, in `--muted`. The search row has the input and a **Search** primary pill (auto width), 8px apart. City cards are `--surface`, radius 18px, padding 24px (16px on phone), same shadow rule, 16px apart. Reading tiles are `--bg`, radius 12px, padding 12px 14px. Result rows and alert rows use a `--hairline` divider.
- **History**: the head row is the `h2` and timezone, then **Back to cities** as a compact secondary pill, which wraps underneath on phone. Controls use the shared field style. Chart cards and the table wrapper are `--surface`, radius 18px, padding 20px (table wrapper padding 0), same shadow rule. The table keeps its sticky date column (background `--surface`) and `--chart-grid` lines. The pager has two compact secondary pills with the page info between them.
- **Settings**: card max width 640px (it was 440px), centered, same card style as auth. Each section `h3` has 32px of space above it and a 1px `--hairline` line above it (padding-top 24px), which separates units, notifications and password. The units radios sit inline, 24px apart.
- Control order and every id stay unchanged. Only classes and wrapper styling change.

## Imagery

All images are original hand-written SVG in `assets/`. They have no external references and no scripts, and each is under 8 KB.

**Dark-mode approach:** every image is a self-contained tile that carries its own background: a rounded, saturated mid-tone gradient, or the blue logo square. So the same file looks right on white, `#f5f5f7`, `#161617` and black. No dark variants are needed, the images don't depend on page tokens, and `data-theme` overrides work. (`currentColor` would not work in an `<img>`, and an SVG media query would follow the OS, not `data-theme`.) The only exception is `chevron.svg`, which is used as a CSS mask, so it takes the link's text color in either theme.

| File | Where | Size attributes | Alt | Dark mode |
|---|---|---|---|---|
| `assets/logo.svg` | Header brand link; closing call to action | 28×28 (header, shown at 24px on phone), 64×64 (closing) | `alt=""` in both. In the header, the link text "Weather Insights" names the link. In the closing section it is decorative next to the headline. The file has `<title>Weather Insights</title>` for direct viewing. | Same file. A blue gradient square with a yellow sun and a white rising line, readable on light and dark. |
| `assets/favicon.svg` | `<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">` | n/a | n/a | Same mark with thicker strokes and no end dot, tuned for 16px. |
| `assets/hero.svg` | Hero, under the buttons | 1200×640 | `alt=""` (the headline and subhead carry the meaning) | Own night-to-day sky tile: moon, sun and a floating card with a day/night line chart |
| `assets/feature-cities.svg` | Feature 1 | 640×480 | `alt=""` | Own blue tile: a globe with pins and a city list card showing 3 of 10 slots used |
| `assets/feature-readings.svg` | Feature 2 | 640×480 | `alt=""` | Own indigo tile: a night clock and a day clock at 12, and a card with two source rows |
| `assets/feature-history.svg` | Feature 3 | 640×480 | `alt=""` | Own coral tile: a day/night chart, a table card and a °C/°F toggle |
| `assets/feature-email.svg` | Feature 4 | 640×480 | `alt=""` | Own teal tile: a digest letter in an envelope, Daily/Weekly chips and an alert bell |
| `assets/chevron.svg` | `::after` of the landing **Sign in** chevron link | 12×12, shown at 0.7em | n/a (a CSS mask, so screen readers don't see it) | Use it as `mask: url(assets/chevron.svg) center / contain no-repeat; background: currentColor`, so it follows `--accent` in both themes. |

If an image fails to load, its `width` and `height` attributes reserve space. With `height: auto` the browser keeps the aspect ratio, and the text sits in its own block, so nothing overlaps. No image is focusable or wrapped in a link, except the header logo, whose link is named by its text.

Text inside the illustrations ("18°", "°C", "Daily") is decorative and uses a system font stack, so small differences in font rendering are fine.

## Motion

- Buttons and links: `background-color`, `color` and `border-color` transitions over 150ms `ease`.
- Header: no motion. Its translucency is static.
- Hero: the headline, subhead, buttons and image fade in over 450ms `ease-out`, moving up 12px, staggered by 60ms. Put this **only** inside `@media (prefers-reduced-motion: no-preference)`, so by default content is visible with no animation. Feature bands don't animate, and nothing waits for scroll or JS.
- Screen switches: none. Screens show and hide as today.
- Under `@media (prefers-reduced-motion: reduce)`: `transition: none` and `animation: none` on everything (`*, *::before, *::after`).

## States

**Primary pill (`.btn`)**: fill `--btn-bg`, text `--on-accent`, 17px weight 500, padding 12px 22px, min height 44px, radius 980px, no border. In auth forms and Settings it is full width, as today. On Landing, and for **Search**, it is auto width.
- Hover: `--btn-bg-hover`.
- Active: `--btn-bg-hover`, no movement.
- Focus-visible: 2px solid `--focus` outline, offset 3px. The outline follows the pill radius.
- Disabled: opacity 0.45, `cursor: default`, no hover change.

**Secondary pill (`.btn-secondary`)**: transparent background, text `--accent`, 1px `--accent` border, same radius and size as primary. Compact variant (in rows, header, pager and **Back** buttons): padding 6px 14px, 14px font, min height 32px.
- Hover: background `--badge-bg`.
- Focus: same as primary.
- Disabled: opacity 0.45.

**Chevron link (landing Sign in)**: text `--accent`, 17px (19px desktop), weight 400, no underline, chevron after the text with a 4px gap. Min height 44px, so the tap target is large enough.
- Hover: underline.
- Focus: 2px `--focus` outline, offset 3px, radius 8px.

**Header Sign in and brand link**: see Layout. Focus ring as above, with radius 8px.

**`.link`**: `--accent`, underlined (offset 3px, thickness 1px).
- Hover: thickness 2px.
- Focus: ring with radius 4px.

**Inputs and selects**: min height 44px, padding 10px 14px, radius 12px, 17px. Fill `--bg` inside cards and `--surface` on the page (city search, history controls). Border 1px `--border`.
- Hover: border `--text`.
- Focus-visible: border `--focus` plus a 2px `--focus` outline, offset 1px.
- Disabled: opacity 0.5, cursor default.
- Error (any input with `aria-invalid="true"`, where the code sets it): border `--danger`. The message below it is `--danger` at 14px.

**Checkboxes and radios**: native, 20px, `accent-color: var(--accent)`. Focus uses the same ring. Inside a disabled fieldset, labels are `--muted`, as today.

**Messages**: `.msg-error` is `--danger` and `.msg-ok` is `--ok`, both 15px weight 500. They have no background box, so the layout stays calm. `.msg:empty` stays hidden.

**Empty and loading states** (`#cities-status`, `#history-empty`, `#history-status`, `#notify-status`): 17px `--muted`, with 24px of space above and below. Retry buttons are compact secondary pills placed directly under their message.

**Focus everywhere**: `:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }`. Headings with `tabindex="-1"` keep today's behavior; the brief doesn't change how they look when they receive focus. The scrollable `.table-wrap` (`tabindex="0"`) shows the ring at offset 2px.

**Badge**: static. It has no hover or focus state.
