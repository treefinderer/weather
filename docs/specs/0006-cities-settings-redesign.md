# 0006 Your cities and Settings redesign

## Request

> "all good. Now when i click Your cities, that page needs to be redesigned as well. Same for settings page. Please do"

Fixed decisions (orchestrator, 2026-10-30):
- Your cities and Settings are redesigned to match the 0005 landing: a large page title band, generous spacing, grouped cards in the style of iOS Settings, pill buttons, and a segmented control for °C/°F.
- City cards get a large temperature for the latest reading, a condition label with a small weather glyph, and both sources shown compactly. There is an illustrated empty state and a clearer search.
- Behavior, data, element ids and the keyboard and accessibility contract stay the same. Control order changes only where this spec says so. It doesn't say so anywhere, so control order stays the same.
- The `designer` agent may add SVGs: condition glyphs and an empty-state illustration. No new libraries and no build step.

Fixed decisions (owner, 2026-10-30):
- **History** is not part of this spec. It only picks up changes to shared styles, and its redesign gets a separate follow-up spec.
- **Large temperature:** the average of both sources' `temperature_c` for the newest date and slot. If only one source has a value there, that source's value is used.
- **Condition label and glyph:** Open-Meteo's code when it maps to a condition, otherwise MET Norway's.
- **Caption:** names the source or sources used, then the slot and the reading's date (`Wx.fmt.day`, owner 2026-10-30), for example "Average of Open-Meteo and MET Norway · Day (12pm), Oct 24", or "MET Norway · Night (12am), Oct 24" when only one source has data.

## Goal

Signed-in visitors get a Your cities page that reads at a glance: a large temperature and a condition for each city, with both sources' details close at hand. They also get a Settings page laid out as calm grouped sections. Both pages look like the Weather Insights landing page.

## Scope

In:
- **Your cities (`#screen-shell`)**
  - **Title band:** a large "Your cities" heading with the count line ("3 of 10 cities") under it as a subtitle.
  - **Search:** a larger search field with a decorative magnifier glyph and the **Search** pill. Results show as one grouped card of rows, with a hairline between rows and the **Add** pill at the end of each row.
  - **City cards**, top to bottom:
    1. Head: city name, timezone, and the **History** and **Remove** pills. These are unchanged.
    2. New summary: a large average temperature, a condition glyph and label, and a small caption naming the source or sources and the reading.
    3. Detail: the existing per-slot, per-source readings in a compact form.
  - **Empty state:** an illustration above the existing "No cities yet" text.
- **Settings (`#screen-settings`)**
  - **Title band:** a large "Settings" heading, with **Back** beside it on the same row.
  - **Grouped cards, in today's order:**
    1. Temperature unit, as a segmented control
    2. Email notifications, with digests and range alerts in their own sub-groups
    3. Change password
  - The screen stops being one big card. Instead it shows separate cards on the page background, in a centered column about 680px wide.
- **Data:** `cities.js` adds `weather_code` to the columns it reads from `latest_readings`. The view already exposes that column, so no migration is needed.
- **New pictures** in `assets/` from the `designer`:
  - Condition glyphs: clear, clear night, partly cloudy, partly cloudy night, cloudy, fog, rain (drizzle uses rain), snow (sleet uses snow), thunderstorm
  - An empty-cities illustration
  - Optionally a magnifier glyph
- **Styles** in `style.css`, with new tokens if they are needed.
- **Tests:** new checks for this spec. Existing checks are only updated where a criterion below requires it.

Out:
- **History screen.** It changes only through shared styles, such as tokens, pills and inputs. Its own redesign is a separate follow-up spec (owner decision).
- **Auth screens, Landing, the header and the footer.**
- **Any change to behavior or data,** including:
  - messages and their wording
  - ids
  - control order
  - focus handling
  - Supabase calls (apart from the extra `weather_code` column)
  - unit conversion
  - the 10-city and 20-alert limits
- **Turning checkboxes into switch widgets,** or changing any control's role or type.
- **Forecasts,** live "current" weather, or any new API call.
- **New JS libraries,** icon fonts and a build step.

## Behavior

**Your cities: title and search**
- The `h2#cities-title` keeps its text "Your cities" and keeps receiving focus when the screen opens. `#cities-count` keeps its text format.
- The search field keeps:
  - its visible label "Search for a city"
  - `type="search"`
  - Enter to submit
  - "Searching…" on the button while a search runs
  - all of today's messages: short query, no places found, search failed, limit
- The magnifier glyph is decorative (`alt=""` or `aria-hidden="true"`) and is never focusable.
- Each result row shows the place text and one **Add** / **Adding…** / **Added** pill, with the same states and accessible names as today. On a phone, a long place name wraps and the pill stays on the row's right side, or drops under the name. It never overflows.

**Your cities: city card summary**
- **Which reading:** the newest date and slot among the city's latest rows, from either source. It is ordered by `local_date`, and on the same date day (12pm) is newer than night (12am).
- **Large value:**
  - Take the rows at that date and slot that have a `temperature_c`. Average them in °C, then format the result once with `Wx.fmt.temp`. Example: 21.4 and 20.6 average to 21.0, which shows as "21°C", or "70°F" (69.8 rounded).
  - If only one source has a temperature there, use that value alone.
  - If neither has one, show "–".
  - It is visually the largest text on the card, about 44px on a phone and 56px on desktop, using tabular numbers.
- **Condition:**
  - Use `Wx.condition` on the Open-Meteo row's `weather_code` at that date and slot when it gives a label other than "–".
  - Otherwise, use the MET Norway row's code.
  - If the result is still "–", hide both the condition label and the glyph. No "–" condition is shown.
- **Glyph:** chosen by the condition label.
  - Clear and Mostly clear use clear. Partly cloudy uses partly cloudy.
  - When the shown reading is the night slot, those three use their night variants.
  - The glyph is decorative (`alt=""` or `aria-hidden="true"`), because the label carries the meaning.
- **Caption:** in small `--muted` text, it names the source or sources whose temperatures were used, then the slot label.
  - Both sources: "Average of Open-Meteo and MET Norway · Day (12pm), Oct 24".
  - One source: for example "MET Norway · Night (12am), Oct 24".
  - Neither source has a temperature: list the sources that have a row at that date and slot, in the same format.
- **Unit changes:** switching °C/°F in Settings updates the large value without any new request, as the rest of the card already does.
- **No readings:** a city with no readings shows no summary. It keeps the existing "No readings yet. First reading at 12am/12pm local time." text.

**Your cities: detail**
- The detail keeps today's structure:
  - two slot groups, Day (12pm) then Night (12am)
  - inside each group, one `.reading` per source, Open-Meteo then MET Norway
  - each `.reading` has the source name and the date, then a `dl` in the order Temperature, Feels like, Humidity, Wind, Precipitation
  - "No reading yet" where a source has none
- It is restyled as compact tiles:
  - Desktop: the two sources sit side by side within each slot.
  - About 400px: each slot's two tiles sit side by side if they fit, or stack.
- The day and night slot groups may sit side by side on wide screens.

**Your cities: states**
- **Loading:** "Loading your cities…", the error message, and **Try again** keep today's text and behavior. They sit in the page column below the search, not inside a card.
- **Empty:** `#cities-status` keeps the exact text "No cities yet. Search for a city to add it." A decorative empty-state illustration shows above it.
  - The illustration is shown only in the empty state. It is hidden while loading, on error, and when any city exists.
  - It is not focusable, has `alt=""` or `aria-hidden="true"`, and has `width` and `height` attributes.
- **Remove:** after removing a city, focus moves as today, to the next Remove button or to the search input. The `.msg-ok` / `.msg-error` announcements are unchanged.

**Settings**
- **Title and Back:** `h2#settings-title` gets focus on open as today. **Back** (`#settings-back`) comes after it in DOM and Tab order and sits on the same row as a compact pill.
  - About 400px: it may wrap under the heading, but it never overflows.
- **Temperature unit:** a segmented control with two segments, "°C" and "°F".
  - It must stay a `fieldset` with the legend "Temperature unit", containing the two native `input[type=radio][name=unit]` with values `C` and `F`. The inputs may be visually hidden, but must not use `display:none` or `hidden`, so they stay in the accessibility tree and reachable with Tab.
  - Keyboard: Tab reaches the checked segment, and arrow keys switch segments as native radios do.
  - The checked segment has a filled look with `--on-accent`-level contrast. The focused segment shows the `--focus` ring.
  - `#unit-msg` ("Saved") still shows beside or under the control.
- **Email notifications:** one card, headed "Email notifications" (`h3#notify-title`). Inside it, there are visual sub-groups separated by hairlines:
  1. the main checkbox
  2. send time and timezone, and the device-timezone hint
  3. daily and weekly digests, with the weekly day
  4. cities in digests
  5. Save
  6. "Range alerts" (`h4#alerts-title`), with its list and the add form
  - The rules for this card are:
    - Every control, legend, label, message, disabled state and hidden state stays the same.
    - Checkboxes stay checkboxes.
    - The not-allowed notice, the loading text and **Try again** keep their text.
    - Alert rows use hairline dividers, with a compact **Delete** pill.
- **Change password:** its own card, with the form unchanged.
- **Primary buttons:** full-width pills inside Settings cards, as today.

**Phone width (about 400px)**
- There is no sideways scroll on Your cities with 10 long-named cities and 10 long results, or on Settings with notifications and two alerts.
- The large temperature, the caption and the city names wrap or shrink without clipping.

**Keyboard only**
- Tab order on both screens is unchanged from today. Every focusable element shows the `--focus` ring in both themes.
- No glyph or illustration is focusable.

**Dark mode**
- Every new color is a `:root` token, defined in both dark blocks (the `prefers-color-scheme` block and `[data-theme="dark"]`).
- The glyphs and the illustration must read on `--surface` and `--bg` in light and dark. If they are `<img>` SVGs, they use fixed mid-tone colors that work on both. If they are inline SVGs, they may use tokens.
- Text contrast is at least 4.5:1, and the large temperature, borders and segment edges are at least 3:1.

**Motion**
- Only the 0005 hover and colour transitions are allowed. Under `prefers-reduced-motion: reduce`, nothing transitions.

**Network and API replies**
- There are no new requests. Slow, failed and empty replies show today's messages in the new layout.
- If a glyph or illustration fails to load, its reserved box stays empty, and the text still reads correctly with nothing overlapping.

## Acceptance criteria

1. Your cities shows "Your cities" as a large title, with the count line directly under it. All tests that existed before this spec still pass unchanged. `tests/run.sh` prints `RESULT: PASS`.
2. Take a city whose newest date and slot (2026-10-24, day) has Open-Meteo at 21.4 °C with code `3` and MET Norway at 20.6 °C with code `cloudy`.
   - Its card shows a large "21°C", the label "Cloudy" with a glyph, and the caption "Average of Open-Meteo and MET Norway · Day (12pm), Oct 24".
   - After switching to °F, the large value reads "70°F", with no new request.
3. These checks cover a missing temperature and unmapped codes:
   - The newest date and slot (night) has Open-Meteo with no temperature and code `null`, and MET Norway at 18.6 °C with code `cloudy`. The card shows "19°C", "Cloudy", and the caption "MET Norway · Night (12am), Oct 24". After switching to °F, it shows "65°F".
   - Open-Meteo code `3` and MET Norway code `rain` show "Cloudy", because Open-Meteo wins.
   - Open-Meteo code `999` and MET Norway code `null` show no condition label and no glyph.
4. A night-slot newest reading with condition Clear shows the night (moon) glyph. A day-slot one shows the sun glyph.
5. Each card keeps its four `.reading` tiles: Open-Meteo day, MET Norway day, Open-Meteo night, MET Norway night. Each has the existing `dl` values in the order Temperature, Feels like, Humidity, Wind, Precipitation. A city without readings shows "No readings yet. First reading at 12am/12pm local time." and no large value.
6. With no cities, the empty-state illustration and "No cities yet. Search for a city to add it." are visible. The illustration is hidden while loading, on load error, and once a city exists.
7. Search results show as rows with one Add pill each. Search, add, limit and remove messages, accessible names, and the focus move after Remove all behave as before.
8. Settings shows "Settings" as a large title with **Back** on its row. Below it are separate cards in this order: Temperature unit, Email notifications, Change password.
9. Temperature unit is a segmented control built on the two native `name="unit"` radios inside a fieldset with the legend "Temperature unit". Tab reaches it, the arrow keys switch the unit, "Saved" appears, and the checked segment looks selected.
10. At a 400px viewport, Your cities (10 long-named cities with readings, plus 10 results) and Settings (notifications on, two alerts) have no horizontal scrollbar and no clipped text.
11. Keyboard only, Tab order on both screens matches the pre-0006 order, every focused element shows a visible ring, and no glyph or illustration takes focus. Every glyph and illustration has `alt=""` or `aria-hidden="true"`, and loads from `assets/` or is inline SVG.
12. With OS dark mode, and separately with `data-theme="dark"`, both screens show dark cards with readable text, glyphs, illustration and segmented control. With `prefers-reduced-motion: reduce`, nothing transitions. No new `<script>` tag or external URL is added.

## Open questions

