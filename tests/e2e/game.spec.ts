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
  const s = (await state(page))!;
  await expect(page.getByRole('heading', { name: 'CABIN CLEARED!' })).toBeVisible();
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
  await expect(page.getByRole('heading', { name: 'PAUSED' })).toBeHidden();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'QUIT TO TITLE' }).click();
  await expect(page.getByRole('button', { name: '1 PLAYER', exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
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
