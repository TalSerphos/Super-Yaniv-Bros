/**
 * Fidelity check: how close does the built game look to the concept art?
 *
 *   npm run fidelity                 # metrics only (cheap, used in CI)
 *   npm run fidelity -- --judge      # + OpenAI vision rubric (needs OPENAI_API_KEY)
 *   npm run fidelity -- --ids title
 *
 * For each shot in shots.json: screenshot the built game (vite preview, or BASE_URL), compute
 * palette + composition similarity against the reference, write a side-by-side composite and
 * append results to docs/fidelity/<id>.md. Claude review agents read the composite and apply
 * the same rubric (docs/fidelity/RUBRIC.md) during the per-level loop.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { compositionSsim, paletteSimilarity } from './metrics.ts';

interface Shot {
  id: string;
  url: string;
  reference: string;
  gate: number;
  notes?: string;
}

const ROOT = new URL('../../', import.meta.url).pathname;
const OUT = join(ROOT, 'tests/fidelity/out');
const DOCS = join(ROOT, 'docs/fidelity');
const argv = process.argv.slice(2);
const useJudge = argv.includes('--judge');
const idsArg = argv[argv.indexOf('--ids') + 1];
const ids = argv.includes('--ids') ? idsArg.split(',') : undefined;
// Soft floors for CI: a big drop means something broke visually (missing asset, wrong layout).
const MIN_PALETTE = 0.45;
const MIN_SSIM = 0.35;

async function startServer(): Promise<{ base: string; proc?: ChildProcess }> {
  if (process.env.BASE_URL) return { base: process.env.BASE_URL };
  const proc = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const base = 'http://localhost:4174';
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

async function judge(shot: Shot, screenshot: Buffer): Promise<{ scores: Record<string, number>; average: number; fixes: string[] }> {
  const rubric = readFileSync(join(DOCS, 'RUBRIC.md'), 'utf8');
  const ref = await sharp(join(ROOT, shot.reference)).resize(1280).webp({ quality: 80 }).toBuffer();
  const shotImg = await sharp(screenshot).resize(1280).webp({ quality: 80 }).toBuffer();
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.JUDGE_MODEL ?? 'gpt-5.5',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: `${rubric}\n\nShot "${shot.id}". Notes: ${shot.notes ?? '-'}\nImage 1 = REFERENCE concept art. Image 2 = GAME screenshot. Reply with JSON only.` },
            { type: 'input_image', image_url: `data:image/webp;base64,${ref.toString('base64')}` },
            { type: 'input_image', image_url: `data:image/webp;base64,${shotImg.toString('base64')}` },
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
  const shots = (JSON.parse(readFileSync(join(ROOT, 'tests/fidelity/shots.json'), 'utf8')) as Shot[]).filter((s) => !ids || ids.includes(s.id));
  mkdirSync(OUT, { recursive: true });
  mkdirSync(DOCS, { recursive: true });
  const { base, proc } = await startServer();
  const browser = await chromium.launch(process.env.CI ? {} : { executablePath: '/opt/pw-browsers/chromium' });
  const failures: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.emulateMedia({ reducedMotion: 'reduce' }); // freeze CSS animations for stable shots
    for (const shot of shots) {
      await page.goto(base + shot.url);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.fonts.ready);
      const png = await page.locator('#stage').screenshot();
      const refPath = join(ROOT, shot.reference);
      const [palette, ssim] = await Promise.all([paletteSimilarity(png, refPath), compositionSsim(png, refPath)]);

      // Side-by-side composite: reference | game.
      const left = await sharp(refPath).resize(800, 450, { fit: 'cover' }).toBuffer();
      const right = await sharp(png).resize(800, 450, { fit: 'cover' }).toBuffer();
      const composite = join(DOCS, `${shot.id}.compare.webp`);
      await sharp({ create: { width: 1608, height: 450, channels: 3, background: '#000' } })
        .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 808, top: 0 }])
        .webp({ quality: 75 })
        .toFile(composite);
      writeFileSync(join(OUT, `${shot.id}.png`), png);

      let line = `| ${new Date().toISOString().slice(0, 16)} | ${palette.toFixed(3)} | ${ssim.toFixed(3)} |`;
      let verdict = `palette ${palette.toFixed(3)}, composition ${ssim.toFixed(3)}`;
      if (useJudge) {
        const j = await judge(shot, png);
        line += ` ${j.average.toFixed(1)} | ${Object.entries(j.scores).map(([k, v]) => `${k} ${v}`).join(', ')} | ${j.fixes.slice(0, 3).join('; ')} |`;
        verdict += `, rubric ${j.average.toFixed(1)}/10 (gate ${shot.gate})`;
        if (j.average < shot.gate) failures.push(`${shot.id}: rubric ${j.average.toFixed(1)} < gate ${shot.gate}`);
        console.log(`  fixes: ${j.fixes.join(' | ')}`);
      } else {
        line += ' – | – | – |';
      }
      if (palette < MIN_PALETTE) failures.push(`${shot.id}: palette ${palette.toFixed(3)} < ${MIN_PALETTE}`);
      if (ssim < MIN_SSIM) failures.push(`${shot.id}: composition ${ssim.toFixed(3)} < ${MIN_SSIM}`);

      const md = join(DOCS, `${shot.id}.md`);
      if (!existsSync(md)) {
        writeFileSync(
          md,
          `# Fidelity: ${shot.id}\n\nReference: \`${shot.reference}\` · gate ${shot.gate}/10\n\n![reference vs game](./${shot.id}.compare.webp)\n\n` +
            '| run | palette | composition | rubric | scores | top fixes |\n|---|---|---|---|---|---|\n',
        );
      }
      appendFileSync(md, line + '\n');
      console.log(`${shot.id}: ${verdict}`);
    }
  } finally {
    await browser.close();
    proc?.kill();
  }
  if (failures.length) {
    console.error(`Fidelity below threshold:\n  ${failures.join('\n  ')}`);
    process.exit(1);
  }
}

main();
