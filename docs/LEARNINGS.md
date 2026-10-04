# Learnings log

Append after every stage/level: what worked, what didn't, numbers worth remembering.

## Stage 1: title screen (2026-10-03)

**Image generation**
- `gpt-image-2` via `images/edits`, with the title concept as reference, reproduced the scene almost perfectly even at `low`. "Recreate this exact illustration with ALL text removed" works well for clean background plates.
- `gpt-image-2` rejects `background: transparent`. `gpt-image-1.5` accepts it but garbled "FLIGHT 1073" and lost the pixel look. **Fix:** paint on flat `#FF00FF` with gpt-image-2, then chroma-key in `process.ts`; the edges un-mix cleanly with no halo.
- One of two logo candidates spelled "YANIIV". Always read generated lettering.
- Cost: about $1.30 for the whole title set (low exploration, then high finals).
- Behind the session proxy, Node `fetch` needs `NODE_USE_ENV_PROXY=1` (already set in the npm scripts).

**Performance**
- The LCP was the background image, delayed by bandwidth contention. Deferring the Coming Soon image until `load` + idle and dropping the logo to q80 took Lighthouse mobile LCP from 2.41 s to 2.11 s (perf 0.99).
- Masters stored as WebP q95 are about 400 KB each, versus 1.8 MB lossless.

**Fidelity**
- Title rubric (gpt-5.5 judge) scored 8.8/10 (gate 8). Palette similarity went from 0.68 to 0.73 after darkening the menu panel. Composition similarity is 0.85.
- The judge keeps flagging the mute button as "not in the reference". That's intentional UX, so ignore it.
- Pixelify Sans has a narrow space glyph; `word-spacing: 0.25em` opens it up (0.6em overflowed, see below).

**QA agent pass (found 11 issues; all fixed, each with a regression test)**
- A visual tweak suggested by the fidelity judge (`word-spacing: 0.6em`) made the 2P label overflow its box. Keep the overflow e2e check, and re-screenshot after any judge-driven change.
- History: only call `history.back()` on an entry we pushed ourselves (`fromTitle` marker). Guard against double activation while `popstate` is pending, and route by `location.hash`, not `history.state`.
- Roving tabindex keeps focus and the visual cursor in sync. Mouse hover must move focus too.
- CSS `::before` text becomes part of the accessible name. Use `content: '>' / ''` for decorative glyphs. This also broke `getByRole(..., { exact: true })` in tests.
- Ignore keydowns with Ctrl/Cmd/Alt. Give small controls 44px hit areas. Phones in portrait get a rotate hint.
- QA agent recipe that worked: a read-only general-purpose agent, about 9 viewports, scripted edge cases (double tap, deep link, back/forward, Tab vs hover), reporting file:line plus a suggested fix. It took about 5 min.

## Deploy (2026-10-04)
- With `base: '/'`, the site rendered unstyled at `talserphos.github.io/Super-Yaniv-Bros/` because every asset 404'd under the project subpath. The fix is `base: './'`, which makes all URLs relative so one build works at the domain root and under a subpath. `check-budget.mjs` now fails on root-absolute URLs, and the `subpath` Playwright project serves the build under `/Super-Yaniv-Bros/`.
- When Pages deploys from Actions, the `public/CNAME` file is ignored. The custom domain must be set in Settings → Pages, and the DNS must point at GitHub. The smoke job now tests the `page_url` the deploy reports, rather than assuming the domain works.
- e2e tests use `page.goto('./')` (relative), so `BASE_URL` can carry a path.
