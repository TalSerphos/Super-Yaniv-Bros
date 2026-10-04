import { expect, test, type Page } from '@playwright/test';

/** World 7, The White House: the Reflecting Pool, the press, the paparazzi, and the Oval Office. */

interface SybState {
  level: string;
  x: number;
  y: number;
  hearts: number;
  finished: boolean;
  drains: number;
  time?: number;
  hurts: unknown[];
}
type Syb = { state(): SybState; teleport(x: number, y: number): void; clearEnemies(): void; skipClock?(s: number): void };

const syb = (page: Page) => page.evaluate(() => (window as unknown as { __syb?: Syb }).__syb?.state());

async function waitForLevel(page: Page, id: string) {
  await page.waitForFunction((want) => (window as unknown as { __syb?: Syb }).__syb?.state().level === want, id, { timeout: 20_000 });
}

for (const id of ['7-1', '7-2', '7-3']) {
  test(`the bot can finish ${id}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chrome' && id !== '7-1', 'the full World 7 sweep runs on desktop Chrome');
    test.setTimeout(180_000);
    // Real damage on Chromium (the difficulty proof); Firefox/WebKit take different paths (see LEARNINGS).
    const god = !['desktop-chrome', 'pixel-7', 'subpath'].includes(info.project.name);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`./?level=${id}&bot=1${god ? '&god=1' : ''}#play`);
    await waitForLevel(page, id);
    await expect(page.getByTestId('alt')).toHaveText(/^TIME \d+$/);
    await page.waitForFunction(() => (window as unknown as { __syb: Syb }).__syb.state().finished, null, { timeout: 160_000, polling: 500 });
    const s = (await syb(page))!;
    expect(s.hearts, `hurts: ${JSON.stringify(s.hurts)}`).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'STAGE CLEAR!' })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('7-1: the gate stays shut until every drain is unclogged', async ({ page }) => {
  await page.goto('./?level=7-1&god=1#play');
  await waitForLevel(page, '7-1');
  expect((await syb(page))!.drains).toBe(3);
  // Straight to the gate with the pool still clogged: no way through.
  await page.evaluate(() => {
    const s = (window as unknown as { __syb: Syb }).__syb;
    s.clearEnemies();
    s.teleport(3410, 320);
  });
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1500);
  await page.keyboard.up('ArrowRight');
  expect((await syb(page))!.finished).toBe(false);
});

test('winning 6-3 leads TO WASHINGTON, and the map lists World 7', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?level=6-3&god=1#play');
  await page.waitForFunction(() => !!(window as unknown as { __syb?: Syb }).__syb?.skipClock);
  await page.evaluate(() => (window as unknown as { __syb: Syb }).__syb.skipClock!(50 * 60));
  await expect(page.getByRole('heading', { name: 'TABUK!' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'TO WASHINGTON' }).click();
  await waitForLevel(page, '7-1');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
  await expect(page.getByRole('button', { name: /^7-1 THE REFLECTING POOL/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: '7-4 LOCKED' })).toBeDisabled();
});

test('7-4: walking up to the President ends the game with the photo', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?level=7-4#play');
  await waitForLevel(page, '7-4');
  await expect(page.getByTestId('alt')).toHaveText('WASHINGTON, D.C.');
  await page.keyboard.down('ArrowRight');
  await expect(page.getByRole('heading', { name: 'THANK YOU YANIV!' })).toBeVisible({ timeout: 30_000 });
  await page.keyboard.up('ArrowRight');
  await expect(page.getByText('But your next client is waiting in Nes Ziona!')).toBeVisible();
  await expect(page.locator('.game-overlay img.photo')).toBeVisible();
});
