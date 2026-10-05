import { expect, test, type Page } from '@playwright/test';

/** The enrichment pass: the goal pole (flagpole twin), impact FX, and the per-level backgrounds. */

interface SybState {
  level: string;
  x: number;
  y: number;
  score: number;
  finished: boolean;
  time?: number;
  fx: number;
  pole: { x: number; base: number; points: number | null } | null;
}
type Syb = { state(): SybState; teleport(x: number, y: number): void; clearEnemies(): void };

const syb = (page: Page) => page.evaluate(() => (window as unknown as { __syb?: Syb }).__syb?.state());
const hook = `(window).__syb`;

async function waitForLevel(page: Page, id: string) {
  await page.waitForFunction((want) => (window as unknown as { __syb?: Syb }).__syb?.state().level === want, id, { timeout: 20_000 });
  // The first frames upload big textures; wait for the clock to run before acting (see LEARNINGS). In the air
  // the clock is ALT (in the HUD), on the ground TIME (in the state).
  if ((await syb(page))!.time === undefined) await expect(page.getByTestId('alt')).toHaveText(/ALT [\d,]+ FT/, { timeout: 15_000 });
  else await expect.poll(async () => (await syb(page))!.time ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
}

test.describe('goal pole', () => {
  test.skip(({ isMobile }) => !!isMobile, 'keyboard-driven');

  test('touching it from the floor pays the base bonus, the level still clears through the exit', async ({ page }) => {
    await page.goto('./?level=3-1&god=1#play');
    await waitForLevel(page, '3-1');
    const pole = (await syb(page))!.pole!;
    expect(pole.points).toBeNull();
    await page.evaluate(`${hook}.clearEnemies(); ${hook}.teleport(${pole.x - 40}, ${pole.base})`);
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await syb(page))!.pole!.points, { timeout: 20_000 }).toBe(100);
    // Keep walking: the curtain/gate exit still ends the level.
    await page.waitForFunction(() => (window as unknown as { __syb: Syb }).__syb.state().finished, null, { timeout: 30_000, polling: 200 });
    await page.keyboard.up('ArrowRight');
  });

  test('touching it high pays more, and only once', async ({ page }) => {
    await page.goto('./?level=7-2&god=1#play');
    await waitForLevel(page, '7-2');
    const pole = (await syb(page))!.pole!;
    const before = (await syb(page))!.score;
    // Drop Yaniv onto the pole 60 units up (between the 2000 and 5000 bands).
    await page.evaluate(`${hook}.clearEnemies(); ${hook}.teleport(${pole.x}, ${pole.base - 60})`);
    await expect.poll(async () => (await syb(page))!.pole!.points, { timeout: 20_000 }).toBe(2000);
    const after = (await syb(page))!.score;
    expect(after - before).toBeGreaterThanOrEqual(2000);
    // Touching again does nothing.
    await page.evaluate(`${hook}.teleport(${pole.x}, ${pole.base})`);
    await page.waitForTimeout(800);
    expect((await syb(page))!.pole!.points).toBe(2000);
  });

  test("7-1's flagpole counts only once the pool is clean", async ({ page }) => {
    await page.goto('./?level=7-1&god=1#play');
    await waitForLevel(page, '7-1');
    const pole = (await syb(page))!.pole!;
    await page.evaluate(`${hook}.clearEnemies(); ${hook}.teleport(${pole.x}, ${pole.base})`);
    await page.waitForTimeout(800);
    expect((await syb(page))!.pole!.points).toBeNull();
    await page.evaluate(`${hook}.clearPool(); ${hook}.teleport(${pole.x - 30}, ${pole.base}); ${hook}.teleport(${pole.x}, ${pole.base})`);
    await expect.poll(async () => (await syb(page))!.pole!.points, { timeout: 20_000 }).toBe(100);
  });
});

test.describe('impact effects and level art', () => {
  test('a long drop raises landing dust; the level has no page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./?level=7-2&god=1#play');
    await waitForLevel(page, '7-2');
    const before = (await syb(page))!.fx;
    // Drop from well above a full jump onto open walkway (column 24: nothing overhead, floor on both sides).
    await page.evaluate(`${hook}.clearEnemies(); ${hook}.teleport(${24 * 16 + 8}, 100)`);
    await expect.poll(async () => (await syb(page))!.fx, { timeout: 20_000 }).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });

  for (const id of ['3-2', '5-4', '7-3']) {
    test(`${id} loads its own background art without errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.goto(`./?level=${id}&god=1#play`);
      await waitForLevel(page, id);
      await page.waitForTimeout(1500);
      expect(errors).toEqual([]);
    });
  }
});
