import { expect, test, type Page } from '@playwright/test';

interface SybState {
  level: string;
  items: { kind: string; x: number; y: number }[];
  swinging: boolean;
  power: string;
  x: number;
  y: number;
  hearts: number;
  nuts: number;
  score: number;
  finished: boolean;
  tilt: number;
  width: number;
  hurts: { cause: string; x: number; y: number; t: number }[];
}

const state = (page: Page) => page.evaluate(() => (window as unknown as { __syb?: { state(): SybState } }).__syb?.state());

async function waitForLevel(page: Page, id?: string) {
  await page.waitForFunction(
    (want) => {
      const syb = (window as unknown as { __syb?: { state(): { level: string } } }).__syb;
      return syb && (!want || syb.state().level === want);
    },
    id,
    { timeout: 20_000 },
  );
}

interface SybHooks {
  teleport(x: number, y: number): void;
  clearEnemies(): void;
  state(): SybState;
}
const syb = () => (window as unknown as { __syb: SybHooks }).__syb;

test('1 PLAYER starts the trip at 3-1 in Dubai: intro card, then a playable level with HUD', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./');
  await page.getByRole('button', { name: '1 PLAYER', exact: true }).click();
  await expect(page).toHaveURL(/#play$/);
  await expect(page.getByText('SECURITY LINE').first()).toBeVisible();
  await waitForLevel(page, '3-1');
  const s = (await state(page))!;
  expect(s.tilt).toBe(0); // on the ground
  expect(s.hearts).toBe(3);
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('alt')).toHaveText(/^TIME \d+$/);
  await expect(page.locator('canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('keyboard moves Yaniv right and jump leaves the floor', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard flow is desktop-only');
  await page.goto('./#play');
  await waitForLevel(page);
  const start = (await state(page))!;
  // Poll rather than assume a frame rate: headless CI under load may run slower than 60 fps.
  await page.keyboard.down('ArrowRight');
  await expect.poll(async () => (await state(page))!.x, { timeout: 5_000 }).toBeGreaterThan(start.x + 40);
  await page.keyboard.down('Space');
  await expect.poll(async () => (await state(page))!.y, { timeout: 5_000 }).toBeLessThan(start.y - 10);
  await page.keyboard.up('Space');
  await page.keyboard.up('ArrowRight');
});

// The rule-based bot (no god mode) must clear every World 5 level: proves each is completable in a real
// browser by a simple player. 5-2 runs on every device; the rest on desktop Chrome to keep CI time down.
for (const id of ['5-1', '5-2', '5-3', '5-4']) {
  test(`the bot can finish ${id}`, async ({ page }, info) => {
    test.skip(id !== '5-2' && info.project.name !== 'desktop-chrome', 'full World 5 sweep runs on desktop Chrome');
    test.setTimeout(180_000);
    // The difficulty proof (a simple player survives) is game logic, shared by every engine: it runs on the
    // Chromium projects. Firefox/WebKit take slightly different paths through the same level (engine timing),
    // so there the bot is invulnerable and the test proves the level plays through to the end.
    const god = !['desktop-chrome', 'pixel-7', 'subpath'].includes(info.project.name);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`./?level=${id}&bot=1${god ? '&god=1' : ''}#play`);
    await waitForLevel(page, id);
    await page.waitForFunction(
      () => (window as unknown as { __syb?: { state(): { finished: boolean } } }).__syb?.state().finished,
      null,
      { timeout: 160_000, polling: 500 },
    );
    const end = (await state(page))!;
    expect(end.hearts, `hurts: ${JSON.stringify(end.hurts)}`).toBeGreaterThan(0);
    const last = id === '5-4';
    await expect(page.getByRole('heading', { name: last ? 'THE CAPTAIN OPENED THE DOOR!' : 'CABIN CLEARED!' })).toBeVisible();
    // He walks through the curtain and stays on the floor: no creeping downhill or dropping off the level.
    const s = (await state(page))!;
    expect(s.y).toBeLessThanOrEqual(320);
    await page.waitForTimeout(1_500);
    expect((await state(page))!).toMatchObject({ x: s.x, y: s.y, level: id });
    expect(s.hearts, JSON.stringify(s.hurts)).toBeGreaterThan(0);
    expect(s.nuts).toBeGreaterThan(10);
    expect(s.x).toBeGreaterThan(s.width - 300);
    expect(errors).toEqual([]);
    // The clear unlocks the next level, saves it, and the card boards it (5-4 leads into the cockpit, World 6).
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('syb.progress.v1') ?? '{}'));
    expect(saved.best[id]).toBe(s.score);
    await page.getByRole('button', { name: last ? 'INTO THE COCKPIT' : 'NEXT LEVEL' }).click();
    await waitForLevel(page, last ? '6-1' : `5-${Number(id[2]) + 1}`);
  });
}

test('returning players pick an unlocked level from the World 5 map', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('syb.progress.v1', JSON.stringify({ unlocked: '5-2', best: { '5-1': 1234 } })));
  await page.goto('./#play');
  await expect(page.getByRole('heading', { name: 'THE MAP' })).toBeVisible();
  await expect(page.getByRole('button', { name: '5-1 THE SCREAM · 001234' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '5-3 LOCKED' })).toBeDisabled();
  await page.getByRole('button', { name: /^5-2 THE AISLE/ }).click();
  await waitForLevel(page, '5-2');
  expect((await state(page))!.tilt).toBe(8);
});

test('Escape pauses, Resume continues, Quit returns to the title', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard flow is desktop-only');
  await page.goto('./');
  await page.getByRole('button', { name: '1 PLAYER', exact: true }).click();
  await waitForLevel(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
  await page.getByRole('button', { name: 'RESUME' }).click();
  // Press again straight away (before the next physics step): must still pause.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
  await page.getByRole('button', { name: 'QUIT TO TITLE' }).click();
  await expect(page.getByRole('button', { name: '1 PLAYER', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
  // Game styles must not leak onto the title (the two HUDs once shared a class name).
  const titleHud = page.locator('#title header');
  await expect(titleHud).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(titleHud).toHaveCSS('justify-content', 'space-between');
});

test('browser back from the game returns to the title and tears the game down', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '1 PLAYER', exact: true }).click();
  await waitForLevel(page);
  await page.goBack();
  await expect(page.getByRole('button', { name: '1 PLAYER', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('2 PLAYERS still shows Coming Soon', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '2 PLAYERS: SIT NEXT TO AN ISRAELI', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'COMING SOON!' })).toBeVisible();
});

test('touch controls are shown on touch devices and drive the player', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch-only');
  await page.goto('./#play');
  await waitForLevel(page);
  const right = page.locator('[data-btn="right"]');
  await expect(right).toBeVisible();
  const start = (await state(page))!;
  const box = (await right.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await state(page))!.x, { timeout: 5_000 }).toBeGreaterThan(start.x + 40);
  await page.mouse.up();
});

// Regression tests from the Stage 2 QA playtest.
test.describe('QA regressions', () => {
  test.skip(({ isMobile }) => !!isMobile, 'keyboard-driven');

  test('walking left into a hatch respawns on safe floor (no death loop)', async ({ page }) => {
    test.setTimeout(90_000); // software-rendered CI browsers can run the simulation slowly
    await page.goto('./?level=5-2#play');
    await waitForLevel(page, '5-2');
    await page.evaluate(() => {
      const syb = (window as unknown as { __syb: { teleport(x: number, y: number): void; clearEnemies(): void } }).__syb;
      syb.clearEnemies(); // 5-2 has a Baby Bomber right by this hatch
      // Just right of the first cargo hatch (x 992-1056).
      syb.teleport(1110, 320);
    });
    await page.keyboard.down('ArrowLeft');
    // Release as soon as the fall registers: holding left after the respawn would (correctly) walk back in.
    await expect.poll(async () => (await state(page))!.hurts.length, { timeout: 30_000, intervals: [50] }).toBeGreaterThan(0);
    await page.keyboard.up('ArrowLeft');
    const hurts = (await state(page))!.hurts;
    expect(hurts.map((h) => h.cause), JSON.stringify(hurts)).toEqual(['pit']);
    // Respawned standing on the floor right of the hatch, not back inside it, and it stays that way.
    await expect.poll(async () => (await state(page))!.y, { timeout: 10_000 }).toBe(320);
    const s = (await state(page))!;
    expect(s.x).toBeGreaterThan(1056 + 10); // on the floor, clear of the hatch edge (body half-width 10)
    await page.waitForTimeout(1_000);
    expect((await state(page))!).toMatchObject({ hearts: 2, y: 320 });
  });

  test('a key pressed on the intro card does not fire when play starts', async ({ page }) => {
    await page.goto('./#play');
    await page.waitForTimeout(400);
    await page.keyboard.press('Space');
    await waitForLevel(page);
    const ys: number[] = [];
    for (let i = 0; i < 6; i++) {
      ys.push((await state(page))!.y);
      await page.waitForTimeout(60);
    }
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(ys[0] - 1);
  });

  test('pause card works with Space and arrow keys', async ({ page }) => {
    await page.goto('./#play');
    await waitForLevel(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('button', { name: /SOUND/ })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeHidden();
  });

  test('bumping a call-button block from below releases hummus: Yaniv grows Big', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./?level=5-1#play');
    await waitForLevel(page, '5-1');
    // 5-1's power block is at column 28 (x 448-480); stand just left of its centre so the hummus slides right.
    await page.evaluate(`(${syb})().teleport(458, 320)`);
    await page.keyboard.down('Space'); // held: a full-height jump
    await expect.poll(async () => (await state(page))!.y, { timeout: 10_000 }).toBeLessThan(316); // airborne (the block stops the head ~14 units up)
    await expect.poll(async () => (await state(page))!.y, { timeout: 10_000 }).toBe(320); // landed after the bump
    await page.keyboard.up('Space');
    // The bump released a hummus. Chasing a moving item with real key presses is timing-dependent across
    // browsers, so once it is out, put Yaniv where it is; touching it must make him Big.
    await expect.poll(async () => (await state(page))!.items.map((i) => i.kind), { timeout: 10_000 }).toContain('hummus');
    await page.evaluate(`(() => {
      const syb = (${syb})();
      const h = syb.state().items.find((i) => i.kind === 'hummus');
      syb.teleport(h.x, h.y);
    })()`);
    await expect.poll(async () => (await state(page))!.power, { timeout: 10_000 }).toBe('big');
  });

  test('after the galley checkpoint, GAME OVER offers RETRY FROM GALLEY', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('./?level=5-2#play');
    await waitForLevel(page, '5-2');
    // Past 5-2's galley (column 142, x 2272), just before the third hatch (x 2400-2464): walk in until out of
    // hearts. (A key held through a respawn is ignored, so press it again for each fall.)
    const over = page.getByRole('heading', { name: 'GAME OVER' });
    for (let i = 0; i < 3 && !(await over.isVisible()); i++) {
      const before = (await state(page))!.hurts.length;
      await page.evaluate(`(${syb})().clearEnemies(); (${syb})().teleport(2380, 320)`);
      await page.keyboard.down('ArrowRight');
      await expect.poll(async () => (await over.isVisible()) || (await state(page))!.hurts.length > before, { timeout: 20_000 }).toBe(true);
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(700); // the respawn's control lock
    }
    await expect(over).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'RETRY FROM GALLEY' }).click();
    await expect.poll(async () => (await state(page))?.hearts, { timeout: 20_000 }).toBe(3);
    const s = (await state(page))!;
    expect(s.finished).toBe(false);
    expect(Math.abs(s.x - 2272)).toBeLessThan(80);
  });

  test('letting go of a mask with Jump drops off it (no instant re-grab)', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./?level=5-2#play');
    await waitForLevel(page, '5-2');
    // Fall onto the first mask over 5-2's middle hatch (anchor column 100) and hang still.
    await page.evaluate(`(${syb})().clearEnemies(); (${syb})().teleport(1600, 262)`);
    await expect.poll(async () => (await state(page))!.swinging, { timeout: 10_000 }).toBe(true);
    await page.waitForTimeout(500);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await state(page))!.swinging, { timeout: 5_000 }).toBe(false);
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(100);
      expect((await state(page))!.swinging).toBe(false);
    }
  });

  test('the map opened from pause can resume the level or go to the title', async ({ page }) => {
    await page.goto('./?level=5-1#play');
    await waitForLevel(page, '5-1');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'MAP', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'THE MAP' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'TITLE' })).toBeVisible();
    await page.getByRole('button', { name: 'RESUME' }).click();
    await expect(page.getByRole('heading', { name: 'THE MAP' })).toBeHidden();
    const start = (await state(page))!;
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await state(page))!.x, { timeout: 5_000 }).toBeGreaterThan(start.x + 40);
    await page.keyboard.up('ArrowRight');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'MAP', exact: true }).click();
    await page.getByRole('button', { name: 'TITLE' }).click();
    await expect(page.getByRole('button', { name: '1 PLAYER', exact: true })).toBeVisible();
  });

  test('HUD shows the score', async ({ page }) => {
    await page.goto('./#play');
    await waitForLevel(page);
    await expect(page.getByTestId('hud-score')).toHaveText('000000');
  });
});

test('a phone held upright pauses the game behind the rotate hint', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch-only');
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('./#play');
  await waitForLevel(page);
  await expect(page.getByText('Turn your phone sideways to board')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeVisible();
});
