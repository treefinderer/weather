# QA 0009 fix: history picture viewer default

- Date: 2026-11-05
- Branch: fix/history-picture-default (bug fix on spec 0009)
- Result: PASS (`RESULT: PASS 895/895` from `tests/run.sh`)

Checked (group "Satellite pictures (0009)", History viewer):
1. Default opens on the newest slot with a picture past newer reading-only slots; period with no pictures opens on the newest step; custom past range (no today step) opens on its newest picture.
2. Missing picture on the city's today shows "...is saved after midnight, city time."; past missing slots show "No satellite picture for <when>"; "Picture unavailable" unchanged. Honolulu case (UTC already Oct 27, city today Oct 26) confirms city time is used.
3. Selection kept across a source change; a period change resets to the default.

Manual: none.
