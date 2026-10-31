# 0007 History redesign: design brief

Spec: `docs/specs/0007-history-redesign.md`. Base system: `docs/design/0005-weather-insights-look.md` and `docs/design/0006-cities-settings-redesign.md`. Everything those define (tokens, Inter, pills, inputs, focus ring, messages, card style, page title, segmented control, phone breakpoint ≤734px, desktop ≥1069px) still applies. This brief only adds the History screen.

Owner decisions (2026-10-30), folded in below:
- Stat tiles: **Day high**, **Night low**, **Day average**, **Night average**, each with a caption (the date, or "N days").
- **Source** becomes a segmented control: `fieldset#history-source` (legend "Source", `aria-describedby="history-source-hint"`) with three native radios `name="history-source"`, values `avg` / `open-meteo` / `met-norway`, labels "Average", "Open-Meteo", "MET Norway". One Tab stop, arrow keys switch. All three segments fit on one row at 400px with no clipped text.
- **Period** stays a native `<select>`. The custom date range stays.

## Direction

It's the same quiet, Apple-style look as Your cities and Settings: a large, tightly tracked city title with the timezone muted under it, then everything in rounded white cards on the neutral `--bg` page. The page reads like a weather app's detail screen. One tidy controls card comes first, then a row of four headline numbers, then calm chart cards and the readings table. Charts are spare: a horizontal grid only, no x grid, thin lines, small points. Day and night differ by line style (solid vs dashed) and marker (circle vs square) as well as by color. No new artwork is needed. The only new asset is a small chevron for the restyled select.

## Tokens

**No new tokens.** The four `--chart-*` tokens keep their current values. They already pass in both themes (see ratios), and the warm day orange next to the cool night blue matches the 0005/0006 palette. Every color below is an existing token, already in `:root` and both dark blocks.

| Part | Token |
|---|---|
| Page background | `--bg` |
| Controls card, stat tiles, chart cards, table card | `--surface`, 1px `--card-line` border, radius 18px, `0 4px 24px var(--shadow)` |
| Title, tile values, legend text, table cells | `--text` |
| Timezone, field labels, tile labels and captions, hint, pager info, table header, status lines | `--muted` |
| Fields inside the controls card (Period select, From, To) | `--bg` fill, 1px `--border` |
| Source track | `--seg-track` fill, 1px `--border` edge; checked segment `--btn-bg` / `--on-accent`; hover `--seg-hover` |
| Custom range divider, table-wrap border, table header and group dividers | `--hairline` |
| Table body row lines, chart y grid | `--chart-grid` |
| Chart ticks | `--chart-text` |
| Day line, day legend glyph, day tile glyph | `--chart-day` |
| Night line, night legend glyph, night tile glyph | `--chart-night` |
| Sticky Date column background | `--surface` (same as the card, so it is opaque) |
| Focus ring | `--focus` |
| Errors | `--danger` (`.msg-error`) |

Current values, for reference:

| Token | Light | Dark (both blocks) |
|---|---|---|
| `--chart-day` | `#c2410c` | `#ffa94d` |
| `--chart-night` | `#3b5bdb` | `#91a7ff` |
| `--chart-grid` | `#e5e5ea` | `#38383a` |
| `--chart-text` | `#6e6e73` | `#a1a1a6` |

Contrast (WCAG 2.x, rounded). Dark is `--surface #1c1c1e` / `--bg #000000`.

| Pair | Light | Dark | Needs |
|---|---|---|---|
| Title, `--text` on `--bg` | 15.5 | 19.3 | 3 (large) |
| Timezone, status lines, empty text, `--muted` on `--bg` | 4.66 | 8.16 | 4.5 |
| Error text, `--danger` on `--bg` | 6.0 | 7.45 | 4.5 |
| Tile value, legend text, cells, `--text` on `--surface` | 16.8 | 15.6 | 4.5 |
| Labels, captions, hint, header, pager info, ticks, `--muted` / `--chart-text` on `--surface` | 5.07 | 6.61 | 4.5 |
| Day line and glyph, `--chart-day` on `--surface` | 5.18 | 8.94 | 3 (graphic) |
| Night line and glyph, `--chart-night` on `--surface` | 5.67 | 7.43 | 3 (graphic) |
| Field text, `--text` on `--bg` fill | 15.5 | 19.3 | 4.5 |
| Field edge, `--border` on `--bg` fill | 3.3 | 5.05 | 3 |
| Select chevron `#7c7c80` on `--bg` fill | 3.82 | 5.05 | 3 (graphic) |
| Unchecked segment, `--text` on `--seg-track` | 13.8 | 15.6 | 4.5 |
| Checked segment, `--on-accent` on `--btn-bg` | 4.70 | 4.70 | 4.5 |
| Checked segment against track | 3.86 | 3.61 | 3 |
| Track edge, `--border` on `--surface` | 3.62 | 4.09 | 3 |
| Focus ring, `--focus` on `--surface` / `--bg` | 5.56 / 5.11 | 5.64 / 6.97 | 3 |

`--chart-grid` and `--hairline` are decorative dividers, so no ratio is needed. Day and night never rely on color alone: they also differ by dash and marker shape.

## Type

Font: **Inter**, already loaded (400, 500, 600, 700), with the 0005 `--font` fallback stack (`"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`). No new weight. Every changing number (tile values, captions, table cells, pager info) uses `font-variant-numeric: tabular-nums`.

| Style | Phone (~400px) | Desktop (≥1069px) | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|
| Page title `#history-title` (add to the 0006 `#cities-title, #settings-title` rule) | 34px | 48px | 700 | 1.08 | -0.02em phone, -0.025em desktop |
| Subtitle `#history-tz` | 17px | 19px | 400 | 1.35 | -0.01em |
| Field label (Period), legend (Source, Custom range) | 15px | 15px | 600 | 1.35 | 0 |
| Select and date input text | 17px | 17px | 400 | 1.3 | -0.01em |
| Segment label (Source) | 14px | 15px | 600 | 1.1 | 0 |
| Hint (source hint, precipitation note) | 14px | 14px | 400 | 1.43 | 0 |
| Tile label | 14px | 14px | 600 | 1.3 | 0 |
| Tile value | 28px | 34px | 600 | 1.1 | -0.02em |
| Tile caption | 13px | 13px | 400 | 1.35 | 0 |
| Card title (chart `h3`s, `#history-table-title`) | 19px | 21px | 600 | 1.25 | -0.01em |
| Legend text | 13px | 13px | 500 | 1.3 | 0 |
| Chart ticks (Chart.js) | 12px | 12px | 400 | n/a | n/a |
| Table header (both header rows) | 13px | 13px | 600 | 1.35 | 0 |
| Table cells | 14px | 14px | 400 (Date cell 500) | 1.43 | 0 |
| Pager info | 14px | 14px | 400 | 1.43 | 0 |
| Status, empty, gone, charts-unavailable lines | 17px | 17px | 400 | 1.47 | -0.01em |

Fluid sizes: title `clamp(34px, 2.1vw + 25.6px, 48px)` (the existing rule); subtitle and card title as in 0006 (`clamp(17px, 0.3vw + 16px, 19px)`, `clamp(19px, 0.3vw + 18px, 21px)`); tile value `clamp(28px, 0.9vw + 24.4px, 34px)`.

The shared `.screen h2` and `.screen h3` rules don't change. The History title and card titles get History-scoped selectors (e.g. `#screen-history .chart-card h3`, `#history-table-title`).

## Layout

The screen column is the same as Your cities: 980px max, 22px side padding (16px on phone), 40px top and 80px bottom padding (24px and 64px on phone). Nothing uses `100vw`. Every flex or grid child holding text gets `min-width: 0` and `overflow-wrap: anywhere`. At 400px the column is 368px.

### 1. Title band (`.history-head`)

- Flex row with wrap, `align-items: flex-start`, `justify-content: space-between`, gap 16px. 28px below it (20px on phone).
- `.history-heading`: `flex: 1 1 260px; min-width: 0`. `#history-title` uses the page title style with `overflow-wrap: anywhere` and no margin. `#history-tz` sits 6px under it in the subtitle style, `--muted`, margin 0. When the timezone is empty, it takes no space.
- `#history-back`: the 0005 compact secondary pill (32px tall), `flex: none`. On desktop it sits on the title row at the right, centered on the title's **first line**: `margin-top: clamp(2px, 1.134vw - 2.18px, 10px)`, which is (title line height − 32px) / 2.
- At 400px the heading's 260px basis, plus the gap and the pill (about 120px), is wider than 368px. So Back always wraps under the subtitle there, left-aligned, 16px below it (set `margin-top: 0` on phone). That's calmer than squeezing a long place name into 230px. Back stays after the heading in DOM and Tab order.

### 2. Controls card (`form#history-controls`)

- The form is the card: `--surface`, radius 18px, padding 24px (20px on phone), `--card-line` border, 0005 shadow. 24px below it (20px on phone). No `overflow: hidden`, so focus rings never get clipped.
- **Toolbar row** (Period field, then the Source fieldset):
  - Desktop (>734px): a grid, `grid-template-columns: minmax(0, 280px) minmax(0, 420px)`, `justify-content: start`, gap 16px 24px, `align-items: start`. Both controls are 44px tall, so their tops and bottoms line up under their labels.
  - Phone (≤734px): one column, 20px gap. Both are full width (328px card content).
- **Period** (`.history-field` + `select#history-period`): label above, 8px gap. The select is restyled for this card only:
  - `appearance: none`, width 100%, min height 44px, padding 10px 44px 10px 18px, radius 980px (pill), fill `--bg`, 1px `--border`, 17px text.
  - The arrow is `assets/select-chevron.svg`, drawn as a background on the select: `var(--bg) url(assets/select-chevron.svg) no-repeat right 18px center / 12px 12px`. The chevron color is fixed (`#7c7c80`) and passes 3:1 on both `--bg` fills.
  - Options keep the native popup.
- **Source** (`fieldset#history-source`):
  - Reset the fieldset: no border, no padding, no margin, `min-width: 0`.
  - The `legend` "Source" uses the field label style, with `padding: 0` and 8px below it. Use `float: left; width: 100%` and `clear: both` on the track, as in 0006, so spacing matches the Period label exactly.
  - **Track**: reuse `.segmented`, with a History-only modifier (for example `.segmented.segmented-3`, or `#history-source .segmented`). The shared 2-column, 200px rule stays as it is for Settings. Modifier: `grid-template-columns: repeat(3, minmax(0, 1fr))`, `width: 100%`, `max-width: 420px`, height 44px, padding 3px, radius 980px, `--seg-track` fill, 1px `--border`.
  - **Segments**: each `label` wraps its radio and is centered text, 36px tall, padding 0 6px, `white-space: nowrap`, 15px desktop and 14px phone. The radios are hidden with the existing `.segmented input` visually-hidden rule, so Tab and the arrow keys still reach them.
  - **Fit at 400px**: the track is 328px, so the inner width is 320px and each segment is about 106px. "MET Norway", the longest label, is about 84px at 14px/600 Inter, so it fits with about 11px each side. Desktop segments are 138px. Under 360px viewports only (not a target, but no clipping): let the labels wrap (`white-space: normal`, `text-align: center`, line height 1.1) and change the track to `height: auto; min-height: 44px`.
  - **Hint** `#history-source-hint`: hint style, 8px under the track, `max-width: 420px`.
- **Custom range** (`fieldset#history-custom`), when shown:
  - It spans the full card width (`grid-column: 1 / -1` on desktop).
  - 20px above, a 1px `--hairline` top border, 20px padding-top (16px and 16px on phone). The legend "Custom range (local dates)" floats inside below the line (`float: left; width: 100%; padding: 0; margin-bottom: 8px`), so it doesn't sit on the border.
  - `.history-dates` (`clear: both`): flex, wrap, `align-items: flex-end`, gap 12px. Desktop: From and To are `flex: 0 1 200px`, then **Apply**. Phone: From and To are `flex-basis: 100%` (stacked, full width), and Apply is on its own row, left-aligned, auto width.
  - Date inputs: pill like the select (radius 980px, `--bg` fill, 1px `--border`, min height 44px, padding 10px 18px, 17px). They keep the native picker icon.
  - **Apply** (`#history-apply`): the compact secondary pill look (14px/500, `--accent` text and 1px border, transparent), at 44px height and padding 0 20px, so it lines up with the fields. `width: auto`. This overrides the full-width `form .btn-secondary` rule.
  - `#history-range-msg`: `.msg-error`, 12px above, 0 below.
- Gone state: the whole card is hidden (as today).

### 3. Status lines

In the page column, between the controls card and the content, as plain text with no card. Left-aligned, 17px, 24px above and below.
- `#history-status` ("Loading history…"): `--muted`. It takes no space when empty.
- `#history-error`: `.msg-error` at 17px. **Try again** (`#history-retry`) is a compact secondary pill directly under it (keep `margin: -12px 0 24px`).
- `#history-gone`: `--muted`, 17px (it is `.msg`, so reset its 500 weight to 400 for this id).
- `#history-empty`: `--muted`, 17px, max width 34em.

### 4. Content (`#history-content`), in order

**a. Stat tiles (`ul#history-stats`)**
- `list-style: none`, padding 0, margin 0 0 24px (16px on phone).
- Grid: desktop (>734px) `repeat(4, minmax(0, 1fr))`, gap 16px. Phone `repeat(2, minmax(0, 1fr))`, gap 12px. At 400px each tile is 178px wide. At 1280px each is about 222px. Grid rows stretch, so tiles in a row are the same height even when one has no caption.
- **Tile** (`li`, suggested class `.stat` plus `.stat-day` or `.stat-night`): `--surface` card (radius 18px, `--card-line`, shadow), padding 16px 18px (14px 16px on phone), `min-width: 0`.
  - **Label** (`p.stat-label`): a flex row, `align-items: center`, gap 8px, `--muted`, margin 0 0 8px. Before the text is a decorative 16px × 8px line glyph drawn by `::before`: a solid 2px `--chart-day` line on day tiles, a 2px `--chart-night` 4px/3px dash on night tiles (`repeating-linear-gradient(90deg, var(--chart-night) 0 4px, transparent 4px 7px)`). It's `flex: none` and has no text, so screen readers ignore it. It ties each tile to its chart line.
  - **Value** (`p.stat-value`): tile value style, `--text`, margin 0, `overflow-wrap: anywhere`. "–" when missing, in `--muted`.
  - **Caption** (`p.stat-caption`): 13px `--muted`, margin 6px 0 0. Leave it out (don't just empty it) when there's no value.
- Not focusable, no hover, no headings.

**b. Charts (`.history-charts`)**
- One-column grid, 16px gap. Both chart cards are full column width, because line charts with up to 365 points need the width. The two never sit side by side.
- `#history-charts-msg` ("Charts are unavailable right now."): the plain status-line style (17px `--muted`, regular weight, margin 0, the grid gap spaces it), no card.
- **Chart card** (`.chart-card`): `--surface` card, radius 18px, padding 20px 24px 24px (16px 16px 16px on phone).
  - **Card head** (new wrapper, e.g. `div.chart-head`, holding the `h3` then the legend): flex, wrap, `align-items: baseline`, `justify-content: space-between`, gap 8px 16px, 16px below it. `h3` in the card title style, margin 0, `min-width: 0`. At 400px the legend wraps under the title, left-aligned.
  - **Legend: HTML, not canvas.** The Chart.js legend draws a filled box, so the dash is hard to see. An HTML legend shows the real dash pattern and marker, follows the tokens through CSS, wraps naturally and needs no canvas space. Set `plugins.legend.display: false` in the config and leave the dataset labels ("Day (12pm)", "Night (12am)") as they are, because the tooltip uses them. Markup: a `<p class="chart-legend" aria-hidden="true">` with two `<span class="legend-item legend-day">` / `legend-night` spans, each holding a glyph span and the text. The canvas `aria-label` already names both series, so the legend is hidden from screen readers.
    - Item: inline-flex, `align-items: center`, gap 8px. 16px between items. 13px/500 `--text`.
    - Glyph: 26px × 10px, `position: relative`, `flex: none`. Its `::before` is the line: 2px tall, vertically centered, 26px wide. Day: solid `--chart-day`. Night: `repeating-linear-gradient(90deg, var(--chart-night) 0 6px, transparent 6px 10px)`, which is exactly the chart's `[6, 4]` dash (6+4+6+4+6 = 26). Its `::after` is the marker, centered: day is a 7px circle in `--chart-day`, night a 6px square in `--chart-night`, matching `pointStyle` circle and rect.
  - **Chart box** (`.chart-box`): `height: clamp(240px, 12vw + 192px, 320px)`, which is 240px at 400px and 320px from about 1069px. `position: relative; min-width: 0`.

**c. Table card (new wrapper, e.g. `section.history-table-card` or `div.card`, holding `h3#history-table-title`, `.table-wrap` and the precipitation note)**
- 16px above (after the charts), `--surface` card, radius 18px, padding 20px 24px 24px (16px on phone). No `overflow: hidden`.
- `#history-table-title`: card title style, margin 0 0 16px.
- `.table-wrap`: drop its own card look (no shadow, no `--card-line`). Instead it gets a 1px `--hairline` border, radius 12px, fill `--surface`, `overflow-x: auto`, `max-width: 100%`. The ring sits 2px outside it, inside the card's padding, so it is never clipped. At 400px the wrap is 336px wide and the table scrolls inside it.
- Table:
  - Cells have padding 10px 14px (8px 12px on phone) and are right-aligned. `white-space: nowrap`.
  - Header rows: centered, 13px/600 `--muted`, fill `--surface`. 1px `--hairline` under the second header row.
  - Body rows: 1px `--chart-grid` between them. No line under the last row, because the wrap's border closes it.
  - Group dividers (`.slot-start`): 1px `--hairline` on the left.
  - No zebra stripes and no row hover (the rows aren't interactive).
  - **Date column** (`.date`): sticky at `left: 0`, opaque `background: var(--surface)`, left-aligned, weight 500, 1px `--hairline` right edge, `z-index: 1` (header Date `z-index: 2`). Because the wrap fill and the column fill are both `--surface`, nothing shows through in either theme.
- Precipitation note (`.hint`): 12px under the wrap, margin-bottom 0.

**d. Pager (`.history-pager`)**
- After the table card, 16px above it. Flex, wrap, `align-items: center`, `justify-content: space-between`, gap 8px 12px.
- **Newer** and **Older**: compact secondary pills, `flex: none`.
- Info (`#history-page-info`): 14px `--muted`, tabular-nums, `text-align: center`, `flex: 1 1 auto; min-width: 0`.
- At 400px: about 72 + 12 + 130 + 12 + 66 = 292px, which fits in 368px on one row. If it doesn't fit (large text settings), the info takes `flex-basis: 100%` and `order: 3` on its own row, centered under the buttons. Use `order` for visuals only. DOM and Tab order stay Newer, info, Older.

### Phone, 400px summary

The column is 368px. Card content is 328px (controls) or 336px (charts and table). Nothing is fixed wider than that. Tiles are 2 × 2. Source segments are about 106px each. Only `.table-wrap` scrolls sideways.

## Chart styling (Chart.js 4.5.1, in `lineConfig`)

Colors are still read from the tokens when a chart is built (`colors()`). Font: pass `font: { family: getComputedStyle(document.body).fontFamily, size: 12 }` in each axis's `ticks`. Don't change `Chart.defaults`.

- **Datasets**:
  - `borderWidth: 2.5`.
  - Day `borderDash: []`, `pointStyle: "circle"`. Night `borderDash: [6, 4]`, `pointStyle: "rect"`.
  - `pointRadius` stays 3 when there are 45 labels or fewer (or for the averages chart) and 0 otherwise. Add `pointHoverRadius: 5` and `pointBorderWidth: 0`.
  - `backgroundColor` stays the line color. `tension: 0`, `spanGaps: false` (unchanged).
- **x axis**: `grid: { display: false }`, `border: { color: c.grid }`. Ticks `color: c.text`, `maxRotation: 0`, `autoSkip: true`, `autoSkipPadding: 16`.
- **y axis**: `grid: { color: c.grid }`, `border: { display: false }`. Ticks `color: c.text`, `padding: 8`, `maxTicksLimit: 6`, and the `"°"` callback (unchanged).
- **Legend**: `plugins.legend.display: false` (an HTML legend replaces it, see Layout).
- **Tooltip**: keep Chart.js's default dark tooltip. Add `usePointStyle: true` (it shows the circle or square), `borderColor: c.grid`, `borderWidth: 1`, `padding: 10`, `boxPadding: 4`.
- **Animation**: `animation: false`, unchanged (see Motion).
- Rebuild on a color-scheme change and on `data-theme` changes (unchanged).

## Imagery

| File | Where | Alt | Dark mode |
|---|---|---|---|
| `assets/select-chevron.svg` | CSS background on `#history-period` only (see Layout 2) | none (CSS background, never an `<img>`) | Same file. The fixed `#7c7c80` stroke passes 3:1 on light `--bg` (3.82) and dark `--bg` (5.05). |

- `viewBox="0 0 12 12"`, a single stroked path, no scripts, no external references, under 1 KB. Original.
- The legend glyphs and the tile glyphs are drawn in CSS, not SVG, so they take the live `--chart-*` token in each theme and stay in step with the chart.
- I added no empty-history illustration. The spec keeps the empty state as plain text in the column, and an image would add markup the spec doesn't list. See open questions.

## Motion

- Chart.js animation stays off (`animation: false`), so it is off under `prefers-reduced-motion: reduce` too. No chart motion is proposed.
- Only the 0005/0006 color transitions run: 150ms `ease` on `background-color`, `color` and `border-color` for buttons, inputs, the select and the segment labels.
- Nothing slides, fades or grows: not the tiles, the cards, the custom panel or the segment.
- The existing `@media (prefers-reduced-motion: reduce)` rule turns all of it off.

## States

**Period select and date inputs**:
- Rest: `--bg` fill, `--border` edge.
- Hover: border `--text`.
- Focus-visible: border `--focus` plus the 2px `--focus` outline, offset 1px. The outline follows the pill radius.
- Disabled (not used today): opacity 0.5, default cursor.
- Invalid date (`aria-invalid="true"`, if set): `--danger` border, with the message in `#history-range-msg`.

**Source segmented control** (as 0006):
- Unchecked: transparent on `--seg-track`, `--text`. Hover (unchecked only): `--seg-hover`.
- Checked: `--btn-bg` fill, `--on-accent` text, no hover change.
- Focus-visible on the radio: 2px `--focus` ring around that segment, offset 2px, pill radius.
- `fieldset:disabled` (defined for safety): track opacity 0.45, no hover, default cursor.

**Apply, Back, Try again, Newer, Older**: the 0005 compact secondary pill. Hover fill `--badge-bg`. Disabled is opacity 0.45 with no hover (Newer on the first page, Older on the last). Focus-visible uses the 0005 ring (2px, offset 3px).

**Table region** (`.table-wrap:focus-visible`): 2px `--focus` outline, offset 2px, radius 12px. Fully visible inside the card padding.

**Loading**: the controls card shows. "Loading history…" in `--muted` under it. Tiles, charts, table and pager are hidden (they're inside `#history-content`).

**Error**: `.msg-error` line plus **Try again** under the controls card. No tiles.

**Gone**: the controls card is hidden. "This city is no longer in your list." in 17px `--muted` under the title band.

**Empty period**: "No readings in this period…" in 17px `--muted`, left-aligned, no card, no tiles.

**Charts unavailable** (`window.Chart` missing): the plain line takes the charts' place. The tiles above and the table card and pager below still show.

**Missing tile value**: "–" in `--muted`, no caption. The tile keeps its row height.

**Focus everywhere**: the `--focus` ring in both themes on Back, Period, each Source segment (via its radio), From, To, Apply, Try again, the table region, Newer and Older. `#history-title` (`tabindex="-1"`) gets no ring when focused on open, as in 0005. Tiles, chart cards, legends and canvases are not focusable.
