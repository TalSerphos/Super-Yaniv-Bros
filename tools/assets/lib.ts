import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import YAML from 'yaml';

export const ROOT = new URL('../../', import.meta.url).pathname;
export const RAW_DIR = join(ROOT, 'art/raw');
export const MASTERS_DIR = join(ROOT, 'art/masters');

export interface AssetOut {
  width?: number;
  height?: number;
  fit?: 'cover' | 'contain' | 'inside';
  position?: string;
  trim?: boolean;
  quality?: number;
  /** Subfolder of src/assets (e.g. `w5` → src/assets/w5/<id>.webp). */
  dir?: string;
  /** Quantize to this many colors (palette, no dither) and write lossless WebP. */
  colors?: number;
  /** Framed sprites: alpha at or above this becomes opaque, below it transparent (0 keeps soft alpha). Default 128. */
  alphaThreshold?: number;
  /** Framed sprites: neutralize a magenta fringe left on dark outlines (lowers red and blue to green's level). */
  despill?: boolean;
  /** Seamless images: fraction of the master's width one tile spans (default: as much as fits). */
  span?: number;
}

/** How cut-out poses are sized into their frames. */
export interface AssetFit {
  /** common: one scale for the whole sheet (animation); each: every frame on its own; stretch: fill the frame. */
  mode?: 'common' | 'each' | 'stretch';
  /** Target content height in output pixels (2x). Defaults to the frame height. */
  height?: number;
}

export interface AssetEntry {
  id: string;
  kind: string;
  prompt: string;
  refs?: string[];
  size?: '1024x1024' | '1536x1024' | '1024x1536';
  /** Native alpha (uses the alpha model). Prefer `chroma` for pixel art: better models, keyed in process.ts. */
  transparent?: boolean;
  /** Background color the image is painted on; process.ts keys it out to alpha. */
  chroma?: string;
  candidates?: number;
  out?: AssetOut;
  /** Pose grid painted in the master (spritesheets). Default 1×1. */
  grid?: { cols: number; rows: number };
  /** Grid cells (reading order) to use, in output frame order. Default [0]. */
  cells?: number[];
  /** Frame size in world units; files are built at 2x. Frames go left to right in one strip. */
  frame?: { w: number; h: number };
  fit?: AssetFit;
  /** Horizontal placement in the frame: centre of mass (default), bounding-box centre, or shared left edge. */
  anchor?: 'mass' | 'bbox' | 'left';
  /**
   * Vertical placement: feet on the bottom row (default, characters and props), centred (items, icons) or top
   * row (things hanging from a ceiling, e.g. the Bin Biter).
   */
  valign?: 'bottom' | 'middle' | 'top';
  /** Make the built image tile seamlessly along x. */
  seamless?: 'x';
  /**
   * Inpainting: a PNG the size of the first ref whose transparent pixels mark the only area the model may
   * repaint (OpenAI images/edits `mask`). The first ref must then be a PNG of the same size.
   */
  mask?: string;
}

export function loadManifest(): AssetEntry[] {
  const dir = join(ROOT, 'art/manifest');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .flatMap((f) => YAML.parse(readFileSync(join(dir, f), 'utf8')) as AssetEntry[]);
}

export function stylePrefix(): string {
  const md = readFileSync(join(ROOT, 'art/prompts/style.md'), 'utf8');
  const m = md.match(/<!-- PREFIX -->([\s\S]*?)<!-- \/PREFIX -->/);
  if (!m) throw new Error('style.md is missing the PREFIX block');
  return m[1].trim().replace(/\s+/g, ' ');
}

/** Stable hash of everything that affects the generated image. */
export function entryHash(entry: AssetEntry, model: string, quality: string, prefix: string): string {
  const h = createHash('sha256');
  h.update(JSON.stringify({ model, quality, prefix, prompt: entry.prompt, size: entry.size, transparent: entry.transparent, chroma: entry.chroma }));
  for (const ref of entry.refs ?? []) h.update(readFileSync(join(ROOT, ref)));
  if (entry.mask) h.update(readFileSync(join(ROOT, entry.mask)));
  return h.digest('hex').slice(0, 12);
}

export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=', 2);
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = 'true';
  }
  return out;
}

export function selectEntries(all: AssetEntry[], ids?: string): AssetEntry[] {
  if (!ids || ids === 'all') return all;
  const want = ids.split(',').map((s) => s.trim());
  const picked = all.filter((e) => want.some((w) => e.id === w || (w.endsWith('*') && e.id.startsWith(w.slice(0, -1)))));
  if (!picked.length) throw new Error(`No manifest entries match ${ids}`);
  return picked;
}
