import { describe, expect, it } from 'vitest';
import { WORLD5, WORLD5_ORDER } from '../../src/game/levels/index.ts';
import { floorTopOf, parseLevel } from '../../src/game/levels/loader.ts';
import { PHYS, TILE } from '../../src/game/config.ts';

/** Max gap a running jump clears on flat floor, with a safety margin (world units). */
const MAX_GAP = ((2 * PHYS.jumpVelocity) / PHYS.gravity) * PHYS.runSpeed * 0.85;

describe('World 5 levels', () => {
  it('are registered in play order', () => {
    expect(WORLD5_ORDER).toEqual(['5-1', '5-2', '5-3', '5-4']);
  });

  for (const level of WORLD5) {
    describe(level.id, () => {
      const p = parseLevel(level);
      const floorTop = floorTopOf(p);

      it('parses with one start, one exit near the end, and a straight-up start', () => {
        expect(p.start.y).toBe(floorTop);
        expect(p.exit.x).toBeGreaterThan(p.width - 400);
      });

      it('has tilt keys in increasing order with sane angles', () => {
        level.tilt.forEach((k, i) => {
          if (i) expect(k.x).toBeGreaterThan(level.tilt[i - 1].x);
          expect(Math.abs(k.deg)).toBeLessThanOrEqual(20);
        });
      });

      it('has an altitude budget of at least 2.5 minutes', () => {
        expect(level.altitude.start / level.altitude.rate).toBeGreaterThanOrEqual(150);
      });

      it('has no floor gap wider than a running jump (vines only make it easier)', () => {
        const floors = p.solids.filter((s) => s.kind === 'floor' && s.y === floorTop).sort((a, b) => a.x - b.x);
        for (let i = 1; i < floors.length; i++) {
          const gap = floors[i].x - (floors[i - 1].x + floors[i - 1].w);
          expect(gap, `gap at x=${floors[i - 1].x + floors[i - 1].w}`).toBeLessThanOrEqual(MAX_GAP);
        }
      });

      it('puts every block and breakable within head-bump reach of the floor', () => {
        for (const b of [...p.blocks, ...p.breakables]) {
          const bottom = b.y + 32;
          expect(floorTop - 50 - PHYS.jumpVelocity ** 2 / (2 * PHYS.gravity), `block at ${b.x}`).toBeLessThan(bottom);
          expect(bottom).toBeLessThan(floorTop - 50 + TILE); // above a standing head (with a tile of room)
        }
      });
    });
  }
});
