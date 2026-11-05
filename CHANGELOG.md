# Changelog

## 2026-11-04

- Chat assistant: the default model is now `@cf/meta/llama-3.1-8b-instruct-fp8`, because Cloudflare no longer serves the `-fp8-fast` variant. ([spec 0012](docs/specs/0012-chat-assistant.md))

## 2026-11-03

- Chat assistant: a chat button on every page opens "Ask Weather Insights", answered by a free Cloudflare Workers AI model. Visitors can ask about the site; signed-in users also about their own cities' history. 5 questions a day, nothing stored. ([spec 0012](docs/specs/0012-chat-assistant.md))
- Landing page: new Satellite pictures and Live view sections with original illustrations and source credits, an updated hero subline, and a Windy credit in the footer. ([spec 0011](docs/specs/0011-landing-new-features.md))

## 2026-11-02

- Fix: Your cities loads even before the webcam migration is applied (it retries without the webcam details instead of showing "Can't load your cities").

## 2026-11-01

- Live webcam: each city card can open a live view from the most viewed nearby Windy webcam (looked up once per city on the server, refreshed weekly), with the Windy credit. ([spec 0010](docs/specs/0010-live-webcam.md))
- Satellite pictures: the collector saves one NASA GIBS satellite picture per city for each day and night reading, shared by everyone who follows the city. The latest picture shows on each city card, and History has a picture viewer linked to the temperature chart and the table. ([spec 0009](docs/specs/0009-satellite-pictures.md))
- City search is now an autocomplete: after 2 letters up to 10 suggestions drop down and update as you type, and one click (or arrow keys and Enter) adds the city. The Search button is gone. ([spec 0008](docs/specs/0008-city-search-typeahead.md))

## 2026-10-30

- History redesigned: large city title, one controls card with a Source switch, period summary tiles (day high, night low, day and night averages), chart cards with legends and the table in its own card. ([spec 0007](docs/specs/0007-history-redesign.md))
- Fix: scripts and styles now carry a version number that changes on every release, so browsers load updates right away instead of keeping old copies for up to 10 minutes.
- Fix: city search results now disappear when the search box is cleared or Esc is pressed, and a late search reply no longer brings them back.
- Your cities and Settings redesigned: large titles, city cards with a big averaged temperature, condition icon and caption, an empty-state picture, grouped Settings cards and a °C/°F segmented control. ([spec 0006](docs/specs/0006-cities-settings-redesign.md))
- Renamed to Weather Insights, with a new logo and favicon, an apple.com-style landing page with original illustrations explaining what the site does, a footer crediting the data sources, and a refreshed look on every screen. ([spec 0005](docs/specs/0005-weather-insights-look.md))

## 2026-10-28

- Email notifications: daily and weekly weather digests and range alerts (at most one per alert per day), set up in Settings, with one-click unsubscribe. Limited to allowlisted addresses until a sending domain is added. ([spec 0004](docs/specs/0004-email-notifications.md))

## 2026-10-27

- History: open any city's history to see a day-by-day table and a day/night temperature chart for the last 7, 30 or 90 days, 12 months or a custom range, from either source or their average, with weekly or monthly averages for longer periods. ([spec 0003](docs/specs/0003-history-views.md))
- Your cities: search for and follow up to 10 cities, and see each one's latest 12am and 12pm readings from Open-Meteo and MET Norway, collected automatically every day. ([spec 0002](docs/specs/0002-cities-collection.md))

## 2026-10-25

- Accounts: sign up with email confirmation, sign in and out, reset or change your password, and choose °C or °F in Settings. ([spec 0001](docs/specs/0001-accounts.md))

## 2026-10-24

- Project set up: placeholder page, test suite, GitHub Pages deploy and the ADLC agent workflow.
