# 0007 History redesign

## Request

> "ok start it" (owner, 2026-10-30, replying to the proposed next step: "the History page redesign (charts and table)")

Background: spec 0006 left History out of scope, with "Its own redesign is a separate follow-up spec (owner decision)."

Fixed decisions (orchestrator, 2026-10-30):
- History is restyled and re-laid out in the 0005/0006 Apple-style language:
  - a large title band with the city name, with **Back** on its row
  - the controls (period, source, custom dates) in one clean grouped card, with segmented controls where the native control allows, built on native radios or selects as in 0006
  - summary stat tiles above the charts, computed from the data already loaded, with no new requests
  - chart cards with titles and a legend, using the existing `--chart-*` tokens (the designer may refresh their values)
  - the table in its own card with a sticky date column, and the pager below it
- Behavior, data, requests, hash routing and CSV stay out of scope, as in 0003. Element ids, `data-*` attributes and the keyboard and accessibility contract stay the same, except for the Source control described below. Control order changes only where this spec says so.
- Chart.js 4.5.1 only. No new libraries and no build step.
- Still required: about 400px with no sideways scroll (the table may scroll sideways inside its own card), keyboard only, both dark blocks, reduced motion, and `tests/run.sh` PASS.

Fixed decisions (owner, 2026-10-30):
1. **Stat tiles:** the four tiles Day high, Night low, Day average and Night average, as defined in *Behavior*.
2. **Source becomes a segmented control** built on three native radios inside a fieldset with the legend "Source", like the 0006 °C/°F control.
   - The visible texts stay "Average", "Open-Meteo" and "MET Norway".
   - The radio values stay `avg`, `open-meteo` and `met-norway`.
   - Hash routing keeps working both ways: the hash sets the checked radio, and changing the radio updates the hash.
   - Period stays a `<select>`.
   - The existing History checks that drive the Source select are updated on purpose (see *Tests*).

## Goal

A visitor who opens a city's history sees it in the same calm look as Your cities and Settings: a big city title, one tidy controls card with a segmented Source switch, a row of headline numbers for the period, then clean chart and table cards.

## Scope

In:
- **Title band:** the city name (`h2#history-title`) in the 0006 page-title style, the timezone (`#history-tz`) as a muted subtitle under it, and **Back to cities** (`#history-back`) as a compact pill on the same row.
- **Controls card:** `form#history-controls` becomes one grouped card holding Period (a select), Source (a segmented radio group) with its hint, and the Custom range panel.
- **Stat tiles (new):** a row of four tiles at the top of `#history-content`, above the charts.
- **Chart cards:** `#history-temp-card` and `#history-avg-card` restyled, each with its `h3` title and a legend.
- **Table card:** the table title (`h3#history-table-title`), the `.table-wrap` scroller and the precipitation note together in one card. The pager (`.history-pager`) sits below the card.
- **States** (loading, error with Try again, city gone, empty, charts unavailable) restyled in the 0006 manner: plain text in the column, not inside a card.
- **Styles** in `style.css`, with new tokens only if needed, each in `:root` and both dark blocks. A `designer` brief at `docs/design/0007-history-redesign.md` is expected, as for 0005 and 0006.
- **`history.js`:** the stat tiles (computing and rendering them), the Source radio group (reading and setting it in place of the select), and any markup hooks the new layout needs.
- **Tests:** a new "History redesign" group, plus the deliberate updates listed under *Tests*.

Out:
- Any change to behavior or data, including:
  - the Supabase queries, paging, caching and sequence handling
  - hash format, routing, defaults (30 days, Average) and the hash corrections
  - period lengths, custom-range rules and their messages
  - the average-of-sources rule and condition labels
  - table columns, row order, 31 rows per page, the pager text
  - chart datasets, labels, the averages chart rules, `aria-label` summaries
  - every message and its wording
  - focus handling (heading focused on open, focus back to the card's History button)
- Turning `#history-period` into radios. It keeps its 5 options, including Custom range.
- CSV export, new charts (spread, source comparison, precipitation, heatmap), forecasts, any new request.
- Your cities, Settings, Landing, auth screens, header and footer. Shared rules they use (`.screen h2`, `.btn-secondary`, inputs, `.card`, `.segmented`, messages) must not change in a way that alters those screens. History may reuse `.segmented` and extend it, for example with a three-column modifier class.
- New JS libraries, Chart.js plugins, icon fonts, a build step, new `<script>` tags or external URLs.

## Behavior

**Title band**
- `h2#history-title` keeps its text (the place, "Paris, Île-de-France, France", or "History" before the city loads) and keeps `tabindex="-1"` and focus on open. It uses the 0006 page-title style (about 34px phone, 48px desktop), reached by a History-scoped selector or a shared `.page-title` class. The shared `.screen h2` doesn't change.
- `#history-tz` sits under the title in the muted subtitle style.
- `#history-back` keeps its text "Back to cities" and comes after the heading in DOM and Tab order. It sits on the title row as the compact secondary pill, aligned to the title's first line. At about 400px it may wrap under the title, but it never overflows. A long place name wraps (`overflow-wrap: anywhere`) and is never clipped.

**Controls card**
- One card (`--surface`, the 0006 card radius, shadow and `--card-line` border) holding, in DOM and Tab order: Period, Source, the source hint, then the Custom range panel (From, To, Apply, range message). This is today's order.
- **Period:** stays `select#history-period`, with the same option values and texts. It is restyled as a pill-shaped select that matches the 0006 inputs.
- **Source** markup:
  - `fieldset#history-source`, with `legend` "Source". The id moves from the select to this fieldset, so tests and styles can still find it.
  - Inside it are three native `input[type=radio][name="history-source"]`, with values `avg`, `open-meteo` and `met-norway`, in that order. Each is wrapped in a `label` with the text "Average", "Open-Meteo" or "MET Norway". The radios sit inside a `.segmented` track, as in 0006.
  - The fieldset carries `aria-describedby="history-source-hint"`, which today is on the select.
  - The radios may be visually hidden, but must not use `display:none`, `hidden` or `visibility:hidden`.
  - The checked segment has the 0006 checked look (`--btn-bg` fill, `--on-accent` text). The focused segment shows the `--focus` ring.
  - The track fits about 400px: all three segments stay on one row, the track may shrink to the card width, and labels never clip. "MET Norway" may drop to a smaller size, but it doesn't wrap.
- **Source** behavior:
  - On every render of the controls, the radio whose value equals the route's source is checked. That includes when the view opens, on `hashchange`, and after a hash correction (an invalid source becomes `avg`). Exactly one radio is checked whenever the controls show.
  - A `change` on any radio calls the same `go(route.period, value)` that the select's change did. That updates the hash to `#history/<id>/<period>/<value>` and re-renders from memory with no request.
  - Browser Back and Forward move the checked radio along with the hash.
  - `#history-source-hint` ("Average of the sources available for each reading.") still shows only while Average is checked.
  - Keyboard: the group is one Tab stop, on the checked radio. The arrow keys move the selection (and so the hash), as native radios do.
- **Layout:**
  - Desktop: Period and Source sit side by side in a toolbar row, with the hint under Source. When Custom range is open, its panel sits under the row, separated by a `--hairline` line.
  - About 400px: Period and Source stack, each full width.
- From and To stay `<input type="date">`. Apply stays a compact secondary pill (`#history-apply`, `type="submit"`).
- When the view is in the "gone" state, the whole card is hidden, as today.

**Status lines**
- `#history-status` ("Loading history…"), `#history-error` with `#history-retry`, `#history-gone` and `#history-empty` sit in the page column below the controls card, as plain text in the 0006 empty/loading style (17px `--muted`, error in `.msg-error`). Try again is a compact pill under the error. Their text, roles and when they show don't change.

**Stat tiles (new)**
- A list (`ul#history-stats`, with `aria-label` "Period summary") at the top of `#history-content`, before `.history-charts`. It shows and hides with `#history-content`, so it never shows while loading, on error, when the city is gone, or when the period has no readings.
- Each tile (`li`) has a short label and a large value, plus an optional small caption, all as plain text. Tiles aren't focusable, aren't headings and aren't a live region.
- **Tiles**, in this order:
  1. **Day high**: the highest day (12pm) temperature in the period. Caption: its date (`Wx.fmt.day`). On a tie, the newest date.
  2. **Night low**: the lowest night (12am) temperature. Caption: its date, newest on a tie.
  3. **Day average**: the mean of the day temperatures that have a value. Caption: "N days", the count of dates with a day value ("1 day" for one).
  4. **Night average**: the same for night temperatures.
- **Data:** the selected source (Average, Open-Meteo or MET Norway), using the same per-date `value()` the table and charts use (so Average is the mean of the available sources). It covers the whole loaded period, not just the table page on show. It makes no request.
- **Units and rounding:** compute in °C, then format once with `Wx.fmt.temp`, so tiles round like the table and cards.
- **Missing:** a slot with no values in the period shows "–" as the value and no caption.
- **Updates:** a unit change, source change or period change re-renders the tiles from memory, together with the table and charts. Paging the table doesn't change them.
- **Layout:** desktop shows the 4 tiles in one row. About 400px shows them 2 by 2. The tiles use the 0006 tile look (`--bg` or `--surface` per the designer), with the value in a large tabular-nums style. Values and captions wrap rather than clip.

**Chart cards**
- `#history-charts-msg`, `#history-temp-card` and `#history-avg-card` keep their order, ids, `h3` ids and texts ("Day and night temperature", "Weekly averages" / "Monthly averages"), their show and hide rules, and the canvases' `role="img"` and `aria-label`.
- Cards use the 0006 card style. The chart box stays about 240px tall on phone and may be taller on desktop (up to about 320px).
- **Legend:** each chart shows a legend naming "Day (12pm)" and "Night (12am)", with day solid and night dashed so they differ without color. Use Chart.js's built-in legend (configured in `options.plugins.legend`) or an HTML legend inside the card. An HTML legend must be `aria-hidden="true"` or plain text, and must not duplicate the dataset labels in the config.
- **Colors:** dataset, grid and tick colors still come from `--chart-day`, `--chart-night`, `--chart-grid` and `--chart-text`, read when a chart is built. The designer may change those tokens' values in `:root` and both dark blocks, keeping day and night lines at least 3:1 against `--surface` in both themes.
- **Motion:** Chart.js animation stays off (`animation: false`, as today), so it is off under `prefers-reduced-motion: reduce` too. If the designer wants chart animation, it must be on only under `prefers-reduced-motion: no-preference`, checked when a chart is built.
- Charts still rebuild on a color-scheme change and on `data-theme` changes.

**Table card**
- One card holds `h3#history-table-title` ("Daily readings"), the `.table-wrap` (keeping `role="region"`, `aria-label="History table"`, `tabindex="0"`) and the precipitation note, in that order.
- The table scrolls sideways inside the card only. The Date column stays sticky with an opaque background matching the card in both themes, so scrolled cells never show through it.
- The two-level header, the Day (12pm) and Night (12am) group dividers and the row lines use `--hairline` or `--chart-grid`. Numbers stay tabular.
- `.table-wrap:focus-visible` shows the `--focus` ring fully, not clipped by the card's rounded corners or `overflow`.
- The pager sits below the card: **Newer** (left), "Days 1–31 of 90" (center), **Older** (right), as compact pills. Disabled pills use the 0005 disabled look. At about 400px all three stay on one row if they fit, otherwise the info wraps under the buttons. Nothing overflows.

**Phone width (about 400px)**
- Take a long place name, Custom range open with a range error, the three Source segments, 4 tiles, both charts (12 months) and the table. The page has no sideways scroll. Only `.table-wrap` scrolls sideways.

**Keyboard only**
- Tab order: Back, Period, Source (one stop, on the checked radio), then From, To and Apply when open, Try again when shown, the table region, Newer, Older. Inside Source, the arrow keys switch the source. The tiles and chart cards add no stops.
- Every focusable element shows the `--focus` ring in both themes.

**Dark mode**
- Every new color is a `:root` token, defined in both dark blocks. Text is at least 4.5:1, and large values, borders, lines and segment edges at least 3:1, in both themes.

**Network and API replies**
- No new requests. Slow, failed, empty and not-followed replies show today's messages in the new layout. A failed `window.Chart` load shows "Charts are unavailable right now." in the charts area, while the tiles and table still show.

**Tests** (deliberate updates to existing checks in `tests/tests.js`)
- History group, check **"2 MET Norway selected"**: it read `$("history-source").value`. It now checks that `#history-source input[name="history-source"][value="met-norway"]` is checked.
- History group, check 7 **"7 source change rebuilds with that source's values"**: the setup set `$("history-source").value = "open-meteo"` and fired `change` on the select. It now checks the `open-meteo` radio and fires a bubbling `change` on it. The assertion is unchanged, and so is **"7 no Supabase calls from unit or source change"**.
- No other existing check reads or drives the Source select. History regressions, the History checks 1, 3–6, 8, 10 and 11, and Landing check 13 stay unchanged.

## Acceptance criteria

1. Every check that existed before this spec passes. The only edits are the two Source updates listed under *Tests* ("2 MET Norway selected" and the check 7 source-change setup), and `tests/run.sh` prints `RESULT: PASS`. `index.html` keeps the same `<script>` tags (Chart.js 4.5.1 pinned) and adds no external URL.
2. On History, `#history-title` shows the place in the page-title style (computed font size at least 30px at 400px), with `#history-tz` under it and `#history-back` ("Back to cities") on the title row at 1280px. The title still gets focus on open, and Back still returns focus to the card's History button.
3. `#history-controls` is shown as one card containing `select#history-period`, `fieldset#history-source`, `#history-source-hint` and `#history-custom`, in that DOM order.
   - The Period select keeps its option values and texts.
   - `fieldset#history-source` has the legend "Source" and three radios named `history-source`, with values `avg`, `open-meteo` and `met-norway` and labels "Average", "Open-Meteo" and "MET Norway", in that order.
   - The radios aren't `display:none` or `hidden`.
4. With `#history/5/7d/avg` and the 0003 FIX rows, `#history-stats` shows 4 tiles in order: Day high "21°C" with caption "Oct 27", Night low "8°C" with "Oct 24", Day average "20°C" with "2 days", Night average "10°C" with "2 days".
5. These checks start from check 4's state:
   - Switching to °F makes Day high read "70°F".
   - Separately, in °C, checking the `open-meteo` radio sets the hash to `#history/5/7d/open-meteo`, makes Day high read "20°C", and hides `#history-source-hint`. Neither change makes a Supabase call.
   - Setting the hash to `#history/5/7d/met-norway` checks the `met-norway` radio. Setting it to `#history/5/7d/xyz` corrects it to `#history/5/7d/avg` and checks `avg`.
6. With rows that have only day values, the Night low and Night average tiles show "–" with no caption. On a 90-day period, pressing Older and then Newer doesn't change any tile value.
7. `#history-stats` is hidden while loading, on a readings error, when the city is gone, and in the empty state. With `window.Chart` undefined, the tiles and the table show along with "Charts are unavailable right now."
8. Each chart card shows its `h3` and a legend for "Day (12pm)" (solid) and "Night (12am)" (dashed). Dataset border colors still equal the computed `--chart-day` and `--chart-night`, and every chart config has `animation: false` (or animation only when reduced motion isn't requested).
9. `h3#history-table-title`, `.table-wrap` and the precipitation note are inside one card, with `.history-pager` after that card. Scrolling `.table-wrap` sideways keeps the Date column visible with an opaque background.
10. Take a 400px viewport with a long place name, Custom range open with an error, a 12-month period, both charts and the table. `document.documentElement.scrollWidth` is at most the viewport width, the three Source segments sit on one row without clipped text, and only `.table-wrap` scrolls sideways.
11. Keyboard only:
    - Tab order is Back, Period, Source (one stop, on the checked radio), From, To and Apply when open, Try again when shown, the table region, Newer, Older.
    - Inside Source, the arrow keys move the checked radio, and the hash follows.
    - Every stop shows a visible focus ring, including the focused segment and `.table-wrap`.
    - No tile or chart card takes focus.
12. With OS dark mode, and separately with `data-theme="dark"`, the controls card (including the Source segments), tiles, chart cards and table card are dark with readable text, and the charts are rebuilt with the dark `--chart-*` values. Every color token is defined in `:root` and both dark blocks.

## Open questions

