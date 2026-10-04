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

## World 5 Stage 3 assets (2026-10-04)
- All 13 entries in `docs/levels/w5-stage3-assets.md` come from `art/manifest/w5-stage3.yaml`. Spend was about $5.40 estimated (30 calls): low exploration for all, three prompt fixes, medium finals for the small items and blocks, high for characters, enemies, door and galley.
- **Calibrate fits by measuring, not by eye.** Yaniv's idle content is 107 px tall (his fit of 118 is a median across poses). The Captain at fit 118 came out 12 px taller, so he uses fit 108. The suitcase uses fit 50, which reaches Yaniv's belt. A throwaway script that prints each frame's opaque bbox settles these quickly.
- **Seated enemies: keep everyone inside the seat's footprint.** The first Baby Bomber had the parent's hair above the seat back and the feet and baby's arm far to the right. In a 96×128 frame that shrank the seat to 85% of `w5.seat`. Asking for "head BELOW the top of the seat back, feet no further right than the passengers in the reference, short arms close to the body" brought it to 93% (frame width is the limit now).
- **The model draws the projectile in the throw frame.** Ask for "NO pacifier anywhere in the picture", or paint it out of the candidate with flat magenta before `select`. Retouched candidates live in `art/raw/<id>/retouched/` (`select --from` is repo-relative).
- **Check bandages for red.** The Captain's bandage came with a small pink "blood" spot in every frame, which the no-blood guardrail rules out. It was recoloured in three small boxes using the test `r-g > 30 && |g-b| < 40`, which leaves skin and gold braid alone.
- "Golden plunger standing upright" reads as a bell. Raising it like a trophy, tilted, with a "rounded half-dome cup, not a cone", fixed that. "Drop-down oxygen mask" got an elastic loop that made it look like a bucket; "NO strap, NO loop" fixed that.
- `valign: top` is new, for hanging sprites (Bin Biter). For multi-state props (door, bin), ask for "the outer outline identical in every frame". Then `fit: stretch` or `common` + `bbox` keeps the frames registered. Verify with an onion-skin overlay of all frames.

## Stage 3: full World 5 (2026-10-04)

**Engine**
- Entities talk to the scene only through the `GameWorld` interface (`world.ts`). Don't name a field `scene` on a `Phaser.Scene` subclass: it shadows the scene's own plugin. The field is called `stage`.
- Key tilt to progress (the furthest x reached), not to time. Then the level designer controls exactly where the floor gets steeper, and a warning goes out 280 units early. Ease each change over 120 units so the camera doesn't snap.
- Mask vines are pendulums that rest along *true* gravity (φ = tilt in cabin space), so they hang straight down on screen at any bank angle. Auto-grab only while airborne and not hurt, with a 0.35 s cooldown after letting go.
- Level JSON comes from a small generator (row conventions: floor rows 20–21, seats 19, blocks 14, bins 11–12, mask anchors 6). A unit test checks every floor gap is within the jump envelope (`MAX_GAP` ≈ 98). That caught one 112-wide pit in 5-3.

**Testing**
- Two bot modes: `god=1` proves each level's geometry is completable, and the plain bot proves a simple player can clear it. The bot started at "only jumps": it cleared 5-1 and died in 5-2..5-4. Adding three rules let it clear all four with 1–3 hearts: poke anything within plunger reach, wait while a bag is falling just ahead, and only jump slow ground enemies. The bot uses the same plunger as a player, so this is also a balance check.
- `window.__syb` survives a level change until the new scene replaces it. Tests that cross levels wait for `state().level === id`, not just for `__syb`.
- A jump under a block is stopped by the block about 14 units up. "Airborne" asserts have to allow for that.
- Don't rebuild `dist/` while another process runs e2e against `vite preview`: a test's `goto` can land on deleted hashed files.
- Mechanic e2e tests clear *all* enemies (`__syb.clearEnemies()`), not just trolleys. When 5-2 gained a Baby Bomber next to the hatch used by the respawn test, that test became timing-flaky.

**QA agent (Stage 3)**: 10 bugs, all fixed with regression tests where they fit.
- Invisible `-` shelves: now drawn.
- Instant re-grab after letting go of a mask: the released vine stays locked until Yaniv lands.
- Swinging through bins: the swing collides and bounces back.
- Luggage out of thin air: drops now come from real bins and rattle for 0.5 s first, and a unit test checks the bin is above.
- Map with no way back: RESUME/TITLE added, and the level stays paused behind the map.
- Per-level best was the run total: it now counts only that level's points.
- Double scoring on projectile and shell hits.
- Translucent Bamba Rush.
- A screamer stuck mid-scream.
- Level-end visuals: a bulkhead behind the cockpit door, and seat rows past both ends.

Tuning from the same pass:
- ALT is now about 170 s per level, a real clock.
- Mask pumping only adds energy in the direction of swing.
- The plunger reaches above the head, for Bin Biters.
- Luggage now hurts Big Yaniv too.
- Babies hold fire while Yaniv hangs from a mask.
- Every level starts with at least 3 hearts.
- Bin-top nuts that nobody could reach are gone.
- Firefox takes a different but repeatable path through a level than Chromium, even with a fixed physics step. 6× CPU throttling in Chromium did not reproduce it. Keep difficulty proofs (the real bot) on Chromium projects and run the bot invulnerable elsewhere. Never assert on chasing a moving item with real key presses: wait for it in `state().items`, then teleport onto it.
- A hazard must never spawn inside the player. A Baby Bomber lobbing from its own seat while Yaniv stood on it was an unavoidable hit, so babies hold fire within 56 units.

## World 6 boss assets (2026-10-04)
- All 15 entries in `docs/levels/w6-boss-assets.md` come from `art/manifest/w6.yaml` (`out.dir: w6` needed no tool change). Spend was about $7.40 estimated (39 calls): low exploration for everything, three prompt fixes, high for the bible, boss, characters and backgrounds, medium for items, yoke and seat.
- **13-frame boss = two pose sheets + compose.** `boss.jacuzzam.a` (7 poses) and `.b` (6 poses) are `kind: reference` entries (generated, never built). Their chosen candidates were cut with `sliceCells` (`tools/assets/compose-boss.mts`), put on one scale and pasted onto a 4x4 magenta canvas (feet on a common baseline per row), then `select`ed as the `boss.jacuzzam` master. Match the two sheets' scale with a rigid part (shoe length was 85 px in both), not with height: the poses differ too much.
- **Same-pose frames can differ in size.** idle1 came out 7% shorter than idle0 (it would pulse). Rescale such a frame during the compose to a small breathing dip (2–3%).
- **Width is the binding limit in narrow frames.** In 48×64 frames a lunge or a thrown prop that leaves the hands sets the common scale through `frame.w / maxW`: Assaf's first pin pose (w/h 1.29) shrank him to 91 px. The pose must be no wider than about 0.85× the idle height. "A SHORT, compact lunge … total width no more than three quarters of his standing height" and "he still HOLDS the coil … overlapping his hands" fixed it. Check `w/h` per piece before going high.
- **`fit.height` is a median, so calibrate with an off-output cell.** `yaniv.action` paints a 4th "standing idle" cell that isn't exported. Measure it to set the fit so Yaniv matches `yaniv.small` (idle 107 px, scale 0.246). With two-frame sheets the median is the average of both poses, so fits for the Bros are 95–106, not 118.
- **Multi-state props:** "a wide floor housing … the yoke never reaches past its edges" + `anchor: bbox` keeps the yoke's base registered within 1 px; the first prompt drew "pulled" and "pushed" leaning the same way until it said "its top further LEFT than its foot".
- Opaque 640×360 backgrounds don't need `frame`: `out: {width: 1280, height: 720, fit: cover, quality: 82}` gives 139 KB (cockpit) and 74 KB (galley). Recreating the concept with "remove ALL text, the HUD, every person, seats, yoke" worked first time; still zoom in on dots that look like glyphs.
- Black zip ties and the dark-grey yoke are low-contrast against the dark cockpit; give them an outline or glow in the engine if they get lost.

## Stage 4: World 6 boss (2026-10-04)

**Design**
- Each boss phase is a stage (6-1, 6-2, 6-3) with its own intro card, so a player can retry or pick a phase from the map. Phase C's fail sends you to 6-2 at half HP, as in the spec.
- Phase rules are plain state machines (`systems/boss.ts`) driven by `tick(dt)` and returning events. The scene only draws them and routes input, and every rule has a unit test without Phaser.
- Phase B was too easy at first (about 12 s), because his goggles could be plunged any time. Now he is "open" only for 1.3 s after each slap on the yoke, or while Assaf pins him. That forces flying and fighting in turns, which is the point of the phase.

**Engine**
- A new scene must set gravity itself. The arcade world starts with none: a phase with 0° tilt never called `applyTilt`, so Yaniv floated ("never grounded"). Force it in `create()`.
- `Altitude(start, rate)` multiplies every tick by `rate`. A rate of 0 with a scaled `dt` never moves. When the rate is dynamic, construct with rate 1 and tick by `dt × rate`.
- Animations live in `assets.ts#createAnimations` and are created by every scene: a deep link straight into a boss phase has no `LevelScene` to make Yaniv's run cycle first.
- The player can hold an action pose (`player.pose`: pull, choke, tighten) from a second sheet; `showFrame` switches the texture back.

**Testing**
- Edge-detected buttons need a released frame between presses. A synthetic "mash" that presses again in the frame right after a release reads as still held, so every other tap is lost. Mash inside the page (`dispatchEvent` + `requestAnimationFrame`) with a gap frame, and wait for each tap to count: test-side round trips are too slow for a 4-second window.
- The bot needs hysteresis for juggling tasks. Helping Shota until the Captain was just above the threshold made it bounce between Shota and the knots and lose both. Help until 90%, unless a knot is about to slip.

**QA agent (Stage 4):** 11 bugs, all fixed.
- **Controls**
  - After pulling the yoke Yaniv faced away, so GRAB poked backwards.
  - The yoke zone was offset from the yoke art, and ▼ just beside the zone spent Assaf.
- **Hazards**
  - Bath bombs were effectively point-blank at the yoke. They now have a wind-up and a 1.1 s minimum arc.
  - Jet bubble streams were a wall nobody could dodge. They now fly low with a 260-unit range, so you can clear them from a seat top or by backing off.
  - Ducks spawned in the corner behind the boss. They now come out from under his robe.
- **Prompts**
  - The prompt said "▼" when the pitch was above the band.
  - Phase C put helping Shota ahead of a slipping knot.
  - The prompt covered the yoke.
  - The prompt blinked out half the time.
- **Layout**
  - Yaniv hovered over the seat cushion. Seatback tops are now the standing platforms.
  - The map from pause focused 5-1 (RESUME now) and left TITLE alone in a column.
  - On phones the touch buttons covered actors, so the camera now sits higher on touch devices.

Feel changes from the same pass:
- Stomps in 6-2 never hurt.
- Houdini gets a 2 s warning.
- Zip ties no longer refill the knots.
- The Tabuk clock survives a slip.
- The attitude bar shows −60..+10°, with its label outside the bar.

## World 7 assets (2026-10-04)
- All 18 entries in `docs/levels/w7-assets.md` come from `art/manifest/w7.yaml`. Spend was about $6.90 estimated (42 calls): low exploration for everything, four prompt fixes, medium for textures and small props, high for characters and backgrounds.
- **The President rendered without a refusal.** gpt-image-2 drew "a respectful, warm, stylized 16-bit portrait of President Donald Trump" at low and high, so no fallback was needed. Naming the role (the host welcoming the hero for a handshake and photo) and saying "not a caricature, never mocking, no exaggerated features" gave a dignified, friendly figure.
- **The style prefix says sunset.** Every W7 prompt overrides it with "bright, clear MORNING ... NOT sunset", and the W5 aisle reference is used "ONLY for the pixel-art technique; ignore its content, its colors and its sunset light". That kept the daylight palette with the house pixel style.
- **Give room interiors a scale in the prompt.** The first Oval Office had a desk 1.9× Yaniv's height. "A standing adult would be only one seventh of the image height; the desk one ninth (waist high), the windows one third" fixed it at once. Composite a mock with sprites before going high.
- **Seamless strips can be keyed now.** `buildSeamless` honours `chroma` (4 channels, alpha threshold), which the foreground rope needed. For a periodic prop (stanchions), set `out.span` so the period sits inside [0.8, 1] × span × width. The crop height is the chosen width / aspect, so the prop must fit in that band (`position: bottom`). The model ignores exact spacing requests; measure the candidate and set `span` from it.
- **Texture courses vs. crop height.** With `span: 0.5, position: top`, a texture uses only the top ~37% of the image, so a second row of marble blocks showed up as a sliver. Ask for "ONE course ... everything below is a plain face with NO joints".
- **Walk cycles: name the phases.** The Reporter's two walk frames came out identical until the prompt said "CONTACT: legs in an upside-down V ..." and "PASSING, clearly different from (1): one knee lifted high".
- **Frame width again.** A boom mic thrust forward made the swing pose 1.17× the body height, which would have shrunk the Reporter to about 82 px. "Feet a small step apart, NOT lunging ... the mic ends a forearm's length past his hands ... no more than three quarters of his height" brought it to 0.81×.
- **Stable parts across frames:** the Paparazzo's flash burst moves a bbox anchor, so he uses `anchor: left`; the rope posts stay within 2 px. The drain's algae drips hang below the block, so it uses `valign: top`.
- **`out.despill`** (new) lowers red and blue to green's level on magenta-tinted pixels. It removes the purple fringe on dark outlines (low-quality gate, Reporter, Paparazzo, President) and leaves reds, skin and navy alone.
- **`out.colors` does not quantize with sharp 0.35.** `png({palette, colors})` stays at a 256-entry palette unless `bitdepth` is lowered (colors 16 + bitdepth 4 works), so every "colors: N" build so far is really 256 colors. That is harmless for the look but means it never saved size. The 960×480 White House was 185 KB "at 40 colors"; lossy `quality: 90` gives 111 KB. `tools/assets/measure.mts` prints cell sizes and the common scale, which helps calibrate `fit`.

## World 7 engine and QA (2026-10-04)
- **The first ~2 s of a level stall on texture uploads** (swiftshader especially). Inputs sent in that window merge or get lost, so an e2e test that acts at once is flaky. Wait for a game-state signal first (the `time` counter dropping below its start), not a fixed sleep.
- **Ledges over pits must be one-way.** Solid marble blocks at row 16 clipped a standing Yaniv's head (block bottom 272 vs head 270) and blocked jumps out of the pits. One-way `-` shelves drawn with the theme's solid texture look the same and play right.
- **Phaser follow offset is subtracted.** `startFollow(..., offsetX, offsetY)` moves the camera target by −offset, so a *positive* Y offset shows more sky above the player. We use `(-70, 84)` on ground levels.
- **A fixed room needs fixed bounds.** The Oval Office showed an empty strip and a dark band until the camera got explicit bounds centred on the room and the image was anchored to the floor (`floorTop + 22`).
- **Checkpoints must carry objective state.** Retrying 7-1 from the checkpoint re-clogged every drain. The checkpoint event now records cleared drain indices and the retry passes them back (`clearedDrains`).
- **Gate the exit physically, not just logically.** A "gate shut" flag alone let players walk past the art; `gateWall` is a real body until `poolCleared()`.
- **Don't spawn on the player.** Drains skip a blob spawn while Yaniv stands within 44 units, or a plunge turned into an unavoidable hit.
- **Telegraph every hit.** Reporters wait until you're within 320 (they used to march from the level start) and wind up for 0.45 s with a yellow tint and "ONE QUESTION!". Paparazzi aim for 0.7 s before flashing. Full-screen flashes have a 1.6 s cooldown, and with reduced motion they become a 45% white veil.
- **Overlays need 2D navigation.** Once the map became a grid (one column per world), linear up/down focus was confusing. `overlayNavigate` picks the nearest button in the pressed direction and falls back to linear order; tap targets are at least 44 px.
- **Cutscenes hide touch controls** (`.touch.away`), or the buttons sit over the handshake on phones.
- **`camera.pan` takes an ease name string** (`'Sine.easeInOut'`), not a function; passing a function throws "this.ease is not a function" at runtime.
- **Music by world:** Hava Nagila is World 5 only (a 184/208 bpm hora with staccato notes; the slow version sounded mournful). World 6 has original themes; the 6-3 win plays one-shot claps and a fanfare under the chanted words "OD AVINU CHAI!". The Carlebach melody is still under copyright, so it's not in the game unless Tal gets permission.
