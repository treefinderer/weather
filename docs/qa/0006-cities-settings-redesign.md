# QA 0006 Your cities and Settings redesign

- Date: 2026-10-30
- Commit tested: 7542295 (plus the test group added on top)
- `tests/run.sh`: `RESULT: PASS 343/343` (group "Cities and Settings redesign"; existing checks unchanged, only additions to `tests/tests.js`)

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Large title, count line under it, old tests pass | PASS |
| 2 | 21°C / Cloudy + glyph / average caption; 70°F with no new request | PASS |
| 3 | MET-only night (19°C, 65°F, caption); OM wins over MET; OM 999 + MET null shows no label or glyph | PASS |
| 4 | Night clear shows moon glyph, day shows sun glyph | PASS |
| 5 | Four `.reading` tiles in order, dl order; no-readings card has no summary | PASS |
| 6 | Empty art shown only when empty (hidden loading, error, with cities) | PASS |
| 7 | Search, add, limit, remove behavior and focus | PASS (existing Cities group, unchanged and passing; the row/pill layout is only checked at 400px) |
| 8 | Settings title, Back on its row, three cards in order, no `.card` on the screen | PASS |
| 9 | Segmented control on native `name=unit` radios in fieldset, Saved, checked state | PASS (Tab and arrow-key behavior is native radio behavior and was not simulated) |
| 10 | 400px, no sideways scroll (Your cities with 10 long cities and 10 results; Settings with notifications and two alerts) | PASS (scroll width and element fit; clipped text only checked for temp and caption) |
| 11 | Glyphs and art `alt=""`, from `assets/`, not focusable; Tab order | PASS for alt, source and focusability. Tab order and visible focus rings: manual (not checked) |
| 12 | Tokens in `:root` and both dark blocks, no new scripts | PASS for `--seg-track` and `--seg-hover` and script list. Dark rendering, contrast, reduced motion: manual (not checked) |

## Not automated
Real dark mode appearance (cards, glyphs, illustration, segmented control), contrast ratios, visible `--focus` rings, `prefers-reduced-motion`, how glyphs and illustration look, and a failed image load.

## Failures
None. (Two early failures were test fixture mistakes, fixed in the tests.)
