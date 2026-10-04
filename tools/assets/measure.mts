// Print each grid cell's keyed content size, to calibrate `fit.height` and check pose widths before a build.
//   npx tsx tools/assets/measure.mts <candidate.png> <cols>x<rows> [frameW frameH fitHeight]
// With a frame (world units) and fit height (2x px) it also prints the common scale the build would use and each
// pose's size at that scale, so e.g. a Yaniv idle cell can be matched to yaniv.small (107 px).
import sharp from 'sharp';
import { commonScale, sliceCells } from './sheet.ts';

const [file, gridArg, fw, fh, fit] = process.argv.slice(2);
if (!file || !gridArg) {
  console.log('usage: measure.mts <png> <cols>x<rows> [frameW frameH fitHeight]');
  process.exit(1);
}
const [cols, rows] = gridArg.split('x').map(Number);
const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
// Same key as process.ts (#ff00ff, inner radius 70): anything near magenta is background.
for (let i = 0; i < data.length; i += 4) if (Math.hypot(data[i] - 255, data[i + 1], data[i + 2] - 255) < 70) data[i + 3] = 0;
const cells = Array.from({ length: cols * rows }, (_, i) => i);
const pieces = cells.flatMap((c) => {
  try {
    return [{ cell: c, ...sliceCells(new Uint8Array(data), info.width, info.height, { cols, rows }, [c])[0] }];
  } catch {
    return [];
  }
});
const scale = fw ? commonScale(pieces, { w: Number(fw) * 2, h: Number(fh) * 2 }, Number(fit ?? Number(fh) * 2)) : 1;
for (const p of pieces) {
  const at = fw ? `  → ${Math.round(p.w * scale)}x${Math.round(p.h * scale)} at scale ${scale.toFixed(3)}` : '';
  console.log(`cell ${p.cell}: ${p.w}x${p.h} (w/h ${(p.w / p.h).toFixed(2)})${at}`);
}
