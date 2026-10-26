# 0001 User accounts

## Request

> "Each user authenticates with login and password, there's option to reset the password in the user settings or during login if user forgot his email. [...] There should be option to select both - Celsius and Fahrenheit."

This is the accounts part of the owner's full request. Cities and collection are spec 0002, history views 0003, notifications 0004.

## Goal

A visitor can create an account with email and password, sign in, stay signed in across reloads, reset or change their password, and choose °C or °F once for every device they use. Signed-in users see an empty app shell that later specs fill.

## Scope

**In**
- Sign up, sign in and sign out with email + password (Supabase Auth). The session survives a reload.
- "Forgot password?" on the sign-in form. It sends a Supabase reset email, and the link in that email opens a "Set a new password" screen.
- "Change password" in Settings while signed in.
- A `profiles` table (one row per user, RLS limited to `auth.uid()`) holding the temperature unit, `C` or `F`, default `C`. You pick it in Settings.
- A signed-in shell: a header with the user's email, a Settings button and a Sign out button, plus an empty "Your cities" section with placeholder text.
- Loading `supabase-js` from jsDelivr at a pinned exact version, plus a small committed config holding the project URL and anon key.

**Out**
- Cities, weather collection, tables, charts, notifications (specs 0002 to 0004).
- Social or magic-link login, changing the account email, deleting the account, a light/dark theme switch.
- Converting temperatures anywhere. 0001 only stores the preference and exposes it.

## Behavior

**Files and wiring**
- New `auth.js` (an IIFE, loaded after the pinned `supabase-js` script and `common.js`). New markup goes in `index.html` and new styles in `style.css`, using the existing tokens (`--bg`, `--surface`, `--text`, `--muted`, `--accent`) plus any new tokens, each with both dark-mode overrides.
- New migration in `supabase/migrations/`. It creates `profiles (id uuid primary key references auth.users on delete cascade, unit text not null default 'C' check (unit in ('C','F')), updated_at timestamptz)`, enables RLS with select, insert and update policies limited to `id = auth.uid()`, and adds a trigger that creates the profile row when a user signs up.
- `auth.js` shares state with later features only through `window.Wx`: the Supabase client, the current user (or null), the current unit (`"C"` or `"F"`), and a way to be told when the user or the unit changes. 0002 and later must not create their own client.

**Screens** (only one shows at a time)
1. *Loading*: shown while the stored session is being checked on page load, so the sign-in form never flashes for a user who is already signed in.
2. *Sign in*: email, password, "Sign in" button, "Forgot password?" link, "Create an account" link. This is the only thing a signed-out visitor can reach.
3. *Sign up*: email, password, confirm password, "Create account" button, "Already have an account? Sign in" link.
4. *Forgot password*: email and a "Send reset link" button. It calls `resetPasswordForEmail` with `redirectTo` set to the app's own URL. Afterwards it always shows "If an account exists for that email, we've sent a reset link." whether or not the address is registered, so the form can't be used to find out who has an account.
5. *Set a new password*: shown when the app is opened from a reset link (Supabase fires a `PASSWORD_RECOVERY` event). New password, confirm, and "Save password". On success the user lands in the shell, signed in, with "Password updated."
6. *Shell*: a header with the user's email, Settings and Sign out. Main area: a "Your cities" heading and "No cities yet." (placeholder for 0002).
7. *Settings* (inside the shell; a "Back" control returns to the shell):
   - Temperature unit: two radio buttons, °C and °F. Changing one saves it to `profiles` straight away and shows "Saved". If the save fails, the selection goes back to the previous value and shows an error.
   - Change password: current password, new password, confirm, and "Change password". It checks the current password by signing in again with it, then calls `updateUser({ password })`. A wrong current password shows "Current password is incorrect." and nothing changes.

**Validation and errors** (shown as text next to the form, announced to screen readers through an `aria-live` region, never with `alert()`)
- Password rule (owner, 2026-10-25): at least 10 characters with an upper-case letter, a lower-case letter and a digit. It is checked in the browser before any call and shows "Use at least 10 characters, with upper case, lower case and a digit." The Supabase project's password settings should be set to match. A mismatched confirmation shows "Passwords don't match." No call is made in either case. If Supabase rejects the password anyway (weak or leaked password), its message is shown.
- Wrong email or password: "Email or password is incorrect." The email stays filled in and the password field is cleared.
- Email already registered on sign-up: show whatever Supabase returns. With email confirmation on, Supabase may report success without saying the address exists, and that is acceptable.
- Unconfirmed email (confirmation is on, owner 2026-10-25): after sign-up, show "Check your email to confirm your account." Signing in before confirming shows "Please confirm your email first." with a "Resend confirmation email" button.
- Expired or already-used reset link: "This reset link has expired. Request a new one." with a link to the Forgot password screen.
- Network failure, or the request is rejected or times out: "Can't reach the server. Check your connection and try again." The typed values stay (except passwords after a failed sign-in) and the button is re-enabled.
- Slow replies: while a request is in progress, its submit button is disabled and its label changes (for example "Signing in…"), so a double click sends only one request.
- `supabase-js` fails to load from the CDN, or the URL and anon key are missing from the config: show "Accounts are unavailable right now. Please reload the page later." instead of the forms, with no console-only failure.
- Missing profile row (for example the trigger failed): treat the unit as °C, and create the row on the first save.
- Session expires or is revoked in another tab: the app returns to the Sign in screen.

**Layout and access**
- At 400px wide, every screen fits with no sideways scroll. Form fields and buttons are full width, and the header email wraps or truncates with an ellipsis rather than pushing the buttons off-screen.
- Keyboard only: every control can be reached with Tab in a logical order and shows the existing `:focus-visible` outline. Enter submits the current form. When a screen changes, focus moves to its heading or first field. Every input has a visible `<label>`, and the right `autocomplete` values are used (`email`, `current-password`, `new-password`).
- Dark mode: all new colors come from tokens that have both dark overrides (the `prefers-color-scheme` block and `[data-theme="dark"]`), and error text stays readable in both themes.

## Acceptance criteria

Unless marked **[real Supabase]**, each check runs in `tests/tests.js` with `supabase-js` mocked.

1. With no stored session, the page shows the Sign in screen (email, password, "Sign in", "Forgot password?", "Create an account"), and the shell and Settings are not visible.
2. With a stored session (the mock `getSession` returns a user), the shell shows that user's email in the header, plus Settings, Sign out, and "Your cities" with "No cities yet." The Sign in form is never visible while this loads.
3. Submitting Sign up with a password that breaks the rule (under 10 characters, or missing an upper-case letter, a lower-case letter or a digit), or with a confirmation that doesn't match, shows the matching message, and `signUp` is not called.
4. A valid Sign up calls `signUp` with the typed email and password. When it returns no session (email confirmation on), "Check your email to confirm your account." shows. Signing in with a mocked "email not confirmed" error shows "Please confirm your email first." and a "Resend confirmation email" button.
5. Sign in with a mocked "invalid credentials" error shows "Email or password is incorrect.", keeps the email, and clears the password.
6. Sign in with a mocked network failure shows "Can't reach the server. Check your connection and try again." and re-enables the Sign in button. A double click while a request is in progress calls `signInWithPassword` only once.
7. Clicking Sign out calls `signOut` and returns to the Sign in screen with no email in the header.
8. Forgot password calls `resetPasswordForEmail` with the typed email and a `redirectTo` equal to the app URL, and shows the same "If an account exists…" message whether the mock reports success or "user not found".
9. A mocked `PASSWORD_RECOVERY` event shows the Set a new password screen. Saving a valid password calls `updateUser({ password })` and shows the shell with "Password updated."
10. In Settings, choosing °F writes `unit: 'F'` to `profiles` for the current user and shows "Saved". After a reload with the mock profile at `F`, °F is selected. A user with no profile row sees °C selected.
11. At a 400px viewport, the Sign in, Sign up, shell and Settings screens have no horizontal scroll (`scrollWidth <= clientWidth`), and every input has an associated `<label>`.
12. **[real Supabase]** Against the real project: (a) a reset email arrives and its link opens Set a new password, and the new password works for sign-in; (b) a unit set on one browser shows on another after sign-in; (c) signed in as user A, selecting from `profiles` returns only A's row, and updating B's row affects 0 rows.

## Decisions (owner, 2026-10-25)

1. "Forgot his email" means a forgotten password. There is no account-email recovery.
2. New users must confirm their email before signing in (Supabase "Confirm email" on).
3. Password rule: 10+ characters with upper case, lower case and a digit.
4. Release blocker, still open: the owner creates the Supabase project, shares its URL and anon key (safe to commit), and adds https://treefinderer.github.io/weather/ to the allowed redirect URLs. 0001 is built and tested against mocks until then.

Spec approved by the owner on 2026-10-25.
