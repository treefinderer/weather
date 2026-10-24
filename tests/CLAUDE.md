# Tests

- `tests/run.sh` runs the browser suite in headless Chrome and prints `RESULT: PASS n/n` or one `FAIL [Group] name: detail` line per failure. It exits 0 on PASS and 1 otherwise.
- `tests/tests.js` loads the real `index.html` into a same-origin `srcdoc` iframe. It mocks `fetch` (through `WxTest.respond`), so the suite never touches the network. Add new fixtures inline in `tests.js`, next to the existing ones.
- Each group starts with the `wx-*` localStorage keys cleared, and the run restores your own keys afterwards.
- Drive the page with real DOM events and assert on the DOM. Reuse the existing helpers rather than writing new ones.
- When behavior changes on purpose, update the check that covers it. Never weaken a check just to get a pass.
- A new feature gets its own group, named after the feature. Keep checks short, about one assertion each.
