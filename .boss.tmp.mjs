import { chromium } from '@playwright/test';
const S = process.env.S;
const levels = (process.env.LEVELS || '6-1,6-2,6-3').split(',');
const god = process.env.GOD !== '0';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
await Promise.all(levels.map(async (id) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await page.goto(`http://localhost:4173/?level=${id}&bot=1${god ? '&god=1' : ''}#play`);
  await page.waitForFunction(() => window.__syb?.boss, null, { timeout: 30000 });
  const t0 = Date.now();
  const log = [];
  let s, b, shot = false;
  while (Date.now() - t0 < 200000) {
    await page.waitForTimeout(2000);
    s = await page.evaluate(() => window.__syb.state());
    b = await page.evaluate(() => window.__syb.boss());
    log.push(`${Math.round((Date.now()-t0)/1000)}s x${s.x} hp${b.hp} ${b.mode ?? ''} p${b.pitch ?? ''} k${b.knots ?? ''} ${b.clock ?? ''} c${b.captain ?? ''} h${s.hearts}`);
    if (!shot && Date.now() - t0 > 6000) { shot = true; await page.screenshot({ path: `${S}/boss-${id}.png` }); }
    if (s.finished) break;
  }
  await page.waitForTimeout(1600);
  const overlay = await page.evaluate(() => document.querySelector('.game-overlay:not([hidden])')?.textContent?.replace(/\s+/g,' ').trim().slice(0, 90) ?? '');
  await page.screenshot({ path: `${S}/boss-${id}-end.png` });
  console.log(id, '|', overlay, '|', errs.join(';').slice(0, 300));
  console.log('  ' + log.filter((_, i) => i % 3 === 0).join('\n  '));
  await page.close();
}));
await browser.close();
