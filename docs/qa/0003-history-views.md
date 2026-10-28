# QA 0003 History views

- Date: 2026-10-27
- Commit tested: 4988929 (feature/0003-history-views)
- `tests/run.sh`: RESULT: PASS 148/148
- Verdict: PASS for everything the browser suite can check. Check 12 is pending.

## Coverage (group "History" in tests/tests.js)

| Criterion | Status |
|---|---|
| 1 History button, hash, focus, Back, hashchange to empty | automated, pass |
| 2 local-date range (Pacific/Auckland), MET selected, invalid hash replaced | automated, pass |
| 3 12m paging (two range requests, no raw, 366 dates) | automated, pass |
| 4 table order, gap rows, dashes, metric units | automated, pass |
| 5 average (both, one source, feels-like, condition) | automated, pass |
| 6 condition labels | automated, pass |
| 7 unit F and source change rebuild chart, no Supabase calls | automated, pass |
| 8 chart labels, datasets, nulls, token colors, canvas aria-label | automated, pass |
| 9 | dropped (owner decision) |
| 10 averages chart: none for 7d/30d, monthly for 12m, mean ignores missing | automated, pass |
| 11 empty, error plus Try again, city gone, no Chart, custom range errors and hash | automated, pass |
| 12 RLS and real 12-month paging | pending: real Supabase |

## Manual

- Suite also opened at http://localhost:8000/tests/ in the browser pane: RESULT: PASS 148/148.
- Not checked: dark-mode chart look, 400px layout of the history view, weekly buckets (only monthly is tested), page-wide scroll. The app can't be signed in to.
