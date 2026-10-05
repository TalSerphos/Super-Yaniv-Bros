import { describe, expect, it } from 'vitest';
import { FX, FX_CAP, FxPool, LAND_DUST_SPEED, SKID_SPEED, allowedWithReducedMotion, landingDust, shardOffset, shardPaths, skidding } from '../../src/game/systems/fx.ts';
import { PHYS } from '../../src/game/config.ts';
import { SHEETS } from '../../src/game/assets.ts';

describe('impact FX rules', () => {
  it('raises landing dust only after a drop higher than a full jump', () => {
    const fullJumpLanding = PHYS.jumpVelocity; // a jump lands as fast as it took off
    expect(landingDust(fullJumpLanding)).toBe(false);
    expect(landingDust(LAND_DUST_SPEED)).toBe(true);
    expect(landingDust(PHYS.maxFall)).toBe(true);
  });

  it('skids only when reversing on the ground at speed', () => {
    expect(skidding(true, -1, SKID_SPEED + 10)).toBe(true);
    expect(skidding(true, 1, -(SKID_SPEED + 10))).toBe(true);
    expect(skidding(true, 1, SKID_SPEED + 10)).toBe(false); // running on, not turning
    expect(skidding(true, -1, SKID_SPEED - 10)).toBe(false); // too slow to skid
    expect(skidding(false, -1, SKID_SPEED + 10)).toBe(false); // in the air
    expect(skidding(true, 0, SKID_SPEED + 10)).toBe(false); // letting go is not a skid
  });

  it('keeps the informative effects under reduced motion', () => {
    expect(allowedWithReducedMotion('poof')).toBe(true);
    expect(allowedWithReducedMotion('sparkle')).toBe(true);
    expect(allowedWithReducedMotion('dust')).toBe(false);
    expect(allowedWithReducedMotion('skid')).toBe(false);
    expect(allowedWithReducedMotion('splash')).toBe(false);
  });

  it('every effect is a short strip of 3-4 frames (16-bit style)', () => {
    for (const spec of Object.values(FX)) {
      const frames = SHEETS[spec.sheet].frames.length;
      expect(frames).toBeGreaterThanOrEqual(3);
      expect(frames).toBeLessThanOrEqual(4);
      expect((frames / spec.frameRate) * 1000).toBeLessThanOrEqual(340);
    }
  });

  it('shards pop up first, then fall past the block, mirrored left and right', () => {
    const paths = shardPaths();
    expect(paths).toHaveLength(4);
    for (const p of paths) {
      const start = shardOffset(p, 0);
      expect(Math.abs(start.x) + Math.abs(start.y)).toBe(0);
      expect(shardOffset(p, 0.3).y).toBeLessThan(0); // rising
      expect(shardOffset(p, 1).y).toBeGreaterThan(0); // fell below where it started
    }
    expect(paths.map((p) => Math.sign(p.dx)).sort()).toEqual([-1, -1, 1, 1]);
  });

  it('the pool recycles the oldest effect over the cap', () => {
    const pool = new FxPool<number>(3);
    expect([1, 2, 3].map((n) => pool.push(n))).toEqual([undefined, undefined, undefined]);
    expect(pool.push(4)).toBe(1);
    pool.remove(3);
    expect(pool.size).toBe(2);
    expect(new FxPool().cap).toBe(FX_CAP);
  });
});
