import { expect, test, type Page } from '@playwright/test';

/** World 6: the three phases of the boss fight with Jacuzzam Al-Jacuzzi. */

interface BossState {
  phase: 'A' | 'B' | 'C';
  hp: number;
  mode?: string;
  chokeTaps?: number;
  pitch?: number;
  subdued?: boolean;
  knots?: number[];
  clock?: string;
  captain?: number;
}

const boss = (page: Page) => page.evaluate(() => (window as unknown as { __syb?: { boss?(): BossState } }).__syb?.boss?.());
const state = (page: Page) =>
  page.evaluate(() => (window as unknown as { __syb?: { state(): { level: string; x: number; hearts: number; finished: boolean; hurts: unknown[] } } }).__syb?.state());

async function waitForBoss(page: Page, id: string) {
  await page.waitForFunction(
    (want) => {
      const syb = (window as unknown as { __syb?: { state(): { level: string }; boss?: unknown } }).__syb;
      return !!syb?.boss && syb.state().level === want;
    },
    id,
    { timeout: 20_000 },
  );
}

// The rule-based boss bot wins each phase in a real browser. Real damage on Chromium (the difficulty proof);
// Firefox/WebKit take slightly different paths through the same fight, so there the bot is invulnerable
// (see docs/LEARNINGS.md). The full fight runs on desktop Chrome only, to keep CI time down.
const PHASES = [
  { id: '6-1', heading: 'GOT HIM!' },
  { id: '6-2', heading: 'LEVEL FLIGHT!' },
  { id: '6-3', heading: 'TABUK!' },
];
for (const { id, heading } of PHASES) {
  test(`the bot wins boss phase ${id}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-chrome' && id !== '6-1', 'the full fight runs on desktop Chrome');
    test.setTimeout(240_000);
    const god = !['desktop-chrome', 'pixel-7', 'subpath'].includes(info.project.name);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`./?level=${id}&bot=1${god ? '&god=1' : ''}#play`);
    await waitForBoss(page, id);
    await expect(page.getByTestId('boss-hud')).toBeVisible();
    if (id === '6-3') {
      // 40 of the 50 game minutes: the clock, knots and zip ties are covered by unit tests; this proves the loop.
      await page.evaluate(() => (window as unknown as { __syb: { skipClock(s: number): void } }).__syb.skipClock(40 * 60));
    }
    await page.waitForFunction(() => (window as unknown as { __syb: { state(): { finished: boolean } } }).__syb.state().finished, null, {
      timeout: 220_000,
      polling: 500,
    });
    const s = (await state(page))!;
    expect(s.hearts, `hurts: ${JSON.stringify(s.hurts)}`).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible({ timeout: 10_000 });
    expect(errors).toEqual([]);
  });
}

test('clearing 5-4 leads INTO THE COCKPIT, and the map lists World 6', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('syb.progress.v1', JSON.stringify({ unlocked: '6-2', best: { '6-1': 12000 } })));
  await page.goto('./#play');
  await expect(page.getByRole('heading', { name: 'THE MAP' })).toBeVisible();
  await expect(page.getByRole('button', { name: '6-1 THE CO-PILOT · 012000' })).toBeEnabled();
  await expect(page.getByRole('button', { name: '6-3 LOCKED' })).toBeDisabled();
  await page.getByRole('button', { name: /^6-2 FIGHT \+ FLY/ }).click();
  await expect(page.getByText('PHASE B')).toBeVisible();
  await waitForBoss(page, '6-2');
  expect((await boss(page))!.pitch).toBeLessThan(-30);
});

test.describe('boss controls', () => {
  test.skip(({ isMobile }) => !!isMobile, 'keyboard-driven');

  test('Phase B: holding ▼ at the yoke pulls the nose up', async ({ page }) => {
    await page.goto('./?level=6-2&god=1#play');
    await waitForBoss(page, '6-2');
    const before = (await boss(page))!.pitch!;
    await page.keyboard.down('ArrowDown'); // Yaniv starts at the yoke
    await expect.poll(async () => (await boss(page))!.pitch!, { timeout: 15_000 }).toBeGreaterThan(before + 10);
    await page.keyboard.up('ArrowDown');
    await expect(page.getByTestId('control')).not.toHaveText('0%');
  });

  test('Phase C: a knot that slips sends you back to Phase B at half HP', async ({ page }) => {
    await page.goto('./?level=6-3#play');
    await waitForBoss(page, '6-3');
    await expect(page.getByTestId('boss-hud')).toContainText('WRISTS');
    await page.evaluate(() => (window as unknown as { __syb: { drainKnot(i: number, to: number): void } }).__syb.drainKnot(1, 0));
    await expect(page.getByRole('heading', { name: 'HE SLIPPED A KNOT!' })).toBeVisible();
    await page.getByRole('button', { name: 'BACK TO THE YOKE' }).click();
    await waitForBoss(page, '6-2');
    expect((await boss(page))!.hp).toBe(3);
  });

  test('Phase A: the chokehold lands by mashing GRAB from behind a staggered boss', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('./?level=6-1&god=1#play');
    await waitForBoss(page, '6-1');
    // Land the fifth hit through the hook, then step behind him.
    await page.evaluate(() => {
      const syb = (window as unknown as { __syb: { finalHit(): void; clearEnemies(): void } }).__syb;
      syb.finalHit();
      syb.clearEnemies();
    });
    await expect.poll(async () => (await boss(page))!.mode, { timeout: 10_000 }).toBe('stagger');
    const bx = await page.evaluate(() => (window as unknown as { __syb: { boss(): { bossX: number } } }).__syb.boss().bossX);
    await page.evaluate((x) => (window as unknown as { __syb: { teleport(x: number, y: number): void } }).__syb.teleport(x + 30, 304), bx);
    await page.keyboard.press('ArrowLeft'); // face him
    // GRAB starts the chokehold; then mash it (10 presses within 4 s land it). The mashing runs inside the page
    // (real keydown/keyup events with a released frame between presses, as a human's mashing has; a press in
    // the very frame after a release would read as "still held"). Test-side round trips are too slow for this.
    await page.keyboard.press('KeyX');
    await expect.poll(async () => (await boss(page))!.mode, { timeout: 5_000 }).toBe('choke');
    await page.evaluate(async () => {
      const syb = (window as unknown as { __syb: { boss(): { chokeTaps?: number; mode?: string } } }).__syb;
      const frame = () => new Promise((r) => requestAnimationFrame(r));
      for (let i = 0; i < 40 && syb.boss().mode === 'choke'; i++) {
        const n = syb.boss().chokeTaps ?? 0;
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }));
        await frame();
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyX' }));
        await frame();
        for (let w = 0; w < 20 && syb.boss().chokeTaps === n && syb.boss().mode === 'choke'; w++) await frame();
      }
    });
    await expect(page.getByRole('heading', { name: 'GOT HIM!' })).toBeVisible({ timeout: 10_000 });
  });
});

test('touch devices get a ▼ button for the yoke', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch-only');
  await page.goto('./?level=6-2&god=1#play');
  await waitForBoss(page, '6-2');
  await expect(page.locator('[data-btn="down"]')).toBeVisible();
});

test('on a phone, the fight stays clear of the touch buttons, even at the steepest tilt', async ({ page }, info) => {
  test.skip(!info.project.use.hasTouch, 'touch devices only');
  type Pt = { x: number; y: number };
  type OnScreen = { player: { feet: Pt; head: Pt }; boss: { feet: Pt; head: Pt }; yoke?: Pt };
  const onScreen = () => page.evaluate(() => (window as unknown as { __syb: { onScreen(): OnScreen } }).__syb.onScreen());
  const buttons = async () => {
    const boxes = [];
    for (const b of ['left', 'down', 'right', 'grab', 'jump']) boxes.push((await page.locator(`.touch [data-btn="${b}"]`).boundingBox())!);
    return boxes;
  };
  const covered = (pt: Pt, boxes: { x: number; y: number; width: number; height: number }[]) =>
    boxes.some((b) => pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height);
  const viewport = page.viewportSize()!;

  // 6-2 starts nose-down at about −38°: the steepest tilt of the fight. 6-1 has the boss farthest right.
  for (const id of ['6-2', '6-1']) {
    await page.goto(`./?level=${id}&god=1#play`);
    await waitForBoss(page, id);
    await page.waitForTimeout(1500);
    const boxes = await buttons();
    const s = await onScreen();
    // Yaniv, the yoke and the boss's body stay in view (at the far right of his patrol his boots may dip
    // behind GRAB: Tal asked for the floor halfway between mid-screen and the bottom edge).
    const bossBody = { x: (s.boss.feet.x + s.boss.head.x) / 2, y: (s.boss.feet.y + s.boss.head.y) / 2 };
    for (const [name, pt] of Object.entries({ 'player feet': s.player.feet, 'boss body': bossBody, 'boss head': s.boss.head, yoke: s.yoke! })) {
      expect(covered(pt, boxes), `${id} ${name} at ${JSON.stringify(pt)} is under a button`).toBe(false);
      expect(pt.y, `${id} ${name} is on screen`).toBeLessThan(viewport.height);
    }
    // The floor sits a margin above the bottom edge (the luggage hold fills it), not at mid-screen.
    expect(s.yoke!.y).toBeLessThan(viewport.height - 40);
    expect(s.yoke!.y).toBeGreaterThan(viewport.height * 0.66);
    expect(s.boss.head.y).toBeGreaterThan(0);
  }
});

test('the luggage in the hold slides off once the plane tilts hard (6-2 starts nose-down)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chrome', 'decoration: one browser is enough');
  type Hold = { rest: number; slide: number; fall: number; gone: number };
  const hold = () => page.evaluate(() => (window as unknown as { __syb: { boss(): { hold?: Hold } } }).__syb.boss().hold);
  await page.goto('./?level=6-2&god=1#play');
  await waitForBoss(page, '6-2');
  await expect.poll(async () => (await hold())?.gone ?? 0, { timeout: 15_000 }).toBeGreaterThan(0);
});
