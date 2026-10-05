import { describe, expect, it } from 'vitest';
import { WORLD3, WORLD5, WORLD7 } from '../../src/game/levels/index.ts';
import { floorTopOf, parseLevel } from '../../src/game/levels/loader.ts';
import { PHYS, TILE } from '../../src/game/config.ts';
import { POLE_BANDS, POLE_H, POLE_REACH, poleBonus, touchesPole } from '../../src/game/systems/goal.ts';

/** Feet height at the top of a full jump from the floor. */
const APEX = (PHYS.jumpVelocity * PHYS.jumpVelocity) / (2 * PHYS.gravity);

describe('goal pole bonus (the flagpole twin)', () => {
  it('pays more the higher the touch, from 100 at the base to 5000 near the top of a jump', () => {
    expect(poleBonus(0)).toBe(100);
    expect(poleBonus(-5)).toBe(100);
    const heights = [0, 12, 30, 50, 72];
    const pays = heights.map(poleBonus);
    expect(pays).toEqual([...pays].sort((a, b) => a - b));
    expect(new Set(pays).size).toBe(POLE_BANDS.length);
    expect(poleBonus(APEX)).toBe(5000);
  });

  it('the top band asks for a near-perfect jump: within the last tenth of the apex', () => {
    expect(POLE_BANDS[0].minHeight).toBeLessThanOrEqual(APEX);
    expect(POLE_BANDS[0].minHeight).toBeGreaterThan(APEX * 0.9);
  });

  it('is touched only by a box overlapping its slim upright', () => {
    const box = (x: number, feet: number) => ({ left: x - 10, right: x + 10, top: feet - 50, bottom: feet });
    expect(touchesPole(box(100, 320), 100, 320)).toBe(true);
    expect(touchesPole(box(100 - 10 - POLE_REACH - 1, 320), 100, 320)).toBe(false); // still short of it
    expect(touchesPole(box(100, 320 - POLE_H - 51), 100, 320)).toBe(false); // flying over the top
  });
});

describe('goal pole placement', () => {
  // The x-3 / x-4 "castles" (the duty-free mascot, the cockpit door) and the Oval Office end differently.
  const withPole = [...WORLD3, ...WORLD5, ...WORLD7].filter((l) => !['3-3', '5-4', '7-4'].includes(l.id));
  it.each(withPole.map((l) => [l.id, l] as const))('%s has a pole on solid floor a few tiles before the exit', (_id, level) => {
    const p = parseLevel(level);
    expect(p.pole).toBeDefined();
    const floorTop = floorTopOf(p);
    expect(p.pole!.y).toBe(floorTop);
    const gapToExit = p.exit.x - p.pole!.x;
    expect(gapToExit).toBeGreaterThanOrEqual(2 * TILE);
    expect(gapToExit).toBeLessThanOrEqual(10 * TILE);
    // Solid floor under it (a plain floor slab, not a belt), a tile to each side.
    for (const dx of [-TILE, 0, TILE]) {
      expect(p.solids.some((r) => r.kind === 'floor' && r.y === floorTop && p.pole!.x + dx >= r.x && p.pole!.x + dx <= r.x + r.w)).toBe(true);
    }
  });
  it('the boss and finale levels have none', () => {
    for (const level of [...WORLD3, ...WORLD5, ...WORLD7].filter((l) => ['3-3', '5-4', '7-4'].includes(l.id))) {
      expect(parseLevel(level).pole).toBeUndefined();
    }
  });
});
