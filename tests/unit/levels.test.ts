import { describe, expect, it } from 'vitest';
import { BONUS_START_ID, FINALE_ID, ORDER, WORLD3, WORLD5, WORLD5_ORDER, WORLD7, WORLDS_BY_NUMBER, stageAfter, stageLabel } from '../../src/game/levels/index.ts';
import { migrateProgress, recordClear } from '../../src/game/systems/progress.ts';
import { floorTopOf, parseLevel } from '../../src/game/levels/loader.ts';
import { PHYS, TILE } from '../../src/game/config.ts';

/** Max gap a running jump clears on flat floor, with a safety margin (world units). */
const MAX_GAP = ((2 * PHYS.jumpVelocity) / PHYS.gravity) * PHYS.runSpeed * 0.85;

describe('the story order', () => {
  it('starts on the plane (World 1), then the cockpit boss (World 2), the White House (World 3), then the airport (World 0)', () => {
    expect(WORLD5_ORDER).toEqual(['5-1', '5-2', '5-3', '5-4']);
    expect(ORDER).toEqual(['5-1', '5-2', '5-3', '5-4', '6-1', '6-2', '6-3', '7-1', '7-2', '7-3', '7-4', '3-1', '3-2', '3-3', '3-4']);
    expect(WORLDS_BY_NUMBER.map((w) => [w.number, w.name])).toEqual([
      [0, 'DXB AIRPORT'],
      [1, 'THE ATTACK'],
      [2, 'THE COCKPIT'],
      [3, 'THE WHITE HOUSE'],
    ]);
  });

  it('players see the new numbers: 5-1 is 1-1, the boss phases 2-x, 7-4 is 3-4, the airport 0-x', () => {
    expect(['5-1', '5-4', '6-1', '6-3', '7-1', '7-4', '3-1', '3-4'].map(stageLabel)).toEqual(['1-1', '1-4', '2-1', '2-3', '3-1', '3-4', '0-1', '0-4']);
  });

  it('winning the story opens the airport, and the airport ends by boarding the plane again', () => {
    const won = recordClear({ unlocked: FINALE_ID, best: {} }, ORDER, FINALE_ID, 1000);
    expect(won.unlocked).toBe(BONUS_START_ID);
    expect(stageAfter('3-4')?.id).toBe('5-1');
    expect(stageAfter('6-3')?.id).toBe('7-1');
    expect(stageAfter('3-1')?.id).toBe('3-2');
  });

  it('old saves (from when the trip started at the airport) are brought up to date', () => {
    const m = (unlocked: string, best: Record<string, number> = {}) => migrateProgress({ unlocked, best }, ORDER, BONUS_START_ID, FINALE_ID).unlocked;
    expect(m('3-3')).toBe('5-1'); // only reached the airport: start the story on the plane
    expect(m('5-3')).toBe('5-3'); // mid-story: unchanged
    expect(m('7-4')).toBe('7-4'); // at the finale, not won yet: airport still closed
    expect(m('7-4', { '7-4': 900 })).toBe('3-1'); // already won: the airport opens
    expect(m('3-2', { '7-4': 900 })).toBe('3-2'); // won and playing the airport: unchanged
    expect(m('9-9')).toBe('5-1'); // unknown id: start fresh
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
