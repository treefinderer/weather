# 0012 Chat assistant: design brief

Spec: `docs/specs/0012-chat-assistant.md`. Base system: `docs/design/0005-weather-insights-look.md`, `0006` and `0008`. Everything those define (tokens, Inter, pills, inputs, focus ring, messages) still applies. This brief only adds the chat button and panel.

Orchestrator defaults folded in: the provider line "Powered by Cloudflare Workers AI · Built with Llama" goes in the panel only, not the footer. The phone sheet is about **85%** of the viewport height, with the page visible above it behind a scrim.

## Direction

Quiet and Apple-like, in the spirit of iMessage and the Apple Support chat: a blue round button that sits in the corner, and a white rounded card with a hairline header, soft grey assistant bubbles and blue user bubbles. Small grey print at the bottom holds the counter, the AI note and the credit. The icon is an original outline speech bubble with a small four-point spark. No company marks.

## Tokens

Two tokens are **new**. Add each to `:root` and to **both** dark blocks (`@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and `:root[data-theme="dark"]`).

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--chat-bot-bg` *new* | `#f5f5f7` | `#2c2c2e` | Assistant bubble, "Thinking…" and notice bubbles |
| `--scrim` *new* | `rgba(0, 0, 0, 0.32)` | `rgba(0, 0, 0, 0.6)` | Phone only: the dimmed page above the sheet |

Existing tokens used:

| Part | Token |
|---|---|
| Launcher fill / hover | `--btn-bg` / `--btn-bg-hover` |
| Launcher icon, user bubble text, Send text | `--on-accent` |
| User bubble, Send | `--btn-bg` (hover `--btn-bg-hover`) |
| Panel fill | `--surface` |
| Panel edge | 1px `--border`, shadow `0 12px 40px var(--shadow), 0 2px 8px var(--shadow)` (transparent in dark, where the border carries the edge) |
| Header and composer dividers | `--hairline` |
| Title, bubble text, input text | `--text` |
| Close icon, counter, AI note, provider line, "Thinking…", placeholder | `--muted` |
| Close hover fill | `--option-hover` |
| Input fill / edge | `--bg` / `--border` |
| Notice bar (3px left edge of limit, busy and unavailable notices) | `--danger` |
| Focus ring | `--focus` |

Contrast (WCAG 2.x, rounded):

| Pair | Light | Dark | Needs |
|---|---|---|---|
| Launcher icon, `--on-accent` on `--btn-bg` | 4.70 | 4.70 | 3 (graphic) |
| Launcher against page `--bg` / footer `--band-alt` / card `--surface` | 4.31 / 4.31 / 4.70 | 4.47 / 3.85 / 3.59 | 3 (graphic) |
| Focus ring on `--bg` / `--band-alt` / `--surface` | 5.11 / 5.11 / 5.56 | 6.97 / 6.01 / 5.64 | 3 |
| Title, `--text` on `--surface` | 16.8 | 15.6 | 4.5 |
| User bubble, `--on-accent` on `--btn-bg` | 4.70 | 4.70 | 4.5 |
| Send hover, `--on-accent` on `--btn-bg-hover` | 5.93 | 5.93 | 4.5 |
| Assistant bubble, `--text` on `--chat-bot-bg` | 15.5 | 12.8 | 4.5 |
| "Thinking…", `--muted` on `--chat-bot-bg` | 4.66 | 5.41 | 4.5 |
| Counter, AI note, provider line, `--muted` on `--surface` | 5.07 | 6.61 | 4.5 |
| Close icon, `--muted` on `--surface` / `--option-hover` | 5.07 / 4.66 | 6.61 / 5.41 | 3 (graphic) |
| Input text / placeholder on `--bg` | 15.5 / 4.66 | 19.3 / 8.16 | 4.5 |
| Input edge, `--border` against `--bg` / panel `--surface` | 3.32 / 3.62 | 5.05 / 4.09 | 3 |
| Notice bar, `--danger` on `--chat-bot-bg` | 5.99 | 4.94 | 3 |
| Panel edge, `--border` on page `--bg` | 3.32 | 5.05 | 3 |

The assistant bubble fill is a tint against the panel (not 3:1). Side, colour and the hidden "You:" / "Assistant:" labels tell the speakers apart, not the tint alone.

## Type

Inter, already loaded, with the 0005 `--font` stack. No new font or weight. Same on phone and desktop.

| Style | Size | Weight | Line height | Letter spacing | Color |
|---|---|---|---|---|---|
| Panel title "Ask Weather Insights" | 17px | 600 | 1.3 | -0.01em | `--text` |
| Bubble text (user, assistant, notices, "Thinking…") | 15px | 400 | 1.4 | 0 | as above |
| Input | 16px (keeps iOS from zooming) | 400 | 1.3 | 0 | `--text` |
| Send | 15px | 600 | 1 | 0 | `--on-accent` |
| Counter | 13px | 500 | 1.4 | 0, `tabular-nums` | `--muted` |
| AI note | 13px | 400 | 1.4 | 0 | `--muted` |
| Provider line | 12px | 400 | 1.4 | 0 | `--muted` |

Bubbles use `white-space: pre-wrap` and `overflow-wrap: anywhere`, so line breaks in replies show and a 300-character word wraps.

## Layout

### Placement and Tab order

The button and panel go in `index.html` just before `</main>` (or are appended there by `chat.js`): button first, panel right after it. Tab then reaches the button after the page content and before the footer links, and the panel's controls follow the button.

### Launcher button (`.chat-launcher`)

- `position: fixed`, `right: calc(16px + env(safe-area-inset-right))`, `bottom: calc(16px + env(safe-area-inset-bottom))`. 56×56, `border-radius: 50%`, no border, fill `--btn-bg`, shadow `0 4px 16px var(--shadow)`. Same size on phone and desktop.
- Icon: a `::before` 26×26, centered, `background: var(--on-accent)`, `mask: url(assets/chat.svg) center / contain no-repeat` (plus `-webkit-mask`, as `search.svg` does). The button holds no text. Its name comes from `aria-label`.
- **Not covering the footer:** give `.footer-inner` a bottom padding of `calc(104px + env(safe-area-inset-bottom))` at all widths (it replaces the 32px, in both the base rule and the phone rule). The button's top edge is 72px above the viewport bottom, so at the end of the page the last footer line ends 32px above it. When a page is shorter than the viewport, the footer still sits at the bottom, so the same gap holds. The last control in `main` is above the footer, so it clears too.

### Desktop panel (above 600px)

- `position: fixed`, `right: calc(16px + env(safe-area-inset-right))`, `bottom: calc(84px + env(safe-area-inset-bottom))` (12px above the button). Width `min(380px, calc(100vw - 32px))`. Height `min(560px, calc(100dvh - 100px))` (`100vh` first as a fallback), so it never runs under the 52px top bar.
- `--surface`, radius 18px, 1px `--border`, the shadow above, `overflow: hidden`. A flex column: header, message list (`flex: 1 1 auto; min-height: 0`), composer.
- Not modal: no scrim, the page behind stays usable and scrollable.
- 601–734px (between the spec's phone width and the site's 734px breakpoint) also uses the card.

### Phone sheet (600px and below)

- `position: fixed`, `left: 0; right: 0; bottom: 0`, height `85dvh` (`85vh` fallback), radius 20px 20px 0 0, 1px `--border` on the top edge only, no side or bottom radius. Side padding includes `env(safe-area-inset-left/right)`, and the composer's bottom padding adds `env(safe-area-inset-bottom)`.
- A `--scrim` layer covers the whole viewport behind the sheet. Tapping it closes the panel. The 15% strip of page shows through it.
- While open, the page under it doesn't scroll (`overflow: hidden` on `html`), and Tab is kept inside the sheet (the page outside gets `inert`, or a Tab loop in `chat.js`).
- **Keyboard on screen:** `chat.js` listens to `visualViewport` resize and, while the sheet is open, sets the sheet's height to `min(85dvh, visualViewport.height - 8px)` and its `bottom` to the hidden keyboard height, so the composer stays just above the keyboard. Without `visualViewport`, the `dvh` fallback applies.
- Width is the viewport, never `100vw`, so no sideways scroll at 400px. The launcher stays behind the sheet. Close is in the header.

### Panel parts, top to bottom

1. **Header**: 56px tall, padding 0 6px 0 20px, flex, `align-items: center`, `justify-content: space-between`, 1px `--hairline` below. Title `h2` in the title style, `min-width: 0`. **Close** is a 44×44 round button, transparent, with a 16×16 `::before` masked by `assets/close.svg` in `--muted`, `aria-label="Close chat"`.
2. **Message list** (`role="log"`, `aria-live="polite"`): `overflow-y: auto`, `overflow-x: hidden`, `overscroll-behavior: contain`, padding 16px, flex column, 8px between bubbles (16px between a user bubble and the next assistant bubble). It is a Tab stop only if it scrolls (`tabindex="0"` with an `aria-label="Conversation"` is fine). New messages jump the list to the bottom, with no smooth scrolling.
   - **Bubble** (shared): max width 85%, padding 10px 14px, radius 18px, `min-width: 0`. Each starts with a `.visually-hidden` "You: " or "Assistant: ".
   - **User**: `align-self: flex-end`, `--btn-bg` fill, `--on-accent` text, bottom-right radius 6px.
   - **Assistant** (greeting and replies): `align-self: flex-start`, `--chat-bot-bg` fill, `--text`, bottom-left radius 6px.
   - **Thinking…**: an assistant bubble with the text "Thinking…" in `--muted`. It is removed when the reply or the error notice arrives.
   - **Notice** (limit, busy, unavailable): an assistant bubble with `box-shadow: inset 3px 0 0 var(--danger)` and 16px left padding. Text stays `--text`.
3. **Composer**: 1px `--hairline` above, padding 12px 16px 14px (bottom plus the safe area on phone).
   - Row: flex, gap 8px, `align-items: center`. The label "Your question" is `.visually-hidden`. The input has `placeholder="Ask a question"`, `flex: 1 1 auto; min-width: 0`, min height 44px, radius 22px, padding 10px 16px, `--bg` fill, 1px `--border`. **Send** is a primary pill, `flex: none`, width auto, min height 44px, padding 0 18px (the `.btn` look without its `width: 100%`).
   - Under the row, 8px gap, a stack of three small lines, 2px apart, left-aligned, `overflow-wrap: anywhere`: the counter ("4 questions left today", "…" while loading, hidden when the status call fails), the AI note, then the provider line.
   - At 400px: the input is about 290px and Send about 70px, on one row. The provider line may wrap to two lines.

### Z-index

| Layer | z-index |
|---|---|
| History table sticky cells | 1–2 (existing) |
| Top bar | 10 (existing) |
| City search suggestions | 20 (existing) |
| Launcher | 40 |
| Phone scrim | 41 |
| Panel / sheet | 42 |

Chart.js tooltips are drawn inside the chart `<canvas>`, so they are never above the panel. The webcam `iframe` sits in normal flow with no z-index, so the panel and launcher cover it. Neither creates a stacking context that could rise above 40. The launcher may cover the bottom-right corner of a chart or webcam while scrolling. That is fine, because the footer padding lets every element scroll clear.

## Imagery

All files are original hand-written SVG in `assets/`, with a `viewBox`, a solid black shape, no scripts and no external references. Both are under 1 KB and are used **only as CSS masks**, so they take the token colour in each theme and need no dark versions. Screen readers never see them (no `<img>`). The buttons' `aria-label`s carry the meaning.

| File | viewBox | Where | Colour (via `background`) | Alt |
|---|---|---|---|---|
| `assets/chat.svg` | `0 0 24 24` | Launcher `::before`, 26×26 | `--on-accent` | none (mask). Button `aria-label="Ask Weather Insights"` |
| `assets/close.svg` | `0 0 16 16` | Close `::before`, 16×16 | `--muted` | none (mask). Button `aria-label="Close chat"` |

`chat.svg`: an outline speech bubble (2px stroke, rounded corners, tail at the lower left) with a small filled four-point spark at the upper right, set apart from the bubble. If the mask fails to load, the blue round button still shows and keeps its name.

## Motion

Declared inside the existing `@media (prefers-reduced-motion: no-preference)` block, and turned off by the existing reduce rule.

- **Desktop open**: `opacity 0 → 1`, `translateY(8px) scale(0.98) → none`, 160ms `ease-out`, `transform-origin: bottom right`.
- **Phone open**: the sheet goes `translateY(100%) → 0` over 220ms `cubic-bezier(0.2, 0.8, 0.2, 1)`, and the scrim fades in over the same time.
- **Close**: instant (the `hidden` attribute), as in 0008.
- **Launcher, Send, Close hover**: the 0005 150ms colour transitions. No scaling or bouncing.
- No animation on new bubbles or "Thinking…". Scrolling to the newest message is instant.

## States

**Launcher**: rest `--btn-bg`. Hover `--btn-bg-hover`. Focus-visible gets the 0005 ring (2px `--focus`, offset 3px, round). While open (`aria-expanded="true"`), the fill stays `--btn-bg-hover` on desktop, so it reads as pressed. It is never disabled.

**Close**: rest transparent. Hover `--option-hover` fill. Focus-visible 2px `--focus` ring, offset 2px (it has to fit inside the header).

**Input**: as 0005 inputs. Hover border `--text`. Focus-visible border `--focus` plus the 2px ring, offset 1px, following the 22px radius. Disabled (pending, limit, busy): opacity 0.5, `cursor: not-allowed`.

**Send**: rest `--btn-bg`, hover `--btn-bg-hover`, focus-visible the 0005 ring. Disabled (pending, limit, busy): opacity 0.45, no hover. It isn't disabled for empty input. Pressing it with empty input does nothing, as the spec says.

**Pending**: the input and Send are disabled, and "Thinking…" shows as the last bubble. Focus stays in the input. Return it there when the reply comes, if focus was in the panel.

**Limit reached (429 `limit`)**: a notice bubble "You've used today's 5 questions. You can ask again at {local time}." The input and Send are disabled, and the counter reads "0 questions left today".

**Busy (429 `busy`)**: a notice bubble "The assistant is busy today, try again tomorrow." The input and Send are disabled. The counter is unchanged.

**Unavailable (502, 503, network error, timeout, bad reply)**: a notice bubble "The assistant is unavailable right now, try later." The counter is unchanged, and the input and Send are re-enabled.

**Status call**: the counter reads "…" until it answers. If it fails, the counter line is hidden and the rest of the panel works.

**Empty conversation**: just the greeting bubble, with no separate empty illustration.

**Dark mode**: every colour above is a token, so OS dark and `data-theme="dark"` both work. The masks follow the tokens.
