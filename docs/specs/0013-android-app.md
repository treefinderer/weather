# 0013 Android app: foundation and accounts

**Status: on hold (owner, 2026-11-11).** Approved on 2026-11-08, then paused before any build. Nothing in `android/` exists yet. To resume: install Android Studio, then start stage 2.

## Request

> "i want to build a native app with all the same functionality that we currently have in web app"

Fixed decisions (owner, 2026-11-08):
- **Platform:** Android only, truly native: Kotlin and Jetpack Compose.
- **Audience:** just the owner for now. A debug APK on their own phone or an emulator. No Google Play, store listing or store review.
- **Backend:** the current Supabase project, as is. All server calls sit in one data layer in the app, because the owner plans to move hosting later and only that layer should need rewriting.

Full parity is too big for one spec. This spec sets the roadmap and builds the first slice only.

## Goal

The owner can install a native Android app, create an account or sign in with their existing one, stay signed in across restarts, recover a forgotten password, and set the same °C/°F preference the website uses. Later specs add the remaining web features in the order below.

## Scope

### Parity roadmap

Spec numbers are proposed. If web specs are added in between, the numbers move and the order stays.

| Web feature (source spec) | Android spec | Slice |
|---|---|---|
| Sign up, email confirmation message, resend confirmation (0001) | **0013** | Foundation and accounts |
| Sign in, sign out, session kept across restarts (0001) | **0013** | Foundation and accounts |
| Forgot password (0001) | **0013** | Foundation and accounts; the new password is set on the website |
| °C/°F preference shared with the web (0001) | **0013** | Foundation and accounts |
| Up to 10 cities: list, remove, limit message (0002, 0006) | 0014 | Cities |
| Live city search with suggestions (0008) | 0014 | Cities (see Open question 2) |
| Latest readings on city cards, in the chosen unit (0002, 0006) | 0014 | Cities |
| Source credits and "records, doesn't forecast" note, from the web footer | 0014 | Cities: an About screen, extended by later slices |
| Latest satellite picture on city cards (0009) | 0015 | Pictures and webcam: signed URLs from the private bucket, through the data layer |
| Live webcam, opened on request, with the Windy credit (0010) | 0015 | Pictures and webcam: Windy's stored player URL in a WebView; the app never calls the Windy API |
| History period presets, custom range, source control (Average, Open-Meteo, MET Norway) (0003, 0007) | 0016 | History |
| Period summary, daily readings table with paging (0003, 0007) | 0016 | History |
| Day and night temperature chart, averages chart (0003, 0007) | 0016 | History: drawn with Compose, with a TalkBack alternative |
| Satellite picture viewer linked to the chart, Older/Newer, opens on the newest picture (0009) | 0017 | History pictures |
| Change password in Settings (0001) | 0018 | Settings |
| Email notifications: digests, send time, timezone, digest cities, the "not available yet" notice (0004, 0006) | 0018 | Settings |
| Range alerts, up to 20 (0004, 0006) | 0018 | Settings |
| Chat assistant for visitors and signed-in users, 5 questions a day (0012) | 0019 | Chat: calls the existing `chat` function. Its CORS code only sets headers and doesn't refuse callers, so no backend change is expected |

Stays on the web, with no app slice:
- **Landing marketing sections (0005, 0011):** replaced by the Sign in screen (see Behavior).
- **Set a new password and email-confirmation pages (0001):** opened from email links.
- **The unsubscribe page (0004):** emails keep linking to the website.

### In (first slice only)

- **Project in `android/`:** one `app` module, Kotlin, Compose, Material 3, a committed Gradle wrapper and a version catalog. App name "Weather Insights", application id `io.github.treefinderer.weather`.
- **`android/.gitignore`:** covers at least `.gradle/`, `build/`, `local.properties`, `.idea/`, `*.apk`, `*.aab`, `*.jks` and `*.keystore`. The root `.gitignore` covers none of these.
- **Data layer** in `android/app/src/main/java/io/github/treefinderer/weather/data/`:
  - One Kotlin interface, in the app's own terms: sign up, sign in, sign out, request password reset, resend confirmation, session state, load unit, save unit.
  - Its results and errors are app-defined types. No Supabase or Ktor type crosses the boundary.
  - The Supabase URL, the anon key (copied from `config.js`) and the web app URL live in one file in this package.
- **Screens:** Loading, Unavailable, Sign in, Sign up, Forgot password, Home placeholder, Settings (unit only).
- **Tests:** Gradle unit tests for the data layer (mocked HTTP) and the screen logic (fake data layer). No test calls the real Supabase.
- **CLAUDE.md:** the developer adds this Architecture bullet:

  "**Android app (spec 0013):** native Kotlin and Jetpack Compose in `android/`, built with Gradle (owner-approved exception to the web frontend's "No build step" and runtime-library rules, 2026-11-08; those rules still apply unchanged to the web). A debug APK for the owner only, with no store release. All server calls sit in the app's `data` package, so a hosting move rewrites only that package. Runtime libraries, each pinned to an exact version in `android/gradle/libs.versions.toml`: Jetpack Compose with Material 3; AndroidX Activity, Lifecycle and Navigation; supabase-kt with Ktor; kotlinx coroutines and serialization; Coil from spec 0015. Charts are drawn with Compose, with no chart library. Only the Supabase URL and anon key may be in the app, and no other secret ever goes in the APK. Keyed services and weather collection stay behind the Edge Functions. `tests/run.sh` covers the web; Android unit tests run with `./gradlew testDebugUnitTest` in `android/`."

**Libraries:**
- **Server access: supabase-kt (`auth-kt` and `postgrest-kt` now; `storage-kt` and `functions-kt` when needed), recommended over plain HTTP.** Token storage, refresh and expiry are the riskiest code to write by hand. The data-layer interface keeps the library replaceable. Its Ktor engine can be mocked in unit tests.
- **Compose:** Compose BOM, Material 3, `activity-compose`, `lifecycle-viewmodel-compose`, `navigation-compose`.
- **Charts (0016):** drawn with Compose `Canvas`. The chart needs a tap-to-select link to the picture viewer and a TalkBack alternative, and a library would add a dependency for two charts. If 0016 finds this impractical, it proposes a pinned library.
- **Images (0015):** Coil.
- **Test only:** JUnit, `kotlinx-coroutines-test`, Ktor `MockEngine`.
- The developer picks current stable versions that work together, pins them exactly, and uses no dynamic versions.

**No backend change for this slice:** no migration, Edge Function, secret or Supabase setting changes. The app uses Supabase Auth and the existing `profiles` table with its RLS policies.

Out:
- Everything assigned to 0014 and later, including Change password.
- Google Play, release signing, CI for Android, push notifications, widgets, offline history.
- An in-app Set a new password screen, deep links and App Links (see Open question 1).
- Any change to the web app, `.github/workflows/`, `supabase/` or `tests/`.
- Any manual theme switch, and bundled fonts: the app uses the system font.
- Keystore encryption of the stored session. It is app-private and excluded from backups, which suits a one-person debug build. Add encryption before any wider release.

## Behavior

**Not published**
- `.github/workflows/pages.yml` copies only `index.html`, `style.css`, the root `./*.js` (not recursive) and `assets`, so `android/` is never published.
- The workflow has no path filter, so an Android merge still redeploys the unchanged site. That is harmless.
- An Android-only merge changes no web file, so it needs no cache-busting bump. The release's curl check becomes criterion 2.

**Screens** (signed-out users get no marketing content)
1. **Loading:** shown while the stored session is read, so Sign in never flashes for a signed-in user.
2. **Unavailable:** if the backend config is missing: "Accounts are unavailable right now. Please try again later."
3. **Sign in:** the first screen when signed out. It shows the logo, "Weather Insights", the tagline "Weather, remembered.", email, password, "Sign in", "Forgot password?" and "Create an account". 0019 adds the visitor chat here.
4. **Sign up:** email, password, confirm password, "Create account", "Already have an account? Sign in".
5. **Forgot password:** email and "Send reset link". The email is prefilled from Sign in.
6. **Home:** a top bar with the user's email, Settings and Sign out, the heading "Your cities", and "Your cities will appear here in a later version." The web's "No cities yet." would be untrue for an account that has cities.
7. **Settings:** °C and °F radio options and Back.

System Back goes from Sign up or Forgot password to Sign in, and from Settings to Home. On Sign in or Home it leaves the app.

**Accounts** (the same rules and message text as `auth.js`)
- **Password rule:** at least 10 characters with an upper-case letter, a lower-case letter and a digit, otherwise "Use at least 10 characters, with upper case, lower case and a digit." A mismatch shows "Passwords don't match." Neither makes a server call.
- **Empty fields:** "Enter your email and password." (or "Enter your email." on Forgot password), with no server call. Email is trimmed.
- **Sign up:** with email confirmation on, shows "Check your email to confirm your account." The confirmation link opens the website. The user then returns to the app and signs in.
- **Sign in errors:**
  - "Email or password is incorrect.": the email stays and the password is cleared.
  - "Please confirm your email first.": with a "Resend confirmation email" button, which shows "Confirmation email sent." on success.
- **Other server errors:** the server's message is shown.
- **Network failure or a 20-second timeout:** "Can't reach the server. Check your connection and try again." Typed values stay, except the password after a failed sign-in.
- **Slow replies:** the button is disabled and relabelled ("Signing in…", "Creating account…", "Sending…", "Signing out…"), so a double tap sends one request.
- **Passwords** are never written to storage or logs and don't survive the app being killed. A typed email survives rotation.
- **Sign out:** a global sign-out, as on the web, so it also ends the web session. If that call fails, the session is cleared on this phone anyway, and the app returns to Sign in.

**Session**
- Saved in app-private storage and restored on launch. `android:allowBackup="false"` keeps tokens out of device backups.
- Expired access tokens refresh automatically.
- **Offline at launch:** the user stays signed in and Home shows.
- **Refresh token rejected** (for example, the session was revoked, or a password reset ended it): the session is cleared and the app returns to Sign in with "Please sign in again."
- The developer confirms how supabase-kt behaves in each case above, and adds handling where it differs.

**Password reset**
- **Recommended, and the simplest:** the emailed link opens the existing website screen.
  - "Send reset link" calls the Supabase recover endpoint with `redirect_to` set to `https://treefinderer.github.io/weather/`.
  - The link opens "Set a new password" on the website in any browser. The user saves the password there, returns to the app and signs in.
- **No Supabase redirect change is needed,** since the web app already uses that URL (spec 0001, decision 4).
- The app must use the implicit flow, not PKCE. With PKCE the secret half stays on the phone, and the website couldn't finish the reset.
- Sign-up and resend-confirmation requests carry the same `redirect_to`. If supabase-kt can't send it on one of them, the data layer makes that one call directly with HTTP.
- **Forgot password messages:**
  - On success or "user not found": "If an account exists for that email, we've sent a reset link."
  - Below it, always: "Open the link in the email to choose a new password on the website, then come back and sign in."
  - On network failure: the network message.

**°C/°F**
- Stored only in `profiles.unit`, the column the website uses. There is no app-side copy.
- Read after sign-in, at launch when already signed in, and each time Settings opens.
- Tapping an option upserts `{id, unit}` at once and shows "Saved".
- **Failed save:** the selection returns to the previous value, with "Couldn't save the unit. Try again." or the network message.
- **Missing row:** °C, and the first save creates the row.
- **Failed read:** the options are disabled and the network message shows with "Try again". This stops a wrong default from overwriting the saved value.
- The website reads the unit when it loads, so a change made in the app shows there after a reload.

**Security**
- Only the Supabase URL and anon key are in the app. No other secret may ever be in the APK or under `android/`.
- Weather collection, Windy, Cloudflare and Resend stay behind the existing Edge Functions, and RLS still protects the data.
- The only permission is `INTERNET`, and cleartext traffic is off.
- Library logging is off, and tokens, passwords and emails are never logged.

**Look and access**
- **Theme:** dark and light follow the system.
- **Colors** match `style.css`, as light / dark:

| Token | Light | Dark |
|---|---|---|
| `bg` | `#f5f5f7` | `#000000` |
| `surface` | `#ffffff` | `#1c1c1e` |
| `text` | `#1d1d1f` | `#f5f5f7` |
| `muted` | `#6e6e73` | `#a1a1a6` |
| `accent` | `#0066cc` | `#2997ff` |
| `btn-bg` | `#0071e3` | `#0071e3` |
| `on-accent` | `#ffffff` | `#ffffff` |
| `border` | `#86868b` | `#7c7c80` |
| `danger` | `#b3261e` | `#ff6961` |
| `ok` | `#1e7a3a` | `#30d158` |

- **Design brief (stage 1b):** not needed for this slice. It has standard forms in Material 3 with the colors above. The developer converts `assets/logo.svg` into a vector drawable and adaptive launcher icon. City cards (0014) and History (0016, 0017) will need briefs.
- **Touch targets:** at least 48dp.
- **TalkBack:** every control and field has a spoken name. Errors and "Saved" are announced through a live region. Focus moves to the new screen's heading when screens change.
- **Keyboard:** the on-screen keyboard's Next moves between fields and Done submits. A hardware keyboard reaches every control with Tab, and focus is visible.
- **Narrow, large or landscape:** at 320dp width, in landscape, and at 200% font size, screens scroll vertically, nothing is clipped and there's no sideways scroll. The focused field stays above the keyboard, and content respects system bars.
- **Autofill:** email and password fields carry autofill hints.
- **Not applicable in this slice:** unknown locations and empty weather replies, since no city data is shown.

**Tooling and who verifies what**
- **Owner step, before stage 2:** install Android Studio from https://developer.android.com/studio, finish its setup wizard (Standard) and accept the SDK licenses. It provides the SDK, `adb`, a JDK and the emulator. Nothing has been checked or installed on this Mac yet, so the build can't start until this is done.
- **Agents can verify from the command line**, once Android Studio is installed, with `JAVA_HOME` set to its bundled JDK and `ANDROID_HOME` to `~/Library/Android/sdk`. In `android/`: `./gradlew testDebugUnitTest lintDebug assembleDebug`, plus repo searches and APK inspection. That covers criteria 1 to 10. If the session's permissions refuse Gradle, ask the owner.
- **Only the owner can verify** criteria 11 and 12, on a device or emulator, because this session has no emulator tool. The APK is at `android/app/build/outputs/apk/debug/app-debug.apk`. Install it with Android Studio or `adb install -r`.
- `tests/run.sh` covers only the web and must keep passing.

## Acceptance criteria

1. **Build [Gradle]:** in `android/`, `./gradlew testDebugUnitTest lintDebug assembleDebug` exits 0 and produces `app-debug.apk`.
2. **Web untouched [repo, curl]:** the branch changes only `android/`, `CLAUDE.md` and `docs/`. `tests/run.sh` prints `RESULT: PASS`. After release, `https://treefinderer.github.io/weather/android/settings.gradle.kts` returns 404.
3. **Data-layer boundary [repo]:** imports of `io.github.jan.supabase` and `io.ktor`, and the project's `supabase.co` host, appear in `android/app/src/main` only under the `data` package.
4. **Secrets [repo, APK]:** neither `android/` nor the text of the APK's dex files contains `service_role`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `WINDY_API_KEY`, `CF_API_TOKEN`, `CHAT_SALT`, `COLLECT_SECRET` or `UNSUBSCRIBE_SECRET`. The only JWT present decodes to `"role":"anon"`. The manifest declares only `INTERNET`, cleartext traffic off and `allowBackup="false"`.
5. **Start and sign out [Gradle]:** with no stored session the state goes Loading then Sign in. With one it goes Loading then Home, showing that email, and never Sign in. Sign out returns to Sign in with no email held, including when the server call fails.
6. **Sign-up rules [Gradle]:** an empty field, a password breaking any part of the rule, or a mismatched confirmation shows the matching message and makes no data-layer call. A valid sign-up with no session returned shows "Check your email to confirm your account."
7. **Sign-in errors [Gradle]:** invalid credentials shows "Email or password is incorrect.", keeps the email and clears the password. Unconfirmed email shows "Please confirm your email first." and a Resend action. A network failure and a 20-second timeout each show the "Can't reach the server…" message and re-enable the button. A double submit makes one call.
8. **Reset and links [Gradle, mocked HTTP]:** recover, sign-up and resend requests carry `redirect_to=https://treefinderer.github.io/weather/`, and the recover request has no `code_challenge`. Forgot password shows the same "If an account exists…" text for success and "user not found".
9. **Session survival [Gradle, mocked HTTP]:** a session saved by one data-layer instance is restored by a new one. An expired access token with a valid refresh token yields new tokens without signing in. A rejected refresh token gives the signed-out state. A network failure during refresh keeps the user signed in.
10. **Unit [Gradle, mocked HTTP]:** a `profiles` reply with `F` selects °F, and an empty reply selects °C. Choosing °F sends an upsert with the user's `id` and `unit: "F"` and shows "Saved". A failed save restores the previous option and shows the error. A failed read disables the options and sends no write.
11. **Real flows [owner, device]:** on the real project:
    - (a) Sign in works.
    - (b) After force-stopping and reopening the app, Home shows with no sign-in.
    - (c) A new account's confirmation email leads to a successful sign-in.
    - (d) A reset email's link opens Set a new password on the website, and the new password then works in the app.
    - (e) °F set in the app shows on the website after a reload, and °C set on the website shows when the app's Settings is reopened.
12. **Look and access [owner, device]:**
    - With the system in light and in dark, colors match the website and all text is readable.
    - With TalkBack on, every screen can be completed and each control is announced by name, and errors are spoken.
    - In landscape and at the largest font size, every control can be reached by scrolling, with no clipped text.

## Open questions (answered 2026-11-08, see Owner decisions)

1. **Password reset in the browser.** Is it acceptable that the emailed link finishes on the website, and you then sign in again in the app? An in-app screen would need a custom-scheme deep link and a new Supabase redirect URL added by you. Verified App Links wouldn't work on this host, because a GitHub project site can't serve the domain-root file they need. **Recommendation:** yes, keep the website step, and revisit after the hosting move.
2. **City search in 0014.** The website's city search calls Open-Meteo's keyless geocoding API directly from the browser (`cities.js`), and no Edge Function exists for it. May the app do the same from its data layer? The alternative is a new Edge Function, which is a backend change. **Recommendation:** the same direct, keyless call. No secret is involved, and 0014 can confirm this. It doesn't affect this slice.
3. **Your device.** Which Android version does your phone run, or will you use the emulator? **Recommendation:** minimum Android 8.0 (API 26), which covers nearly all phones in use. Tell us if yours is older.
4. **Merge gate.** Criteria 11 and 12 can only be checked by you, while the normal release has no owner gate. Should the merge wait for your device check? **Recommendation:** yes, for this first slice, because only a real device proves the sign-in flows. `docs/qa/0013-android-app.md` records the result.

## Owner decisions (2026-11-08)

Spec approved. All four recommendations accepted:

1. Password reset finishes on the website, and the user then signs in to the app.
2. City search in 0014 uses the same direct, keyless Open-Meteo call as the website, from the data layer.
3. Minimum Android 8.0 (API 26).
4. The merge of this slice waits for the owner's device checks (criteria 11 and 12).
