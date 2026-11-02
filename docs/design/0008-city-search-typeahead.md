# 0008 City search autocomplete: design brief

Spec: `docs/specs/0008-city-search-typeahead.md`. Base system: `docs/design/0005-weather-insights-look.md` and `docs/design/0006-cities-settings-redesign.md`. Everything those define (tokens, Inter, the 52px search field with its magnifier, messages, focus ring, phone breakpoint ≤734px) still applies. This brief only adds the suggestion list and replaces the 0006 results card and **Add** pill.

## Direction

A quiet, Apple-style popover menu, like Spotlight or the Maps search suggestions: a white rounded panel that drops just below the field, rows with the city name in clear type and the region and country in grey under it. The keyboard highlight is a soft blue tint with a thin accent bar on the left, so it reads as "selected" without shouting. Nothing new is drawn. The existing magnifier stays, and no new SVG is needed.

## Tokens

Two tokens are **new**. Add each to `:root` and to **both** dark blocks (`@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`).

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--option-hover` *new* | `#f5f5f7` | `#2c2c2e` | Pointer hover fill of a choosable row |
| `--option-active` *new* | `#eef4fd` | `#14304d` | Keyboard-highlighted row fill (`aria-selected="true"`) |

Existing tokens used:

| Part | Token |
|---|---|
| Panel fill | `--surface` |
| Panel border | `--border` (1px, so the edge reaches 3:1 in both themes; `--card-line` is transparent in light and too faint) |
| Panel shadow | `--shadow` (transparent in dark, where the border carries the edge) |
| City name | `--text` |
| Region and country, "Added", "Adding…", limit-disabled names | `--muted` |
| Highlight bar (3px, left edge of highlighted row) | `--accent` light, `--focus` dark (same values: `#0066cc` / `#2997ff`, so use `--focus` in both) |
| Magnifier (unchanged CSS mask) | `--muted` |

Contrast (WCAG 2.x, rounded):

| Pair | Light | Dark | Needs |
|---|---|---|---|
| City name, `--text` on `--surface` | 16.8 | 15.6 | 4.5 |
| City name, `--text` on `--option-hover` | 15.5 | 12.8 | 4.5 |
| City name, `--text` on `--option-active` | 15.2 | 12.4 | 4.5 |
| Region/country and "Added", `--muted` on `--surface` | 5.07 | 6.61 | 4.5 |
| `--muted` on `--option-hover` | 4.66 | 5.41 | 4.5 |
| `--muted` on `--option-active` | 4.59 | 5.23 | 4.5 |
| Panel border, `--border` on `--surface` | 3.62 | 4.09 | 3 |
| Panel border, `--border` against page `--bg` | 3.32 | 5.05 | 3 |
| Highlight bar, `--focus` on `--option-active` | 5.03 | 4.47 | 3 |
| Highlight bar, `--focus` on `--surface` | 5.56 | 5.64 | 3 |

The highlight fill alone is a tint (it does not reach 3:1 against the panel). The 3px bar is the 3:1 indicator, and the tint makes it easy to spot. Hover (grey fill, no bar) and highlight (blue tint plus bar) stay distinct in both themes, and a row that is both hovered and highlighted shows the highlight.

## Type

Inter, already loaded, with the 0005 `--font` fallback stack. No new font or weight. Same on phone and desktop.

| Style | Size | Weight | Line height | Letter spacing | Color |
|---|---|---|---|---|---|
| Search input (unchanged) | 17px | 400 | 1.3 | -0.01em | `--text` |
| Row city name | 17px | 500 | 1.3 | -0.01em | `--text` |
| Row region and country | 14px | 400 | 1.35 | 0 | `--muted` |
| Row status ("Added", "Adding…") | 14px | 600 | 1.3 | 0 | `--muted` |

The spec's `place()` text is split for display: the first part (the city name) on line one, the rest ("Île-de-France, France") on line two. If a place has no region or country, line two is left out. The accessible name of the option stays the full text, plus ", already added" for followed cities.

## Layout

### Search form (400px and up)

- The **Search** button is removed. Drop the `.city-search-row .btn` rule. `.city-search-row` holds only `.search-field`, which now takes the full form width: max 680px on desktop, the full 368px column at 400px (16px side padding).
- The field keeps 0006's size and magnifier: min height 52px, radius 14px, padding 12px 16px 12px 46px, the 18px `--muted` magnifier 16px from the left. Hide the native WebKit cancel button only if it overlaps the text; otherwise leave it.
- `.city-search-row` becomes `position: relative` and is the anchor for the panel. Move `#city-results` inside it, right after `.search-field`, so the panel sits under the field and matches its width. The form's 12px bottom margin stays.

### Suggestion panel (`#city-results`, `role="listbox"`)

- Position: `absolute`, `top: calc(100% + 6px)`, `left: 0`, `right: 0`, so it is exactly the field's width and never wider than the column (and so never wider than the viewport). The 6px offset clears the field's 2px focus ring. `z-index: 20`, above the city cards and messages; it overlays them instead of pushing them down.
- Surface `--surface`, 1px solid `--border`, radius 12px, shadow `0 12px 32px var(--shadow), 0 2px 6px var(--shadow)`.
- Padding 6px on all sides. No list bullets, margin 0.
- Max height `min(400px, 55vh)` (add `55dvh` after it for mobile browsers), `overflow-y: auto`, `overscroll-behavior: contain`. At 56px per row, 10 rows are about 570px, so the list always scrolls inside itself; about 7 rows show on desktop, fewer on a short phone, with a partly cut row hinting that it scrolls. No horizontal overflow (`overflow-x: hidden`).
- Replaces the 0006 results card rule (`.city-results` card margins, 18px radius, hairline dividers). No dividers between rows; the 2px gap and the hover/highlight fills do the separating.
- The `hidden` attribute closes it. It is not rendered while closed.

### Option row (`.city-result`, `role="option"`)

- Flex, `align-items: center`, gap 12px, min height 52px (above the 44px touch minimum), padding 8px 12px, radius 8px (inner radius of the 12px panel minus its 6px padding, rounded up), 2px gap between rows, `cursor: pointer`.
- Text block: `flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere`. Name on line one, region and country on line two, 2px between. Long names wrap to as many lines as needed; nothing is truncated or clipped.
- Status label ("Added", "Adding…"), when present: `flex: none`, right side, vertically centered, `white-space: nowrap`.
- At 400px: the panel is 368px, its content 354px, the text block about 330px (about 300px with a status label). "Llanfairpwllgwyngyll, Wales, United Kingdom" wraps to two lines and the row grows to about 72px.

### Messages and live region

- `#cities-limit` and `#search-msg` stay in the column under the form, 0005 message styles, 12px above and below. When the panel is open it may cover them; when there are no matches or an error, the panel is closed, so the message is visible.
- **Live region**: add one `<p id="city-results-status" class="visually-hidden" aria-live="polite"></p>` right after the form, using the existing `.visually-hidden` rule. It holds only "N suggestions available." / "1 suggestion available.". "No places found…" and the failure text go to the visible `#search-msg` (already polite), and the hidden region is emptied then, so nothing is announced twice.

## Imagery

No new files. The magnifier stays `assets/search.svg` as a CSS mask on `.search-field::before`, colored `--muted` in both themes. Rows use no icons; the "Added" state is text, so it needs no dark variant.

## Motion

- Opening: the panel fades in with a 4px drop, `opacity 0 → 1` and `translateY(-4px) → 0`, over 120ms `ease-out`, as a keyframe animation declared inside the existing `@media (prefers-reduced-motion: no-preference)` block. It plays only when the panel goes from hidden to shown, not when rows update while it is open.
- Closing: instant (no animation).
- Row hover and highlight fill: `background-color` 100ms `ease`.
- `scrollIntoView` for the highlighted row uses `block: "nearest"` with no smooth behavior.
- The existing `@media (prefers-reduced-motion: reduce)` rule turns all of it off.

## States

**Search field**: unchanged 0006 states (hover border `--text`, focus border `--focus` plus 2px ring offset 1px, disabled opacity 0.5). The field keeps its focus ring while the panel is open, since DOM focus never leaves it.

**Row, choosable**:
- Rest: transparent on `--surface`.
- Hover: `--option-hover` fill.
- Highlighted (keyboard, `aria-selected="true"`): `--option-active` fill plus a 3px `--focus` bar on the left edge (`box-shadow: inset 3px 0 0 var(--focus)`). Rows never get their own focus ring; they are not focusable.

**Row, already added** (`aria-disabled="true"`):
- Name stays `--text` (readable), region `--muted`, status label "Added" in `--muted` on the right.
- No hover fill, `cursor: default`. It can still take the keyboard highlight (tint plus bar), so a keyboard user can tell where they are.

**Row, at the 10-city limit** (all `aria-disabled="true"`): name switches to `--muted` (5.07 / 6.61 on the panel), no hover fill, `cursor: not-allowed`. Followed cities still show "Added". The `#cities-limit` notice shows under the form.

**Row, adding**: the chosen row's status label reads "Adding…" in `--muted`. Other rows keep their look but lose the hover fill and use `cursor: progress` until the add finishes. No spinner.

**Waiting for a reply**: the current rows stay as they are. No spinner or dimming.

**Empty and error**: no panel. "No places found for "<query>"." and "Can't search right now. Check your connection and try again." show in `#search-msg` with the 0005 `.msg-error` style. "Type at least 2 letters." (Enter under 2 characters) uses the same style.

**Focus everywhere else**: unchanged 0005 ring.
