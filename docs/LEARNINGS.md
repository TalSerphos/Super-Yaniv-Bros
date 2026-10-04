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

## World 5 assets (2026-10-04)
- Everything in `docs/levels/w5-assets.md` comes from `art/manifest/w5.yaml`. Spend was about $4.30 estimated (25 calls), counting low exploration, two prompt fixes and high/medium finals.
- **Character bible first.** A 4-view Yaniv turnaround on magenta (refs: title + aisle) became `art/masters/char.yaniv.sheet.webp`. Used as the first ref, it kept the 4×3 pose sheets on-model, including no hat, one wrench logo, and boots.
- **Pose sheets: say where the prop goes.** "Plunger in his front hand" gave a plunger trailing behind him. "Held out in front of his chest on the RIGHT side of the sprite, never behind him" fixed it. Name the run phases (CONTACT / DOWN / PASSING, then the same with the other leg). Without that, the model draws six near-identical strides.
- **High is not a strict upgrade.** The two high candidates differed in the details (one dropped the plunger in the fall pose), so check every cell.
- **Downscaling:** lanczos3, a hard alpha threshold at 128, then palette quantize (24 to 64 colors, no dither) and lossless WebP. This looks crisp at 1:1 even at 0.1x (the nut). Scale every frame of a sheet by one common factor (median height), or the animation pulses in size.
- **Scale check with a mock.** The first wall (16:9 crop of a 3:2 image) had windows about 1.5x too tall next to Yaniv. Asking for "about nine small windows, each a quarter of the image height" matched the concept art. Always composite wall + floor + sprites and compare with the reference.
- **Seamless:** choose the crop whose next column matches its first (wrap diff 1–4 on 0–255), then crossfade a W/16 strip. Window rows and light strips tile with no visible seam. For small textures, `span: 0.5` sets the light spacing.
- gpt-image-2 paints "#FF00FF" as roughly #F205EE to #FB03F8. That is well inside the chroma key's inner radius (70), so no tuning was needed.


## Stage 2: World 5 slice (2026-10-04)

**Engine**
- Run gameplay logic on Arcade's `worldstep` (fixed 60 Hz), not in `update()`. Logic that ran per rendered frame went out of step with physics at low frame rates, and the bot died on loaded machines.
- Latch key and touch presses until the next step reads them. A tap shorter than one step (16 ms) was being lost; Playwright's `keyboard.press` is exactly such a tap. Reset inputs on level start and resume, so keys pressed on a card don't fire in play.
- Never use `body.reset()` on an offset body: it places the body at the sprite's top-left and ignores `body.offset`. Use `setPosition` + `body.updateFromGameObject()` (see `placePlayer`).
- A respawn point needs floor on both sides (±40 units). Otherwise walking into a pit from the right respawns you inside it.
- Camera rotation sign: `setRotation(+θ)` gives nose-down (floor descends to the right), matching gravity `(sin θ, cos θ)`.
- CSS class names are global: the title `.hud` and the game `.hud` leaked into each other. Game UI classes use the `ghud-` prefix, with a regression test.

**Testing**
- Software-rendered WebGL (this sandbox, GitHub runners) makes several parallel games run in slow motion. Use poll-based assertions with generous timeouts, cap CI at 2 workers, and never assert on "X ms of play".
- `__syb` test hooks (`state`, `teleport`, `clearTrolleys`, and a `hurts` log with causes) turned "flaky" failures into clear diagnoses. Twice the game was right and the test was wrong.
- Phones run the e2e suite in landscape (the game is landscape-only). Portrait gets its own test: rotate hint plus auto-pause.

**QA agent (2nd pass)**: 9 bugs and 5 feel items, all addressed except placing touch buttons in the letterbox bars (Stage 10). Recipe as in Stage 1, plus real held-key playthroughs and a FPS check under 4× CPU throttle.

**Fidelity**: World 5 judged 8.0 → 7.2 (gate 5). The drop came from a later trolley spawn moving it out of the capture frame, not from the art. Lowering the camera and making the foreground seats larger fixed the "too much empty wall" note. For Stage 3: denser passengers in the play layer, a larger Yaniv frame (the art agent suggests about 56×72), and a capture point that shows the trolley mid-screen.
