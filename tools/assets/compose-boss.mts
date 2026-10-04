// Compose the boss.jacuzzam master from two pose sheets.
//   npx tsx tools/assets/compose-boss.mts measure <a.png> <b.png>
//   npx tsx tools/assets/compose-boss.mts build <a.png> <b.png> <scaleB> <out.png>
// Poses are cut with the pipeline's sliceCells, scaled (sheet a at 1, sheet b by scaleB) and pasted onto a flat
// magenta 1536x2048 canvas (4x4 grid of 384x512 cells), centred on their mass, feet on a common baseline.
import sharp, { type OverlayOptions } from 'sharp';
import { sliceCells, type Piece } from './sheet.ts';

async function keyed(file: string) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const key = [255, 0, 255], inner = 70, outer = 150;
  for (let i = 0; i < data.length; i += 4) {
    const d = Math.hypot(data[i] - key[0], data[i + 1] - key[1], data[i + 2] - key[2]);
    if (d >= outer) continue;
    const a = Math.max(0, (d - inner) / (outer - inner));
    if (a === 0) { data[i + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) data[i + c] = Math.max(0, Math.min(255, (data[i + c] - (1 - a) * key[c]) / a));
    data[i + 3] = Math.round(a * data[i + 3]);
  }
  return { data: new Uint8Array(data), w: info.width, h: info.height };
}

async function pieces(file: string, cells: number[]): Promise<Piece[]> {
  const k = await keyed(file);
  return sliceCells(k.data, k.w, k.h, { cols: 4, rows: 2 }, cells);
}

const [cmd, a, b, sB, out] = process.argv.slice(2);
const pa = await pieces(a, [0, 1, 2, 3, 4, 5, 6]);
const pb = await pieces(b, [0, 1, 2, 3, 4, 5]);
if (cmd === 'measure') {
  pa.forEach((p, i) => console.log(`a${i}: ${p.w}x${p.h} massX ${p.massX.toFixed(0)}`));
  pb.forEach((p, i) => console.log(`b${i}: ${p.w}x${p.h} massX ${p.massX.toFixed(0)}`));
} else {
  const scaleB = Number(sB);
  const CW = 384, CH = 512, BASE = 490;
  const comps: OverlayOptions[] = [];
  const place = async (p: Piece, s: number, cell: number) => {
    const w = Math.round(p.w * s), h = Math.round(p.h * s);
    const img = await sharp(Buffer.from(p.data), { raw: { width: p.w, height: p.h, channels: 4 } }).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer();
    const col = cell % 4, row = Math.floor(cell / 4);
    let left = Math.round(col * CW + CW / 2 - p.massX * s);
    left = Math.max(col * CW + 4, Math.min(left, (col + 1) * CW - w - 4));
    if (w > CW - 8) console.warn(`cell ${cell}: piece ${w}px wider than cell`);
    comps.push({ input: img, left, top: row * CH + BASE - h });
  };
  for (let i = 0; i < 7; i++) await place(pa[i], i === 1 ? 372 / pa[1].h : 1, i); // idle1: a 2.6% breathing dip, not 7%
  for (let i = 0; i < 6; i++) await place(pb[i], scaleB, 8 + i);
  await sharp({ create: { width: 1536, height: 2048, channels: 4, background: { r: 255, g: 0, b: 255, alpha: 1 } } })
    .composite(comps).flatten({ background: '#ff00ff' }).png().toFile(out);
  console.log('wrote', out);
}
