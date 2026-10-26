# QA 0001 accounts

- Date: 2026-10-25
- Commit tested: 4172afa (feature/0001-accounts)
- Result: `RESULT: PASS 47/47` (tests/run.sh, group "Accounts", supabase-js mocked)
- Criteria 1-11: automated, all pass. Also checks the "Accounts are unavailable" screen with an empty config.
- Manual: none.
- Pending: real Supabase: criterion 12 (reset email, cross-browser unit, RLS isolation) needs the real project.
- Failures: none.
