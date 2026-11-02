# 0010 Live webcam per city

## Request

> "wanted webcam pictures per city"

> "at this point we don't know what city the user may select. So we would need to search for the cameras in that city once it's selected at least by one user. Also if both users ... select the same city then we don't need to save the same pictures multiple times ... To reduce number of records in database"

Fixed decisions (owner, 2026-11-01, after the orchestrator checked the Windy Webcams API terms of use, https://account.windy.com/agreements/windy-webcams-api-terms-of-use):
- **Live webcam only. No pictures are stored.** The terms forbid publishing graphics of stored webcam images and redistributing content. On the free tier, image URLs are token-secured and expire after about 10 to 15 minutes.
- Images must use URLs that the API provides, and must link to the webcam page or player.
- **Mandatory visible credit:** "Webcams provided by windy.com - add new webcam", linking to windy.com and windy.com/webcams/add.
- The API needs a key, sent in the `x-windy-api-key` header. The free-tier player may show ads.

Fixed decisions (orchestrator, 2026-11-01):
- **Server-side lookup:** an Edge Function finds a webcam once per city, after the city is first followed by at least one user. It stores the camera on the shared `cities` row: one record per city, not per user, and no images. Lookups are refreshed weekly, and sooner when the stored camera stops working.
- **Key handling:** `WINDY_API_KEY` exists only as a Supabase secret. The browser never sees it and never calls the Windy API.

## Goal

Each city card on Your cities gets a "Live view": the visitor can open Windy's live webcam player for a camera near that city, see the camera's name, and follow a link to its page on windy.com. When no camera is near a city, the card says so quietly.

## Scope

In:
- **Migration** (next free number in `supabase/migrations/` at build time, because 0009 may add one too). It adds nullable webcam columns to `public.cities`:
  - `webcam_id`
  - `webcam_title`
  - `webcam_page_url`: the camera's page on windy.com
  - `webcam_player_url`: the embeddable player
  - `webcam_status`: `found` or `none`, null until the first lookup
  - `webcam_checked_at`
  - `webcam_next_try_at`: used for retry after failures
  
  It needs no new table, no per-user rows and no image columns. Existing RLS (`cities_select_followed`) already limits who can read these columns. Authenticated users still can't write `cities`.
- **New Edge Function `supabase/functions/webcams/`**, with `index.ts`, `logic.ts`, `logic_test.ts` and fixtures, following the same pattern as `collect`.
  - pg_cron calls it every hour, at a minute that doesn't clash with `collect`. It uses the same `x-collect-secret` header and Vault entries, so no new Vault secret is needed.
  - It looks up only cities that are followed and due (see Behavior).
- **Frontend:** a new IIFE `webcam.js`, loaded after `cities.js` and sharing only through `window.Wx`.
  - `cities.js` adds the webcam columns to its `cities` select.
  - Styles go in `style.css`, with new tokens if they are needed.
- **Tests:** frontend checks in `tests/tests.js`, and Deno tests for `webcams/logic.ts` using fixtures. No test calls the real Windy API.
- **Docs:** `supabase/README.md` gets the steps for the owner to set the secret and deploy. The developer proposes the CLAUDE.md wording (see Open questions) but doesn't edit CLAUDE.md until the owner confirms it.

Out:
- **Storing or proxying any webcam image,** thumbnails included. A thumbnail would need a fresh token URL from an Edge Function on every view: one keyed Windy call per card per visit, with URLs that expire while the page is open. It is out until the owner asks for it.
- **Timelapses, history of pictures, and more than one camera per city.** Saved pictures are spec 0009, which is a separate spec and not touched here.
- **Webcams on History, Landing, emails or Settings.**
- **Any browser request to `api.windy.com`,** and any Windy key in the repo, the frontend or a response body.
- **A paid Windy tier or removing ads.**

## Behavior

**Showing the camera: player embed, not image URLs (decision and reasoning)**
- The card uses the embeddable player URL that the API returned at lookup time. It is stored in `webcam_player_url`. Windy v3 `include=player` is expected to return it, for example a `.../embed/player/{id}/day` URL.
- Why the player and not image URLs:
  - **Uses API URLs:** the player URL comes from the API as-is.
  - **Links every image:** the player is Windy's own page, and the card also links to `webcam_page_url`.
  - **Keeps the key private:** the player URL needs no key and no Edge Function call at view time.
  - **Stores no images:** only the URL is kept.
- **Developer must confirm** with a real key that the player URL doesn't expire the way image URLs do. If it does expire, stop and report back. Don't build a per-view image proxy without a new owner decision.

**Lookup (Edge Function `webcams`)**
- **A city is due** when at least one user follows it and any of these is true:
  - `webcam_status` is null (never looked up)
  - `webcam_checked_at` is more than 7 days old
  - `webcam_next_try_at` has passed
- **First lookup timing:** a newly followed city gets its first lookup within about an hour, on the next run.
- **Batch size:** each run handles at most a small batch, for example 10 cities, oldest due first. Leftover cities wait for the next run.
- **A city followed by several users** is one `cities` row, so it gets one lookup and one stored camera.
- **Request:**
  - `GET https://api.windy.com/webcams/api/v3/webcams` with the header `x-windy-api-key: <WINDY_API_KEY>`
  - `nearby=<lat>,<lon>,<radius_km>`
  - `include` containing at least `player`, `urls` and `location`
  - a timeout of about 10 seconds
  - The developer confirms the exact parameter names and response fields against the v3 documentation. Radius: see Open questions. Until the owner decides, use 25 km.
- **Choosing a camera:**
  - Ignore cameras that aren't `active`.
  - Ignore cameras whose last update is more than 48 hours old, when the API gives a last-update time.
  - Pick the closest remaining camera by distance from the city's lat/lon. If two are equally close, pick the one with more views. If still tied, pick the lower id.
- **Result found:** store the id, title, page URL and player URL. Set `webcam_status = 'found'`, `webcam_checked_at = now()` and `webcam_next_try_at = null`.
- **No camera in radius,** or every camera was filtered out: clear the four camera fields. Set `webcam_status = 'none'` and `webcam_checked_at = now()`.
- **Stored camera stopped working:** at the weekly refresh, the camera is checked again. If it is no longer returned as active and recent, the normal choice rule runs and picks a replacement, or sets `none`.
- **Failure** (timeout, network error, HTTP 4xx/5xx including 429, or unparseable JSON):
  - Leave the existing webcam fields and status unchanged.
  - Set `webcam_next_try_at` to 1 hour later, growing to at most 24 hours on repeated failures.
  - Continue with the other cities. The function returns 200 with a list of failures that contains no secret.
- **Missing `WINDY_API_KEY`:** the function makes no Windy calls, writes nothing, and returns an error code. It never logs or returns the key.
- **Auth:** a missing or wrong `x-collect-secret` returns 401, and the function does nothing else.
- **Unfollowed cities:** when the last follower leaves, the stored camera stays, but no further lookups run for that city.

**City card (Your cities)**
- **Placement:** a "Live view" block goes at the bottom of each card, after the detail tiles. It is shown only when `webcam_status = 'found'` and `webcam_player_url` is set. It contains:
  - A toggle button, "Live view" (`aria-expanded="false"`, `aria-controls` pointing to the player area). Its accessible name includes the camera, for example "Live view: Zurich – Lake".
  - The camera's name (`webcam_title`) as a link to `webcam_page_url`, opening in a new tab with `rel="noopener noreferrer"`.
  - The credit, in small `--muted` text: "Webcams provided by windy.com - add new webcam". "windy.com" links to https://www.windy.com/ and "add new webcam" links to https://www.windy.com/webcams/add.
- **Opening:** pressing the button (click, Enter or Space) inserts an `<iframe>` with:
  - `src` set to `webcam_player_url`
  - `title="Live webcam: <camera name>"`
  - `loading="lazy"`
  - a box that keeps a 16:9 aspect ratio at the card's width
  
  The button text changes to "Hide live view" and `aria-expanded` becomes `true`. Pressing it again removes the iframe. Focus stays on the button.
- **Lazy loading:** no iframe exists and no request goes to windy.com until the visitor opens the player.
- **No layout shift:** the webcam fields arrive in the same `cities` query as the card. The block renders together with the card, so nothing moves in later. Only opening the player, which the visitor asks for, makes the card taller.
- **`webcam_status = 'none'`:** the card shows a single short line, "No webcam nearby", in `--muted` text, with no button and no credit.
- **`webcam_status` null** (not yet looked up): nothing webcam-related shows. The developer may choose to show "Looking for a webcam…" in muted text instead, but should say which one they chose.
- **Existing card behavior** stays as specified in 0006: ids, Tab order, Remove focus handling and the summary.

**Phone width (about 400px)**
- The button, camera name and credit wrap and never overflow. The open player fills the card's inner width at 16:9, with no sideways scroll.

**Keyboard only**
- Tab reaches, in order: the Live view button, the camera link, then the two credit links. Each one shows the `--focus` ring.
- The opened iframe is a single Tab stop after the button, before the links. Escape needs no special handling.

**Dark mode**
- Any new colors (the player box border and its background while loading) are `:root` tokens in both dark blocks.
- The player's own content belongs to Windy and isn't themed.

**Network and API replies**
- **Slow or blocked player:** the 16:9 box shows a `--surface-2`-style background until the player paints. The camera link and credit stay usable.
- **Player fails to load:** the box stays empty, and the camera page link remains the way to reach the camera.
- **Failed `cities` load:** today's error message and **Try again** apply unchanged.
- **Unknown or odd locations** (remote, polar or at sea): the lookup simply finds nothing, and the card shows "No webcam nearby".

**Owner actions (not done by agents)**
1. Create a Windy Webcams API key at https://api.windy.com/keys.
2. Set the key with `supabase secrets set WINDY_API_KEY=...` yourself. Never paste it in chat, a commit or a file.
3. Deploy the `webcams` function with JWT verification off, and run the migration, following `supabase/README.md`.

## Acceptance criteria

1. **Migration:** the new migration adds the webcam columns to `public.cities` and creates no other table. It has no image, bytea or picture-URL column, and keeps RLS on. Signed in as a normal user, an `update` on `cities.webcam_id` is rejected.
2. **Request:** a Deno test with a mocked fetch shows the request goes to `/webcams/api/v3/webcams` with `nearby=<lat>,<lon>,25` and an `include` that has `player`. The `x-windy-api-key` header is taken from `WINDY_API_KEY`.
3. **Choosing a camera:** given a fixture with three cameras (one inactive, one 40 hours stale but active, one farther but fresh and active), the function stores the closest camera that is active and fresh. It stores that camera's id, title, page URL and player URL, with status `found`.
4. **No camera:** given an empty-result fixture, the city gets status `none`, `webcam_checked_at` is set, and the camera fields are null.
5. **Failure:** when Windy returns HTTP 429 or 500, or times out, the city's existing camera fields and status are unchanged and `webcam_next_try_at` is about 1 hour ahead. The next city in the batch is still processed, and the function returns 200.
6. **Which cities:** only followed and due cities are looked up. A city followed by two users makes exactly one Windy request and keeps one row. A city checked 2 days ago with status `found` makes no request. A missing or wrong `x-collect-secret` returns 401 and makes no request.
7. **No key in the browser:** searching the repo finds no Windy key value. No frontend file references `api.windy.com` or `x-windy-api-key`, and no function response contains the key.
8. **Card with a camera:** a city with `webcam_status = 'found'` shows the "Live view" button (`aria-expanded="false"`), the camera name linking to its windy.com page, and the exact credit "Webcams provided by windy.com - add new webcam", whose two links go to windy.com and windy.com/webcams/add. No `<iframe>` exists yet.
9. **Opening and closing:** pressing Enter on the Live view button inserts one iframe whose `src` equals the stored player URL, with a `title` naming the camera and `loading="lazy"`. The button reads "Hide live view" with `aria-expanded="true"`. Pressing it again removes the iframe, and focus stays on the button.
10. **Other statuses:** a city with status `none` shows "No webcam nearby" and no button or credit. A city with status null shows no webcam button, credit or iframe. Neither case logs a console error.
11. **Phone width:** at a 400px viewport with 10 cities, one of them with the player open, there is no horizontal scrollbar. The player box is 16:9 at the card's width, and card heights don't change after the first render until a player is opened.
12. **Keyboard, dark mode and test suite:** Tab order is Live view button, then camera link, then the credit links, each with a visible focus ring. The block reads correctly with OS dark mode and with `data-theme="dark"`. All earlier tests still pass and `tests/run.sh` prints `RESULT: PASS`.

## Open questions

1. **Architecture exception.** CLAUDE.md says weather sources are keyless and the frontend talks to Supabase only. This spec adds a keyed, non-weather service (Windy Webcams, with the key only in Supabase secrets), and an iframe that loads windy.com in the browser when the visitor opens it. Do you accept both? If so, the developer proposes a new Architecture bullet for CLAUDE.md, for example: "**Webcams (spec 0010):** Windy Webcams API v3, keyed; `WINDY_API_KEY` only as a Supabase secret, used by the `webcams` Edge Function; the browser only embeds Windy's player URL and never calls the API."
2. **Search radius.** The spec uses 25 km as a placeholder. Would you prefer something smaller, such as 10 km so the camera really is "in the city", or larger, such as 50 km, so more cities get a camera?
3. **Which camera when there are several.** The spec picks the closest active, recent camera. Would you rather pick the most popular camera within the radius, or the one Windy marks as best quality?
4. **Ads.** The free-tier Windy player may show ads inside the iframe. Is that acceptable on the site?
5. **Credit placement.** The spec shows the credit on every card that has a camera. Is once per Your cities page, shown when any camera is present, enough for you? Windy's terms say "visible", so per card is the safer choice.
6. **First-lookup delay.** A newly followed city gets its camera within about an hour, on the next hourly run. Is that fine, or should following a city start the lookup right away? That would need a database trigger or a call from the browser.
7. **Free-tier limits.** Do you know your key's request quota? The design uses about one request per followed city per week, plus retries.

## Owner decisions (2026-11-01)

- Architecture exception accepted: Windy Webcams API (keyed, `WINDY_API_KEY` only as a Supabase secret) and an embedded windy.com player. Ads in the free player are acceptable. The developer adds the CLAUDE.md Architecture bullet proposed in open question 1.
- Camera choice: the most viewed active camera within 25 km. It skips cameras that are inactive or haven't updated in 48 h, and the closest one wins a tie. This replaces "closest first" in the selection rule and its acceptance check.
- Credit: on every card with a camera, in normal body text as the design brief says (the brief overrides "small muted").
- First lookup: within about an hour by the hourly job is fine.
