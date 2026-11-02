# 0009 Satellite pictures with the weather history

## Request

> "i'm also thinking about pulling data from webcameras at those cities at the times of weather readings and save those pictures along with the weather data. then user can see the latest pictires in My Cities section and also be able to see the history of pictures while playing with History section of the website. Maybe those historical pictures can come up when i'm looking to the charts"

> "at this point we don't know what city the user may select... if both users in the same timezone select the same city then we don't need to save the same pictures multiple times, we can show the same picture for all users that have this specific city selected. To reduce number of records in database"

Fixed decisions (owner, 2026-11-01):
- Webcam images are not stored, because Windy's terms forbid publishing stored images. Saved pictures come from **NASA GIBS** satellite imagery, which is keyless and public domain. That is this spec.
- A live webcam view is a separate spec (0010) and is not part of this one.
- Each picture is stored once per city, local date and slot, and every user who follows that city sees the same picture. A city row already has a single timezone, so "same city" also means "same timezone".

## Goal

Each followed city gets a satellite picture of its area at every reading slot: true color by day and infrared clouds by night. Visitors see the latest picture on the city card. In History they can step through past pictures, and pointing at a chart point shows the picture for that date and slot.

## Scope

In:
- **Collection:** the existing `collect` Edge Function also fetches one picture per due city and slot from the GIBS WMS. It runs on the same schedule and needs no new secret.
- **Storage:** a new private Storage bucket `city-pictures`, plus a migration `0004_city_pictures.sql` with:
  - the `city_pictures` table
  - a `latest_pictures` view
  - RLS on the table
  - a Storage read policy
- **Your cities:** a picture block on each city card.
- **History:** a "Satellite pictures" viewer next to the temperature chart. It is linked to the chart's points and to the table rows.
- **Credit:** "Imagery: NASA GIBS / EOSDIS" in the footer and in every picture caption.
- **Tests:** collector logic tests in `supabase/functions/collect/logic_test.ts` and frontend checks in `tests/tests.js`.
- **Design brief:** a `designer` brief for the picture block, the viewer and the placeholder, because this spec changes how the site looks.

Out:
- Webcams of any kind (0010).
- Animations or time-lapse, zoom or pan, downloads, and sharing.
- Pictures for dates before this ships (no backfill).
- Pictures in email notifications.
- A picture for the Averages chart, because a weekly or monthly point has no single picture.
- Any new runtime library, external script, or secret.

## Behavior

**Source and picture**
- **Endpoint:** GIBS WMS `GetMap` (`https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi`), version 1.3.0, with:
  - `CRS=EPSG:4326`
  - `WIDTH=512&HEIGHT=512`
  - `FORMAT=image/jpeg`
  - a `TIME` parameter
  - No key and no login. Requests send the same `User-Agent` that names the app as for MET Norway.
- **Box:** about 300 × 300 km centered on the city.
  - Half-height: 150 / 111.32 ≈ 1.3475° of latitude.
  - Half-width: 1.3475° / cos(lat) of longitude, capped at 20°.
  - The latitude limits are clamped to ±90°.
  - If the box would cross ±180° longitude, it is shifted inward so it stays inside −180…180, instead of wrapping.
  - In WMS 1.3.0, `BBOX` is in `minLat,minLon,maxLat,maxLon` order.
- **Day slot (12pm):** a true-color corrected reflectance layer from a polar orbiter, such as `VIIRS_SNPP_CorrectedReflectance_TrueColor` or the NOAA-20 or MODIS equivalent.
  - These satellites pass at about 1:30pm local time, and GIBS publishes the imagery a few hours later. So the day picture for local date D is fetched in the **next night window** (the 12am run of D+1) with `TIME=D`, and stored under (D, `day`).
  - A city's day picture therefore appears about 12 hours after its 12pm reading.
- **Night slot (12am):** a longwave infrared cloud layer that covers the whole globe and has sub-daily times, such as a geostationary IR mosaic.
  - It is requested for the UTC instant of that 12am local time, or the nearest earlier time the layer offers.
  - It is fetched in the same night window and stored under (D+1, `night`).
- **Overlays:** if GIBS offers a coastline and borders reference layer, it is stacked on top in the same request, so the area is recognisable.
- **Layer names:** the developer confirms the exact layer names, their time steps and the overlay against the GIBS `GetCapabilities`. They are kept in one place in `logic.ts`.
- **Layer per row:** each row records the layer that was used, so a later layer change doesn't relabel old pictures.

**Collection and storage**
- **Table `city_pictures`** has these columns:
  - `id`
  - `city_id` (references `cities`)
  - `local_date`
  - `slot` (`day`/`night`)
  - `layer`
  - `image_time` (the date or time requested from GIBS)
  - `storage_path`
  - `bytes`
  - `fetched_at`
- It has **`unique (city_id, local_date, slot)`**, so there is one picture per city, date and slot, shared by every follower.
- **Storage path:** `city-pictures/{city_id}/{local_date}/{slot}.jpg`.
- **When pictures are fetched:** the collector already finds the followed cities whose night window is due.
  - For each such city it fetches the night picture and the previous date's day picture, but only for pairs that have no row yet.
  - A due city with no followers gets nothing, because the collector reads only followed cities.
- **Order of work:**
  - Pictures are fetched after that city's readings, in their own try/catch, with their own timeout of about 15 s.
  - A picture failure never blocks or undoes a reading.
  - The upload and the row insert use upsert with ignore-duplicates, so a run that overlaps another can't create a second picture.
- **What counts as a failure:**
  - a network error or timeout
  - a non-2xx status
  - a reply whose content type is not `image/jpeg` (GIBS returns XML errors with 200)
  - a JPEG under 4 KB, which is treated as blank (no coverage, or polar night)
- **After a failure:**
  - No row is written, and the failure appears in the function's `failures` list.
  - The next hourly run in the same window (local hours 0–2) tries again.
  - After the window the picture is skipped for good. There is no backfill.
- **New cities:** the first picture comes from the first night window that runs after the first user follows the city.
  - If the city was followed during a night window, the next run in that window counts.
  - That run fetches the night picture and the previous day's picture. GIBS still has the previous day, even if no one followed the city then.
- **Access rules:**
  - RLS is enabled, with one select policy, `city_pictures_select_followed`, using the same `user_cities` check as `readings_select_followed`.
  - There are no write policies. Only the collector writes, with the service role.
  - `anon` gets no access.
- **Storage:**
  - The bucket is private.
  - A `storage.objects` select policy for `authenticated` allows `bucket_id = 'city-pictures'` only when the first path folder is a `city_id` that the caller follows.
- **Signed URLs:** an `<img>` can't send the auth header, so the frontend uses `createSignedUrls` (one batch call per screen, valid for 1 hour). Creating them runs through the policy above.
  - A signed URL works for anyone who has it until it expires. That is acceptable, because the imagery is public domain. Keeping the bucket private only hides which cities a user follows.
- **View `latest_pictures`** (`security_invoker = true`): the newest row per city, ordered by `local_date` descending. On the same date, day is newer than night.

**Your cities: picture block**
- **Placement:** each city card shows a picture block after the summary (0006) and before the detail.
- **Contents:**
  - The image has `width="512" height="512"`, a reserved square box and `loading="lazy"`.
  - Alt text, for example: "Satellite picture of the area around Oslo, infrared clouds, Night (12am), Oct 25". The day version says "true color".
  - A small decorative center marker shows where the city is (`aria-hidden="true"`).
  - The `--muted` caption, for example "Infrared · Night (12am), Oct 25 · Imagery: NASA GIBS / EOSDIS".
- **No picture yet:** a quiet placeholder box of the same size, with the text "No satellite picture yet". The picture is optional, so the card has no "–" and no error message.
- **Load failure:** if the signed URL call fails or the image errors, the same box shows "Picture unavailable". Readings and the rest of the card are unaffected, and there is no retry loop.
- **Unit changes:** switching °C/°F doesn't reload pictures.

**History: Satellite pictures viewer**
- **Placement:** a card titled "Satellite pictures" (`h3`) directly after the temperature chart card. On wide screens (about 900px and up) it sits beside the temperature chart. At about 400px it sits under the chart, at full card width.
- **Contents:**
  - the image, or the placeholder "No satellite picture for Night (12am), Oct 24"
  - the caption with the layer kind, slot, date and credit
  - **Older** and **Newer** pills
  - a polite live region that announces the selected date and slot
- **What it steps through:** every date and slot in the loaded period, oldest to newest, that has a reading or a picture.
  - It opens on the newest one.
  - **Older** and **Newer** move one step, and are disabled at the ends.
  - It ignores the table pager.
- **Period and source:**
  - Changing the period reloads and selects the newest again.
  - Changing the source keeps the selection.
  - With no readings and no pictures in the period, the card is hidden along with the rest of `#history-content`.
- **Temperature chart:**
  - Hovering or tapping a day or night point selects that date and slot in the viewer.
  - The canvas becomes one Tab stop (`tabindex="0"`), which is a deliberate change to the 0007 "chart cards add no stops" rule. Its hint text says to use the arrow keys.
  - With the canvas focused, Left and Right step through the same sequence as **Older** and **Newer**. They show that point's tooltip (Chart.js `setActiveElements`) and update the viewer.
  - Focusing the canvas selects nothing until an arrow key is pressed.
- **Table:**
  - The row whose date is selected gets a highlighted look on its Day or Night cells, without colour alone (for example a bold outline).
  - Clicking or tapping a row's Day cells or Night cells selects that date and slot.
  - The keyboard equivalent is the viewer buttons and the chart keys, so the table gains no Tab stops.
- **Signed URLs:** fetched in one batch for the period's pictures when History loads. If the batch fails, the viewer shows "Picture unavailable" and the charts and table still show.

**Footer**
- A new line: "Imagery: [NASA GIBS / EOSDIS](https://www.earthdata.nasa.gov/gibs)" (the developer may use NASA's current GIBS page URL).

**Edge cases**
- **About 400px:** pictures scale down to the card width, square, with no sideways scroll. Captions wrap. **Older** and **Newer** stay on one row.
- **Keyboard only:**
  - Tab order on History: …, the temperature chart canvas, then the viewer's **Older** and **Newer**, then the rest as in 0007.
  - Every new stop shows the `--focus` ring.
  - The center marker and the placeholder art aren't focusable.
- **Dark mode:**
  - New colors (placeholder background, highlight outline) are `:root` tokens defined in both dark blocks.
  - The picture itself isn't filtered.
  - Placeholder text has at least 4.5:1 contrast.
- **Slow replies:** the reserved square stops any layout shift, and the placeholder shows until the image loads.
- **Empty or blank imagery:** this covers the ocean, polar night and swath gaps.
  - Blank replies are skipped as failures, so the visitor sees the placeholder.
  - A partly covered image, with a black swath gap, is stored as returned.
- **Unknown locations:** not applicable, because pictures exist only for cities already stored.
- **Cities near the poles or ±180°** get the clamped or shifted box described above.

## Acceptance criteria

1. `0004_city_pictures.sql` creates `city_pictures` with `unique (city_id, local_date, slot)`, RLS enabled, and only a select policy limited to followed cities. It also creates the private `city-pictures` bucket and a select policy on `storage.objects` limited to followed `city_id` folders.
   - A signed-in user who doesn't follow a city gets no row for it, and can't create a signed URL for its files.
   - `anon` gets nothing.
2. In `logic_test.ts`:
   - The box for lat 60, lon 10.75 is 58.65–61.35 latitude and 8.05–13.45 longitude (±0.01).
   - A city at lon 179.5 gets a box with its maximum longitude at 180 or less.
   - The picture URL is a GIBS WMS 1.3.0 `GetMap` with `CRS=EPSG:4326`, `WIDTH=512`, `HEIGHT=512`, `FORMAT=image/jpeg`, the expected layer and `TIME`, and no key.
3. A night-window run for a followed city with no pictures stores two files, `{city_id}/{D+1}/night.jpg` and `{city_id}/{D}/day.jpg`, and two rows with their layer names. A second run in the same window fetches nothing new. Two users following the same city produce exactly one row and one file per date and slot.
4. When the GIBS fetch times out, returns XML, or returns a JPEG under 4 KB:
   - That city's weather readings are still stored.
   - No picture row is written, and the failure is listed in the response.
   - The next run in the window retries the fetch.
5. A city that nobody follows gets no picture fetch. A city first followed today gets its first pictures at its next night window.
6. On Your cities, a city whose newest picture is (Oct 25, night) shows that image. The alt text names the city, "infrared clouds" and "Night (12am), Oct 25", and the caption ends with "Imagery: NASA GIBS / EOSDIS". If (Oct 25, day) also exists, the day picture is shown instead.
7. A city with no picture shows "No satellite picture yet". When the signed URL call fails, it shows "Picture unavailable". Neither case shows a broken-image icon, and readings and the summary are unchanged.
8. On History with a 7-day period:
   - The Satellite pictures viewer opens on the newest date and slot.
   - **Older** steps back one slot at a time, and is disabled at the oldest. **Newer** is disabled at the newest.
   - A slot without a picture shows "No satellite picture for …".
   - Each change is announced in the live region.
9. Hovering or tapping a night point on the temperature chart selects that date's night picture. With only the keyboard, Tab reaches the chart canvas, and Left and Right step through slots, showing the tooltip and updating the viewer.
10. Clicking a table row's Night cells selects that date's night picture, and the selected row is highlighted in a way that doesn't rely on color alone. Paging the table doesn't change the viewer.
11. The footer shows "Imagery: NASA GIBS / EOSDIS" with a link. At a 400px viewport, Your cities (10 cities with pictures) and History have no horizontal scrollbar, and pictures stay square. Every new focusable element shows the `--focus` ring.
12. In OS dark mode, and separately with `data-theme="dark"`, the placeholders and the highlight are readable.
   - No new `<script>` tag, library or secret is added.
   - The only new external host is `gibs.earthdata.nasa.gov`, called from the Edge Function only. Images reach the browser from Supabase Storage.
   - All earlier tests still pass, and `tests/run.sh` prints `RESULT: PASS`.

## Open questions

1. **Retention and storage budget.** Each picture is about 40–80 KB, call it 60 KB. Two a day per city is about 44 MB per city per year, so the free 1 GB holds roughly 23 city-years. Shared cities count once.
   - Recommended default: keep the last 365 days and delete older pictures and rows in a daily cleanup.
   - The other choice is to keep everything and revisit when storage passes 70%.
2. **Pictures of cities nobody follows any more.** Recommended default: keep them until retention removes them, so a re-followed city keeps its history. The other choice is to delete them 30 days after the last unfollow.
3. **When the day picture arrives.** Recommended default: fetch the true color for date D in the next night window, so the picture really is from day D and arrives about 12 hours late. The other choice is to fetch at the 12pm run using the previous day's pass, which shows sooner but is a day old.
4. **Picture size.** Recommended default: 512 × 512. 384 × 384 roughly halves storage, at the cost of detail.

## Owner decisions (2026-11-01)

- Retention: keep every picture, no cleanup job. Revisit when Storage reaches about 70% of the plan.
- Unfollowed cities: their pictures are kept (follows from keeping everything).
- Day picture: delayed fetch at the next 12am run, so it shows the real day D about 12 hours late.
- Picture size: 512×512.
- Off-centre boxes (poles, ±180°): place the marker from the stored box, or hide it if the box isn't available.
