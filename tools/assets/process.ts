/**
 * Promote generated candidates to masters and build web-ready assets.
 *
 *   npm run assets:process -- select --id title.bg --from art/raw/title.bg/low-abc/1.png
 *   npm run assets:process -- build [--ids title.*]
 *
 * select: copies a candidate to art/masters/<id>.webp (q95, committed to git).
 * build:  renders each master per the manifest `out` spec into src/assets/[<dir>/]<id>.webp,
 *         where Vite content-hashes it at build time. Entries with a `frame` are built at 2x world units:
 *         spritesheets are cut from their pose grid into one horizontal strip, `seamless: x` images tile.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { MASTERS_DIR, ROOT, loadManifest, parseArgs, selectEntries, type AssetEntry } from './lib.ts';
import { commonScale, containScale, crossfadeSeam, findRepeatCrop, placeInFrame, sliceCells, type Piece } from './sheet.ts';

const OUT_DIR = join(ROOT, 'src/assets');
/** Art is authored at 2x world units; the engine draws it at scale 0.5. */
const PIXEL_SCALE = 2;
const [cmd, ...rest] = process.argv.slice(2);
const args = parseArgs(rest);

interface Raw {
  data: Buffer;
  width: number;
  height: number;
}

async function select(id: string, from: string) {
  if (!loadManifest().some((e) => e.id === id)) throw new Error(`Unknown asset id ${id}`);
  mkdirSync(MASTERS_DIR, { recursive: true });
  const dest = join(MASTERS_DIR, `${id}.webp`);
  await sharp(join(ROOT, from)).webp({ quality: 95, alphaQuality: 100, effort: 6 }).toFile(dest);
  console.log(`master ${id} ← ${from}`);
}

function destFor(entry: AssetEntry): { file: string; rel: string } {
  const rel = join(entry.out?.dir ?? '', `${entry.id}.webp`);
  mkdirSync(join(OUT_DIR, entry.out?.dir ?? ''), { recursive: true });
  return { file: join(OUT_DIR, rel), rel: `src/assets/${rel}` };
}

async function build(entry: AssetEntry) {
  if (entry.kind === 'reference') return; // character bibles etc. are only used as generation refs
  const master = join(MASTERS_DIR, `${entry.id}.webp`);
  if (!existsSync(master)) {
    console.warn(`- ${entry.id}: no master yet, skipped`);
    return;
  }
  if (entry.frame) return entry.seamless === 'x' ? buildSeamless(entry, master) : buildFrames(entry, master);
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
  const dest = destFor(entry);
  const info = await img.webp({ quality: out.quality ?? 85, alphaQuality: 90, effort: 6, smartSubsample: true }).toFile(dest.file);
  console.log(`✓ ${entry.id}: ${info.width}×${info.height}, ${(info.size / 1024).toFixed(0)} KB → ${dest.rel}`);
}

/**
 * Spritesheets and single framed sprites: key the background, cut each listed grid cell, scale (one common
 * factor per sheet by default, so frames don't jitter), paste bottom-centre into its frame, write one strip.
 */
async function buildFrames(entry: AssetEntry, master: string) {
  const frame = { w: entry.frame!.w * PIXEL_SCALE, h: entry.frame!.h * PIXEL_SCALE };
  const src = entry.chroma ? await chromaKeyRaw(master, entry.chroma) : await toRaw(sharp(master).ensureAlpha());
  const pieces = sliceCells(src.data, src.width, src.height, entry.grid ?? { cols: 1, rows: 1 }, entry.cells ?? [0]);
  const mode = entry.fit?.mode ?? (pieces.length > 1 ? 'common' : 'each');
  const fitH = entry.fit?.height ?? frame.h;
  const shared = commonScale(pieces, frame, fitH);

  const scaled: Piece[] = [];
  for (const p of pieces) {
    const s = mode === 'common' ? shared : containScale(p, frame, fitH);
    const w = mode === 'stretch' ? frame.w : Math.max(1, Math.round(p.w * s));
    const h = mode === 'stretch' ? frame.h : Math.max(1, Math.round(p.h * s));
    const r = await toRaw(sharp(p.data, { raw: { width: p.w, height: p.h, channels: 4 } }).resize(w, h, { fit: 'fill', kernel: 'lanczos3' }));
    scaled.push({ data: r.data, w, h, massX: (p.massX * w) / p.w });
  }

  const maxW = Math.max(...scaled.map((p) => p.w));
  const stripW = frame.w * scaled.length;
  const strip = new Uint8Array(stripW * frame.h * 4);
  scaled.forEach((p, i) => {
    const anchor = entry.anchor ?? 'mass';
    const pos =
      anchor === 'left'
        ? { x: Math.max(0, Math.round((frame.w - maxW) / 2)), y: frame.h - p.h }
        : placeInFrame(p, frame, anchor === 'mass' ? p.massX : p.w / 2);
    if (entry.valign === 'middle') pos.y = Math.floor((frame.h - p.h) / 2);
    else if (entry.valign === 'top') pos.y = 0;
    for (let y = 0; y < p.h; y++) {
      const fy = pos.y + y;
      if (fy < 0 || fy >= frame.h) continue;
      for (let x = 0; x < p.w; x++) {
        const fx = pos.x + x;
        if (fx < 0 || fx >= frame.w) continue;
        const o = (fy * stripW + i * frame.w + fx) * 4;
        const q = (y * p.w + x) * 4;
        for (let c = 0; c < 4; c++) strip[o + c] = p.data[q + c];
      }
    }
  });

  const threshold = entry.out?.alphaThreshold ?? 128;
  if (threshold > 0) for (let i = 3; i < strip.length; i += 4) strip[i] = strip[i] >= threshold ? 255 : 0;
  const scaleNote = mode === 'common' ? `, scale ${shared.toFixed(3)}` : '';
  await writeOut(entry, { data: Buffer.from(strip), width: stripW, height: frame.h }, 4, `${scaled.length} frame(s)${scaleNote}`);
}

/**
 * Opaque images that must tile horizontally: crop the stretch of the master that best wraps onto itself
 * (same aspect as the output), resize it a little wider than the output, then crossfade the overhang into the
 * left edge so the last column flows into the first.
 */
async function buildSeamless(entry: AssetEntry, master: string) {
  const W = entry.frame!.w * PIXEL_SCALE;
  const H = entry.frame!.h * PIXEL_SCALE;
  const strip = Math.max(4, Math.round(W / 16));
  const src = await toRaw(sharp(master).removeAlpha());
  const gray = await toRaw(sharp(master).greyscale().removeAlpha());
  const aspect = W / H;
  const maxWidth = Math.floor(Math.min(src.width / (1 + strip / W), src.height * aspect, src.width * (entry.out?.span ?? 1)));
  const cropH = (width: number) => Math.round(width / aspect);
  const position = entry.out?.position ?? 'centre';
  const top = (h: number) => (position === 'top' ? 0 : position === 'bottom' ? src.height - h : Math.round((src.height - h) / 2));
  // Compare columns over the vertical band the largest crop covers.
  const y0 = top(cropH(maxWidth));
  const best = findRepeatCrop(gray.data, gray.width, gray.height, {
    minWidth: Math.round(maxWidth * 0.8),
    maxWidth,
    extra: (width) => Math.ceil((width * strip) / W),
    y0,
    y1: y0 + cropH(maxWidth),
  });
  const h = cropH(best.width);
  const region = { left: best.x, top: top(h), width: Math.round((best.width * (W + strip)) / W), height: h };
  const wide = await toRaw(sharp(master).removeAlpha().extract(region).resize(W + strip, H, { fit: 'fill', kernel: 'lanczos3' }));
  const tiled = crossfadeSeam(wide.data, W, H, 3, strip);
  await writeOut(entry, { data: Buffer.from(tiled), width: W, height: H }, 3, `seamless (crop ${best.width}px at x=${best.x}, wrap diff ${best.score.toFixed(1)})`);
}

/** Lossless (optionally palette-quantized) WebP for sprites and textures; lossy when `out.quality` is set. */
async function writeOut(entry: AssetEntry, raw: Raw, channels: 3 | 4, note: string) {
  const out = entry.out ?? {};
  let img = sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels } });
  if (out.colors) img = sharp(await img.png({ palette: true, colors: out.colors, dither: 0, effort: 10 }).toBuffer());
  const webp = out.quality && !out.colors ? { quality: out.quality, effort: 6, smartSubsample: true } : { lossless: true, effort: 6 };
  const dest = destFor(entry);
  const info = await img.webp(webp).toFile(dest.file);
  console.log(`✓ ${entry.id}: ${info.width}×${info.height}, ${(info.size / 1024).toFixed(1)} KB, ${note} → ${dest.rel}`);
}

async function toRaw(img: Sharp): Promise<Raw> {
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * Key a flat background color out to alpha. Pixels near the key become transparent; the fringe gets
 * partial alpha and is un-mixed from the key color so edges don't keep a magenta halo.
 */
export async function chromaKeyRaw(file: string, hex: string, inner = 70, outer = 150): Promise<Raw> {
  const key = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const { data, width, height } = await toRaw(sharp(file).ensureAlpha());
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
  return { data, width, height };
}

export async function chromaKey(file: string, hex: string, inner = 70, outer = 150): Promise<Sharp> {
  const { data, width, height } = await chromaKeyRaw(file, hex, inner, outer);
  return sharp(data, { raw: { width, height, channels: 4 } }).png();
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
