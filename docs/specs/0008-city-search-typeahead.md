# 0008 City search autocomplete

## Request

> "let's improve city search even further. after two characters entered, make the field show 10 possible matches even before Search button is pressed"

Follow-up (owner, 2026-11-01):

> "I think we should make it easier for user to select the city, with less clicks. So the ideal scenario - user types a few characters, website shows possible matches dinamically (up to 10) and user can select one of the suggested cities without even pressing Search button. the list of hints updated dynamically once user continues typing more characters in the search field"

Fixed decisions (orchestrator, 2026-11-01):
- The search becomes an autocomplete. A suggestion list opens directly under the input after 2 or more characters, updates as the visitor types, and closes below 2 characters.
- Debounce of about 300 ms. The latest query's reply wins. The request is the same Open-Meteo geocoding call as today, with `count=10`.
- One click, tap or Enter on a suggestion adds that city at once. There is no separate **Add** pill.
- Keyboard follows the ARIA combobox and listbox pattern.
- The visual style of the dropdown is covered by a designer brief (stage 1b), `docs/design/0008-city-search-typeahead.md`.
- No new libraries.

## Goal

On Your cities, a visitor types a few letters, sees up to 10 matching places right under the field, and adds one with a single click, tap or Enter. There's no **Search** button and no separate **Add** step.

## Scope

In:
- **`index.html`**, in the `#city-search` form:
  - `#city-query` becomes a combobox: `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls="city-results"`, and `aria-activedescendant` while an option is highlighted.
  - `#city-results` becomes the `role="listbox"` popup under the input. Each suggestion is a `role="option"` with its own id.
  - The `#city-search-submit` button is removed (owner to confirm, see Open questions).
  - The visible label "Search for a city" and `type="search"` stay.
- **`cities.js`**, Search section: debounced search on input, the listbox rendering and highlight, keyboard handling, outside click, and adding a city on selection. It reuses today's request, filter (id, name, time zone, coordinates), `add()`, messages and limit.
- **`style.css`**: the dropdown, option, highlight and "already added" styles, following the designer brief. New colors are tokens in `:root` and both dark blocks.
- **Tests:**
  - New checks for this spec in `tests/tests.js`.
  - Existing checks that use `#city-search-submit` or the result **Add** pills are rewritten to match the criteria below. All others stay unchanged.

Out:
- City cards, remove, loading states, Settings, History, and Supabase calls (the `follow_city` RPC is unchanged).
- Recent searches, caching replies, geolocation ("near me"), other geocoders, and highlighting the typed letters in suggestions.
- Adding several cities in one go from the list. The list closes after each add.

## Behavior

**Opening and updating**
- The query is the input value with spaces trimmed from both ends.
- Each `input` event (typing, paste, cut, autofill) restarts a timer of about 300 ms. When the timer fires and the query has 2 or more characters, one request runs. Typing "Berlin" quickly sends one request, not six.
- If the query is the same as the one whose suggestions are already shown, no request is sent.
- When the reply arrives, the list opens (`aria-expanded="true"`) directly under the input. It shows up to 10 places, in the API's order.
- While a newer reply is pending, the current suggestions stay visible. Then they are replaced.
- Every search takes a new `searchSeq`, and any reply that isn't the latest is ignored. Example: "Pa" answering after "Paris" never replaces the "Paris" suggestions.
- **Under 2 characters**, or an empty box (typing, cut, native clear button):
  - The pending timer is cancelled.
  - Any reply still in flight is dropped.
  - The list closes and `#search-msg` is cleared. This extends today's `clearSearch()`.
  - No "Type at least 2 letters." message appears.

**Suggestion rows**
- One row per place: the city name, then the region and country (today's `place()` text, for example "Paris, Île-de-France, France"). Long text wraps inside the row.
- **A city the visitor already follows:**
  - its row shows "Added" and has `aria-disabled="true"`
  - it can be highlighted but not chosen
  - its accessible name includes "already added"
- **At 10 followed cities:**
  - every row is `aria-disabled="true"`
  - the existing limit notice `#cities-limit` shows
  - choosing a row does nothing
- **While a city is being added**, its row shows "Adding…" and the other rows can't be chosen. This prevents double adds.

**Choosing a suggestion**
- One click, one tap, or Enter on the highlighted row calls today's `add()` with the same RPC and the same messages:
  - on success, "Added Paris." in `#cities-msg`
  - "Paris is already in your list."
  - the limit message
  - "Can't add the city. Check your connection and try again."
- Choosing with the mouse must not lose the click to the input's blur.
- **On success:** the input is emptied, the list closes, focus stays in the input, and the new city card appears as today.
- **On failure:**
  - the input text and the list stay
  - the row returns to choosable (unless the limit is reached)
  - the error shows in `#cities-msg`

**Keyboard (combobox pattern)**
- No row is highlighted when the list opens or updates, so Enter never adds by accident.
- **Down:** from the input, highlights the first row. On a row, moves to the next. On the last row, stays there.
- **Up:** moves to the previous row. From the first row, removes the highlight, and the caret stays in the input.
- **Down while the list is closed:** with 2 or more characters and suggestions for the current query, Down reopens the list.
- The highlighted row has `aria-selected="true"`, is referenced by `aria-activedescendant`, and is scrolled into view. DOM focus never leaves the input.
- **Enter:**
  - **With a highlighted, choosable row:** adds that city.
  - **With nothing highlighted:**
    - a pending timer runs the search at once
    - under 2 characters, it shows "Type at least 2 letters."
    - otherwise it does nothing
  - Enter never reloads the page.
- **Escape:** with the list open, closes it and keeps the text. With the list closed, the native `type="search"` behavior is left alone.
- **Tab:** closes the list without choosing anything, and focus moves on normally.
- Left, Right, Home and End move the caret in the input, as in any text field.

**Pointer**
- Hovering a row shows the hover style. Clicking or tapping outside the input and the list closes the list. Clicking back into the input doesn't send a new request.

**Screen readers**
- After each reply, a polite live region announces "1 suggestion available." or "N suggestions available." It may be visually hidden.
- With no matches, it announces `No places found for "<query>".`, which is also shown visibly, as today.
- **Request failure or timeout:**
  - the list closes
  - `#search-msg` shows "Can't search right now. Check your connection and try again."
  - the next keystroke tries again
- **Unknown or odd input** ("zzzz", digits, emoji) gets the "No places found" message. Places without a time zone or coordinates are never offered, as today.

**Phone width (about 400px)**
- The list is as wide as the search field and never wider than the viewport. There is no sideways scroll with 10 long-named suggestions.
- If 10 rows don't fit in the space below the field, the list scrolls vertically inside itself.
- Rows are at least 44px tall for touch.

**Dark mode and motion**
- Every new color is a `:root` token defined in both dark blocks. The highlighted row, the hover row and the "Added" state are distinguishable in both themes. Text contrast is at least 4.5:1, and the list border and highlight are at least 3:1.
- Any open or close animation is turned off under `prefers-reduced-motion: reduce`.

**Sign-out and user change**
- `reset()` cancels the timer, drops in-flight replies, empties the input and closes the list.

## Acceptance criteria

1. Typing "Pa" and waiting about 300 ms sends one geocoding request for `name=Pa` with `count=10`. A listbox then opens under the input with up to 10 option rows, and `#city-query` has `aria-expanded="true"`.
2. Typing "Berlin" with less than 300 ms between keys sends exactly one request, for `name=Berlin`. If an older reply arrives after a newer one, the newer suggestions stay.
3. Typing one character, or two spaces, sends no request. Deleting back to one character closes the list and ignores any reply still in flight. Neither case shows "Type at least 2 letters."
4. Each row shows city, region and country. Clicking a row calls `follow_city` once, shows "Added <city>." in `#cities-msg`, adds the city card, empties the input, closes the list, and leaves focus in the input. There is no **Add** button in the list.
5. A followed city's row shows "Added" with `aria-disabled="true"`, and clicking it sends no request. With 10 cities followed, every row is disabled and the limit notice shows. A failed add keeps the text and the list, and shows "Can't add the city. Check your connection and try again."
6. Keyboard: Down highlights the first row, and further Down/Up move the highlight (`aria-selected` and `aria-activedescendant` update) while focus stays in the input. Up from the first row clears the highlight. Enter adds the highlighted city.
7. Enter with nothing highlighted adds nothing and doesn't reload the page. Escape closes the list and keeps the text. Tab closes the list and moves focus on. Clicking outside closes the list.
8. A polite live region announces "N suggestions available." after each reply. An empty reply shows and announces `No places found for "<query>".` A failed request shows "Can't search right now. Check your connection and try again." and closes the list.
9. `#city-search-submit` no longer exists, and the label "Search for a city" is still tied to `#city-query`.
10. At a 400px viewport, with 10 long-named suggestions, there is no horizontal scrollbar, rows wrap without clipping, and each row is at least 44px tall.
11. With OS dark mode, and separately with `data-theme="dark"`, the list, hover row, highlighted row and "Added" rows are readable and distinguishable. With `prefers-reduced-motion: reduce`, nothing animates.
12. `tests/run.sh` prints `RESULT: PASS`, and no new `<script>` tag or external URL is added.

## Open questions

1. Remove the **Search** button entirely (the proposed default), or keep it as a fallback that runs the search at once?

## Decisions made for this spec (owner may change on approval)

- **No automatic highlight:** no row is highlighted when the list opens, so Enter never adds a city by accident.
- **Down and Up stop at the ends:** Down stops at the last row instead of wrapping, and Up from the first row returns to the input.
- **Enter with nothing highlighted:** it runs a pending search at once, or shows "Type at least 2 letters." under 2 characters. Otherwise it does nothing.
- **Followed cities:** they appear in the list as disabled "Added" rows, rather than being hidden.
- **At 10 cities:** suggestions still show, all disabled, with the existing limit notice. The input is not disabled.
- **After a successful add:** the input is emptied and focus stays in it, so the visitor can type the next city.
- **After a failed add:** the text and list stay, so the visitor can retry with one click.
- **Count announcement wording:** "N suggestions available.", possibly visually hidden.
- **While waiting for a reply:** the old suggestions stay visible. There is no spinner unless the designer brief adds a subtle one.
- **Long lists:** the list scrolls inside itself on short screens, and rows are at least 44px tall.
