# Weather

A one-page weather site, to be live at https://treefinderer.github.io/weather/ (repo `treefinderer/weather`).
The `pages` GitHub Actions workflow deploys it on every push to `main`.

## Files

- `index.html` (markup), `style.css` (all styles), `common.js` (shared helpers on `window.Wx`).
- A new feature gets its own IIFE `.js` file, loaded after `common.js`, and shares only through `window.Wx`.
- Read only the files a change touches.

## Rules

- Plain HTML/CSS/JS: no build step, no dependencies. Colors are CSS tokens on `:root` with both dark-mode overrides. Fonts from Google Fonts only, always with a fallback stack.
- Must work at about 400px with no sideways scroll, and with keyboard only.
- Weather data comes from keyless public APIs (for example Open-Meteo). Never commit API keys or secrets.
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
