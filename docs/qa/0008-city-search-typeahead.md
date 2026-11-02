# QA 0008 City search autocomplete

- Date: 2026-11-01
- Commit tested: e63946f (feature/0008-city-search-typeahead)
- Result: PASS. `tests/run.sh` prints `RESULT: PASS 464/464`.

## Covered by tests (group "City search autocomplete (0008)")

1. One debounced request (name=Pa, count=10), listbox opens, aria-expanded, combobox attributes, no auto-highlight, no request on re-click.
2. "Berlin" typed fast sends one request; an older reply arriving late never replaces newer suggestions.
3. One character or spaces send nothing; deleting to one character closes the list and drops the in-flight reply; no "Type at least 2 letters." message.
4. Row text, no button, mousedown default-prevented, click calls `follow_city` once, "Added Paris.", card added, input emptied, list closed, focus kept.
5. Followed row "Added" with aria-disabled and "already added" name; 10-city limit disables all rows and shows the notice; failed add keeps text and list.
6. Down/Up, aria-selected, aria-activedescendant, stops at the last row, Up from first clears, focus stays, Enter adds the highlighted row.
7. Enter with nothing highlighted adds nothing, form submit does not reload; Escape, Tab and outside click close; Down reopens without a request.
8. Live region counts (plural, singular), empty reply and failure messages, retry on next keystroke.
9. `#city-search-submit` is gone; label tied to `#city-query`.
10. 400px: no sideways scroll, 10 rows each at least 44px, list matches field width.
11. `--option-hover` and `--option-active` in `:root` and both dark blocks; open animation only under `prefers-reduced-motion: no-preference`.
12. Script tag count unchanged.

## Manual (not automated)

- Criterion 11 looks: hover, highlighted and "Added" rows readable and distinguishable in OS dark mode and with `data-theme="dark"`, and contrast ratios. Not checked visually in this run.
- Criterion 11: confirm nothing animates with reduced motion enabled (the CSS rule is verified, the rendered behavior is not).
- Real Open-Meteo replies and a real Supabase project (mocked here).

## Failures

None.
