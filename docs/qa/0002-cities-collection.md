# QA 0002 Cities and twice-daily collection

- Date: 2026-10-25
- Commit tested: 10a5ed3 (feature/0002-cities-collection)
- `tests/run.sh`: RESULT: PASS 97/97
- Verdict: PASS for everything the browser suite can check. Checks 8-12 are pending, listed below.

## Coverage (group "Cities" in tests/tests.js)

| Criterion | Status |
|---|---|
| 1 search, no results, fetch failure, short query | automated, pass |
| 2 add: rpc params, card, count, Added, announcement | automated, pass |
| 2 (later fix) new card shows existing latest_readings rows | automated, pass |
| 3 already-followed Added, 23505 message | automated, pass |
| 4 limit at 10, city_limit message | automated, pass |
| 5 remove: delete filters, count, empty state, focus | automated, pass |
| 6 readings and °C/°F (incl. km/h, mph, mm, in per Decision 5) with no new calls | automated, pass |
| 7 400px no sideways scroll, labels, accessible names, form submit | automated, pass |
| 8 dueSlot (Deno) | pending: run `deno test --allow-read supabase/functions/collect/logic_test.ts` |
| 9 parsing (Deno) | pending: run `deno test --allow-read supabase/functions/collect/logic_test.ts` |
| 10 RLS, limit, duplicates on real DB | pending: real Supabase |
| 11 cron collection, no duplicates | pending: real Supabase |
| 12 401 without secret, no secrets in repo | pending: real Supabase |

## Notes

- The iframe fetch mock always replies 200, so a non-2xx geocoding reply and the 10 s search timeout are not covered.
- Enter-in-input is checked as a form with a submit button plus `requestSubmit()`, not a real key press.
- Focus-visible outlines and dark mode were not checked (no manual look).
