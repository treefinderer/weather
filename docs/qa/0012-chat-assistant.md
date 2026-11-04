# QA 0012 Chat assistant

- Date: 2026-11-03
- Branch: feature/0012-chat-assistant
- Commit tested: ae04b98 (feature code; tests added on top)
- Result: **PASS**. `tests/run.sh`: `RESULT: PASS 886/886`
- `supabase/functions/chat/logic_test.ts` was **not run** (Deno isn't installed here). Criteria 8, 9 and 10 are therefore unverified.

## Covered (group "Chat assistant (0012)" in tests/tests.js)
The harness mock now supports real HTTP statuses and a hung request (`{ __http, body }`, `{ __never }`) and records request headers. The chat function is mocked for 200, 429 limit, 429 busy, 502, 503, a network error, a non-JSON body, an empty reply and a 30 s timeout. Nothing calls Cloudflare.
- 2 Launcher on Landing, Sign in, Your cities, History and Settings, at 400px and 1280px: named, fixed, 56px, 16px from the bottom-right; after scrolling to the end it covers no link or control.
- 3 Tab stop between page content and footer links; aria-expanded and aria-controls; focus moves to the input on open; Escape and Close return focus to the launcher.
- 4 Title, Close, role=log polite list, hidden "Your question" label, placeholder, maxlength 500, counter, AI note, provider line (panel only); greetings (visitor, signed in); one status call `{messages: []}` per conversation; anon key vs access token in `Authorization`.
- 5 `<b>Hi</b>` shown as literal text; counter text; the request is the trimmed question, at most 10 messages, ends on the user message; empty input sends nothing; Thinking and one-at-a-time; reopening keeps the chat; signing out clears it.
- 6 Limit: message with local reset time, input and Send disabled, counter 0, nothing sent while locked, unlock after the reset time. Limit from the status call. Busy: message, disabled, counter unchanged.
- 7 Unavailable (502, 503, network error, non-JSON, empty reply, timeout at 30 s): notice, counter unchanged, input enabled, focus back, no uncaught errors, a failed question is not resent. Status call failing (network error, 404, 500): counter hidden, notice once, chat still works.
- 12 Phone sheet at 400px: full width, 85% height, scrim, inert page and launcher, scroll lock, no sideways scroll, a 300-character word wraps; lock and inert released on Escape, scrim tap and Close. Desktop card 380px. `--chat-bot-bg` and `--scrim` in `:root` and both dark blocks with the brief's values; no literal colours in the chat CSS; icon masks; reduced-motion rule; footer padding 104px.
- 11 (static) No `api.cloudflare.com` or Cloudflare secret names in any frontend file; chat.js stores nothing, no innerHTML, one fetch to the chat function; no console.log in index.ts or logic.ts, console output limited to the header-name line and the log hook, logic.ts logs only fixed text, codes, durations and token counts; the service-role client touches only chat_usage, chat_take and chat_refund; user data goes through the user-token client.
- 1 (static) Migration 0006: columns key, day, count only; primary key (key, day); RLS on with no policies; table access revoked; both functions security definer with `search_path = ''`; execute revoked from public/anon/authenticated and granted to service_role only.

## Not checked by the suite
- Criterion 1 runtime part (anon and authenticated really rejected by Postgres) needs a real Supabase project.
- Dark-mode look (manual): bubbles, notice bar, launcher and icons with OS dark and `data-theme="dark"`. Token values are verified, appearance is not.
- On-screen keyboard fitting (`visualViewport`) on a real phone.
- °C/°F change keeping the chat was not tested.

## Live checks for the owner (after the secrets, migration and deploy)
1. The first real Workers AI call: ask a question signed out and signed in, and confirm a sensible reply and that the counter drops.
2. The model `@cf/meta/llama-3.1-8b-instruct-fp8-fast` (or `CHAT_MODEL`) is still available on the account.
3. The IP header log: after the first cold start, read the function log line "chat: ip headers present" and confirm the header the visitor key uses is there.
4. The real limits: the 6th question in a day gets the limit message; the status call shows the right count after a reload; `CHAT_VISITOR_DAILY_LIMIT` and `CHAT_GLOBAL_DAILY_LIMIT` behave as set; a failed AI call is refunded.
5. Anon and authenticated calls to `chat_usage` and `rpc('chat_take')` are rejected.

## Failures
None. Bugs found: none.
