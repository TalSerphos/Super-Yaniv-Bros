import { describe, expect, it } from 'vitest';
import { ORDER, WORLD3, WORLD5, WORLD5_ORDER, WORLD7 } from '../../src/game/levels/index.ts';
import { floorTopOf, parseLevel } from '../../src/game/levels/loader.ts';
import { PHYS, TILE } from '../../src/game/config.ts';

/** Max gap a running jump clears on flat floor, with a safety margin (world units). */
const MAX_GAP = ((2 * PHYS.jumpVelocity) / PHYS.gravity) * PHYS.runSpeed * 0.85;

describe('the story order', () => {
  it('runs World 3 (DXB Airport), World 5, the three boss phases of World 6, then World 7', () => {
    expect(WORLD5_ORDER).toEqual(['5-1', '5-2', '5-3', '5-4']);
    expect(ORDER).toEqual(['3-1', '3-2', '3-3', '3-4', '5-1', '5-2', '5-3', '5-4', '6-1', '6-2', '6-3', '7-1', '7-2', '7-3', '7-4']);
  });
});

describe('World 3 levels (DXB Airport)', () => {
  const parsed = WORLD3.map((l) => ({ level: l, p: parseLevel(l) }));
  it('are on the ground in the terminal, the duty-free or at the gates, with a TIME counter', () => {
    for (const { level } of parsed) {
      expect(['terminal', 'dutyfree', 'gate']).toContain(level.theme);
      expect(level.tilt.every((k) => k.deg === 0)).toBe(true);
      expect(level.timer).toBeGreaterThanOrEqual(45); // 3-4 is a sprint: about twice a fast run
      expect(level.intro).toBeTruthy();
    }
  });
  it('3-1 has raised conveyors with X-ray machines on their belts, metal detectors and friendly officers', () => {
    const { p } = parsed[0];
    const raised = p.belts.filter((b) => b.y < floorTopOf(p));
    expect(raised.length).toBeGreaterThanOrEqual(3);
    expect(raised.some((b) => b.speed < 0)).toBe(true); // one runs against you
    for (const x of p.xrays) expect(raised.some((b) => b.y === x.y && x.x > b.x && x.x < b.x + b.w)).toBe(true);
    expect(p.detectors.length).toBeGreaterThanOrEqual(2);
    expect(p.officers.length).toBeGreaterThanOrEqual(2);
  });
  it('3-2 and 3-4 are travelator runs: only the top row of a travelator moves', () => {
    for (const { p, level } of [parsed[1], parsed[3]]) {
      const floorTop = floorTopOf(p);
      const travelators = p.belts.filter((b) => b.y === floorTop);
      expect(travelators.length, level.id).toBeGreaterThanOrEqual(4);
      expect(p.belts.every((b) => b.y <= floorTop)).toBe(true);
      expect(Math.abs(travelators[0].speed)).toBe(level.beltSpeed);
    }
  });
  it('3-3 has Duty-Free Bill cannons and Mr. Spritz guarding the gate; 3-4 ends at the gate agent', () => {
    expect(parsed[2].p.launchers.length).toBeGreaterThanOrEqual(4);
    expect(parsed[2].p.mascot!.x).toBeGreaterThan(parsed[2].p.exit.x - 400);
    expect(parsed[2].level.clear?.sub).toBe('But the cockpit is in another cabin!');
    expect(parsed[3].p.gateAgent!.x).toBeGreaterThan(parsed[3].p.exit.x - 120);
  });
});

describe('World 7 levels (on the ground)', () => {
  for (const level of WORLD7) {
    const p = parseLevel(level);
    it(`${level.id}: no tilt, a TIME counter (except the Oval Office), a known theme`, () => {
      expect(level.tilt.every((k) => k.deg === 0)).toBe(true);
      expect(['mall', 'lawn', 'oval']).toContain(level.theme);
      if (level.theme === 'oval') {
        expect(p.president, 'the President waits in the Oval Office').toBeDefined();
        // Just right of the room's middle (Tal: about half as far from it as column 30 was).
        expect(Math.abs(p.president!.x - p.width / 2)).toBeLessThanOrEqual(96);
        expect(level.timer).toBeUndefined();
      } else {
        expect(level.timer).toBeGreaterThanOrEqual(110); // a real clock: about 4× a fast run
      }
    });
  }

  it('7-1 has the drains to unclog; the press levels have reporters and paparazzi', () => {
    const [pool, gaggle, row] = WORLD7.map(parseLevel);
    expect(pool.drains.length).toBe(3);
    expect(gaggle.reporters.length).toBeGreaterThanOrEqual(6);
    expect(row.paparazzi.length).toBeGreaterThanOrEqual(5);
  });
});

describe('platform levels (Worlds 3, 5 and 7)', () => {
  for (const level of [...WORLD3, ...WORLD5, ...WORLD7]) {
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

      it('has an altitude budget of 2.5 to 4 minutes (a real clock, but a generous one)', () => {
        if (level.theme && level.theme !== 'cabin') return; // World 7 runs on TIME (checked above)
        const seconds = level.altitude.start / level.altitude.rate;
        expect(seconds).toBeGreaterThanOrEqual(150);
        expect(seconds).toBeLessThanOrEqual(240);
      });

      it('drops luggage only from under an overhead bin, never out of thin air', () => {
        const bins = p.solids.filter((s) => s.kind === 'bin');
        for (const l of p.luggage) {
          // The bag spreads ±48 around its drop point: the whole spread must be under the bin run.
          const bin = bins.find((b) => b.y + b.h === l.y && b.x <= l.x - 48 && b.x + b.w >= l.x + 48);
          expect(bin, `luggage at x=${l.x}`).toBeDefined();
        }
      });

      it('draws every one-way shelf (seat tops excepted)', () => {
        for (const s of p.shelves) expect(p.oneWays).toContainEqual(s);
        const grid = level.grid.join('');
        expect(p.shelves.length > 0).toBe(grid.includes('-'));
      });

      it('has no floor gap wider than a running jump (vines only make it easier)', () => {
        // (A travelator is floor you can run on.)
        const floors = p.solids.filter((s) => (s.kind === 'floor' || s.kind === 'belt') && s.y === floorTop).sort((a, b) => a.x - b.x);
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
