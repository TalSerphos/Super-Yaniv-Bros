import { describe, expect, it } from 'vitest';
import { Altitude } from '../../src/game/systems/altitude.ts';
import { cabinGravity, tiltAt } from '../../src/game/systems/tilt.ts';
import { parseLevel, SEAT, type LevelData } from '../../src/game/levels/loader.ts';

describe('cabinGravity', () => {
  it('is straight down when level', () => {
    const g = cabinGravity(900, 0);
    expect(g.x).toBeCloseTo(0);
    expect(g.y).toBeCloseTo(900);
  });

  it('pulls toward the cockpit (right) when nose-down, keeping magnitude', () => {
    const g = cabinGravity(900, 12);
    expect(g.x).toBeCloseTo(187.1, 1);
    expect(g.y).toBeCloseTo(880.3, 1);
    expect(Math.hypot(g.x, g.y)).toBeCloseTo(900);
  });
});

describe('tiltAt', () => {
  const tl = [
    { t: 0, deg: 0 },
    { t: 10, deg: 15 },
  ];
  it('interpolates and holds the ends', () => {
    expect(tiltAt(tl, -1)).toBe(0);
    expect(tiltAt(tl, 5)).toBeCloseTo(7.5);
    expect(tiltAt(tl, 99)).toBe(15);
    expect(tiltAt([], 3)).toBe(0);
  });
});

describe('Altitude', () => {
  it('counts down, clamps at zero and formats like an altimeter', () => {
    const alt = new Altitude(24300, 150);
    expect(alt.format()).toBe('24,300 FT');
    alt.tick(1);
    expect(alt.value).toBe(24150);
    alt.tick(0.05);
    expect(alt.format()).toBe('24,140 FT');
    alt.tick(1000);
    expect(alt.value).toBe(0);
    expect(alt.crashed).toBe(true);
  });
});

describe('parseLevel', () => {
  const base: LevelData = {
    id: 't',
    name: 'test',
    altitude: { start: 1000, rate: 10 },
    tilt: [{ t: 0, deg: 12 }],
    grid: [
      '..........BB..',
      '..o.?.........',
      '..............',
      'P..E....T---.X',
      '#####..#######',
      '#####..#######',
    ],
  };

  it('finds entities with feet on cell bottoms', () => {
    const p = parseLevel(base);
    expect(p.width).toBe(14 * 16);
    expect(p.start).toEqual({ x: 8, y: 64 });
    expect(p.nuts).toEqual([{ x: 40, y: 24 }]);
    expect(p.blocks).toEqual([{ x: 64, y: 16 }]);
    expect(p.trolleys).toEqual([{ x: 136, y: 64 }]);
    expect(p.exit).toEqual({ x: 208, y: 64 - 128, w: 64, h: 128 });
    expect(p.seats).toEqual([{ x: 48, y: 64 - SEAT.h, kind: 'empty' }]);
  });

  it('merges solid runs horizontally and vertically, keeping the pit open', () => {
    const p = parseLevel(base);
    const floors = p.solids.filter((s) => s.kind === 'floor').sort((a, b) => a.x - b.x);
    expect(floors).toEqual([
      { x: 0, y: 64, w: 80, h: 32, kind: 'floor' },
      { x: 112, y: 64, w: 112, h: 32, kind: 'floor' },
    ]);
    expect(p.solids.filter((s) => s.kind === 'bin')).toEqual([{ x: 160, y: 0, w: 32, h: 16, kind: 'bin' }]);
  });

  it('adds one-way platforms for dashes and seatback tops', () => {
    const p = parseLevel(base);
    expect(p.oneWays).toContainEqual({ x: 144, y: 48, w: 48, h: 16 });
    expect(p.oneWays).toContainEqual({ x: 48 + SEAT.backX, y: 64 - SEAT.h + SEAT.topInset, w: SEAT.backW, h: 6 });
  });

  it('rejects levels without exactly one start and exit', () => {
    expect(() => parseLevel({ ...base, grid: ['....', '####'] })).toThrow(/'P'/);
    expect(() => parseLevel({ ...base, grid: ['P..', '###'] })).toThrow(/'X'/);
  });
});
