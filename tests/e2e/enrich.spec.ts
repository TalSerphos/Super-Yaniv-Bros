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
  sliding: boolean;
  pose: string | null;
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
    // Record every frame whether he hangs on the pole (the slide takes well under a second).
    await page.evaluate(() => {
      const w = window as unknown as { __slid?: boolean; __landed?: { x: number; y: number }; __syb: Syb };
      w.__slid = false;
      const tick = () => {
        const st = w.__syb.state();
        if (st.sliding && st.pose === 'pole') w.__slid = true;
        if (w.__slid && !st.sliding && !w.__landed) w.__landed = { x: st.x, y: st.y };
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    // Drop Yaniv onto the pole 60 units up (between the 2000 and 5000 bands).
    await page.evaluate(`${hook}.clearEnemies(); ${hook}.teleport(${pole.x}, ${pole.base - 60})`);
    await expect.poll(async () => (await syb(page))!.pole!.points, { timeout: 20_000 }).toBe(2000);
    // He grabs on and slides down the pole to its base, flagpole style.
    await expect.poll(() => page.evaluate(() => (window as unknown as { __slid: boolean }).__slid), { timeout: 10_000 }).toBe(true);
    await expect.poll(async () => (await syb(page))!.sliding, { timeout: 10_000 }).toBe(false);
    const landed = await page.evaluate(() => (window as unknown as { __landed: { x: number; y: number } }).__landed);
    expect(landed.y).toBe(pole.base);
    expect(Math.abs(landed.x - pole.x)).toBeLessThanOrEqual(16);
    const after = (await syb(page))!.score;
    expect(after - before).toBeGreaterThanOrEqual(2000);
    // Then, as after the classic flagpole, he walks on to the exit by himself (no input) and it scores once.
    await page.waitForFunction(() => (window as unknown as { __syb: Syb }).__syb.state().finished, null, { timeout: 30_000, polling: 200 });
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

  test('a skid into the 7-4 handshake never freezes the skid pose on screen', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'keyboard-driven');
    await page.goto('./?level=7-4&god=1#play');
    await page.waitForFunction(() => (window as unknown as { __syb?: Syb }).__syb?.state().level === '7-4', null, { timeout: 20_000 });
    await page.waitForTimeout(2500);
    const presidentX = 25 * 16 + 8; // 'V' in gen-w7.py; the finale starts 46 units before him
    await page.evaluate(`${hook}.teleport(${presidentX - 200}, 320)`);
    // Run right, and brake (skid) just before the finale takes over: all in the page, frame-exact.
    await page.evaluate((trigger) => {
      const w = window as unknown as { __syb: Syb; __poses: (string | null)[] };
      const fire = (t: string, c: string) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: c }));
      w.__poses = [];
      let reversed = false;
      fire('keydown', 'ArrowRight');
      const tick = () => {
        const st = w.__syb.state();
        if (!reversed && st.x >= trigger) {
          reversed = true;
          fire('keyup', 'ArrowRight');
          fire('keydown', 'ArrowLeft');
          setTimeout(() => fire('keyup', 'ArrowLeft'), 150);
        }
        if (st.finished) w.__poses.push(st.pose);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, presidentX - 52);
    await page.waitForFunction(() => (window as unknown as { __syb: Syb }).__syb.state().finished, null, { timeout: 20_000 });
    await page.waitForTimeout(1500);
    const poses = await page.evaluate(() => (window as unknown as { __poses: (string | null)[] }).__poses);
    expect(poses.length).toBeGreaterThan(4);
    // At most the frame of the hand-over may still show it; after that the handshake pose is the real sprite.
    expect(poses.slice(2).filter((p) => p !== null)).toEqual([]);
  });

  test('reversing at a run shows the skid frame', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'keyboard-driven');
    await page.goto('./?level=7-2&god=1#play');
    await waitForLevel(page, '7-2');
    await page.evaluate(`${hook}.clearEnemies(); ${hook}.teleport(${24 * 16 + 8}, 320)`);
    // Sample the sprite sheet every frame in the page: a skid lasts only a few frames.
    await page.evaluate(() => {
      const w = window as unknown as { __skid?: boolean; __syb: Syb };
      w.__skid = false;
      const tick = () => {
        if (w.__syb.state().pose === 'skid') w.__skid = true;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.keyboard.down('ArrowRight');
    await expect.poll(async () => (await syb(page))!.x, { timeout: 20_000 }).toBeGreaterThan(24 * 16 + 120);
    // Reverse in one tick (▶ up and ◀ down together), as a player rolling from one key to the other.
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft', key: 'ArrowLeft' }));
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __skid: boolean }).__skid), { timeout: 10_000 }).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowLeft', key: 'ArrowLeft' })));
    await page.keyboard.up('ArrowRight');
  });

  test('the WORLD 0 COMPLETE card (the airport) shows the pushback scene behind it', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'keyboard-driven');
    await page.goto('./?level=3-4&god=1#play');
    await waitForLevel(page, '3-4');
    const pole = (await syb(page))!.pole!;
    await page.evaluate(`${hook}.clearEnemies(); ${hook}.teleport(${pole.x + 20}, ${pole.base})`);
    await page.keyboard.down('ArrowRight');
    await expect(page.getByRole('heading', { name: 'BOARDING COMPLETE!' })).toBeVisible({ timeout: 30_000 });
    await page.keyboard.up('ArrowRight');
    const overlay = page.locator('.game-overlay');
    await expect(overlay).toHaveAttribute('data-backdrop', 'on');
    expect(await overlay.evaluate((el) => (el as HTMLElement).style.backgroundImage)).toContain('card.w3');
    // The scene's image actually loads.
    const ok = await overlay.evaluate(async (el) => {
      const url = /url\("(.+?)"\)/.exec((el as HTMLElement).style.backgroundImage)![1];
      return (await fetch(url)).ok;
    });
    expect(ok).toBe(true);
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
