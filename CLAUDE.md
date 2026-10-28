# Weather

A weather-history web app, live at https://treefinderer.github.io/weather/ (repo `treefinderer/weather`).
Users sign in, pick up to 10 cities, and the app records each city's weather at 12am and 12pm local time from several services, then shows the history as tables and charts.
The `pages` GitHub Actions workflow deploys the frontend on every push to `main`.

## Architecture (decided 2026-10-25)

- **Frontend:** static HTML/CSS/JS on GitHub Pages. It talks to Supabase with `supabase-js`, loaded from jsDelivr at a pinned exact version.
- **Backend:** Supabase: Postgres (SQL), Supabase Auth (email + password, password-reset emails), Row Level Security so each user sees only their own rows, and a scheduled Edge Function that collects readings.
- **Weather sources:** keyless only, Open-Meteo and MET Norway (sends a `User-Agent` naming the app). Each reading is stored per source.
- **Email notifications (spec 0004):** sent through Resend's API from an Edge Function. The `RESEND_API_KEY` is kept only as a Supabase secret. There is no verified domain yet (owner, 2026-10-28), so Resend delivers only to the owner's own address until a domain is added. The sender address must be configurable without a code change.
- **Roadmap:** 0001 accounts (sign up, sign in, password reset, °C/°F) → 0002 cities (up to 10) + twice-daily collection → 0003 history table, graph and charts → 0004 notifications.

## Files

- `index.html` (markup), `style.css` (all styles), `common.js` (shared helpers on `window.Wx`).
- A new feature gets its own IIFE `.js` file, loaded after `common.js`, and shares only through `window.Wx`.
- `supabase/migrations/` holds the SQL schema and RLS policies, `supabase/functions/` the Edge Functions.
- Read only the files a change touches.

## Rules

- No build step. The only runtime libraries are `supabase-js` and Chart.js 4 (spec 0003), each from a pinned CDN URL. Colors are CSS tokens on `:root` with both dark-mode overrides. Fonts from Google Fonts only, always with a fallback stack.
- Must work at about 400px with no sideways scroll, and with keyboard only.
- The Supabase project URL and anon key may be committed (they are public by design, and RLS protects the data). The service-role key and any other secret must never be committed. They live only in Supabase secrets.
- Every table has RLS enabled, with policies limited to `auth.uid()`.
- Local preview: `python3 -m http.server 8000` (the `site` entry in `.claude/launch.json`); the tests also show at http://localhost:8000/tests/.
- `tests/run.sh` must print `RESULT: PASS` before anything merges. A hook enforces this on pushes to `main`.
- Never force-push (a hook blocks it). If a push asks for a login, stop and ask the owner.

## Workflow (ADLC)

The main session orchestrates: it briefs agents with only the files involved and doesn't write feature code itself.

| # | Stage | Who | Gate |
|---|-------|-----|------|
| 1 | Spec, `docs/specs/NNNN-slug.md`, short, at most about 12 checks | `product-analyst` | **Owner approves** |
| 2 | Build on `feature/NNNN-slug` | `developer` | `tests/run.sh` PASS |
| 3 | Review | `code-reviewer` (sonnet) | APPROVE |
| 4 | Tests added to `tests/tests.js`, short `docs/qa/NNNN-slug.md` | `qa-tester` (sonnet) | `tests/run.sh` PASS |
| 5 | Release: merge, push, curl check | orchestrator, using the `release` skill | No owner gate |

- `NNNN` is the next free number in `docs/specs/`.
- A REQUEST CHANGES review or a QA FAIL goes back to `developer` with the findings. After two failed rounds, stop and ask the owner.
- **Fast lane:** trivial changes (wording, a color, a typo) skip stage 1. Tell the owner you're using it.
- After each stage, give the owner a one- or two-line status.
- To review the owner's own branch, run `code-reviewer`, plus `qa-tester` if behavior changes.
