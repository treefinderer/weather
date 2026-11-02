# QA 0009 Satellite pictures

Result: **PASS**
Date: 2026-11-01. Commit tested: 85e3480 on `feature/0009-satellite-pictures` (plus the tests added here).
`tests/run.sh`: `RESULT: PASS 567/567`

## Covered (group "Satellite pictures (0009)", browser suite, all network mocked)
- Check 1, as text of `0004_city_pictures.sql`: unique key, RLS enabled, a select-only policy using `auth.uid()`, no write policies, anon revoked, view `security_invoker`, private bucket, `storage.objects` policy with `storage.foldername`.
- Checks 6 and 7, city card: alt text, caption ending "Imagery: NASA GIBS / EOSDIS", day beats night, marker placed from the bbox and hidden when the bbox is missing or the city is outside it, "No satellite picture yet", "Picture unavailable" (signed URL error, query error, image error) with no visible image, one batch signed-URL call, no reload on a unit change.
- Checks 8 to 10, History: opens on the newest slot, Older/Newer step and disable at the ends, live region, placeholder for slots with no picture, picture-only slots, source change keeps the selection, period change resets it, failures leave charts and table, canvas is a Tab stop, Left/Right update viewer and tooltip, hover and tap handlers (called directly), selected-point styling and guide line, table click selects, non-colour cues (bold plus inset outline), paging does not change the viewer.
- Check 11: footer link, 400px with 10 city pictures and on History (no sideways scroll, square frames, Older/label/Newer on one row), wide and narrow placement.
- Check 12: tokens in `:root` and both dark blocks, 8 script tags, only `www.earthdata.nasa.gov` added to index.html, no GIBS host or service key in browser code.
- Test harness: the supabase mock gained `storage.from().createSignedUrls`, and the Chart stand-in gained `update`, `setActiveElements`, `getDatasetMeta` and a tooltip hook.

## Not run or not automatable
- **`logic_test.ts` (checks 2 to 5) was NOT run.** Deno, Node and a TypeScript compiler aren't installed here, so the developer's transpile-in-Chrome route was unavailable. Run `deno test --allow-read supabase/functions/collect/logic_test.ts`.
- **Live collector run (checks 3 to 5):** the first real run against GIBS and Supabase (two files and rows per city, retry on XML/blank/timeout replies, readings kept) is unverified.
- **Layer names and time steps:** confirm against GIBS `GetCapabilities` in a live request.
- **Real policies (check 1):** RLS and Storage policies are checked as text only. A user who doesn't follow a city getting no row or signed URL needs a live project.
- **Dark mode (check 12):** the token definitions are checked, but the look (contrast of placeholders, selection outline) is manual.
- **Real pointer and keyboard on the real Chart.js:** the suite uses a stand-in and calls its handlers directly. Check hover, tooltip and the selected ring in a browser.
