import { expect, test, type Page } from '@playwright/test';

interface SybState {
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

async function waitForLevel(page: Page) {
  await page.waitForFunction(() => (window as unknown as { __syb?: unknown }).__syb, null, { timeout: 20_000 });
}

test('1 PLAYER boards World 5: intro card, then a playable tilted level with HUD', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('./');
  await page.getByRole('button', { name: '1 PLAYER', exact: true }).click();
  await expect(page).toHaveURL(/#play$/);
  await expect(page.getByText('THE AISLE').first()).toBeVisible();
  await waitForLevel(page);
  const s = (await state(page))!;
  expect(s.tilt).toBe(12);
  expect(s.hearts).toBe(3);
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect(page.getByTestId('alt')).toHaveText(/ALT \d{2},\d{3} FT/);
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

test('the bot can finish the level (proves it is completable in a real browser)', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./?bot=1#play');
  await waitForLevel(page);
  await page.waitForFunction(
    () => (window as unknown as { __syb?: { state(): { finished: boolean } } }).__syb?.state().finished,
    null,
    { timeout: 100_000, polling: 500 },
  );
  await expect(page.getByRole('heading', { name: 'CABIN CLEARED!' })).toBeVisible();
  // He walks through the curtain and stays on the floor: no creeping downhill or dropping off the level.
  const s = (await state(page))!;
  expect(s.y).toBeLessThanOrEqual(320);
  await page.waitForTimeout(1_500);
  expect((await state(page))!).toMatchObject({ x: s.x, y: s.y });
  expect(s.hearts).toBeGreaterThan(0);
  expect(s.nuts).toBeGreaterThan(10);
  expect(s.x).toBeGreaterThan(s.width - 300);
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
    await page.goto('./#play');
    await waitForLevel(page);
    await page.evaluate(() => {
      const syb = (window as unknown as { __syb: { teleport(x: number, y: number): void; clearTrolleys(): void } }).__syb;
      syb.clearTrolleys();
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
