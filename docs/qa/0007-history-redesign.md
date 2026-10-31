# QA 0007 History redesign

- Date: 2026-10-30
- Commit tested: 89b2934 (feature/0007-history-redesign)
- `tests/run.sh`: RESULT: PASS 402/402 (new group "History redesign")
- Owner overrides applied: empty state is plain text; Period select and date inputs have 12px corners.

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Existing checks pass, only the two Source updates; script tags unchanged | PASS (automated) |
| 2 | Title size >= 30px at 400px, tz under title, Back on title row | PASS (automated); focus on open and Back focus covered by History checks 1 |
| 3 | Controls card order, Source fieldset/radios/labels, not hidden, 12px corners | PASS |
| 4 | Tiles for avg/7d | PASS |
| 5 | F, open-meteo radio and hash, no calls, met-norway hash, xyz corrected | PASS |
| 6 | Day-only rows show "–" with no caption; paging leaves tiles unchanged | PASS |
| 7 | Tiles hidden when loading, error, gone, empty; no Chart keeps tiles/table + message | PASS |
| 8 | Chart cards h3, aria-hidden legend, Chart.js legend off, animation false, token colors | PASS |
| 9 | Table card contents, pager after card, sticky opaque date column | PASS (computed style; sideways scroll not exercised) |
| 10 | 400px no sideways scroll, three segments on one row, tiles 2x2 | PASS (that only .table-wrap scrolls is manual) |
| 11 | Tiles/cards not focusable | PASS; Tab order, arrow keys and focus rings are manual (headless iframe) |
| 12 | Dark mode looks and chart rebuild | manual; token presence in both dark blocks PASS (automated) |

Manual items not looked at in a browser: Tab order and focus rings, arrow-key switching, dark-mode appearance, table sideways scroll. No failures found.
