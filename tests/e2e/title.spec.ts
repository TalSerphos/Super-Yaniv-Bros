import { expect, test, type Page } from '@playwright/test';

const MENU = ['1 PLAYER', '2 PLAYERS: SIT NEXT TO AN ISRAELI'];

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
  return errors;
}

test.beforeEach(async ({ page }) => {
  await page.goto('./'); // relative, so BASE_URL may include a subpath
});

test('title screen renders with no errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Super Yaniv Bros/ })).toBeVisible();
  await expect(page.locator('.menu-item')).toHaveText(MENU);
  await expect(page.getByText('(C) 2026 NES ZIONA ENTERTAINMENT SYSTEM')).toBeVisible();
  await expect(page.getByTestId('score')).toHaveText('1P 000000');
  // Images actually decoded (not just requested).
  const loaded = await page.locator('#title img').evaluateAll((imgs) => imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0));
  expect(loaded).toBe(true);
  await page.waitForLoadState('networkidle');
  expect(errors).toEqual([]);
});

test('stage keeps 16:9 and fits the viewport', async ({ page }) => {
  const box = (await page.locator('#stage').boundingBox())!;
  const vp = page.viewportSize()!;
  expect(box.width / box.height).toBeCloseTo(16 / 9, 1);
  expect(box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.height).toBeLessThanOrEqual(vp.height + 1);
});

// 1 PLAYER boards the game (tests/e2e/game.spec.ts); 2 PLAYERS still shows Coming Soon.
for (const [i, label] of [[1, MENU[1]]] as const) {
  test(`keyboard: "${label}" opens Coming Soon and Escape returns`, async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'keyboard flow is desktop-only');
    for (let k = 0; k < i; k++) await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'COMING SOON!' })).toBeVisible();
    await expect(page).toHaveURL(/#coming-soon$/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'COMING SOON!' })).toBeHidden();
  });

  test(`pointer: tapping "${label}" opens Coming Soon and BACK returns`, async ({ page }) => {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'COMING SOON!' })).toBeVisible();
    await expect(page.locator('.coming-soon-bg')).toHaveJSProperty('complete', true);
    await page.getByRole('button', { name: /BACK/ }).click();
    await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
  });
}

test('arrow keys wrap around the menu', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard flow is desktop-only');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('button', { name: MENU[1], exact: true })).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('button', { name: MENU[0], exact: true })).toHaveAttribute('aria-current', 'true');
});

test('browser back closes Coming Soon', async ({ page }) => {
  await page.getByRole('button', { name: MENU[1], exact: true }).click();
  await expect(page.getByRole('heading', { name: 'COMING SOON!' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: MENU[1], exact: true })).toBeVisible();
});

test('mute toggle persists across reloads', async ({ page }) => {
  const mute = page.locator('#mute');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
});

// Regression tests from the Stage 1 QA pass.
test.describe('QA regressions', () => {
  const item = (page: Page, i: number) => page.getByRole('button', { name: MENU[i], exact: true });
  const heading = (page: Page) => page.getByRole('heading', { name: 'COMING SOON!' });

  test('menu labels fit inside the menu box', async ({ page }) => {
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.locator('.menu-item').evaluateAll((els) => els.map((e) => e.scrollWidth - e.clientWidth));
    expect(overflow.every((d) => d <= 1)).toBe(true);
    const menu = (await page.locator('.menu').boundingBox())!;
    for (const el of await page.locator('.menu-item').all()) {
      const r = await el.evaluate((e) => {
        const range = document.createRange();
        range.selectNodeContents(e);
        return range.getBoundingClientRect().right;
      });
      // Require 2% headroom so near-misses fail locally, not just on CI's font rasterizer.
      expect(r).toBeLessThanOrEqual(menu.x + menu.width * 0.98);
    }
  });

  test('deep link to #coming-soon: BACK stays on the site', async ({ page }) => {
    await page.goto('./#coming-soon');
    await expect(heading(page)).toBeVisible();
    await page.getByRole('button', { name: /BACK/ }).click();
    await expect(item(page, 0)).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
  });

  test('double BACK does not leave the site', async ({ page, baseURL }) => {
    await item(page, 1).click();
    await expect(heading(page)).toBeVisible();
    await page.getByRole('button', { name: /BACK/ }).dblclick();
    await expect(item(page, 0)).toBeVisible();
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  });

  test('double tap on a menu item leaves Coming Soon open', async ({ page }) => {
    await item(page, 1).dblclick();
    await expect(heading(page)).toBeVisible();
  });

  test('Tab focus moves the cursor, so Enter activates the focused item', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'keyboard flow is desktop-only');
    await item(page, 1).focus();
    await expect(item(page, 1)).toHaveAttribute('aria-current', 'true');
    await expect(item(page, 0)).toHaveAttribute('aria-current', 'false');
  });

  test('after clicking mute, Enter drives the menu again', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'keyboard flow is desktop-only');
    await page.locator('#mute').click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(heading(page)).toBeVisible();
    await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
  });

  test('browser shortcuts with Ctrl are not hijacked', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'keyboard flow is desktop-only');
    await page.keyboard.press('Control+KeyS');
    await expect(item(page, 0)).toHaveAttribute('aria-current', 'true');
  });

  test('setting the hash by hand shows Coming Soon', async ({ page }) => {
    await page.evaluate(() => (location.hash = '#coming-soon'));
    await expect(heading(page)).toBeVisible();
  });
});

test('Google Analytics is configured, but tests never load it or count as visits', async ({ page }) => {
  const gaRequests: string[] = [];
  page.on('request', (r) => /googletagmanager|google-analytics/.test(r.url()) && gaRequests.push(r.url()));
  await page.reload();
  await page.waitForLoadState('load');
  const configured = await page.evaluate(() =>
    ((window as unknown as { dataLayer?: unknown[][] }).dataLayer ?? []).some((a) => a[0] === 'config' && a[1] === 'G-4C932NCJMZ'),
  );
  expect(configured).toBe(true);
  expect(gaRequests).toEqual([]);
});

test('the title shows the version and build', async ({ page }) => {
  await expect(page.getByTestId('version')).toHaveText(/^v\d+\.\d+\.\d+ · \w+$/);
});

test.describe('cookie consent in Europe', () => {
  test.use({ timezoneId: 'Europe/Berlin' });

  test('asks once, remembers the choice, and can be changed from COOKIES', async ({ page }) => {
    const banner = page.getByTestId('consent');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Google Analytics');
    // The menu still works with the banner up.
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.menu-item').nth(1)).toHaveAttribute('aria-current', 'true');
    await banner.getByRole('button', { name: 'NO THANKS' }).click();
    await expect(banner).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('syb.consent.v1'))).toBe('denied');
    await page.reload();
    await expect(page.getByTestId('consent')).toBeHidden();
    await page.getByRole('button', { name: 'COOKIES' }).click();
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: 'OK' }).click();
    expect(await page.evaluate(() => localStorage.getItem('syb.consent.v1'))).toBe('granted');
  });
});

test.describe('cookie consent elsewhere', () => {
  test.use({ timezoneId: 'America/New_York' });

  test('no banner where the law does not ask for opt-in', async ({ page }) => {
    await page.waitForLoadState('load');
    await expect(page.getByTestId('consent')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'COOKIES' })).toHaveCount(0);
  });
});
