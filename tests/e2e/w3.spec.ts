import { expect, test, type Page } from '@playwright/test';

/** World 3, DXB Airport: security belts, travelators, Duty-Free Bills, Mr. Spritz, and the gate. */

interface SybState {
  level: string;
  x: number;
  y: number;
  hearts: number;
  finished: boolean;
  time?: number;
  hurts: unknown[];
  enemies: { kind: string; x: number; y: number }[];
  pops: string[];
}
type Syb = { state(): SybState; teleport(x: number, y: number): void; clearEnemies(): void };

const syb = (page: Page) => page.evaluate(() => (window as unknown as { __syb?: Syb }).__syb?.state());
/** Pop-up texts are drawn in the canvas: read them from the test hook. */
const popped = (page: Page, text: string) => expect.poll(async () => (await syb(page))?.pops ?? [], { timeout: 20_000 }).toContain(text);

async function waitForLevel(page: Page, id: string) {
  await page.waitForFunction((want) => (window as unknown as { __syb?: Syb }).__syb?.state().level === want, id, { timeout: 20_000 });
  // The first frames upload big textures; wait for the clock to run before acting (see LEARNINGS).
  await expect.poll(async () => (await syb(page))!.time ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
}

const CLEAR_HEADINGS: Record<string, string> = { '3-1': 'SECURITY CLEAR!', '3-2': 'STAGE CLEAR!', '3-3': 'THANK YOU YANIV!', '3-4': 'BOARDING COMPLETE!' };

for (const id of ['3-1', '3-2', '3-3', '3-4']) {
  test(`the bot can finish ${id}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chrome' && id !== '3-1', 'the full World 3 sweep runs on desktop Chrome');
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
    await expect(page.getByRole('heading', { name: CLEAR_HEADINGS[id] })).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });
}

test.describe('World 3 mechanics', () => {
  test.skip(({ isMobile }) => !!isMobile, 'keyboard-driven');

  test('a travelator carries Yaniv while he stands still, and the backward one pushes him back', async ({ page }) => {
    await page.goto('./?level=3-2&god=1#play');
    await waitForLevel(page, '3-2');
    const s = () => (window as unknown as { __syb: Syb }).__syb;
    // The first travelator runs right over columns 21-50 (x 336-816).
    await page.evaluate(`(${s})().clearEnemies(); (${s})().teleport(400, 320)`);
    // (Generous timeouts: WebKit on CI runs the game well below real time.)
    await expect.poll(async () => (await syb(page))!.x, { timeout: 20_000 }).toBeGreaterThan(460);
    // The backward one: columns 91-118 (x 1456-1904), running left.
    await page.evaluate(`(${s})().clearEnemies(); (${s})().teleport(1800, 320)`);
    await expect.poll(async () => (await syb(page))!.x, { timeout: 20_000 }).toBeLessThan(1740);
  });

  test('holding → into a gap costs one heart, not all three (the held key is ignored after the respawn)', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto('./?level=3-2#play');
    await waitForLevel(page, '3-2');
    // QA repro: a forward travelator (columns 21-50) runs into the first gap (x 816). Start on plain floor just
    // before it (teleport also sets the respawn point, and a real one is never on a moving belt).
    await page.evaluate(() => {
      const syb = (window as unknown as { __syb: Syb }).__syb;
      syb.clearEnemies();
      syb.teleport(270, 320);
    });
    await page.keyboard.down('ArrowRight');
    // (Timeouts are generous and the wait is in game seconds: parallel software-rendered CI browsers can run
    // the game several times slower than real time.)
    await expect.poll(async () => (await syb(page))!.hurts.length, { timeout: 60_000 }).toBe(1);
    const t1 = (await syb(page))!.time!;
    await expect.poll(async () => (await syb(page))!.time!, { timeout: 60_000 }).toBeLessThanOrEqual(t1 - 4); // still holding →
    await page.keyboard.up('ArrowRight');
    const s = (await syb(page))!;
    expect(s.hurts.length, JSON.stringify(s.hurts)).toBe(1);
    expect(s.hearts).toBe(2);
  });

  test('the metal detector beeps at the plunger', async ({ page }) => {
    await page.goto('./?level=3-1&god=1#play');
    await waitForLevel(page, '3-1');
    // The first detector is at column 50 (x 808).
    await page.evaluate(() => {
      const syb = (window as unknown as { __syb: Syb }).__syb;
      syb.clearEnemies();
      syb.teleport(770, 320);
    });
    await page.keyboard.down('ArrowRight');
    await popped(page, "BEEP! IT'S JUST A PLUNGER!");
    await page.keyboard.up('ArrowRight');
  });

  test('Mr. Spritz keeps the gate shut until he is stomped three times', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('./?level=3-3&god=1#play');
    await waitForLevel(page, '3-3');
    const s = () => (window as unknown as { __syb: Syb }).__syb;
    // Past him, at the gate: locked.
    await page.evaluate(`(${s})().teleport(3540, 320)`);
    await page.keyboard.down('ArrowRight');
    await popped(page, 'MR. SPRITZ BLOCKS THE GATE!');
    await page.keyboard.up('ArrowRight');
    expect((await syb(page))!.finished).toBe(false);
    // Drop onto his cap until he is beaten (three stomps; he is stunned for a moment after each one).
    for (let i = 0; i < 8; i++) {
      const m = (await syb(page))!.enemies.find((e) => e.kind === 'mascot');
      if (!m) break;
      await page.evaluate(([x, y]) => (window as unknown as { __syb: Syb }).__syb.teleport(x, y), [m.x, m.y - 110]);
      await page.waitForTimeout(1500);
    }
    await expect.poll(async () => (await syb(page))!.enemies.some((e) => e.kind === 'mascot'), { timeout: 20_000 }).toBe(false);
    await popped(page, "I'M JUST THE INTERN!");
    // Now the gate lets him through.
    await page.evaluate(`(${s})().teleport(3500, 320)`);
    await page.keyboard.down('ArrowRight');
    await expect(page.getByRole('heading', { name: 'THANK YOU YANIV!' })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.up('ArrowRight');
    await expect(page.getByText('But the cockpit is in another cabin!')).toBeVisible();
  });

  test('clearing the airport (World 0) boards the plane: TAKE YOUR SEAT starts World 1-1', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./?level=3-4&god=1#play');
    await waitForLevel(page, '3-4');
    await page.evaluate(() => {
      const syb = (window as unknown as { __syb: Syb }).__syb;
      syb.clearEnemies();
      syb.teleport(3460, 320);
    });
    await page.keyboard.down('ArrowRight');
    await expect(page.getByRole('heading', { name: 'BOARDING COMPLETE!' })).toBeVisible({ timeout: 15_000 });
    await page.keyboard.up('ArrowRight');
    await expect(page.getByText('WORLD 0 COMPLETE')).toBeVisible();
    await page.getByRole('button', { name: 'TAKE YOUR SEAT' }).click();
    await waitForLevelAny(page, '5-1');
  });
});

async function waitForLevelAny(page: Page, id: string) {
  await page.waitForFunction((want) => (window as unknown as { __syb?: Syb }).__syb?.state().level === want, id, { timeout: 20_000 });
}
