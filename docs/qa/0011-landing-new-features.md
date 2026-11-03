# QA 0011 Landing: satellite pictures and live view

- Date: 2026-11-03
- Branch: feature/0011-landing-new-features
- Commit tested: 867c0ea (tests only; feature code at fb9540a)
- Result: **PASS**. `tests/run.sh` (clean worktree of the commit): `RESULT: PASS 696/696`

## Covered (group "Landing new features (0011)" in tests/tests.js)
- Criterion 1: section order and bands (History alt, Satellite plain, Live view alt, Email plain; others unchanged).
- Criteria 2, 3: exact eyebrow, h3 and paragraph copy. Criterion 5: hero subline from Owner decisions.
- Criterion 4: credit text and link URLs in both sections and in the footer (footer has 6 links).
- Criterion 5: no "real-time"; "live" only about webcams; no webcam-for-every-city promise; NASA/Windy named only in credits.
- Criterion 6: both images local, `alt=""`, 640x480, not focusable, SVG files exist; no external image, no new script, script count 9.
- Criterion 7: at 400px signed out and signed in, no sideways scroll, image above text; Tab order of the three credit links (nothing else added between hero and closing).
- Criterion 8 (automatable part): computed credit styles (14px, `--muted`, 16px top margin, links underlined in `--text`); credit rules use tokens only; the tokens they use exist in `:root` and both dark blocks.

## Manual (not run by the suite)
- Dark mode: look at the two new sections, both illustrations and the credits with OS dark, `data-theme="dark"`, and `data-theme="light"` on a dark OS.
- Visible `--focus` ring on the three credit links on both bands.
- Hover removes the credit link underline.

## Failures
None. Note: an unrelated uncommitted edit to `supabase/migrations/0005_city_webcams.sql` in the main checkout breaks 5 "Live webcam (0010)" migration checks there; they pass in a clean worktree.
