import { describe, expect, it } from 'vitest';
import { DECOR, DECOR_CLEARANCE, DECOR_SPACING, critterScatters, placeDecor } from '../../src/game/systems/decor.ts';
import { SHEETS } from '../../src/game/assets.ts';

const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

describe('background decor placement', () => {
  const spans: [number, number][] = [
    [0, 1200],
    [1300, 3000],
  ];
  const avoid = [400, 900, 2000, 2500];
  const spots = placeDecor(spans, avoid, DECOR.w7, seeded(7));

  it('is sparse: at most one prop per spacing', () => {
    expect(spots.length).toBeGreaterThan(4);
    for (let i = 1; i < spots.length; i++) expect(spots[i].x - spots[i - 1].x).toBeGreaterThanOrEqual(DECOR_SPACING - 1);
  });
  it('keeps clear of pit edges and of everything that matters to play', () => {
    for (const s of spots) {
      expect(spans.some(([a, b]) => s.x >= a + DECOR_CLEARANCE - 1 && s.x <= b - DECOR_CLEARANCE + 1)).toBe(true);
      for (const a of avoid) expect(Math.abs(a - s.x)).toBeGreaterThanOrEqual(DECOR_CLEARANCE - 1);
    }
  });
  it('is deterministic for a seed', () => {
    expect(placeDecor(spans, avoid, DECOR.w7, seeded(7))).toEqual(spots);
  });
  it('only uses frames the decor sheets have', () => {
    for (const world of ['w3', 'w7'] as const) {
      for (const k of DECOR[world]) expect(SHEETS[`${world}.decor`].frames).toContain(k.frame);
    }
  });
  it('critters scatter only when Yaniv is close', () => {
    expect(critterScatters(100, 60)).toBe(true);
    expect(critterScatters(100, 300)).toBe(false);
  });
});
