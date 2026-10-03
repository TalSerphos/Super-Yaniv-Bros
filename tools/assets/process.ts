/**
 * Promote generated candidates to masters and build web-ready assets.
 *
 *   npm run assets:process -- select --id title.bg --from art/raw/title.bg/low-abc/1.png
 *   npm run assets:process -- build [--ids title.*]
 *
 * select: copies a candidate to art/masters/<id>.webp (q95, committed to git).
 * build:  renders each master per the manifest `out` spec into src/assets/<id>.webp,
 *         where Vite content-hashes it at build time.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { MASTERS_DIR, ROOT, loadManifest, parseArgs, selectEntries, type AssetEntry } from './lib.ts';

const OUT_DIR = join(ROOT, 'src/assets');
const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

async function select(id: string, from: string) {
  if (!loadManifest().some((e) => e.id === id)) throw new Error(`Unknown asset id ${id}`);
  mkdirSync(MASTERS_DIR, { recursive: true });
  const dest = join(MASTERS_DIR, `${id}.webp`);
  await sharp(join(ROOT, from)).webp({ quality: 95, alphaQuality: 100, effort: 6 }).toFile(dest);
  console.log(`master ${id} ← ${from}`);
}

async function build(entry: AssetEntry) {
  const master = join(MASTERS_DIR, `${entry.id}.webp`);
  if (!existsSync(master)) {
    console.warn(`- ${entry.id}: no master yet, skipped`);
    return;
  }
  const out = entry.out ?? {};
  let img = entry.chroma ? await chromaKey(master, entry.chroma) : sharp(master);
  if (out.trim) img = sharp(await img.trim().toBuffer());
  if (out.width || out.height) {
    img = img.resize({
      width: out.width,
      height: out.height,
      fit: out.fit ?? 'inside',
      position: out.position ?? 'centre',
      kernel: 'lanczos3',
    });
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const dest = join(OUT_DIR, `${entry.id}.webp`);
  const info = await img.webp({ quality: out.quality ?? 85, alphaQuality: 90, effort: 6, smartSubsample: true }).toFile(dest);
  console.log(`✓ ${entry.id}: ${info.width}×${info.height}, ${(info.size / 1024).toFixed(0)} KB → src/assets/${entry.id}.webp`);
}

/**
 * Key a flat background color out to alpha. Pixels near the key become transparent; the fringe gets
 * partial alpha and is un-mixed from the key color so edges don't keep a magenta halo.
 */
export async function chromaKey(file: string, hex: string, inner = 70, outer = 150): Promise<Sharp> {
  const key = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.hypot(data[i] - key[0], data[i + 1] - key[1], data[i + 2] - key[2]);
    if (d >= outer) continue;
    const a = Math.max(0, (d - inner) / (outer - inner));
    if (a === 0) {
      data[i + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, (data[i + c] - (1 - a) * key[c]) / a));
    data[i + 3] = Math.round(a * data[i + 3]);
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png();
}

async function main() {
  if (cmd === 'select') {
    if (!args.id || !args.from) throw new Error('select needs --id and --from');
    await select(args.id, args.from);
  } else if (cmd === 'build') {
    for (const e of selectEntries(loadManifest(), args.ids)) await build(e);
  } else {
    console.log('usage: process.ts select --id <id> --from <png> | build [--ids a,b]');
    process.exit(1);
  }
}

main();
