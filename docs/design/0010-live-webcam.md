# 0010 Live webcam per city: design brief

Spec: `docs/specs/0010-live-webcam.md`. Base system: `docs/design/0005-weather-insights-look.md` and `docs/design/0006-cities-settings-redesign.md`. Everything they define (tokens, Inter, pills, links, focus ring, city card, phone breakpoint ≤734px) still applies. This brief only adds the Live view block at the bottom of each city card.

Coherence with 0009 (satellite picture, designed in parallel): the 0009 picture sits after the summary and before the detail tiles. The Live view block sits at the very bottom, after the tiles. Both are "media boxes" on the same card, so they share one radius (14px, the same as the reading tiles) and one loading fill token (`--media-bg`, below). If the 0009 brief settles on a different radius or fill token, the developer uses the 0009 values for both, so the card has one media style.

## Direction

Quiet and secondary, like a footer row in an iOS card: a hairline, a small outlined pill, and plain text. Nothing loads or moves until the visitor asks. When opened, the player is a calm rounded 16:9 window that fills the card's width, with a neutral grey behind it while Windy's player paints. No Windy logos or marks, and no new artwork. The player's own content belongs to Windy and isn't themed.

## Tokens

One token is **new**. Add it to `:root` and to **both** dark blocks (`@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`).

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--media-bg` *new* | `#e8e8ed` | `#2c2c2e` | Player box fill while the iframe loads, or if it never paints. Shared with the 0009 picture box. |

Existing tokens used:

| Part | Token |
|---|---|
| Divider above the block | `--hairline` |
| Player box edge | `--hairline` (1px) |
| Toggle pill | `.btn-secondary`: `--accent` text and edge, hover `--badge-bg` |
| Camera name link, credit links | `--accent` (the `.link` style) |
| Credit text | `--text` |
| "No webcam nearby" | `--muted` |
| Focus ring | `--focus` |

Contrast (WCAG 2.x, rounded). The block sits on `--surface` (`#ffffff` light, `#1c1c1e` dark).

| Pair | Light | Dark | Needs |
|---|---|---|---|
| Credit text, `--text` on `--surface` | 16.8 | 15.6 | 4.5 |
| Camera link, credit links, toggle text, `--accent` on `--surface` | 5.56 | 5.64 | 4.5 |
| Toggle hover, `--accent` on `--badge-bg` | 4.6 | 4.6 | 4.5 |
| Toggle edge, `--accent` on `--surface` | 5.56 | 5.64 | 3 |
| "No webcam nearby", `--muted` on `--surface` | 5.07 | 6.61 | 4.5 |
| Focus ring, `--focus` on `--surface` | 5.56 | 5.64 | 3 |

`--media-bg` and the `--hairline` box edge carry no text or meaning (the box's purpose is given by the button and the iframe `title`), so they have no contrast target. They are 1.2:1 (light) and 1.3:1 (dark) against the card, which is enough to show the box's shape.

## Type

Font: **Inter** with the 0005 `--font` stack. No new font or weight.

| Style | Phone (~400px) | Desktop | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|
| Toggle pill ("Live view" / "Hide live view") | 14px | 14px | 500 | 1.2 | 0 (0005 compact pill) |
| Camera name link | 17px | 17px | 500 | 1.47 | -0.01em |
| Credit line, including its links | 17px | 17px | 400 | 1.47 | -0.01em |
| "No webcam nearby" (and "Looking for a webcam…" if used) | 15px | 15px | 400 | 1.47 | 0 |

**Credit size and colour.** As the brief for this stage requires, and to meet Windy's "visible" credit terms, the credit uses the site's normal body text (17px, `--text`), with its two links in the normal link style. This is a deliberate change from the spec's "small `--muted` text" (see Open questions). Text: "Webcams provided by " + link "windy.com" + " - " + link "add new webcam". Keep the plain hyphen with spaces exactly as the spec writes it.

## Layout

Applies to `.city-card` on Your cities only. Every element in the block has `min-width: 0` and `overflow-wrap: anywhere`. Nothing has a fixed pixel width.

### Live view block (`.webcam`, `webcam_status = 'found'`)

It is the last child of the card, after `.slots`. It renders together with the card, so it causes no layout shift.

- **Divider:** 20px above the block, a 1px `--hairline` top border across the card's content width, then 20px padding above the content (16px and 16px on phone). This mirrors the summary divider in 0006.
- **DOM and visual order** are the same, so the Tab order matches what the visitor sees:
  1. **Toggle** (`button.btn-secondary`), auto width, left-aligned, `flex: none` look. Text "Live view" or "Hide live view". Its accessible name includes the camera (spec), for example with `aria-label="Live view: Zurich – Lake"`, or a visually hidden span after the visible text.
  2. **Player box** (only while open), 16px below the toggle.
     - Full content width (`width: 100%`), `aspect-ratio: 16 / 9`, radius 14px, `overflow: hidden`, fill `--media-bg`, 1px `--hairline` border.
     - The iframe inside is `display: block; width: 100%; height: 100%; border: 0`.
     - Desktop: the card content is about 922px, so the box is about 922 × 519px. At 400px: 336 × 189px.
  3. **Camera name** (`a.link`), 12px below the toggle (closed) or below the player box (open). It sits on its own line and wraps freely.
  4. **Credit** (`p`), 4px below the camera name. Normal paragraph, no bottom margin. It wraps onto two lines at phone width.
- The block adds no padding of its own beyond the divider, so the player lines up with the tiles above it.

### No camera (`webcam_status = 'none'`)

- The same divider (20px above, hairline, 20px below, 16/16 on phone), then one line, "No webcam nearby", 15px `--muted`, `margin: 0`. No button, no link, no credit.

### Not looked up yet (`webcam_status` null)

- Nothing renders: no divider and no space. If the developer chooses "Looking for a webcam…" instead, it uses exactly the "No webcam nearby" layout and style. The two states must be the same height, so the card doesn't jump when the lookup finishes on a later visit.

### Phone, 400px

- The column is 368px and the card content is 336px (16px card padding).
- Toggle: "Hide live view" is about 120px wide. The camera name and credit wrap. Long camera titles break with `overflow-wrap: anywhere`.
- The player box is 336 × 189px, set by `width: 100%` and `aspect-ratio` only. No `100vw` and no fixed width or height on the iframe, so there is no sideways scroll with ten cards and one player open.

## Imagery

No new image files. The toggle and the link are clear as words, so a camera glyph isn't needed. No Windy logo, wordmark or other mark is used anywhere, and the credit is text only.

## Motion

- Only the existing 0005 colour transitions (150ms `ease` on `background-color`, `color`, `border-color`) on the toggle and the links.
- Opening and closing are instant: the player box appears and disappears with no height, fade or slide animation, and the page doesn't scroll.
- The existing `@media (prefers-reduced-motion: reduce)` rule covers all of it.

## States

**Toggle pill**
- Rest: 0005 compact secondary pill (32px min height, transparent fill, 1px `--accent` edge, `--accent` text).
- Hover: `--badge-bg` fill.
- Focus-visible: the 0005 ring, 2px `--focus`, offset 3px, pill radius. It fits inside the card padding.
- Open (`aria-expanded="true"`): same look, text "Hide live view". No filled or pressed style, so it stays quiet. Focus stays on the button.
- Disabled: not used. If ever needed, the 0005 disabled pill (opacity 0.45, no hover).

**Camera name and credit links**: the `.link` style. `--accent`, underlined (1px, offset 3px), hover underline 2px, focus-visible 2px `--focus` ring with a 3px offset and 4px radius. They open in a new tab. No external-link icon.

**Player box**
- Loading: plain `--media-bg` fill with the hairline edge, no spinner and no text, until Windy's player paints over it.
- Failed or blocked: the box stays as the plain fill. The camera link below remains the way to reach the camera. No error message.
- Focus: the iframe is one Tab stop. Draw the ring on the box, not on the iframe (the box's `overflow: hidden` would clip an iframe outline): `.webcam-frame:focus-within` gets a 2px `--focus` outline with a 3px offset. The ring follows the 14px radius.

**"No webcam nearby"**: static muted text, not focusable.

**Dark mode**: all parts use tokens, so OS dark mode and `data-theme="dark"` look the same. Contrast is in the Tokens table. Windy's player content isn't themed.

**Errors elsewhere**: a failed `cities` load uses today's message and **Try again**. No webcam block renders in that state.

## Open questions

1. **Credit style.** The spec says the credit is small `--muted` text. This brief uses the normal body size and `--text` colour, as the brief for this stage asked, to meet Windy's "visible" terms. Is the larger credit fine on every card? (The tester should check against this brief, not the spec's wording, for size and colour.)
