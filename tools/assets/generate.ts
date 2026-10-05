/**
 * Generate candidate images for manifest entries via the OpenAI Images API.
 *
 *   npm run assets:generate -- --ids title.bg,title.logo --quality low
 *
 * Flags: --ids (comma list, `prefix*` or `all`), --quality low|medium|high, --alpha-model,
 *        --candidates N (override), --model, --max-spend USD, --force.
 * Output: art/raw/<id>/<hash>/<n>.png + meta.json. Unchanged entries are skipped (cache by hash).
 * Needs OPENAI_API_KEY. Behind a proxy, run with NODE_USE_ENV_PROXY=1 (the npm script does).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { RAW_DIR, ROOT, entryHash, loadManifest, parseArgs, selectEntries, stylePrefix, type AssetEntry } from './lib.ts';

const args = parseArgs(process.argv.slice(2));
const baseModel = args.model ?? process.env.IMAGE_MODEL ?? 'gpt-image-2';
// gpt-image-2 rejects background=transparent; sprites/UI with alpha use this model instead.
const alphaModel = args['alpha-model'] ?? process.env.IMAGE_ALPHA_MODEL ?? 'gpt-image-1.5';
const modelFor = (e: AssetEntry) => (e.transparent ? alphaModel : baseModel);
const quality = args.quality ?? 'low';
const maxSpend = Number(args['max-spend'] ?? 10);
const force = args.force === 'true';
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

// Conservative per-image estimates (USD) for the spend cap; actual token usage is logged too.
const EST_COST: Record<string, number> = { low: 0.02, medium: 0.07, high: 0.25 };
const COST_LOG = join(ROOT, 'art/cost-log.csv');
let spent = 0;

async function callApi(entry: AssetEntry, prompt: string, n: number): Promise<{ images: Buffer[]; usage: unknown }> {
  const common = {
    model: modelFor(entry),
    prompt,
    n,
    size: entry.size ?? '1024x1024',
    quality,
    ...(entry.transparent ? { background: 'transparent', output_format: 'png' } : {}),
  };
  let res: Response;
  if (entry.refs?.length) {
    const form = new FormData();
    for (const [k, v] of Object.entries(common)) form.append(k, String(v));
    for (const ref of entry.refs) {
      const buf = readFileSync(join(ROOT, ref));
      const type = ref.endsWith('.png') ? 'image/png' : ref.endsWith('.jpg') ? 'image/jpeg' : 'image/webp';
      form.append('image[]', new Blob([buf], { type }), basename(ref));
    }
    if (entry.mask) form.append('mask', new Blob([readFileSync(join(ROOT, entry.mask))], { type: 'image/png' }), basename(entry.mask));
    res = await withRetry(() =>
      fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form }),
    );
  } else {
    res = await withRetry(() =>
      fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(common),
      }),
    );
  }
  const body = (await res.json()) as { data?: { b64_json: string }[]; usage?: unknown; error?: { message: string } };
  if (!res.ok || !body.data) throw new Error(`${entry.id}: ${res.status} ${body.error?.message ?? JSON.stringify(body)}`);
  return { images: body.data.map((d) => Buffer.from(d.b64_json, 'base64')), usage: body.usage };
}

async function withRetry(fn: () => Promise<Response>, tries = 4): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const res = await fn();
      if ((res.status === 429 || res.status >= 500) && i < tries - 1) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i >= tries - 1) throw err;
      const wait = 2000 * 2 ** i;
      console.warn(`  retry in ${wait / 1000}s (${(err as Error).message})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function generate(entry: AssetEntry, prefix: string): Promise<void> {
  const model = modelFor(entry);
  const hash = entryHash(entry, model, quality, prefix);
  const dir = join(RAW_DIR, entry.id, `${quality}-${hash}`);
  if (existsSync(join(dir, 'meta.json')) && !force) {
    console.log(`= ${entry.id} cached (${dir})`);
    return;
  }
  const n = Number(args.candidates ?? entry.candidates ?? 1);
  const est = n * EST_COST[quality];
  if (spent + est > maxSpend) {
    console.warn(`! ${entry.id} skipped: would exceed --max-spend ${maxSpend}`);
    return;
  }
  spent += est;
  console.log(`> ${entry.id} (${n}× ${quality}, ${entry.refs?.length ? 'edit' : 'generate'})`);
  const t0 = Date.now();
  const { images, usage } = await callApi(entry, `${prefix}\n\n${entry.prompt.trim()}`, n);
  mkdirSync(dir, { recursive: true });
  images.forEach((img, i) => writeFileSync(join(dir, `${i}.png`), img));
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ id: entry.id, model, quality, hash, entry, usage, at: new Date().toISOString() }, null, 2));
  if (!existsSync(COST_LOG)) writeFileSync(COST_LOG, 'timestamp,id,model,quality,n,est_usd,usage\n');
  appendFileSync(COST_LOG, `${new Date().toISOString()},${entry.id},${model},${quality},${n},${est.toFixed(3)},"${JSON.stringify(usage ?? {}).replace(/"/g, "'")}"\n`);
  console.log(`  ✓ ${images.length} image(s) in ${((Date.now() - t0) / 1000).toFixed(0)}s → ${dir}`);
}

async function main() {
  const entries = selectEntries(loadManifest(), args.ids).filter((e) => !e.from); // `from` entries reuse a master
  const prefix = stylePrefix();
  const concurrency = Number(args.concurrency ?? 3);
  const queue = [...entries];
  const failures: string[] = [];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let e = queue.shift(); e; e = queue.shift()) {
        try {
          await generate(e, prefix);
        } catch (err) {
          failures.push(e.id);
          console.error(`✗ ${(err as Error).message}`);
        }
      }
    }),
  );
  console.log(`Estimated spend this run: $${spent.toFixed(2)}`);
  if (failures.length) {
    console.error(`Failed: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main();
