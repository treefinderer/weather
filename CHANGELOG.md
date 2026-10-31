# Changelog

## 2026-10-30

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
