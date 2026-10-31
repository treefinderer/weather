# 0006 Your cities and Settings redesign: design brief

Spec: `docs/specs/0006-cities-settings-redesign.md`. Base system: `docs/design/0005-weather-insights-look.md`. Everything 0005 defines (tokens, Inter, pills, inputs, focus ring, messages, card style, phone breakpoint ≤734px) still applies. This brief only adds to it.

Owner decisions (2026-10-30), folded in below:
- History is out of scope. It changes only through shared styles. This brief changes no shared rule that History uses (`.screen h2`, `.btn-secondary`, inputs, `.card`, `.chart-card`, `.table-wrap`). The new title style is scoped to the two screens.
- The large temperature on each city card is the **average of both sources** for the newest date and slot. If only one source has a temperature, it shows that one. The caption names the sources and the slot.
- The condition label and glyph come from Open-Meteo's code for that date and slot, or from MET Norway's if Open-Meteo's is missing or unknown.

## Direction

Apple-style and quiet, in the spirit of iOS Settings and a weather app's city list: a large, tightly tracked page title with a muted subtitle; content in rounded white cards on the neutral `--bg` page; hairlines instead of boxes inside cards. Each city card opens like a small hero: a big, light-weight temperature with a condition glyph beside it, and the four source readings below as compact grey tiles. Settings is a narrow centered column of separate grouped cards, with a pill-shaped segmented control for °C/°F. Color still comes only from the accent and the pictures. All artwork is original.

## Tokens

The 0005 tokens are unchanged. Two tokens are **new**, for the segmented control. Add each to `:root` and to **both** dark blocks (`@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`).

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--seg-track` *new* | `#e8e8ed` | `#1c1c1e` | Segmented control track fill. In dark mode it matches `--surface`, so the blue checked segment keeps 3:1 against it. |
| `--seg-hover` *new* | `#dcdce1` | `#2c2c2e` | Hover fill of an unchecked segment |

Existing tokens used by the new parts:

| Part | Token |
|---|---|
| Page background | `--bg` |
| Cards (city cards, results group, Settings cards) | `--surface`, `--card-line` border (transparent light, `#38383a` dark), `0 4px 24px var(--shadow)` |
| Large temperature, condition label, city name | `--text` |
| Count subtitle, caption, timezone, slot titles, dates, `dt` | `--muted` |
| Reading tiles | `--bg` |
| Dividers inside cards (summary/detail line, result rows, Settings sub-groups, alert rows) | `--hairline` |
| Segmented control edge | `--border` |
| Checked segment | `--btn-bg` fill, `--on-accent` text |
| Magnifier glyph (CSS mask) | `--muted` |

Contrast (WCAG 2.x, rounded). Pairs already in 0005 are repeated only where they matter here.

| Pair | Light | Dark | Needs |
|---|---|---|---|
| Large temperature, `--text` on `--surface` | 16.8 | 15.6 | 3 (large text) |
| Condition label, city name, `--text` on `--surface` | 16.8 | 15.6 | 4.5 |
| Caption, timezone, count, `--muted` on `--surface` | 5.07 | 6.61 | 4.5 |
| Count subtitle, `--muted` on `--bg` (page) | 4.66 | 8.16 | 4.5 |
| Tile text: `--text` / `--muted` on `--bg` | 15.5 / 4.66 | 19.3 / 8.16 | 4.5 |
| Unchecked segment text, `--text` on `--seg-track` | 13.8 | 15.6 | 4.5 |
| Hovered unchecked segment, `--text` on `--seg-hover` | 12.3 | 12.8 | 4.5 |
| Checked segment text, `--on-accent` on `--btn-bg` | 4.70 | 4.70 | 4.5 |
| Checked segment against track (`--btn-bg` on `--seg-track`) | 3.86 | 3.61 | 3 |
| Track edge, `--border` on `--surface` | 3.62 | 4.09 | 3 |
| Focus ring, `--focus` on `--surface` / `--bg` | 5.56 / 5.11 | 5.64 / 6.97 | 3 |
| Magnifier, `--muted` on input fill `--surface` | 5.07 | 6.61 | 3 (graphic) |
| "Saved", `--ok` on `--surface` | 5.38 | 8.4 | 4.5 |

The glyph colors are fixed in the SVG files (see Imagery), with their ratios listed there.

## Type

Font: **Inter**, already loaded by 0005 (400, 500, 600, 700), with the 0005 `--font` fallback stack. No new font or weight. Numbers that change (temperatures, tile values) use `font-variant-numeric: tabular-nums`.

New styles. The other styles come from the 0005 type table.

| Style | Phone (~400px) | Desktop (≥1069px) | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|
| Page title (`#cities-title`, `#settings-title` only) | 34px | 48px | 700 | 1.08 | -0.02em phone, -0.025em desktop |
| Page subtitle (`#cities-count`) | 17px | 19px | 400 | 1.35 | -0.01em |
| Large temperature (city summary) | 44px | 56px | 500 | 1 | -0.03em, tabular-nums |
| Condition label | 17px | 19px | 600 | 1.25 | -0.01em |
| Summary caption | 14px | 14px | 400 | 1.43 | 0 |
| Settings card heading (unit `legend`, `#notify-title`, password `h3`) | 19px | 21px | 600 | 1.25 | -0.01em |
| Settings sub-group heading (`#alerts-title`) | 17px | 17px | 600 | 1.3 | -0.01em |
| Segment label | 15px | 15px | 600 | 1 | 0 |
| Search input | 17px | 17px | 400 | 1.3 | -0.01em |
| Result row place text | 17px | 17px | 400 | 1.35 | -0.01em |
| Slot title in a card (Day (12pm), Night (12am)) | 15px | 15px | 600 | 1.3 | 0, `--muted` |
| Tile source name (`.reading-source`) | 15px | 15px | 600 | 1.3 | 0 |
| Tile date, "No reading yet" | 13px | 13px | 400 | 1.35 | 0, `--muted` |
| Tile `dt` / `dd` | 14px | 14px | 400 / 500 | 1.43 | 0 |

Fluid sizes in between use `clamp()`: page title `clamp(34px, 2.1vw + 25.6px, 48px)`; large temperature `clamp(44px, 1.8vw + 36.8px, 56px)`; subtitle and condition label `clamp(17px, 0.3vw + 16px, 19px)`.

The page title style is scoped (for example `#screen-shell > h2, #screen-settings .screen-head h2`, or a new `.page-title` class). The shared `.screen h2` stays as it is, so History is unchanged.

## Layout

Breakpoint and content column as in 0005: phone is ≤734px. The screen column is 980px wide with 22px side padding (16px on phone), with 40px padding on top and 80px at the bottom (24px and 64px on phone). Nothing uses `100vw`. Every flex or grid child that holds text gets `min-width: 0` and `overflow-wrap: anywhere`.

### Your cities (`#screen-shell`)

The DOM order stays: `#shell-msg`, title, count, search form, limit, search message, results, cities message, status, retry, list. One new decorative `<img>` goes just before `#cities-status` (see Imagery).

1. **`#shell-msg`** (when not empty): sits above the title, with 16px below it.
2. **Title band.** `h2#cities-title` uses the page title style, with no bottom margin. `#cities-count` sits 6px under it in the subtitle style, `--muted`, with 32px below it (24px on phone). Replace today's negative-margin rule. If the count is hidden, the title keeps the same 32px gap below it.
3. **Search** (`#city-search`), max width 680px, left-aligned in the column.
   - The visible label "Search for a city" stays above the field, in the 0005 label style, 8px gap.
   - The row is a flex row with an 8px gap: field (`flex: 1 1 auto; min-width: 0`), then the **Search** pill (`flex: none`, auto width).
   - The field is taller than 0005's: min height 52px, radius 14px, fill `--surface`, 1px `--border`, padding 12px 16px 12px 46px. The left padding leaves room for the magnifier.
   - Magnifier: 18px square, 16px from the field's left edge, vertically centered, colored `--muted`, `pointer-events: none`. Put the input in a non-focusable wrapper, for example `<span class="search-field">`, positioned relative. Draw the magnifier as that wrapper's `::before`, using `background: var(--muted)` and `mask: url(assets/search.svg) center / contain no-repeat` (with the `-webkit-` prefix too, as `chevron.svg` does). An input can't have a pseudo-element, so it needs the wrapper. The wrapper adds no focusable element and doesn't change Tab order. If the mask fails to load, the space stays empty.
   - **Search** pill: the 0005 primary pill, at the field's height (min height 52px), padding 0 24px.
   - At 400px, the column is 368px. "Search" is about 100px wide, so the field is about 260px. They stay on one row.
4. **Messages** (`#cities-limit`, `#search-msg`): in the column, max width 680px, 12px above and below. They use the 0005 message style.
5. **Results** (`#city-results`): one grouped card, max width 680px, 12px below the search. The card style is `--surface`, radius 18px, the 0005 shadow, a `--card-line` border, and `overflow: hidden`. There is no padding on the list itself.
   - Row (`.city-result`): flex, `align-items: center`, gap 12px, padding 14px 20px, min height 56px. The place text takes `flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere`, 17px. The **Add** pill is the 0005 compact secondary pill, `flex: none`, and stays on the right of the row, vertically centered even when the name wraps to two or three lines.
   - Divider: 1px `--hairline` between rows, inset 20px from the left (for example, a `box-shadow` or `border-top` on `li + li`, with the inset given by a pseudo-element or `background` line). It isn't there above the first row or below the last. A full-width hairline is an acceptable simpler choice.
   - 24px below the results card.
6. **`#cities-msg`, loading and error** (`#cities-status`, `#cities-retry`): plain text in the column, no card, left-aligned, 0005 empty/loading style (17px `--muted`, 24px above and below). **Try again** is a compact secondary pill directly below the error.
7. **Empty state**: the illustration and the status text are centered as a group, with no card. The illustration is 240×160 (the same on phone and desktop), centered, 40px top margin, 20px gap below. Under it, `#cities-status` is centered, 17px `--muted`, max width 30em. The centering only applies in the empty state. Suggested: the JS that already sets the status class adds `cities-empty` to `#cities-status` in that state, and the image is shown and hidden in the same place.
8. **City list** (`#city-list`): a one-column grid, 16px gap (12px on phone), full column width (980px). It doesn't go to two columns. Each card needs the width for two slots side by side.

#### City card (`.city-card`)

`--surface`, radius 22px (a bit softer than the 18px 0005 cards, which marks these out as hero cards), padding 24px 28px 28px desktop, 20px 16px 16px phone. 0005 shadow and `--card-line` border.

1. **Head** (`.city-head`): unchanged layout. Name (`h3.city-name`, 0005 `h3` style) and timezone (14px `--muted`) on the left, **History** and **Remove** compact pills on the right (they wrap under each other if needed). 4px between name and timezone. 16px below the head (12px on phone). The remove-error message sits under the head as today.
2. **Summary** (new, only when the city has readings). It is a block with three parts:
   - A row with `display: flex; flex-wrap: wrap; align-items: center`, gap 8px 20px.
     - **Large temperature**: large temperature style, `--text`, `white-space: nowrap`. "–" when missing.
     - **Condition**: an inline-flex group with the glyph (40×40 desktop, 32×32 phone) and the label 10px apart, `align-items: center`. The whole group is left out (not just emptied) when there's no condition, so no gap is left.
   - **Caption** 8px below the row, 14px `--muted`, `overflow-wrap: anywhere`.
   - 20px below the summary, a 1px `--hairline` line across the card's content width, then 20px before the detail (16px and 16px on phone).
   - Suggested markup: a `<div class="city-summary">` with `<p class="city-temp">`, a `<p class="city-cond">` that holds the `<img>` and the label text, and `<p class="city-caption">`. These are paragraphs, not headings. Without the glyph image, the label still reads alone.
   - **Caption wording**. The spec's final text wins. Suggested:
     - both sources: "Average of Open-Meteo and MET Norway · Day (12pm), Oct 24"
     - one source: "Open-Meteo · Day (12pm), Oct 24", or "MET Norway · Night (12am), Oct 24"
     - The slot words match the slot titles, "Day (12pm)" and "Night (12am)". The date uses the same `day()` format as the tiles. The separator is a middle dot with spaces.
   - At 400px: "−12°F" at 44px is about 120px wide, and "Partly cloudy" with a 32px glyph is about 150px. Both fit on one row in the 336px card content. If they don't, the condition wraps under the temperature. Nothing is clipped.
3. **Detail** (`.slots`): kept as is, two slot groups, Day (12pm) then Night (12am).
   - Desktop: the two slots sit side by side (the existing `repeat(auto-fit, minmax(min(100%, 380px), 1fr))`, gap 20px). With the 980px column and 28px card padding, each slot is about 450px.
   - Slot title: 15px 600 `--muted`, 10px below it.
   - Inside a slot, the two `.reading` tiles use `repeat(auto-fit, minmax(min(100%, 168px), 1fr))` with an 8px gap. On desktop, Open-Meteo and MET Norway sit side by side. At 400px the card content is 336px, two tiles would be 164px each (under 168px), so they stack. From about 430px they sit side by side. That is the spec's "if they fit, or stack".
   - Slots stack at phone width with a 16px gap.
4. **Tile** (`.reading`), the compact form: `--bg`, radius 14px, padding 12px 14px.
   - Top line: source name (`h5.reading-source`, 15px 600) on the left, and the date (`p.reading-date`, 13px `--muted`) on the right, on the same baseline. Make the tile a two-column grid (`grid-template-columns: 1fr auto`, column gap 8px). The `dl` and "No reading yet" span both columns. If the date doesn't fit, it wraps under the name (use `minmax(0, 1fr) auto` and let the date wrap).
   - 8px below the top line, the `dl` stays a two-column grid: `dt` in `--muted` on the left, `dd` on the right, weight 500, `--text`, tabular-nums, row gap 4px. Order stays Temperature, Feels like, Humidity, Wind, Precipitation.
   - "No reading yet": 13px `--muted`, spans the row, with 8px above it.
5. **No readings**: no summary and no hairline. The existing "No readings yet. First reading at 12am/12pm local time." stays as a `.lede` paragraph, 15px `--muted`, directly under the head.

### Settings (`#screen-settings`)

The screen stops being one card. Drop the `card` class from the section (or override it). It becomes an ordinary `.screen` with a centered inner column: max width 680px, `margin-inline: auto`. In practice the section's own `max-width` is 680px plus the 22px/16px side padding. The page background shows between the cards.

1. **Title band** (`.screen-head`): flex row, `align-items: center`, `justify-content: space-between`, `flex-wrap: wrap`, gap 8px 16px, 28px below it (20px on phone). `h2#settings-title` in the page title style. **Back** (`#settings-back`) is the 0005 compact secondary pill, `flex: none`. At 400px, "Settings" at 34px is about 140px and Back is about 64px, so they stay on one row. If they wrap, Back goes under the heading, left-aligned.
2. **Cards**, in DOM order, 20px apart (16px on phone). Each card is `--surface`, radius 18px, padding 24px (20px on phone), with the 0005 shadow and `--card-line` border. The heading at the top of each card uses the Settings card heading style with 16px below it. Remove the 0005 rule that put a top border and 32px/24px space above `.notify > h3` and the password `h3`. The cards now separate the sections.
   1. **Temperature unit**: the `fieldset.units` *is* the card (apply the card style to the fieldset; reset its default border and padding, then set the card's). Its `legend` is the card heading. A fieldset legend sits on the top border by default, so make it `float: left; width: 100%` (the usual way to keep a legend inside the box), or give it `padding: 0` with a matching top padding on the fieldset. Below it is the segmented control, then `#unit-msg`.
   2. **Email notifications**: `section#notify` is the card, with `h3#notify-title` as its heading.
   3. **Change password**: `form#password-form` is the card, with its `h3` as its heading. The fields and the full-width **Save** pill stay as today.

#### Segmented control (inside the unit card)

- Track: the `fieldset`'s two `label`s, wrapped in a non-semantic `<div class="segmented">` if needed. It is an `inline-grid` with two equal columns, width 200px (each segment 97px), height 44px, padding 3px, radius 980px, fill `--seg-track`, 1px `--border` edge. It doesn't stretch to the card width.
- Segment: each existing `label` (it still wraps its radio) is a segment. It is centered text "°C" / "°F", segment label style, `--text`, radius 980px, height 36px, `position: relative`, `cursor: pointer`.
- Radio: stays a native `input[type=radio][name=unit]` inside the label. Hide it visually with the `.visually-hidden` technique (absolute, 1px, clipped), **not** `display:none`, `hidden` or `visibility:hidden`. Tab and the arrow keys still reach and move it.
- Checked: `label:has(input:checked)` gets `--btn-bg` fill and `--on-accent` text. The selector `:has` is already used in `style.css`.
- Focus: `label:has(input:focus-visible)` gets the 2px `--focus` outline with a 2px offset and pill radius. Use 2px, not 0005's 3px, so the ring clears the 3px track padding and still shows outside the track.
- `#unit-msg` ("Saved"): sits to the right of the track on the same line, 12px gap, vertically centered, in the 0005 `.msg-ok` style with no bottom margin. If the card is too narrow, it wraps under the track with an 8px gap. Make the fieldset's content a flex row with wrap: the legend sits above it, outside the row, as described above. When the message is empty, it takes no space (`.msg:empty` stays hidden).

#### Email notifications card

Visual sub-groups, in DOM order, divided by 1px `--hairline` lines. Each line has 20px of space above and below it (16px on phone). No line comes before group 1 (it follows the card heading). The developer may add non-semantic `<div>` wrappers inside the existing form and fieldsets to draw the lines, as long as order, ids, roles and the fieldset/legend structure stay the same. A `border-top` with `padding-top` on the first element of each group also works.

The status line (`#notify-status`), **Try again** and the not-allowed notice (`#notify-denied`) sit straight under the heading, before any group, in the 0005 empty/loading style (17px `--muted`, 0 top margin, 16px bottom), with Try again as a compact pill under the message.

1. **Main checkbox** (`#notify-enabled` row).
2. **Send time and timezone**: `.notify-row` (two fields side by side, wrapping to stacked under about 330px of card content), the device-timezone hint box, and the hint "The send time applies to both digests."
3. **Digests**: Daily digest, then the weekly row (checkbox and Day select side by side, wrapping).
4. **Cities in digests**: `fieldset#notify-cities`, legend in the 0005 label style, checkbox rows 12px apart.
5. **Save**: `#notify-msg`, then the full-width **Save notifications** primary pill.
6. **Range alerts**: `h4#alerts-title` (sub-group heading style, 0 top margin, 12px below), `#alerts-none`, then:
   - **Alert list** (`#alert-list`): rows separated by 1px `--hairline`, with a hairline above the first row and below the last. Row padding 12px 0, flex, wrap, gap 8px 12px. Text `flex: 1 1 200px; min-width: 0; overflow-wrap: anywhere`, 15px. **Delete** is the compact secondary pill, `flex: none`, on the right. 20px below the list.
   - **Add form**: legend "Add an alert" in the label style, the existing auto-fit grid (min column 170px, so two columns in the 680px card and one at 400px), then the limit and messages, then **Add alert**. It stays a full-width 44px secondary pill (the existing `form .btn-secondary` rule).

Checkbox rows (`.check`) keep the native 20px checkbox with `accent-color`, and get a 44px min height (`align-items: center`), so the tap target is big enough. Inside the card, fields use the `--bg` fill as in 0005.

#### Phone, 400px

- The column is 368px, a card's content is 328px (20px padding). Selects and inputs are `width: 100%`. The notify row and alert grid stack. Alert text wraps. Nothing is fixed wider than 328px, except the 200px segmented track.
- No horizontal scroll with notifications on and two alerts.

## Imagery

All files are original hand-written SVG in `assets/`. Each has a `viewBox`, no scripts, no external references (the only `href`s point to `#ids` inside the same file), and is under 3 KB.

**Dark-mode approach for glyphs:** glyphs are `<img>` files with fixed colors. Each shape has a mid-tone fill and a darker outline. The outline reaches 3:1 on white and on `#1c1c1e`, and the fill carries the color on dark cards. One file works in both themes and with `data-theme`. No dark variants. The empty-state illustration is a self-contained gradient tile, like the 0005 feature art, so it reads on `--bg` in both themes. The magnifier is a CSS mask, so it takes `--muted` in each theme.

### Condition glyphs

`viewBox="0 0 32 32"`, drawn on a 32 grid with 2px strokes (about 1.5px at 24px, 2.5px at 40px). Each file has a `<title>` for direct viewing, but on the page every glyph is `<img src="assets/wx-….svg" alt="" width="40" height="40">`, shown at 40px desktop and 32px phone (CSS `width`/`height`, `flex: none`, `display: block`). The label next to it names the condition, so the glyph is decorative. Not focusable.

| File | Condition labels (from `Wx.condition`) | Slot |
|---|---|---|
| `assets/wx-clear-day.svg` | Clear, Mostly clear | Day |
| `assets/wx-clear-night.svg` | Clear, Mostly clear | Night |
| `assets/wx-partly-cloudy-day.svg` | Partly cloudy | Day |
| `assets/wx-partly-cloudy-night.svg` | Partly cloudy | Night |
| `assets/wx-cloudy.svg` | Cloudy | both |
| `assets/wx-fog.svg` | Fog | both |
| `assets/wx-rain.svg` | Rain, Drizzle | both |
| `assets/wx-snow.svg` | Snow, Sleet | both |
| `assets/wx-thunderstorm.svg` | Thunderstorm | both |

"Day" and "Night" mean the slot of the reading shown in the summary. Any other label, or "–", shows no glyph and no label.

Glyph colors (fixed in the files) and their contrast on the card:

| Color | Role | On `#ffffff` | On `#1c1c1e` |
|---|---|---|---|
| `#D97706` | Sun outline and rays, bolt outline | 3.19 | 5.3 |
| `#FFC21A` | Sun disk and bolt fill | fill only | fill only |
| `#B97F00` | Moon and star outline | 3.4 | 4.9 |
| `#FFD25A` | Moon fill | fill only | fill only |
| `#5E6B7A` | Cloud outline, fog lines | 5.4 | 3.1 |
| `#D5DCE4` / `#A3AFBD` | Cloud fill, front / back | fill only | fill only |
| `#2F80ED` | Rain streaks | 3.9 | 4.4 |
| `#3D8FD6` | Snowflakes | 3.4 | 4.9 |

If a glyph fails to load, its `width`/`height` reserve a 40px (32px phone) box and the label still reads beside it.

### Empty-cities illustration

- `assets/empty-cities.svg`, `viewBox="0 0 360 240"`. On the page: `<img class="cities-empty-art" src="assets/empty-cities.svg" alt="" width="240" height="160">`, placed just before `#cities-status`, shown at 240×160, `display: block`, `margin: 40px auto 20px`, `height: auto`, `max-width: 100%`.
- Decorative (`alt=""`). The status text says what it means. Not focusable, not in a link.
- Content: the 0005 feature art style. A blue gradient tile (`#3E7BFA` to `#62C6F0`, the same as `feature-cities.svg`), radius 28. On it, a white list card with three empty dashed rows (the first has a small "+" disc), a large white magnifier overlapping the card's lower right, and a soft sun with a white cloud in the top right.
- Dark mode: same file. The tile carries its own background.
- Show only in the empty state. It has the `hidden` attribute at load, and the JS removes it only when the list is ready and has no cities. It goes back to `hidden` while loading, on error, and once any city exists.

### Search magnifier

- `assets/search.svg`, `viewBox="0 0 16 16"`, black strokes, used **only** as a CSS mask (see Layout, Search), so it takes `--muted` in both themes. Screen readers never see it. No `<img>`.

## Motion

- Only the 0005 transitions: `background-color`, `color` and `border-color` over 150ms `ease` on buttons, links and inputs. The segment labels get the same 150ms `background-color` and `color` transition, so the checked fill fades in, which counts as a 0005 colour transition.
- No movement: the segment doesn't slide, cards and the summary don't animate, and the empty illustration doesn't fade in.
- The existing `@media (prefers-reduced-motion: reduce)` rule (`transition: none; animation: none` on everything) covers all of it.

## States

**Search field**: as 0005 inputs. Hover border `--text`. Focus-visible border `--focus` plus the 2px `--focus` outline, offset 1px (the ring follows the 14px radius). Disabled opacity 0.5. The magnifier doesn't change on hover or focus. The "Searching…" button state uses the 0005 disabled pill (opacity 0.45).

**Search messages**: short query, no places, failed and limit use the 0005 `.msg-error` / `.msg-ok` styles, in the column under the search, 12px above and below.

**Result row**: no hover fill on the row itself. Only the **Add** pill is interactive.
- **Add**: 0005 compact secondary pill, with hover fill `--badge-bg` and the 0005 focus ring.
- **Adding…** and **Added**: the disabled pill (opacity 0.45, no hover). The width may change with the text. The place name absorbs it.

**City card pills** (History, Remove): unchanged 0005 compact secondary. Remove disabled while removing (opacity 0.45). Focus after Remove moves as today. The ring is the 0005 3px-offset ring, which fits inside the 22px card padding.

**Summary**: static, with no hover or focus. "–" in the temperature style when there's no temperature. The condition group is left out when there's no condition. With no readings, there's no summary.

**Segmented control**:
- Unchecked: transparent on `--seg-track`, `--text`.
- Hover (unchecked only): `--seg-hover` fill.
- Checked: `--btn-bg` fill, `--on-accent` text, no hover change.
- Focus-visible (keyboard, on the radio): 2px `--focus` ring around that segment, offset 2px.
- Disabled (not used today, defined for safety): `fieldset:disabled` makes the track opacity 0.45, cursor default, no hover.
- Saved: `#unit-msg` in `--ok` beside the track.

**Settings checkboxes**: native, 20px, `accent-color: var(--accent)`, 0005 focus ring. In a disabled fieldset, the labels are `--muted` and the cursor is the default, as today. The sub-group lines stay visible when disabled.

**Settings selects and inputs**: 0005 inputs with `--bg` fill. Invalid fields (`aria-invalid="true"`) get a `--danger` border, with `.field-error` text 14px `--danger` under them.

**Alert rows**: **Delete** is the compact secondary pill, disabled at opacity 0.45 while deleting. The row has no hover.

**Empty and loading**:
- Cities loading: "Loading your cities…" left in the column, `--muted`, no illustration.
- Cities error: `.msg-error` text plus **Try again**, no illustration.
- Cities empty: centered illustration plus the centered status text.
- Notifications loading or error: under the card heading, as described in Layout.

**Focus everywhere**: the 0005 `:focus-visible` ring (2px `--focus`, offset 3px) in both themes. The only exception is the segment, at offset 2px. Headings with `tabindex="-1"` stay without a ring, as in 0005. No image or glyph is focusable.
