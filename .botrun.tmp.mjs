import { chromium } from '@playwright/test';
const levels = (process.env.LEVELS || '5-1,5-2,5-3,5-4').split(',');
const god = process.env.GOD === '1';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
await Promise.all(levels.map(async (id) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://localhost:4173/?level=${id}&bot=1${god ? '&god=1' : ''}#play`);
  const t0 = Date.now();
  let s = null, overlay = '';
  while (Date.now() - t0 < 240000) {
    await page.waitForTimeout(1000);
    s = await page.evaluate(() => window.__syb?.state?.() ?? null);
    overlay = await page.evaluate(() => document.querySelector('.game-overlay:not([hidden])')?.textContent?.trim().slice(0, 80) ?? '');
    if (s?.finished) break;
  }
  await page.waitForTimeout(1500);
  overlay = await page.evaluate(() => document.querySelector('.game-overlay:not([hidden])')?.textContent?.replace(/\s+/g,' ').trim().slice(0, 80) ?? '');
  await page.screenshot({ path: `${process.env.S}/bot-${id}${god ? '-god' : ''}.png` });
  console.log(id, JSON.stringify({ x: s?.x, w: s?.width, hearts: s?.hearts, power: s?.power, score: s?.score, fin: s?.finished, secs: Math.round((Date.now()-t0)/1000), drains: s?.drains, time: s?.time, hurts: s?.hurts?.map(h=>`${h.cause}@${h.x}`).join(' ') }), '|', overlay, errs.length ? 'ERR ' + errs.join(';') : '');
  await page.close();
}));
await browser.close();
