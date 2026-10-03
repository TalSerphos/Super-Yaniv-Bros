// Fails the build when dist/ exceeds the load-time budgets in docs/PLAN.md §3.
// Text files are measured gzipped (what GitHub Pages serves); binaries as-is.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = new URL('../dist/', import.meta.url).pathname;
const KB = 1024;
const BUDGETS = {
  initialTotal: 350 * KB, // everything the title screen needs (excludes lazy chunks/packs)
  jsEntry: 15 * KB, // title JS, gzipped
  image: 180 * KB, // any single image
};
const TEXT = /\.(html|js|css|json|svg|txt|webmanifest)$/;
const LAZY = /(^|\/)(game|packs?)\//; // Phaser chunk + world packs load after the title

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(DIST).map((p) => {
  const rel = relative(DIST, p);
  const raw = readFileSync(p);
  const size = TEXT.test(rel) ? gzipSync(raw, { level: 9 }).length : raw.length;
  return { rel, size };
});

const errors = [];
const fmt = (n) => `${(n / KB).toFixed(1)} KB`;
let initial = 0;
for (const f of files) {
  if (!LAZY.test(f.rel) && !/coming-soon/.test(f.rel) && !/^(og\.jpg|apple-touch-icon\.png|CNAME)$/.test(f.rel) && !/\.woff$/.test(f.rel)) initial += f.size;
  if (/\.(webp|png|jpe?g|avif)$/.test(f.rel) && f.size > BUDGETS.image) errors.push(`${f.rel} is ${fmt(f.size)} (image budget ${fmt(BUDGETS.image)})`);
  if (/^assets\/index-.*\.js$/.test(f.rel) && f.size > BUDGETS.jsEntry) errors.push(`${f.rel} is ${fmt(f.size)} gz (JS entry budget ${fmt(BUDGETS.jsEntry)})`);
}
if (initial > BUDGETS.initialTotal) errors.push(`initial load is ${fmt(initial)} (budget ${fmt(BUDGETS.initialTotal)})`);

for (const f of files.sort((a, b) => b.size - a.size)) console.log(`${fmt(f.size).padStart(10)}  ${f.rel}`);
console.log(`${fmt(initial).padStart(10)}  = initial load (budget ${fmt(BUDGETS.initialTotal)})`);
if (errors.length) {
  console.error('\nBudget exceeded:\n  ' + errors.join('\n  '));
  process.exit(1);
}
