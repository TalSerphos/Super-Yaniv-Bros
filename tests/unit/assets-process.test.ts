import { describe, expect, it } from 'vitest';
import {
  cellIndex,
  commonScale,
  containScale,
  crossfadeSeam,
  findRepeatCrop,
  labelComponents,
  median,
  placeInFrame,
  seamError,
  sliceCells,
} from '../../tools/assets/sheet.ts';

describe('frame scaling', () => {
  it('median handles odd and even lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('commonScale maps the median height to the fit height', () => {
    const sizes = [
      { w: 50, h: 200 },
      { w: 60, h: 210 },
      { w: 55, h: 190 },
    ];
    expect(commonScale(sizes, { w: 96, h: 128 }, 100)).toBeCloseTo(0.5);
  });

  it('commonScale is capped so the widest and tallest frames still fit', () => {
    const sizes = [
      { w: 100, h: 200 },
      { w: 400, h: 200 },
      { w: 100, h: 200 },
    ];
    expect(commonScale(sizes, { w: 96, h: 128 }, 118)).toBeCloseTo(96 / 400);
    expect(commonScale([{ w: 10, h: 100 }, { w: 10, h: 100 }, { w: 10, h: 300 }], { w: 96, h: 128 }, 118)).toBeCloseTo(128 / 300);
  });

  it('containScale fits one piece inside the frame', () => {
    expect(containScale({ w: 200, h: 100 }, { w: 32, h: 32 })).toBeCloseTo(0.16);
    expect(containScale({ w: 100, h: 200 }, { w: 32, h: 32 }, 30)).toBeCloseTo(0.15);
  });
});

describe('placeInFrame', () => {
  it('puts the feet on the bottom row and centres on the anchor', () => {
    expect(placeInFrame({ w: 40, h: 100 }, { w: 96, h: 128 })).toEqual({ x: 28, y: 28 });
    expect(placeInFrame({ w: 40, h: 100 }, { w: 96, h: 128 }, 30)).toEqual({ x: 18, y: 28 });
  });

  it('clamps so the content stays inside the frame', () => {
    expect(placeInFrame({ w: 80, h: 128 }, { w: 96, h: 128 }, 0)).toEqual({ x: 16, y: 0 });
    expect(placeInFrame({ w: 80, h: 128 }, { w: 96, h: 128 }, 80)).toEqual({ x: 0, y: 0 });
  });
});

describe('sheet slicing', () => {
  it('cellIndex uses reading order', () => {
    const grid = { cols: 4, rows: 3 };
    expect(cellIndex(10, 10, grid, 400, 300)).toBe(0);
    expect(cellIndex(390, 10, grid, 400, 300)).toBe(3);
    expect(cellIndex(110, 150, grid, 400, 300)).toBe(5);
    expect(cellIndex(400, 300, grid, 400, 300)).toBe(11);
  });

  it('labelComponents finds 8-connected regions and drops specks', () => {
    // 7x3: a diagonal pair (connected), a lone pixel (speck), and a 2x2 block.
    // prettier-ignore
    const mask = Uint8Array.from([
      1, 0, 0, 0, 0, 1, 1,
      0, 1, 0, 0, 0, 1, 1,
      0, 0, 0, 1, 0, 0, 0,
    ]);
    const { components, labels } = labelComponents(mask, 7, 3, 2);
    expect(components.map((c) => c.area).sort()).toEqual([2, 4]);
    expect(labels[2 * 7 + 3]).toBe(0);
    const block = components.find((c) => c.area === 4)!;
    expect(block.box).toEqual({ x: 5, y: 0, w: 2, h: 2 });
  });

  it('cuts each pose whole, even when it pokes over a cell line', () => {
    // 8x4 sheet, 2x1 grid. Pose A spans x 1..4 (crosses the x=4 line, centroid in cell 0); pose B is at x 6..7.
    const w = 8;
    const h = 4;
    const rgba = new Uint8Array(w * h * 4);
    const paint = (x: number, y: number, v: number) => rgba.set([v, v, v, 255], (y * w + x) * 4);
    for (let y = 0; y < 4; y++) for (let x = 1; x <= 4; x++) paint(x, y, 10);
    paint(4, 0, 10);
    for (let y = 2; y < 4; y++) for (let x = 6; x <= 7; x++) paint(x, y, 200);
    const [a, b] = sliceCells(rgba, w, h, { cols: 2, rows: 1 }, [0, 1], { minArea: 1 });
    expect([a.w, a.h]).toEqual([4, 4]);
    expect([b.w, b.h]).toEqual([2, 2]);
    expect(b.data[0]).toBe(200);
    expect(a.massX).toBeCloseTo(2);
    expect(() => sliceCells(rgba, w, h, { cols: 4, rows: 1 }, [2])).toThrow(/empty/);
  });
});

describe('seamless textures', () => {
  it('crossfadeSeam makes the last column flow into the first', () => {
    // A horizontal gradient is the worst case: 0 at the left edge, 255 at the right.
    const outW = 32;
    const strip = 8;
    const h = 2;
    const src = new Uint8Array((outW + strip) * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < outW + strip; x++) src[y * (outW + strip) + x] = Math.round((x / (outW + strip - 1)) * 255);
    const naive = new Uint8Array(outW * h);
    for (let y = 0; y < h; y++) naive.set(src.subarray(y * (outW + strip), y * (outW + strip) + outW), y * outW);
    const plainErr = seamError(naive, outW, h, 1);
    const out = crossfadeSeam(src, outW, h, 1, strip);
    expect(out.length).toBe(outW * h);
    expect(seamError(out, outW, h, 1)).toBeLessThan(10);
    expect(plainErr).toBeGreaterThan(100);
    // Untouched past the strip.
    expect(out[strip + 3]).toBe(src[strip + 3]);
  });

  it('findRepeatCrop finds the period of a repeating pattern', () => {
    const w = 120;
    const h = 4;
    const gray = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = (x % 25) * 10;
    const best = findRepeatCrop(gray, w, h, { minWidth: 60, maxWidth: 100, extra: () => 5 });
    expect(best.width % 25).toBe(0);
    expect(best.width).toBe(100);
    expect(best.score).toBe(0);
  });
});
