/**
 * Pure helpers for sprite-sheet slicing, frame layout and seamless textures. No I/O, so they are unit tested
 * (tests/unit/assets-process.test.ts); process.ts does the image reading and writing around them.
 * All images here are raw, row-major, interleaved buffers (`channels` bytes per pixel).
 */

export interface Size {
  w: number;
  h: number;
}
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Component {
  label: number;
  area: number;
  box: Box;
  /** Centroid (mean pixel position). */
  cx: number;
  cy: number;
}

export function median(xs: number[]): number {
  if (!xs.length) throw new Error('median of empty list');
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Label 8-connected regions of `mask` (non-zero = solid). Returns the label image (0 = background) and the
 * components with at least `minArea` pixels; smaller specks keep label 0.
 */
export function labelComponents(mask: Uint8Array, w: number, h: number, minArea = 1): { labels: Int32Array; components: Component[] } {
  const labels = new Int32Array(w * h);
  const components: Component[] = [];
  const stack: number[] = [];
  let next = 1;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start]) continue;
    const label = next++;
    const members: number[] = [];
    labels[start] = label;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      members.push(p);
      const px = p % w;
      const py = (p - px) / w;
      for (let dy = -1; dy <= 1; dy++) {
        const y = py + dy;
        if (y < 0 || y >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const x = px + dx;
          if (x < 0 || x >= w) continue;
          const q = y * w + x;
          if (mask[q] && !labels[q]) {
            labels[q] = label;
            stack.push(q);
          }
        }
      }
    }
    if (members.length < minArea) {
      for (const p of members) labels[p] = 0;
      continue;
    }
    let x0 = w, y0 = h, x1 = -1, y1 = -1, sx = 0, sy = 0;
    for (const p of members) {
      const x = p % w;
      const y = (p - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      sx += x;
      sy += y;
    }
    components.push({ label, area: members.length, box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }, cx: sx / members.length, cy: sy / members.length });
  }
  return { labels, components };
}

/** Reading-order index of the grid cell containing point (x, y). */
export function cellIndex(x: number, y: number, grid: { cols: number; rows: number }, w: number, h: number): number {
  const c = Math.min(grid.cols - 1, Math.max(0, Math.floor((x / w) * grid.cols)));
  const r = Math.min(grid.rows - 1, Math.max(0, Math.floor((y / h) * grid.rows)));
  return r * grid.cols + c;
}

/** One cut-out sprite: RGBA pixels trimmed to its content, plus its alpha-weighted horizontal centre. */
export interface Piece {
  data: Uint8Array;
  w: number;
  h: number;
  massX: number;
}

/**
 * Cut the poses out of a keyed RGBA sheet laid out on a `grid`. Every solid region (8-connected, alpha ≥
 * `alphaMin`, at least `minArea` pixels) belongs to the cell its centroid falls in, so a pose that pokes over a
 * cell line still comes out whole and its neighbours' stray pixels are left out. Returns one trimmed piece per
 * requested cell, in the order given.
 */
export function sliceCells(
  rgba: Uint8Array,
  w: number,
  h: number,
  grid: { cols: number; rows: number },
  cells: number[],
  opts: { alphaMin?: number; minArea?: number } = {},
): Piece[] {
  const alphaMin = opts.alphaMin ?? 32;
  const mask = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) mask[p] = rgba[p * 4 + 3] >= alphaMin ? 1 : 0;
  const { labels, components } = labelComponents(mask, w, h, opts.minArea ?? Math.round(w * h * 1e-4));
  const byCell = new Map<number, Component[]>();
  for (const c of components) {
    const i = cellIndex(c.cx, c.cy, grid, w, h);
    byCell.set(i, [...(byCell.get(i) ?? []), c]);
  }
  return cells.map((cell) => {
    const comps = byCell.get(cell);
    if (!comps?.length) throw new Error(`grid cell ${cell} is empty`);
    const keep = new Set(comps.map((c) => c.label));
    const box = unionBox(comps.map((c) => c.box));
    const data = new Uint8Array(box.w * box.h * 4);
    let mass = 0;
    let massX = 0;
    for (let y = 0; y < box.h; y++) {
      for (let x = 0; x < box.w; x++) {
        const p = (box.y + y) * w + box.x + x;
        if (!keep.has(labels[p])) continue;
        const o = (y * box.w + x) * 4;
        for (let c = 0; c < 4; c++) data[o + c] = rgba[p * 4 + c];
        mass += rgba[p * 4 + 3];
        massX += rgba[p * 4 + 3] * (x + 0.5);
      }
    }
    return { data, w: box.w, h: box.h, massX: massX / mass };
  });
}

/** Smallest box containing all boxes. */
export function unionBox(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * One scale factor for every frame of a sheet, so animation frames don't change size: the median content
 * height maps to `fitHeight`, capped so the widest and tallest frames still fit inside the frame box.
 */
export function commonScale(sizes: Size[], frame: Size, fitHeight = frame.h): number {
  const want = fitHeight / median(sizes.map((s) => s.h));
  const maxW = Math.max(...sizes.map((s) => s.w));
  const maxH = Math.max(...sizes.map((s) => s.h));
  return Math.min(want, frame.w / maxW, frame.h / maxH);
}

/** Scale that fits one piece of content inside a box (contain), optionally capped by a target height. */
export function containScale(size: Size, frame: Size, fitHeight = frame.h): number {
  return Math.min(fitHeight / size.h, frame.w / size.w, frame.h / size.h);
}

/**
 * Top-left position of scaled content inside its frame: bottom-aligned (feet on the last row) and centred
 * horizontally on `anchorX` (content-relative x, e.g. its centre of mass), clamped so it stays inside.
 */
export function placeInFrame(content: Size, frame: Size, anchorX = content.w / 2): { x: number; y: number } {
  let x = Math.round(frame.w / 2 - anchorX);
  x = content.w >= frame.w ? Math.round((frame.w - content.w) / 2) : Math.min(frame.w - content.w, Math.max(0, x));
  return { x, y: frame.h - content.h };
}

/**
 * Pick the horizontal crop [x, x + width) of a `w`-wide source whose next column (x + width) looks most like
 * its first column x, so the crop wraps naturally. `gray` is a single-channel w×h image; only rows
 * [y0, y1) are compared. `extra` source columns past the crop must also exist (for the seam crossfade).
 */
export function findRepeatCrop(
  gray: Uint8Array,
  w: number,
  h: number,
  opts: { minWidth: number; maxWidth: number; extra: (width: number) => number; y0?: number; y1?: number; band?: number },
): { x: number; width: number; score: number } {
  const y0 = opts.y0 ?? 0;
  const y1 = opts.y1 ?? h;
  const band = opts.band ?? 3;
  let best = { x: 0, width: opts.maxWidth, score: Infinity };
  for (let width = opts.maxWidth; width >= opts.minWidth; width--) {
    const need = width + Math.max(band, opts.extra(width));
    for (let x = 0; x + need <= w; x++) {
      let diff = 0;
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let b = 0; b < band; b++) diff += Math.abs(gray[row + x + b] - gray[row + x + width + b]);
      }
      const score = diff / ((y1 - y0) * band);
      // Prefer wider crops (less horizontal squash) when scores tie.
      if (score < best.score - 1e-9) best = { x, width, score };
    }
  }
  return best;
}

/**
 * Make a texture tile horizontally. `src` is (outW + strip) wide: its last `strip` columns continue past the
 * right edge. Those columns are crossfaded into the first `strip` columns, so column outW - 1 flows into
 * column 0 when tiled.
 */
export function crossfadeSeam(src: Uint8Array, outW: number, h: number, channels: number, strip: number): Uint8Array {
  const srcW = outW + strip;
  const out = new Uint8Array(outW * h * channels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < outW; x++) {
      const o = (y * outW + x) * channels;
      const a = (y * srcW + x) * channels;
      if (x >= strip) {
        for (let c = 0; c < channels; c++) out[o + c] = src[a + c];
        continue;
      }
      const t = (x + 0.5) / strip; // 0 → wrapped column, 1 → original column
      const b = (y * srcW + outW + x) * channels;
      for (let c = 0; c < channels; c++) out[o + c] = Math.round(src[b + c] * (1 - t) + src[a + c] * t);
    }
  }
  return out;
}

/** Sum of absolute channel differences between the last and first column: a seam metric for tests. */
export function seamError(img: Uint8Array, w: number, h: number, channels: number): number {
  let d = 0;
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < channels; c++) d += Math.abs(img[(y * w + w - 1) * channels + c] - img[y * w * channels + c]);
  }
  return d / (h * channels);
}
