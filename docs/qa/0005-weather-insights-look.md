# QA 0005 Weather Insights look

- Date: 2026-10-30
- Commit tested: 05361eb (branch feature/0005-weather-insights-look)
- `tests/run.sh`: RESULT: PASS 289/289

## Criteria

- 1 title, favicon, h1 + logo: PASS (group "Landing")
- 2 Landing at start, headline, buttons, no API calls, Sign out to Landing: PASS
- 3 Get started / Sign in (hero, closing, header) with heading focus: PASS
- 4 feature mentions, visible testing note, exactly 3 steps: PASS
- 5 footer on Landing and signed-in screens, 3 hrefs: PASS
- 6 img src under assets/, width/height, no external images, no visible "Apple": PASS
- 7 alt="", no focusable images, logo name "Weather Insights": PASS
- 8 keyboard: PASS for DOM order only (logo first, hero, closing, footer last); real Tab and focus-ring visibility: manual
- 9 400px no sideways scroll, Landing signed out and in: PASS (other screens covered by Accounts/Cities/History/Notifications groups)
- 10 dark mode look: manual. Automated: every color token is in `:root` and both dark blocks, and the two blocks match.
- 11 reduced motion: manual. Automated: style.css has a reduce rule that zeroes animation/transition (text check only).
- 12 one Google Fonts link with display=swap, `--font` ends in a system stack, script tags unchanged: PASS. Blocked-fonts rendering: manual (the suite strips the font links, so it always runs on the fallback stack).
- 13 logo from Your cities, History and Settings shows signed-in Landing; Go to your cities opens the list with heading focused: PASS. Logo no-op on Loading and Unavailable, and reset abandon: PASS.

## Not automated

Real `prefers-reduced-motion`, OS dark mode rendering and contrast, focus-ring visibility, blocked fonts, illustration legibility on dark backgrounds.

## Failures

None.
