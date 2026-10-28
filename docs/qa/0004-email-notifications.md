# QA 0004 email notifications

- Date: 2026-10-28
- Commit tested: 0887df7 (branch feature/0004-email-notifications)
- `tests/run.sh`: RESULT: PASS 204/204

## Criteria

- 1-7: automated, group "Notifications" in `tests/tests.js` (all pass).
- 8-11: pending: run `deno test --allow-read supabase/functions/notify/logic_test.ts` (Deno not installed).
- 12: pending: real Supabase + Resend.
- Manual, not checked: visible focus rings and dark-mode colors of the new section (the suite checks labels, tab order and layout only).

## Failures

None.
