# 0011 Landing: satellite pictures and live view

## Request

> "now let's update front page and add a few section that are saying about new features we added (webcams, satellite pictures)"

Fixed decisions (orchestrator, 2026-11-03):
- Two new feature sections on Landing, one for satellite pictures (0009) and one for the live webcam view (0010). They use the existing pattern: eyebrow, title, short text, illustration.
- The copy is accurate to what is live. Satellite pictures arrive the day after. Webcams are live views from nearby public cameras, where available. Each section carries its source credit with links.
- The illustrations are new, original SVGs from the `designer` (stage 1b). No real satellite or webcam images, and no NASA or Windy logos.
- No new scripts.

## Goal

A visitor reading Landing learns that, besides readings and history, Weather Insights also keeps a satellite picture of each city and offers a live webcam view, so the page no longer undersells the site.

## Scope

In:
- **Two new sections** in `#screen-landing`, placed directly after History and before Email:
  1. **Satellite pictures**: `section.band.feature.feature-flip` (plain band, image on the flipped side), `aria-labelledby="feature-satellite-title"`, image `assets/feature-satellite.svg`.
  2. **Live view**: `section.band.band-alt.feature` (alt band), `aria-labelledby="feature-webcam-title"`, image `assets/feature-webcam.svg`.
  - Adding two sections keeps the alternation as it is: History (alt), Satellite (plain, flip), Live view (alt), Email (plain, flip), How it works (alt), closing (plain). Email and the sections after it need no class change.
- **Hero subline**: a minimal update (see Copy).
- **Copy** for both sections, as drafted below. Small wording edits by the developer are fine if the facts and credits stay the same.
- **Two SVG illustrations** in `assets/`, 640 × 480 like the other feature images, plus a short design brief `docs/design/0011-landing-new-features.md` (stage 1b).
- **Styles** only if the credit line needs one (for example a small class for the credit paragraph), as tokens in both dark blocks.
- **Tests** in `tests/tests.js` for the new sections and credits.

Out:
- Any change to the cities card, History, the picture viewer, the webcam player, or their behavior.
- Embedding a live player, a real satellite picture or any image from NASA or Windy on Landing. The 0010 rule "no webcams on Landing" still holds for the player itself. Landing only describes the feature.
- The How it works steps, the closing section and the other feature sections' copy (see Open questions).
- Footer changes. The footer already credits NASA GIBS. Adding a Windy line to the footer is an open question.
- New scripts, libraries, fonts or external image URLs.

## Copy (draft)

**Hero subline** (replaces the current one):
> Follow up to 10 cities and build a twice-daily weather history from two independent sources, with a satellite picture of every day.

**Satellite pictures section**
- Eyebrow: **From above**
- Title: **Your cities, seen from space.**
- Text: "Weather Insights saves a satellite picture of the area around each city: true color by day, infrared clouds by night. Pictures arrive the day after. The latest one shows on your city card, and in History you can step through them beside the chart and table."
- Credit (own line): "Imagery: [NASA GIBS / EOSDIS](https://www.earthdata.nasa.gov/gibs)". Use the same URL as the footer.

**Live view section**
- Eyebrow: **Live view**
- Title: **See it as it is, right now.**
- Text: "Where a public webcam is nearby, open a live view straight from your city card, and follow the link to the camera's page. Nothing is recorded. It's simply a window onto the moment."
- Credit (own line): "Webcams provided by [windy.com](https://www.windy.com/) - [add new webcam](https://www.windy.com/webcams/add)". This is the full credit Windy's terms require, as on the city cards (0010).

## Behavior

**Content rules**
- The copy states only what is live:
  - pictures are satellite pictures, true color by day and infrared at night, and they arrive the day after
  - webcams are live views from nearby public cameras, shown only where one is available, and nothing from them is stored
  - the readings themselves are still recorded twice a day and are not real-time or a forecast. The word "live" appears only about webcams.
- No text promises a camera for every city. The hero's "a satellite picture of every day" is the one exception to "no promise of a picture every day" (see Open questions).
- The credits are visible text with working links, not tooltips. Links open in the same tab, like the footer links.
- The words "NASA" and "Windy"/"windy.com" appear only in the credits and never as a logo.

**Illustrations**
- Original SVG from the `designer`, in the style of the other feature illustrations. Suggested subjects: an abstract globe or map tile with soft cloud bands and a city marker; a simple camera or window frame over a stylised skyline. No photos, no real imagery, no NASA or Windy marks.
- Decorative: `alt=""`, `width="640" height="480"`, never focusable.
- They read clearly on light and dark backgrounds, including OS dark mode, `data-theme="dark"`, and `data-theme="light"` on a dark OS (same rule as 0005).
- If an image fails to load, the text still reads correctly and nothing overlaps.

**Phone width (about 400px)**
- Both sections become a single column with the illustration above the text, like the others. The credit lines wrap. No sideways scroll.

**Keyboard only**
- The only new Tab stops are the credit links: NASA GIBS / EOSDIS, then windy.com, then add new webcam. They sit in visual order between the hero buttons and the closing call to action, and each shows the `--focus` ring.

**Dark mode**
- Any new color is a `:root` token in both dark blocks. Credit text keeps at least 4.5:1 contrast.

**Network and APIs**
- Landing still makes no API calls and loads nothing from NASA or Windy. Its content is static. Signed-in and signed-out visitors see the same sections.
- Slow, empty or failed API replies, and unknown locations, don't apply to this page.

## Acceptance criteria

1. Landing shows, in order: History, Satellite pictures, Live view, Email. Their bands alternate (History alt, Satellite plain, Live view alt, Email plain), and How it works and the closing section keep their current bands.
2. The Satellite pictures section has the eyebrow, `h3` and text from the Copy section. The text says pictures arrive the day after and that they show on the city card and in History.
3. The Live view section has the eyebrow, `h3` and text from the Copy section. The text says the views come from nearby public webcams, where available, and that nothing is recorded.
4. The Satellite section shows "Imagery: NASA GIBS / EOSDIS" linking to https://www.earthdata.nasa.gov/gibs. The Live view section shows "Webcams provided by windy.com - add new webcam", with links to https://www.windy.com/ and https://www.windy.com/webcams/add.
5. The hero subline mentions satellite pictures. No visible Landing text calls the readings "live" or "real-time", or promises a webcam for every city.
6. Both new images load from `assets/feature-satellite.svg` and `assets/feature-webcam.svg`, have `alt=""` and `width="640" height="480"`, and are not reachable with Tab. Landing has no external image URL, no NASA or Windy logo, and no new `<script>` tag.
7. At a 400px viewport, Landing (signed out and signed in) has no horizontal scrollbar, and the new sections stack with the image above the text. Using only the keyboard, Tab reaches the three new credit links in visual order, each with a visible focus ring.
8. With OS dark mode, and separately with `data-theme="dark"`, the new sections, illustrations and credits are readable, and `data-theme="light"` on a dark OS shows them light. All earlier tests still pass, and `tests/run.sh` prints `RESULT: PASS`.

## Open questions

1. **Hero subline wording.** The draft adds "with a satellite picture of every day". Pictures can be missing on some days (blank imagery, polar night, ocean gaps), so a safer variant is "...from two independent sources, plus satellite pictures and live webcam views." Which do you prefer, or should the hero stay unchanged?
2. **Other existing copy.** The spec leaves the History section, How it works step 3 and the closing line as they are. Do you want them to mention pictures too? For example, History: "...on charts, with the satellite picture for each reading", and step 3: "Readings and satellite pictures arrive twice a day."
3. **Windy credit in the footer.** The footer credits Open-Meteo, MET Norway and NASA GIBS, but not Windy, which is credited on each card and now on Landing. Add a footer line "Webcams provided by windy.com - add new webcam"?
4. **Section order.** The spec puts Satellite pictures, then Live view, after History. The other choice is Live view first, because it is the more eye-catching of the two.

## Owner decisions (2026-11-03)

- Section copy approved as drafted, with the credits under each section.
- Hero subline: "Follow up to 10 cities and build a twice-daily weather history from two independent sources, plus satellite pictures and live webcam views." This replaces "with a satellite picture of every day" in the Copy section and check 5.
- Order: Satellite pictures, then Live view, both after History.
- Footer: add a Windy credit next to the other sources: "Webcams provided by windy.com - add new webcam", with both links. A test that counts footer links must be updated to match.
- Other existing copy (History text, How it works, the closing line) is unchanged.
