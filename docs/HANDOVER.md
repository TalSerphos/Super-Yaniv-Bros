# Super Yaniv Bros. Handover for the next agent

Written at the end of the first long build session (2026-10-03 to 10-05). Read this first, then `CLAUDE.md`,
`docs/LEARNINGS.md` (the detailed lessons, by stage) and the parts of `docs/GAME_SPEC.md` your task touches.
`docs/PLAN.md` holds the original staged plan and its status log.

---

## 1. Where things stand

**Live:** https://superyanivbros.com (GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to
`main`). Version **v0.8.0**, shown bottom left on the title next to the short commit.

| World | Levels | State |
|---|---|---|
| 1 Nes Ziona, 2 Dubai | n/a | **not built** (spec'd in `GAME_SPEC.md`) |
| **3 DXB Airport** | 3-1 Security Line, 3-2 Travelator Rush, 3-3 Duty-Free (fake boss Mr. Spritz), 3-4 Gate Closing | built, QA'd |
| 4 Cruise (37,000 ft) | n/a | **not built** |
| **5 The Attack** | 5-1 The Scream, 5-2 The Aisle, 5-3 Bin Avalanche, 5-4 Cockpit Door | built, QA'd |
| **6 The Cockpit** (boss Jacuzzam) | 6-1 Phase A, 6-2 Phase B, 6-3 Phase C (no 6-4 for now) | built, QA'd |
| **7 The White House** | 7-1 Reflecting Pool, 7-2 Press Gaggle, 7-3 Paparazzi Row, 7-4 Oval Office (handshake, photo, end) | built, QA'd |

**Player-facing numbers differ from the ids (since 2026-10-06, Tal's request).**

| Shown to players | Internal world | Ids | When |
|---|---|---|---|
| World 1 | the plane, 5 | `5-x` | the story starts here, at 5-1 |
| World 2 | the cockpit boss, 6 | `6-x` | |
| World 3 | the White House, 7 | `7-x` | |
| World 0 | DXB Airport, 3 | `3-x` | a prequel, opened by the first win (finishing 7-4) |

- **Ids keep their internal digit**, because saves, `?level=` URLs, asset folders and tests use them. The HUD,
  intro cards, map and world cards show `stageLabel(id)`: `5-1` shows as **1-1**, `7-1` as **3-1**, and the
  airport's `3-1` as **0-1**. When Tal says "3-1", ask or check which one he means.
- Unlocks follow `ORDER` in `src/game/levels/index.ts`: W5, W6, W7, then W3. Clearing 7-4 unlocks 3-1.
  `stageAfter('3-4')` boards the plane again (5-1).
- `migrateProgress` updates old saves:
  - a save that only reached the airport restarts on the plane;
  - a save that already won gets the airport.
- Saved progress (`localStorage syb.progress.v1`) is keyed by level id, so adding worlds never loses progress.

Also live:
- the DOM title screen, with a "Coming Soon" page for 2P;
- Google Analytics G-4C932NCJMZ, with a cookie banner only for EEA/UK/CH time zones;
- the map (one column per world), the pause card, touch controls, and a portrait "rotate" hint.

**Known open items:**
- **Worlds 1, 2 and 4.** Spec'd but not built.
- **5-5 Freefall.** Marked "maybe" in the spec.
- **6-4 Tabuk Terminal.** A planned no-challenge breather where kind Saudis offer coffee.
- **2P co-op ("Sit next to an Israeli").** Stage 9 in PLAN.
- **"Od Avinu Chai" melody.** It's under copyright: the 6-3 win plays claps and the chanted words over an original fanfare. Ask Tal before using the real tune.
- **World 3 polish left from QA:**
  - On phones, when Yaniv stands high, floor threats can hide behind the touch buttons.
- **v0.8 enrichment pass** (`docs/levels/enrich-assets.md`) added:
  - impact FX and the goal pole (flagpole twin, `'I'`);
  - themed bonus blocks;
  - Yaniv's skid and pole-slide frames;
  - W7 parallax (sky + Capitol), W3 concourse and baggage hall, W5 dusk and night;
  - decor and world-complete card art.
  - Use `npm run feel` to check that the platformer feel holds after visual changes.

---

## 2. Working with Tal (the user)

- **Shipping:** Tal plays on the live site, often on a phone, and sends feedback in batches (sometimes with
  screenshots or concept art). **Pushing to `main` is pre-authorised** ("You can push to main and publish").
  Develop on the session's designated branch, then `git push origin HEAD:main`. Don't open PRs unless asked.
- **Decisions:** report decisions you made on their behalf in one line each, so they can veto. Ask only when an
  answer changes the work (e.g. "renumber the worlds?").
- **Creative brief:** Israeli humour and pride. Tone: loud, silly, proud, slapstick only. The heroes are real
  people:
  - Yaniv (plumber), Assaf, Zvika (headphones), Shota (dentist), **Captain Machchhar** (name him in credits).
  - The villain Jacuzzam is a clown with **no ethnic or national markers**.
  - Real public figures (the President, past presidents) are drawn **respectfully**, never mocked or fought.
  - Original art only, no Nintendo IP.
- **Art cost:** spending on the OpenAI images API is fine (Tal adds credits). Typical cost is about $1 to $12 per
  world. `art/cost-log.csv` logs every call.
- **Commits:** commit as `git -c user.name="Claude" -c user.email="noreply@anthropic.com" commit`, ending with
  the attribution trailers the session gives you. Never put model names in commits.
- **Wording:** Tal uses "the plane / the cockpit / the boss" loosely. Map words to the spec's ids (World 6 =
  cockpit boss, 7-4 = Oval Office) and confirm in your summary.

---

## 3. Environment gotchas (cloud container)

- **No live-site access:** the network proxy blocks `superyanivbros.com`. Verify a deploy through GitHub Actions
  (`mcp__github__actions_list` / `get_job_logs`): the deploy workflow ends with a **smoke** job that runs e2e
  against production.
- **GitHub:** there is no `gh` CLI; use the GitHub MCP tools.
- **Browser:** Chromium is at `/opt/pw-browsers/chromium` (Playwright finds it). Never run
  `playwright install`. CI installs its own browsers and adds Firefox, WebKit, iPhone 14 and iPad
  (`playwright.config.ts`).
- **Image generation:** `OPENAI_API_KEY` is in the environment, and the npm scripts already set
  `NODE_USE_ENV_PROXY=1`.
- **Waiting:** foreground `sleep` is blocked. Wait with a background `until …; do sleep 5; done` command, or
  schedule a check-in with `send_later`. A deploy plus smoke takes about 15 to 20 minutes, and the CI matrix about
  20 to 25.
- **Preview server:** `npx vite preview --port 4173 --strictPort` serves `dist/`, and Playwright reuses it.
  - Kill it with `fuser -k 4173/tcp`. **Never `pkill -f "vite preview…"`**: the pattern also matches your own
    shell command and kills it.
- **Python:** PIL isn't installed. Use `sharp` (Node) or ImageMagick (`convert`, `montage`, `compare`).
- **Temp files:** put throwaway scripts in the session scratchpad, or in the repo as `*.tmp.mjs` (gitignored).
  Delete them before committing.

---

## 4. Architecture map

```
index.html            DOM title (paints before JS), inline GA/consent loader, version label (%VITE_APP_VERSION%)
src/main.ts           title menu, screens (#play, #coming-soon), lazy-loads the game chunk
src/title/            menu.ts (input mapping), consent.ts (cookie banner), title.css
src/audio/            sfx.ts (WebAudio blips), music.ts (note-string chiptune sequencer, SONGS table)
src/game/boot.ts      the game shell: level flow, intro/clear/world-transition cards, map, pause, music per level
src/game/hud.ts       DOM HUD + overlay cards (+ spatial keyboard/gamepad navigation), touch buttons
src/game/config.ts    VIEW 640×360 world units, ZOOM 2, PHYS, RULES, ROOM_FLOOR_MARGIN
src/game/assets.ts    SHEETS/IMAGES registry (frame sizes in world units), animations, placeholders for missing art
src/game/levels/      loader.ts (ASCII grid legend: READ IT), index.ts (WORLDS, ORDER), wN/*.json (generated)
src/game/scenes/      LevelScene.ts (all platform levels, themes), BossScene.ts (World 6 one-screen arenas)
src/game/systems/     pure logic, unit-tested: boss.ts (phases), input.ts (keys/touch/gamepad + bots),
                      progress.ts, tilt.ts, altitude.ts
src/game/entities/    player, enemies (Trolley/cart, Suitcase, Baby, BinBiter, LuggageRain, Lobbed), items,
                      masks (vines), hold (cargo hold + sliding bags), boss (Walker, Bubble), w3.ts, w7.ts
tools/levels/gen-wN.py   level generators (edit these, not the JSON)
tools/assets/         generate.ts (OpenAI), process.ts (select/build, chroma key, seamless tiles), README.md
art/manifest/*.yaml   every asset's prompt/refs/frames; art/masters (chosen sources); art/reference (Tal's concepts)
tests/unit, tests/e2e, tests/fidelity, tools/check-budget.mjs, lighthouserc.json
```

**Key ideas:**
- **Fixed step.** Gameplay runs on Arcade's fixed 60 Hz `worldstep`, not the render frame, so bots and tests are
  deterministic at any frame rate.
- **Themes.** `LevelScene` handles every non-boss level. Its `THEMES` table covers cabin, mall, lawn, oval,
  terminal, dutyfree and gate. `ground` means no tilt and a TIME counter; `airport` is World 3.
- **Level data.** `LevelData` (`loader.ts`) carries `theme`, `timer`, `beltSpeed`, `intro` and `clear` text, plus
  `mood: 'alarm'`. Per-level copy lives in the level JSON, written by its generator.
- **Shared interfaces.** Entities talk to the scene through `GameWorld` (`src/game/world.ts`). Enemies implement
  `Enemy` (`step`, `hitbox`, `touch`, `hit`). Stomps go through `contact()`.
- **Test hooks.** `window.__syb` exposes `state()` (`level, x, y, hearts, time, enemies, pops, hurts, items…`),
  `teleport(x, feetY)`, `clearEnemies()`, plus scene-specific hooks: `clearPool`, `onScreen`, `setBossHp`,
  `skipClock`, `boss()`…
  - **`teleport` also sets the respawn point.**
  - URL flags: `?level=3-3`, `&god=1`, `&bot=1`, `&debug`.
- **Bots.** `BotInput` (platform levels) and `BossBot` are deliberately simple rule-based players. If the bot can
  clear a level with real damage, a person can.
- **Floor and units.** The floor top is y=320 in every platform level (`FLOOR` row 20). One tile is 16 units.
  Yaniv is about 53 units tall, and his jump apex is about 76 (4.75 tiles). Keep gaps of 6 tiles or less.

---

## 5. Commands and the verification ladder

```
npm run lint && npm test && npm run build && npm run e2e   # everything; run before every push
npx playwright test tests/e2e/w3.spec.ts --project=desktop-chrome --workers=4   # one spec, fast
npx playwright test --last-failed                                               # re-check a failure
npx playwright test <spec> -g "<name>" --repeat-each=6 --workers=6              # flakiness under load
python3 tools/levels/gen-w3.py src/game/levels/w3                               # regenerate levels
npm run assets:generate -- --ids 'w3.*' --quality low --max-spend 3             # explore art
npm run assets:process -- select --id <id> --from art/raw/<id>/<dir>/<n>.png    # path RELATIVE to repo
npm run assets:process -- build --ids <id,...>
```

The full local e2e takes about 8 minutes and runs on desktop-chrome, pixel-7 and a subpath build. `npm run build`
fails on any budget breach:
- initial load ≤ 350 KB;
- title JS ≤ 15 KB gz;
- game JS ≤ 420 KB gz;
- each world pack ≤ 1.5 MB;
- each image ≤ 180 KB.

Lighthouse mobile performance must stay ≥ 0.9 (CI). Keep every URL relative: the site must also work under
`/Super-Yaniv-Bros/`.

---

## 6. Workflows by task

### A. A feedback batch from Tal (the most common task)
1. **Track it.** Turn the message into a task list, one item per request (TaskCreate). Restate ambiguous ones in
   your own words.
2. **Look before touching code.** Screenshot the reported state on the device Tal used (phone = `Pixel 7
   landscape` / `iPhone 14 landscape`), using the template in §8. Most of the session's wrong turns came from
   fixing an assumed problem.
3. **Fix the root cause, one item at a time**, and re-screenshot the same view to compare before and after.
4. **Add a regression test** that fails without the fix. Prove it: temporarily revert the fix, **check the build
   succeeded**, see the test fail, restore.
5. **Run the full ladder (§5).** Commit with a message that lists each item. Push the branch, then `main`.
6. **Follow up.** Schedule a `send_later` check at about 20 minutes, then report briefly: what changed, what you
   decided for Tal, what's left.

### B. A new world (the World 3 checklist; reuse it)
1. **Spec.** Read the world's row in `GAME_SPEC.md`. Save any concept art to `art/reference/wN-*.webp`, cropping
   off caption bars. Decide the mechanics; the spec lists them, but be creative and keep the game's feel.
2. **Art contract.** Write `docs/levels/wN-assets.md`: a table of id, kind, frame (world units), frame names and
   notes.
3. **Manifest.** Write `art/manifest/wN.yaml`, copying patterns from `w3.yaml` or `w7.yaml` (backgrounds, seamless
   textures, keyed props, spritesheets).
   - Start the low-quality exploration **in the background right away** (it takes 2 to 15 minutes) and build the
     engine meanwhile; the engine draws labelled placeholders until the art exists.
4. **Level format.** Add new legend chars in `loader.ts` (pick unused letters, document them at the top). Add the
   matching `ParsedLevel` fields and parse cases, and extend `LevelData.theme`.
5. **Generator.** Write `tools/levels/gen-wN.py` by copying `gen-w3.py`: `L` class, floor, pits, shelves,
   `dump(meta)` with `timer`, `intro` and `clear`. Generate the JSONs.
6. **Engine:**
   - `LevelScene`: a `THEMES` entry, background, entities, step hooks and NPCs.
   - `assets.ts`: SHEETS/IMAGES, animations and the glob path.
   - New entities go in `src/game/entities/wN.ts`.
7. **Flow:**
   - `levels/index.ts`: add `WORLDn` and place it in `WORLDS` in story order.
   - `boot.ts`: the world-transition card (`cards`), music per theme, and the time-out text.
8. **Music.** Add an original song to `SONGS` in `src/audio/music.ts` with a unit test.
9. **Tests:**
   - Unit (`levels.test.ts`): the world's rules, and include it in the generic platform-level suite.
   - E2E (`wN.spec.ts`): the bot clears every level (desktop-chrome for all, plus one on all devices), each new
     mechanic, the world transition, and the map.
   - Update tests that assumed the old first level or the old map layout.
10. **Art review:**
    - Review low candidates as contact sheets (`montage`) and fix prompts.
    - Run **high** for all (about 2 candidates each), pick, `select`, `build`.
    - Screenshot every level and fix composition: crop `position`, `span`, scale, depth.
11. **QA.** Spawn a background QA playtest agent (prompt template in §9) while CI runs on the branch. Fix what it
    finds, rerun everything, then ship to `main`.
12. **Docs.** Update the spec, PLAN status and LEARNINGS, and bump `package.json` version (minor per world).

### C. A new enemy, hazard or mechanic
- **Pure rules first.** Write the rule as a pure function or class with a unit test (examples: `stepBag` in
  `hold.ts`, the boss state machines in `systems/boss.ts`), then a thin entity that draws it.
- **Telegraph every hit.** A distinct wind-up frame or tint at least 0.4 to 0.7 s before damage. **Don't reuse
  the attack frame as the tell.** Never spawn on or right next to the player.
- **Projectiles:** set their height relative to the floor the player stands on, not the emitter's base.
- **Teach the bot.** Add the kind to `GROUND_THREATS`, or let the plunger poke handle it, or write a small
  routine like `fightMascot`. Prove the bot clears the level with **real damage** on Chromium.
- **Locking the exit:** use a physical wall from floor to above the screen (`gateWall`), not just a flag.

### D. Art: new asset, replacement, or a fix to one detail
- **Placement and size:**
  - Everything is 2× art drawn at `ART_SCALE` 0.5. Frames are in world units.
  - Characters stand bottom-centre. Size them with `fit: {height: …}` (Yaniv's idle is 107 px tall at 2×).
- **Transparency and text:**
  - Need alpha? Paint on flat magenta with `chroma: '#ff00ff'`, plus `out.despill` to remove purple fringes.
  - **No text in art.** Draw signs in-engine (e.g. the B32 sign).
  - Check lettering by eye: the models misspell.
- **Lighting:** the style prefix in `art/prompts/style.md` says sunset. For daylight scenes, say "bright, clear
  MORNING/DAYTIME, NOT sunset". References lock the pixel technique; say "ignore its content and colours" when
  you only want the technique.
- **Seamless strips and textures:**
  - The crop takes a band of the master (`position: top/centre/bottom`, `span`). If the model drew the subject
    as a band with margins, move the crop or rephrase: "fills the WHOLE image, no margins".
  - Screenshot to verify.
- **Fixing one detail of an existing image** (e.g. Zvika's headphones):
  - Use the manifest's `mask` (inpainting). The model still re-renders the whole picture slightly (about 5% RMSE).
  - **Composite** the repainted region onto the original master with a feathered edge (see the title.bg commit),
    then `select` the composite (path relative to the repo).
- **Scale in prompts:** state it ("a standing adult is one seventh of the image height"), and name walk-cycle
  phases explicitly.

### E. Music
Songs are note strings in 8-token bars (`src/audio/music.ts`): `song(bpm, sections, style, {staccato})`.
- Every voice must be the same length (a unit test checks).
- Use only original or public-domain melodies (Hava Nagila is public domain).
- Choose the song per theme or world in `boot.ts` `playLevel`.
- One-shot songs (`play(name, true)`) suit victory stingers.

### F. Phone layout and camera
- **Two different layers.** The touch buttons are DOM over the canvas. One-screen rooms (boss arena, Oval
  Office) keep the floor `ROOM_FLOOR_MARGIN` above the bottom edge; side-scrollers use `setFollowOffset`
  (positive y shows **more sky**, it's subtracted).
- **Tilt.** The camera rotates around the view centre, so the low side drops by `dx · sin(tilt)`.
- **Measure, don't eyeball.** Use the boss scene's `__syb.onScreen()` (actor page coordinates) against the
  buttons' `getBoundingClientRect()`.
- **Tal's taste call.** Tal found "floor mid-screen" too high and "floor at the bottom" hidden; the agreed
  framing is halfway.

### G. Title screen and DOM changes
- **Budget:** title JS ≤ 15 KB gz, and the title must paint before the game chunk loads.
- **Keyboard:** the title keydown handler drives the menu globally. New focusable controls must be excluded
  there, the way `mute` and the consent banner are.
- **Text in tests:** canvas text (`popText`) isn't in the DOM. E2E reads it from `__syb.state().pops`; card text
  *is* DOM.

### H. Ship and watch
1. Push the branch, then `git push origin HEAD:main`.
2. The deploy workflow runs build, e2e on chromium + pixel-7, deploy, then smoke on production. The CI workflow
   runs the full browser matrix plus fidelity and Lighthouse.
3. Check both with the GitHub MCP tools. Get only the failing job logs (`get_job_logs failed_only`) and fix
   forward.
   - A failure only on WebKit or Firefox is almost always **timing**: those engines run the simulation slower.
   - Fix it with game-time waits and generous timeouts, not by skipping the test.

---

## 7. Testing practices that worked

- **Real damage.** Bots run with real damage on Chromium projects (desktop-chrome, pixel-7, subpath) and god mode
  on Firefox/WebKit, where paths diverge. Long sweeps run on desktop-chrome only.
- **Texture stall.** Wait for the level to actually run before acting (`state().time` dropping, or
  `waitForLevel`). The first ~2 s stall on texture uploads and merge key presses.
- **Game time, not wall time.** Measure waits in game time (`state().time`). Under 6 parallel software-rendered
  browsers the game ran at about 1/7 speed. Use `--repeat-each=6 --workers=6` to flush out flakiness before
  pushing.
- **`teleport` gotcha.** `teleport` sets the respawn point. Starting a respawn test on a belt or a lip tests the
  wrong thing.
- **Valid "test the test".** A sabotaged revert that breaks the TypeScript build leaves the old `dist/` in place,
  so the test passes for the wrong reason.
- **Moving targets.** Check moving actors at their extremes (a boss at the far end of his patrol), not wherever
  they happen to stand.
- **Visual checks.** Read the screenshot images; don't trust dimensions alone. Look at full size before
  "fixing" (the 7-4 photo was correct all along).

---

## 8. Screenshot and trace template

```js
// save as shots.tmp.mjs (gitignored), run with: OUT=<scratchpad> node shots.tmp.mjs
import { chromium, devices } from '@playwright/test';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const [dev, tag] of [['Desktop Chrome', 'desk'], ['Pixel 7 landscape', 'phone']]) {
  const page = await (await browser.newContext({ ...devices[dev] })).newPage();
  page.on('pageerror', (e) => console.log('ERR', e.message));
  await page.goto('http://localhost:4173/?level=3-1&god=1#play');
  await page.waitForFunction(() => window.__syb?.state?.().level === '3-1', null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { window.__syb.clearEnemies(); window.__syb.teleport(600, 320); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${process.env.OUT}/3-1-${tag}.png` });
  console.log(tag, JSON.stringify(await page.evaluate(() => window.__syb.state())).slice(0, 300));
}
await browser.close();
```

For a bot trace, load `&bot=1` and log `state()` every few seconds (x, hearts, hurts, pops). That's how the 3-3
mascot softlock was found.

---

## 9. QA playtest agent (prompt template)

Spawn it in the background (`run_in_background: true`) after the feature works and CI is running. Brief it with:
- **Rules:** read-only, scratch files only under /tmp/qa-*/, no commits.
- **How to run:** preview on a *different* port (e.g. 4180), Chromium path, devices (Desktop Chrome + Pixel 7
  landscape), URL flags, controls (arrows, Space jump, X grab, Esc; touch `[data-btn=…]`) and the `__syb` hooks.
- **Design intent per level**, so it can judge what's a bug.
- **What to check:**
  - completable without god mode (and with the bot);
  - unfair hits or telegraphs;
  - the new mechanic's feel;
  - softlocks;
  - visuals (z-order, clipping, placeholders, text overflow, things hidden behind touch buttons);
  - flow (cards, retry, time-out, transitions, map);
  - console errors.
- **Report shape:** under ~900 words, numbered by severity, bugs separate from polish, with repro steps
  (level + x) and the 3 to 6 most telling screenshot paths.

Past runs found real bugs every time: the respawn death loop, unfair projectile heights, misleading telegraphs,
the bot jumping a short gate wall. Verify each finding yourself before fixing (screenshot or trace), and rerun
the full ladder after.

---

## 10. The mistakes worth not repeating (details in LEARNINGS.md)

- **Sign errors.** `centerOn` y and `setFollowOffset` y both have counter-intuitive signs. A "camera higher"
  change once moved the view the wrong way. Screenshot after every camera change.
- **Phaser specifics:**
  - Arcade bodies scale with the sprite: a scale tween resizes the hitbox (the mascot's wind-up did this).
  - `camera.pan` takes an ease *name string*.
  - `renderer.snapshot` captures the *next* frame, so start flashes in its callback.
- **Floor detection.** `floorTopOf` takes the max y of `'floor'` solids. A travelator laid over a floor row made
  the slab underneath the "floor top", so belts are as deep as the slab and only the top row moves.
- **Respawn points.** Sample ground every 16 units (two far probes let a hatch pass as solid), never on a moving
  belt, and ignore a direction held through the fall.
- **Locked exits** need a wall that reaches the ceiling. **Arena furniture** must be one-way shelves, or the boss
  gets fenced in.
- **Decor never hides the player.** An X-ray machine in front of him hid Yaniv completely.
- **Asset pipeline:**
  - `select --from` paths are relative to the repo.
  - `sharp`'s `colors: N` doesn't quantize without a lower `bitdepth`.
  - The magenta key leaves a purple fringe without `despill`.
- **Text placement.** Overlay text near interactive UI must not cover it. The first cookie banner hid the
  "2 PLAYERS" menu item.
- **Analytics.** Never let tests or Lighthouse load it: gate on hostname and `!navigator.webdriver`.
- **Investigate before fixing.** Read the code path that produces the symptom, then fix. Several hours went into
  "fixes" for problems that weren't real (the photo zoom) or were misdiagnosed (camera sign).

---

## 11. Suggested next steps (Tal's backlog, in likely order)

1. **The World 3 phone polish from QA.** Camera bias down while standing high.
2. **World 4, Cruise:**
   - Boarding (bin wars), Meal Service (Trolley Trolls), Wing Dream (a sky level), The Lav (a water level).
   - Lav Warps: flush to warp.
   - Make the 3-4 card lead into World 4 instead of World 5.
3. **Worlds 1–2, Nes Ziona and Dubai.** Ground worlds with x-4 fake-boss "castles": the giant Clog, the Hot-Tub
   Salesman.
4. **6-4 Tabuk Terminal.** A calm walk-around: no enemies, NPC dialogue pops, coffee.
5. **2P co-op.** P2 is Assaf, Zvika or Shota on a shared screen.
6. **Ongoing quality work:**
   - Keep the fidelity shots (`tests/fidelity/shots.json`) up to date for new concept art.
   - Keep LEARNINGS updated per stage.
