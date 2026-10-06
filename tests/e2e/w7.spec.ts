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
    await expect(page.getByTestId('alt')).toHaveText(/^TIME \d+/);
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

test('winning 6-3 leads TO WASHINGTON, and the map lists the White House as World 3', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?level=6-3&god=1#play');
  await page.waitForFunction(() => !!(window as unknown as { __syb?: Syb }).__syb?.skipClock);
  await page.evaluate(() => (window as unknown as { __syb: Syb }).__syb.skipClock!(50 * 60));
  await expect(page.getByRole('heading', { name: 'TABUK!' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'TO WASHINGTON' }).click();
  await waitForLevel(page, '7-1');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'MAP', exact: true }).click();
  await expect(page.getByRole('button', { name: /^3-1 THE REFLECTING POOL/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: '3-4 LOCKED' })).toBeDisabled();
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
  await expect(page.getByTestId('credits')).toContainText('Thank you Yaniv, Assaf, Zvika, Shota and Captain Machchhar');
  // The first win opens the bonus world: the airport, World 0.
  await expect(page.getByTestId('bonus-world')).toContainText('WORLD 0, DXB AIRPORT');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('syb.progress.v1') ?? '{}'));
  expect(saved.unlocked).toBe('3-1');
});

test.describe('World 7 QA regressions', () => {
  test('the bot gets going again after falling into a pit (it lets go of ▶ after the respawn)', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('./?level=7-3&bot=1&god=1#play');
    await waitForLevel(page, '7-3');
    // A pit fall at x≈2001 respawns it at 1850 (where a loaded runner once left it standing until TIME'S UP).
    await page.evaluate(() => {
      const syb = (window as unknown as { __syb: Syb & { pitFall(): void } }).__syb;
      syb.teleport(1850, 320);
      syb.pitFall();
    });
    await expect.poll(async () => (await syb(page))!.x, { timeout: 60_000 }).toBeGreaterThan(2300);
  });

  test('background props and paparazzi stand on the walkway, not floating over the lawn', async ({ page }) => {
    for (const id of ['7-2', '7-3']) {
      await page.goto(`./?level=${id}&god=1#play`);
      await page.waitForFunction((want) => (window as unknown as { __syb?: { state(): { level: string } } }).__syb?.state().level === want, id, {
        timeout: 20_000,
      });
      const feet = await page.evaluate(() => (window as unknown as { __syb: { state(): { propFeet: number[] } } }).__syb.state().propFeet);
      expect(feet.length, id).toBeGreaterThan(3);
      expect([...new Set(feet)], id).toEqual([320]); // the floor top
    }
  });

  test.skip(({ isMobile }) => !!isMobile, 'keyboard-driven');

  test('7-4: jumping over the President still ends in the handshake', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./?level=7-4#play');
    await waitForLevel(page, '7-4');
    // Mid-air, already past him.
    await page.evaluate(() => (window as unknown as { __syb: Syb }).__syb.teleport(540, 220));
    await expect(page.getByRole('heading', { name: 'THANK YOU YANIV!' })).toBeVisible({ timeout: 30_000 });
  });

  test('7-1: a retry from the checkpoint keeps the drains already cleared', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('./?level=7-1#play');
    await waitForLevel(page, '7-1');
    const s = () => (window as unknown as { __syb: Syb }).__syb;
    // Wait until the clock runs (the first frames upload big textures; key taps there would merge into one).
    await expect.poll(async () => (await syb(page))!.time, { timeout: 15_000 }).toBeLessThan(149);
    // Plunge the first drain (column 34, x 552) clear: three pushes, facing it.
    await page.evaluate(`(${s})().clearEnemies(); (${s})().teleport(520, 320)`);
    await page.keyboard.press('ArrowRight');
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('KeyX');
      await page.waitForTimeout(400);
    }
    await expect.poll(async () => (await syb(page))!.drains, { timeout: 10_000 }).toBe(2);
    // Past the lamppost (column 100), then into the pool three times: game over.
    await page.evaluate(`(${s})().clearEnemies(); (${s})().teleport(1640, 320)`);
    await expect(page.getByText('CHECKPOINT').first()).toBeAttached({ timeout: 5_000 }).catch(() => undefined);
    for (let i = 0; i < 3 && !(await page.getByRole('heading', { name: 'GAME OVER' }).isVisible()); i++) {
      await page.evaluate(`(${s})().clearEnemies(); (${s})().teleport(1930, 300)`);
      await page.waitForTimeout(1600);
    }
    await expect(page.getByRole('heading', { name: 'GAME OVER' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'RETRY FROM CHECKPOINT' }).click();
    await expect.poll(async () => (await syb(page))?.hearts, { timeout: 20_000 }).toBe(3);
    expect((await syb(page))!.drains).toBe(2);
  });

  test('the map is an overworld: Yaniv stands where the trip is and walks the path with the arrows', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('syb.progress.v1', JSON.stringify({ unlocked: '7-4', best: { '7-2': 4321 } })));
    await page.goto('./#play');
    await expect(page.getByRole('heading', { name: 'THE MAP' })).toBeVisible();
    // World 0, the airport, stays shut until a win.
    await expect(page.getByRole('button', { name: '0-1 LOCKED' })).toBeDisabled();
    await expect(page.locator('.map-art .plaque.shut')).toContainText('WIN TO OPEN');
    // The furthest level is where Yaniv stands, and the caption names it.
    await expect(page.getByRole('button', { name: /^3-4 THE OVAL OFFICE/ })).toBeFocused();
    await expect(page.locator('.map-caption')).toContainText('WORLD 3-4');
    // The arrows walk the dotted path, and Yaniv walks with them.
    const steps: [string, RegExp][] = [
      ['ArrowDown', /^3-3/],
      ['ArrowDown', /^3-2/],
      ['ArrowLeft', /^3-1/],
      ['ArrowLeft', /^2-3/],
    ];
    for (const [key, name] of steps) {
      await page.keyboard.press(key);
      await expect(page.getByRole('button', { name })).toBeFocused();
    }
    await expect(page.locator('.map-caption')).toContainText('WORLD 2-3');
    const where = () =>
      page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const [n, y] = [box('.node:focus'), box('.map-yaniv')];
        return { dx: Math.abs(n.x + n.width / 2 - (y.x + y.width / 2)), feet: y.bottom - (n.y + n.height / 2) };
      });
    await expect.poll(async () => (await where()).dx, { timeout: 3_000 }).toBeLessThan(2);
    expect((await where()).feet).toBeGreaterThan(0); // he stands on the node, not floating above it
    // Cleared levels show their best score in the caption and look different from open ones.
    await page.getByRole('button', { name: /^3-2/ }).focus();
    await expect(page.locator('.map-caption')).toContainText('BEST 004321');
    await expect(page.getByRole('button', { name: /^3-2/ })).toHaveClass(/cleared/);
    await expect(page.getByRole('button', { name: /^3-1/ })).not.toHaveClass(/cleared/);
  });

  test('after a win the airport opens as World 0 on the map', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('syb.progress.v1', JSON.stringify({ unlocked: '7-4', best: { '7-4': 5000 } })));
    await page.goto('./#play');
    await expect(page.getByRole('heading', { name: 'THE MAP' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^0-1 SECURITY LINE/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: '0-2 LOCKED' })).toBeDisabled();
    await page.getByRole('button', { name: /^0-1 SECURITY LINE/ }).click();
    await expect(page.getByText('WORLD 0-1').first()).toBeVisible();
  });
});
