# 0009 Satellite pictures: design brief

Spec: `docs/specs/0009-satellite-pictures.md`. Base system: `docs/design/0005-weather-insights-look.md`, `0006-cities-settings-redesign.md` and `0007-history-redesign.md`. Everything they define (tokens, Inter, pills, focus ring, card style, phone breakpoint ≤734px) still applies. This brief adds the picture block on the city card, the History viewer, the chart and table selection, the city marker and the footer line. The live view (0010) is designed separately. This brief only leaves room for it (see Layout 1).

## Direction

The picture is shown like a photo in a weather app. It's a calm square with soft corners, set into the existing white cards, with a small muted caption under it. Nothing frames or tints the imagery. It's public-domain satellite data and should read as data. On History the viewer sits beside the temperature chart like an inspector panel. The chart point, the table row and the picture always show the same date and slot, marked by shape and weight as well as color.

## Tokens

Three **new** tokens. Add each to `:root` and to **both** dark blocks.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--pic-empty` *new* | `#f5f5f7` | `#2c2c2e` | Picture frame fill: placeholder, loading, and behind the image |
| `--pick` *new* | `#1d1d1f` | `#f5f5f7` | Selection outline in the table, the chart's selected-point ring and guide line |
| `--pick-bg` *new* | `#eef4fd` | `#14304d` | Fill of the selected Day or Night cells in the table |

Existing tokens: cards `--surface` / `--card-line` / `--shadow`. Caption, placeholder text, placeholder glyph, chart hint: `--muted`. Slot label: `--text`. Frame edge: `--hairline`. Table cell hover: `--option-hover`. Rings: `--focus`.

Contrast (WCAG 2.x, rounded). Dark is `--surface #1c1c1e`.

| Pair | Light | Dark | Needs |
|---|---|---|---|
| Placeholder text and glyph, `--muted` on `--pic-empty` | 4.66 | 5.42 | 4.5 |
| Caption, chart hint, `--muted` on `--surface` | 5.07 | 6.61 | 4.5 |
| Slot label, `--text` on `--surface` | 16.8 | 15.6 | 4.5 |
| Selected cell text, `--text` on `--pick-bg` | 15.2 | 12.4 | 4.5 |
| Selection outline, `--pick` on `--pick-bg` / `--surface` | 15.2 / 16.8 | 12.4 / 15.6 | 3 |
| Hovered cell text, `--text` on `--option-hover` | 15.5 | 12.8 | 4.5 |
| Chart ring and guide line, `--pick` on `--surface` | 16.8 | 15.6 | 3 |
| Focus ring, `--focus` on `--surface` | 5.56 | 5.64 | 3 |
| City marker, white stroke on its own 60% black halo | about 9 at worst | same | 3 (graphic) |

The marker carries its own halo, so it reads on bright cloud and on black ocean in both themes. The picture itself is never filtered or dimmed in dark mode.

## Type

Inter and the 0005 `--font` stack. No new weight. Dates use `tabular-nums`.

| Style | Phone (~400px) | Desktop | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|
| Viewer title `h3` "Satellite pictures" (add to the `#screen-history .chart-card h3` rule) | 19px | 21px | 600 | 1.25 | -0.01em |
| Picture caption (card and viewer) | 13px | 13px | 400 | 1.4 | 0 |
| Placeholder text | 14px | 14px | 500 | 1.4 | 0 |
| Viewer slot label (the live region) | 14px | 14px | 600 | 1.35 | 0 |
| Chart hint (under the temperature chart) | 14px | 14px | 400 | 1.43 | 0 |
| Selected table cells | 14px | 14px | 600 (Date cell 700) | 1.43 | 0 |

## Layout

### 1. City card picture block (`figure.city-picture`)

- **Placement:** after `.city-summary`, before `.slots`. On a card with no readings, it goes after the "No readings yet" lede.
- **Hairline:** the summary and the picture together form the card's top part. When a picture block follows the summary, the summary loses its bottom border and padding and keeps 16px below it. The hairline (1px `--hairline`, 20px above and below, 16px on phone) moves under the picture block.
- **Wrapper for 0010:** put the figure in a `div.city-media` (flex column, 16px gap, `min-width: 0`). The wrapper carries the hairline, not the figure. A 0010 "Live view" block can then go below the picture inside the same wrapper, with the same frame and caption style and no layout change here.
- **Size:** width 100%, max width 320px, left-aligned. At 400px it's the full card content width (about 334px). `margin: 0`.
- **Frame** (`.pic-frame`): `position: relative`, `aspect-ratio: 1 / 1`, radius 14px (the same as the reading tiles), `overflow: hidden`, fill `--pic-empty`.
  - A `::after` covers the frame with `box-shadow: inset 0 0 0 1px var(--hairline)` and the same radius, `pointer-events: none`, so dark imagery keeps an edge on a dark card.
  - The `<img width="512" height="512" loading="lazy">` is `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block`.
  - The frame reserves the square before anything loads, so nothing shifts.
- **Caption** (`figcaption`): 10px below the frame, caption style, `--muted`, `overflow-wrap: anywhere`. For example: "Infrared · Night (12am), Oct 25 · Imagery: NASA GIBS / EOSDIS". It is plain text, not a link (the footer has the link), so it adds no Tab stop.
- **Placeholder** (`.pic-empty`, inside the frame, under the img): `position: absolute; inset: 0`, a flex column centered both ways, 8px gap, padding 24px, `text-align: center`.
  - **Glyph:** 32px square, `background: var(--muted)` masked with `assets/pic-empty.svg` (add the `-webkit-` prefix too, as `search.svg` does). It's a decorative span.
  - **Text:** placeholder style, `--muted`, max width 22em.
  - On the city card, the caption is left out while the placeholder text shows ("No satellite picture yet" or "Picture unavailable"), so the card stays quiet.

### 2. History viewer (`section.chart-card.pic-card#history-pic-card`)

- **DOM:** directly after `#history-temp-card` inside `.history-charts`.
- **Card:** the chart-card style. Padding 20px (16px on phone).
  - Head: the `h3`, 16px below it.
  - Then the frame (as Layout 1, with no `loading="lazy"` needed), then the caption 10px below it.
  - Then the nav row, 16px below the caption.
  - The caption keeps its place even when the placeholder shows: it reads "Imagery: NASA GIBS / EOSDIS" alone, so the nav row doesn't jump between slots.
- **Wide (≥900px):**
  - `.history-charts` becomes `grid-template-columns: minmax(0, 1fr) 360px`, gap 16px, `align-items: stretch`. The temperature card goes in column 1 and the viewer in column 2. `#history-charts-msg` and `#history-avg-card` span `1 / -1`.
  - The frame is then 320px. At 900px the chart card is about 480px wide.
  - The viewer is the taller card (about 510px). So in this layout `#history-temp-card` becomes a flex column and its `.chart-box` gets `flex: 1 1 auto` with its 0007 clamp height as `min-height`. The chart grows to fill the card, and no empty band is left under it.
  - When the temperature card is hidden (charts unavailable), the viewer spans `1 / -1` with max width 480px.
- **Narrower (<900px):** one column, as in 0007. The viewer card is full width under the temperature chart. Its frame, caption and nav row have max width 480px and are left-aligned. At 400px the card content is 336px, so the picture is a 336px square.
- **Nav row** (`.pic-nav`): flex, `align-items: center`, `justify-content: space-between`, gap 12px, no wrap.
  - **Older** (left), the slot label (middle), **Newer** (right). Tab order is Older, then Newer. Older is on the left because the chart's time runs left to right.
  - Both buttons are 0005 compact secondary pills, `flex: none`.
  - **Slot label** `p#history-pic-label`: `aria-live="polite"`, `aria-atomic="true"`, `flex: 1 1 auto; min-width: 0`, centered, slot label style, `--text`, `tabular-nums`, `overflow-wrap: anywhere`. Text: "Night (12am), Oct 24". It is the visible live region, so the announcement and what sighted users see are the same.
  - At 400px: about 70 + 12 + 140 + 12 + 72 = 306px, which fits 336px. With large text the label wraps inside its space onto two lines. The buttons always stay on the one row.
- **Viewer placeholder:** the same as the card's, with the text "No satellite picture for Night (12am), Oct 24" or "Picture unavailable".

### 3. Temperature chart: hint and focus

- `p.hint#history-temp-hint` sits 12px under `.chart-box`, margin-bottom 0. Suggested text: "Point at or tap a reading to see its satellite picture. When the chart has focus, use the Left and Right arrow keys." The canvas gets `aria-describedby` pointing to it.
- The canvas is `display: block`, and its focus ring is described in States.

### 4. Chart selected point (Chart.js options plus a tiny inline plugin object, no library)

- **Selected point:** in its own dataset only, it draws at `pointRadius` 6 in its series shape (a circle for day, a square for night), even when the other points have radius 0 (more than 45 labels).
  - Fill: the line color. `pointBorderWidth` 3, `pointBorderColor` `--pick`.
  - Use scriptable `pointRadius`, `pointBorderWidth` and `pointBorderColor` keyed on the selected dataset and index.
- **Guide line:** a 1px vertical `--pick` line, dashed `[3, 3]`, across the chart area at the selected x. Draw it in an inline plugin's `beforeDatasetsDraw`, so it sits behind the lines.
- **Not by color alone:** the selection reads through size, a ring and a guide line. Read `--pick` in `colors()` with the other tokens. Rebuild on theme change as today.
- **A selected slot with no reading** (a picture only): draw the guide line, with no point.

### 5. Table selection

- **Selected cells:** the selected row's Day cells or Night cells (the slot group the viewer shows) get:
  - `--pick-bg` fill and weight 600
  - a 2px `--pick` frame drawn with inset box-shadows: top and bottom on every cell in the group, plus left on the first cell and right on the last. The group reads as one outlined block, with no lines inside it.
- **Date cell:** that row's Date cell gets weight 700 and an inset 3px `--pick` bar on its left edge. Its background stays opaque `--surface`, so the sticky column still covers what scrolls under it.
- **Clickable cells:** body Day and Night cells get `cursor: pointer`. Under `@media (hover: hover)`, hovering a cell fills its slot group in that row with `--option-hover`. The selected group keeps `--pick-bg`.
- **No new Tab stops.** If the selected row is on another table page, nothing is highlighted, and the pager doesn't move.

### 6. Footer

A new `<p>` between the data line and the source-code line: "Imagery: <a>NASA GIBS / EOSDIS</a>". It uses the existing `.footer p` and `.footer a` styles, with nothing new.

## Imagery

| File | Where | Alt | Dark mode |
|---|---|---|---|
| Stored satellite JPEGs (Supabase Storage, not `assets/`) | City card frame, viewer frame | From the spec, e.g. "Satellite picture of the area around Oslo, infrared clouds, Night (12am), Oct 25" | Shown as-is, with no filter |
| `assets/pic-marker.svg` | `<img class="pic-marker" src="assets/pic-marker.svg" alt="" aria-hidden="true" width="24" height="24">` in each frame, after the img | `alt=""` (decorative) | Same file. A white ring and ticks on a 60% black halo, so it reads on any imagery |
| `assets/pic-empty.svg` | CSS mask on the placeholder glyph span (Layout 1) | none (CSS only) | It takes `--muted` through the mask |

- **Marker:** `position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%)`, 24px, `pointer-events: none`. Show it only when the image has loaded. Hide it with the placeholder.
  - For a box that was clamped at a pole or shifted at ±180°, the city isn't at the center. The developer may set `left` and `top` as percentages from the stored box. If that data isn't available on the client, hide the marker for those rows rather than mark the wrong spot.
- **Files:** both are original, `viewBox` 24 and 32, no scripts, no external references, under 1 KB each.

## Motion

- When a picture finishes loading, the img fades in from opacity 0 to 1 over 150ms `ease`. The JS adds a class on `load`. The placeholder glyph stays under it until then.
- The selection moves on the chart, in the table and in the viewer change instantly. Chart.js `animation: false` stays.
- The existing `@media (prefers-reduced-motion: reduce)` rule turns the fade off, so the picture appears at once.

## States

**Picture frame (card and viewer):**
- **Loading:** `--pic-empty` fill and the glyph, with no text. The square is reserved.
- **Loaded:** the image covers the placeholder, and the marker shows.
- **No picture:** glyph plus "No satellite picture yet" (card) or "No satellite picture for …" (viewer).
- **Failed** (the signed URL call fails or the image fires `error`): set the img `hidden` so no broken-image icon shows. The placeholder text reads "Picture unavailable". It doesn't retry. Readings, the summary, the charts and the table don't change.
- The frame isn't focusable and has no hover.

**Older / Newer:** the 0005 compact secondary pill. Hover fill `--badge-bg`. At the ends they're disabled (opacity 0.45, no hover, `disabled` attribute). The 0005 focus ring is 2px `--focus` with a 3px offset. If the focused button becomes disabled at an end, move focus to the other button so focus isn't lost.

**Chart canvas** (`#history-temp-chart`, `tabindex="0"`): on `:focus-visible`, a 2px `--focus` outline, offset 4px, radius 8px. It fits inside the card padding (24px, or 16px on phone). Focusing it changes nothing. The first Left or Right press steps one slot from the current selection, shows that point's tooltip and moves the ring and guide line.

**Table cells:** rest, hover (`--option-hover`, pointer only) and selected (`--pick-bg`, outline, weight). No focus state, because they aren't Tab stops.

**Viewer empty period:** hidden with `#history-content`, as the spec says.

**Focus everywhere:** the `--focus` ring in both themes on the canvas, Older, Newer and the footer link. The marker, the placeholder glyph, the frames and the captions are never focusable.
