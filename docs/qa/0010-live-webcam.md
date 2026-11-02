# QA 0010 Live webcam

- Date: 2026-11-01
- Commit tested: c6c6af9 (branch feature/0010-live-webcam)
- Result: PASS. `tests/run.sh` prints `RESULT: PASS 619/619`.

## Covered by tests/tests.js, group "Live webcam (0010)"

- Criterion 8: Live view button (aria-expanded=false, aria-controls to an existing element, name includes the camera), camera link (new tab, noopener noreferrer), exact credit text with both windy.com links, credit 17px in --text, no iframe and no windy request before opening, block is the last child of the card.
- Criterion 9: click inserts one iframe with the stored src, title "Live webcam: <name>" and loading=lazy. Button reads "Hide live view" with aria-expanded=true. Pressing again removes it and focus stays on the button. Enter and Space are not simulated (a keydown can't trigger native activation); the test checks the toggle is a native type=button.
- Criterion 10: status none shows "No webcam nearby" in --muted with no button, link or credit. Status null, or no webcam fields at all, shows nothing. No console errors.
- Non-https: a javascript:, data: or http: URL gives no block, so it is never used as src or href.
- Criterion 12: Tab order button, camera link, windy.com, add new webcam (and button, iframe, links when open). Focus-ring CSS rules present. Webcam rules use tokens only, and every token is defined in :root and both dark blocks. The player fill token is the existing `--pic-empty` (shared with 0009), not the brief's `--media-bg`.
- Criterion 11: 400px, ten cities, one player open: no sideways scroll, box 16:9 and as wide as the block, card heights unchanged after first render, only the opened card grows.
- Criterion 7: no frontend file mentions api.windy, x-windy-api-key or WINDY_API_KEY, and webcam.js makes no network call.
- Criterion 1, static checks on 0005_city_webcams.sql: seven columns, no table, no image/bytea column, status check, constraint tying the four camera fields to found, RLS on, authenticated write revoke, cron job reading Vault with no secret literal.
- Suite was checked to fail on a mutation (changed the credit separator, got a FAIL), then restored.

## Not run

- `supabase/functions/webcams/logic_test.ts` (criteria 2 to 6): Deno isn't installed, so it was not run.
- Not verifiable without live services: the Edge Function against the real Windy API, RLS rejecting an authenticated update, the cron job running.

## Manual and live checks for the owner

- Real key: set WINDY_API_KEY as a Supabase secret, deploy webcams, and confirm a followed city gets status found after the next hourly run.
- Confirm the stored player URL does not expire after 10 to 15 minutes (spec: stop and report if it does).
- Dark mode (OS and data-theme="dark"): token definitions are tested, but how the block and the player box look was not checked by eye.
- Real iframe behaviour (ads, Windy player at 400px) was not seen; the suite uses an unresolvable host.

## Known issue check

Reviewer's note: an open player's iframe reloads when cards re-render. Not reproduced. webcam.js keeps each city's block across renders (keyed on the camera fields), and a test that opens a player and switches °C/°F finds the same iframe element. Not checked: a re-render when satellite pictures arrive late (the same cached block is reused, so it should behave the same), and a re-render where the camera fields change (that rebuilds the block, which is intended).
