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
