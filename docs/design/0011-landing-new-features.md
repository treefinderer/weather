# 0011 Landing: satellite pictures and live view, design brief

Spec: `docs/specs/0011-landing-new-features.md`. Base system: `docs/design/0005-weather-insights-look.md`. This brief only adds to it.

## Direction

Two more feature bands, drawn like the four already there: the same eyebrow, headline and paragraph, and an illustration on its own saturated rounded tile with white cards and soft shadows. The satellite tile is violet to blue (sky above the Earth) and the webcam tile is green to teal with a sunset view inside it. That keeps the four-colour rhythm going (coral History, violet Satellite, green Live view, teal Email) so no two neighbouring bands look alike. The credit line is quiet small print, like the footer.

## Tokens

**No new tokens.** The new sections use only existing ones, which are already set in both dark blocks:

| Use | Token | Light | Dark |
|---|---|---|---|
| Satellite band | `--band` | `#ffffff` | `#000000` |
| Live view band | `--band-alt` | `#f5f5f7` | `#161617` |
| Eyebrow | `--accent` | `#0066cc` | `#2997ff` |
| Headline | `--text` | `#1d1d1f` | `#f5f5f7` |
| Paragraph and credit text | `--muted` | `#6e6e73` | `#a1a1a6` |
| Credit links | `--text` | `#1d1d1f` | `#f5f5f7` |
| Focus ring | `--focus` | `#0066cc` | `#2997ff` |

Contrast of the credit line, from the 0005 table:

| Pair | Light, plain / alt | Dark, plain / alt | Needs |
|---|---|---|---|
| Credit text `--muted` | 5.07 / 4.66 | 8.16 / 7.03 | 4.5 |
| Credit link `--text` | 16.8 / 15.5 | 19.3 / 16.6 | 4.5 |
| Focus ring `--focus` | 5.56 / 5.11 | 6.97 / 6.00 | 3 |

The links are told apart from the text around them by an underline, not by colour alone. Both dark modes (OS dark, and `data-theme="dark"`) get the same values because the tokens already sit in both blocks. `data-theme="light"` on a dark OS uses the light column.

## Type

Inter, as in 0005. Eyebrow, headline and paragraph use the existing feature styles. One new style:

| Style | Phone (~400px) | Desktop | Weight | Line height | Letter spacing |
|---|---|---|---|---|---|
| Credit line (`p.feature-credit`) | 14px | 14px | 400 (links 400) | 1.43 | 0 |

## Layout

Order in `#screen-landing`: History (alt) → **Satellite pictures** (`band feature feature-flip`, plain band, image on the right on desktop) → **Live view** (`band band-alt feature`, image on the left) → Email (plain, flip), and so on. Padding, grid (7fr / 5fr, 64px gap, 980px column) and the phone stack (image first, 32px gap, centred text) all come from the existing `.band` and `.feature` rules. Nothing new is needed there.

Text block for each section: eyebrow, 8px, `h3`, 16px, paragraph, **16px**, credit line.

**Credit line** (`<p class="feature-credit">`, the last child of `.feature-text`):
- margin-top 16px; font 14px / 1.43, letter-spacing 0; colour `--muted`; max width 30em, like the paragraph. Use a selector at least as specific as `.feature-text .feature-credit`, so it beats the `.feature-text p` size and margin.
- Links: colour `--text`, underline with an offset of 3px and a thickness of 1px, `border-radius: 4px` (for the ring). Same tab, no icon. The same look as `.footer a`.
- `overflow-wrap: anywhere`, so "NASA GIBS / EOSDIS" and the Windy line wrap at 400px without sideways scroll. On phone it is centred with the rest of the text, and on desktop it is left-aligned.
- The " - " between "windy.com" and "add new webcam" is plain text, not a link, so the two links never run together.

## Imagery

Both are 640×480, `alt=""`, `width="640" height="480"`, not focusable and not wrapped in links. Each is about 6 KB, has a `viewBox`, uses no scripts or external references, and carries no logos or real imagery.

| File | Where | Picture | Dark mode |
|---|---|---|---|
| `assets/feature-satellite.svg` | Satellite pictures section | A violet-to-blue tile with faint stars and a dashed orbit. On the orbit sits a white satellite with two navy solar panels, a lens and a small yellow antenna tip, and a soft beam falls from it onto a curved cyan Earth limb with white cloud swirls. On the right, a white picture card (with a second card behind it, a hint of stepping through days) shows an abstract cloud-and-land thumbnail with a city pin, two text bars and a small sun dot. | The same file in all themes. The tile carries its own background, so it reads on `#ffffff`, `#f5f5f7`, `#161617` and `#000000`. No `currentColor`, no dark variant. |
| `assets/feature-webcam.svg` | Live view section | A green-to-teal tile. Bottom left, a white camera with a hood, a blue lens and a red dot stands on a pole on a rooftop with a railing, and a soft view cone points right into a white player window. The window shows a sunset sky with a sun, clouds and a two-layer violet skyline with lit windows, plus a dark "LIVE" pill with a red dot. Under the view are two text bars and an open-link chip (an arrow pointing up and right). There is no record button and no progress bar. | The same file in all themes (self-contained tile). No dark variant. |

If an image fails to load, its width and height attributes keep the space and the text block still reads, as in 0005.

## Motion

None. The feature bands don't animate (the 0005 rule). Link colour and underline changes follow the existing 150ms transition, which is turned off under `prefers-reduced-motion: reduce`.

## States

The only new controls are the three credit links (NASA GIBS / EOSDIS, windy.com, add new webcam), Tabbed in that order.
- **Default:** `--text` with an underline.
- **Hover:** the underline goes away, as in the footer.
- **Focus-visible:** a 2px solid `--focus` outline, offset 3px, radius 4px (the global rule). It shows on both bands in every theme (at least 5.11:1).
- **Disabled / error / empty:** not applicable. The content is static, there are no API calls, and signed-in and signed-out visitors see the same thing.
