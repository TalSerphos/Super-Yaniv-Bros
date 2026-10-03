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
  await page.goto('/');
});

test('title screen renders with no errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Super Yaniv Bros/ })).toBeVisible();
  await expect(page.getByRole('menuitem')).toHaveText(MENU);
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

for (const [i, label] of MENU.entries()) {
  test(`keyboard: "${label}" opens Coming Soon and Escape returns`, async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'keyboard flow is desktop-only');
    for (let k = 0; k < i; k++) await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: label })).toHaveAttribute('aria-current', 'true');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'COMING SOON!' })).toBeVisible();
    await expect(page).toHaveURL(/#coming-soon$/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem', { name: label })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'COMING SOON!' })).toBeHidden();
  });

  test(`pointer: tapping "${label}" opens Coming Soon and BACK returns`, async ({ page }) => {
    await page.getByRole('menuitem', { name: label }).click();
    await expect(page.getByRole('heading', { name: 'COMING SOON!' })).toBeVisible();
    await expect(page.locator('.coming-soon-bg')).toHaveJSProperty('complete', true);
    await page.getByRole('button', { name: /BACK/ }).click();
    await expect(page.getByRole('menuitem', { name: label })).toBeVisible();
  });
}

test('arrow keys wrap around the menu', async ({ page, isMobile }) => {
  test.skip(!!isMobile, 'keyboard flow is desktop-only');
  await page.keyboard.press('ArrowUp');
  await expect(page.getByRole('menuitem', { name: MENU[1] })).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: MENU[0] })).toHaveAttribute('aria-current', 'true');
});

test('browser back closes Coming Soon', async ({ page }) => {
  await page.getByRole('menuitem', { name: MENU[0] }).click();
  await expect(page.getByRole('heading', { name: 'COMING SOON!' })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('menuitem', { name: MENU[0] })).toBeVisible();
});

test('mute toggle persists across reloads', async ({ page }) => {
  const mute = page.locator('#mute');
  await expect(mute).toHaveAttribute('aria-pressed', 'false');
  await mute.click();
  await expect(mute).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
});
