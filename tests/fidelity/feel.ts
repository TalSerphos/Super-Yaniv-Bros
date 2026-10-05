/**
 * Platformer-feel check: does each platform level still read as a classic 16-bit side-scroller?
 *
 *   npm run feel                        # screenshots + squint sheets (no API calls)
 *   npm run feel -- --judge             # + OpenAI vision rubric (docs/fidelity/FEEL.md)
 *   npm run feel -- --ids 7-1,7-2
 *
 * For each level: two god-mode screenshots (15% and 55% of the way, enemies left in: threats must read),
 * plus a "squint" version (greyscale + blur) where the floor, blocks and threats must still stand out. With
 * --judge, appends one row per level to docs/fidelity/feel.md, so art changes can be compared before/after.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const LEVELS = ['3-1', '3-2', '3-3', '3-4', '5-1', '5-2', '5-3', '5-4', '7-1', '7-2', '7-3'];
const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = join(ROOT, 'tests/fidelity/out/feel');
const DOCS = join(ROOT, 'docs/fidelity');
const argv = process.argv.slice(2);
const useJudge = argv.includes('--judge');
const ids = argv.includes('--ids') ? argv[argv.indexOf('--ids') + 1].split(',') : LEVELS;
const label = argv.includes('--label') ? argv[argv.indexOf('--label') + 1] : '';

async function startServer(): Promise<{ base: string; proc?: ChildProcess }> {
  if (process.env.BASE_URL) return { base: process.env.BASE_URL };
  const proc = spawn('npx', ['vite', 'preview', '--port', '4175', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const base = 'http://localhost:4175';
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base)).ok) return { base, proc };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  proc.kill();
  throw new Error('vite preview did not start (run `npm run build` first)');
}

async function judge(level: string, shots: Buffer[]): Promise<{ scores: Record<string, number>; average: number; fixes: string[] }> {
  const rubric = readFileSync(join(DOCS, 'FEEL.md'), 'utf8');
  const images = await Promise.all(shots.map((s) => sharp(s).resize(1280).webp({ quality: 80 }).toBuffer()));
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.JUDGE_MODEL ?? 'gpt-5.5',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: `${rubric}\n\nLevel ${level}. Reply with JSON only.` },
            ...images.map((b) => ({ type: 'input_image', image_url: `data:image/webp;base64,${b.toString('base64')}` })),
          ],
        },
      ],
      text: { format: { type: 'json_object' } },
    }),
  });
  const body = (await res.json()) as { output?: { content?: { type: string; text: string }[] }[]; error?: { message: string } };
  if (!res.ok) throw new Error(`judge: ${res.status} ${body.error?.message}`);
  const text = body.output?.flatMap((o) => o.content ?? []).find((c) => c.type === 'output_text')?.text ?? '{}';
  const parsed = JSON.parse(text) as { scores: Record<string, number>; fixes: string[] };
  const vals = Object.values(parsed.scores);
  return { ...parsed, average: vals.reduce((a, b) => a + b, 0) / vals.length };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { base, proc } = await startServer();
  const browser = await chromium.launch(process.env.CI ? {} : { executablePath: '/opt/pw-browsers/chromium' });
  const md = join(DOCS, 'feel.md');
  if (useJudge && !existsSync(md)) {
    appendFileSync(md, '# Platformer feel (rubric: FEEL.md)\n\n| run | level | avg | scores | top fixes |\n|---|---|---|---|---|\n');
  }
  const averages: number[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    for (const level of ids) {
      await page.goto(`${base}/?level=${level}&god=1#play`);
      await page.waitForFunction((id) => (window as unknown as { __syb?: { state(): { level: string } } }).__syb?.state().level === id, level, {
        timeout: 60_000,
      });
      await page.waitForTimeout(2500);
      const width = await page.evaluate(() => (window as unknown as { __syb: { state(): { width?: number } } }).__syb.state().width ?? 3000);
      const shots: Buffer[] = [];
      for (const x of [Math.round(width * 0.15), Math.round(width * 0.55)]) {
        await page.evaluate((x) => {
          const s = (window as unknown as { __syb: { clearEnemies(): void; teleport(x: number, y: number): void } }).__syb;
          s.teleport(x, 320);
        }, x);
        await page.waitForTimeout(1200);
        const png = await page.locator('#stage').screenshot();
        shots.push(png);
        await sharp(png).toFile(join(OUT, `${level}-${x}.png`));
        await sharp(png).greyscale().blur(3).resize(640).toFile(join(OUT, `${level}-${x}.squint.png`));
      }
      if (useJudge) {
        const j = await judge(level, shots);
        averages.push(j.average);
        const scores = Object.entries(j.scores).map(([k, v]) => `${k} ${v}`).join(', ');
        appendFileSync(md, `| ${new Date().toISOString().slice(0, 16)} ${label} | ${level} | ${j.average.toFixed(1)} | ${scores} | ${j.fixes.slice(0, 2).join('; ')} |\n`);
        console.log(`${level}: ${j.average.toFixed(1)} (${scores})\n  fixes: ${j.fixes.join(' | ')}`);
      } else console.log(`${level}: shots in ${OUT}`);
    }
  } finally {
    await browser.close();
    proc?.kill();
  }
  if (averages.length) console.log(`mean ${(averages.reduce((a, b) => a + b, 0) / averages.length).toFixed(2)}`);
}

main();
