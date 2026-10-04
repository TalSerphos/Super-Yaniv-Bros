import { describe, expect, it } from 'vitest';
import { stepBag, type BagParams, type BagState } from '../../src/game/entities/hold.ts';
import { cabinGravity } from '../../src/game/systems/tilt.ts';

const bag = (): BagState => ({ x: 0, y: 0, vx: 0, vy: 0, spin: 0, mode: 'rest', slid: 0 });
const params: BagParams = { grip: Math.tan((10 * Math.PI) / 180), ledge: 30, lostAt: 200 };

function run(b: BagState, deg: number, seconds: number): void {
  const g = cabinGravity(900, deg);
  for (let t = 0; t < seconds; t += 1 / 60) stepBag(b, params, g, 1 / 60);
}

describe('loose luggage in the hold', () => {
  it('stays put while the plane banks gently', () => {
    const b = bag();
    run(b, 8, 3);
    expect(b.mode).toBe('rest');
    expect(b.x).toBe(0);
  });

  it('slides downhill once the tilt passes its grip, then tips over the edge and drops out of sight', () => {
    const b = bag();
    run(b, 14, 0.2);
    expect(b.mode).toBe('slide');
    expect(b.x).toBeGreaterThan(0); // positive bank: the right side is low
    run(b, 14, 3);
    expect(b.mode).toBe('gone');
    expect(b.spin).not.toBe(0); // it tumbled
  });

  it('slides the other way when the plane banks the other way', () => {
    const b = bag();
    run(b, -14, 0.3);
    expect(b.x).toBeLessThan(0);
  });

  it('stops again if the plane levels out before it reaches the edge', () => {
    const b = bag();
    run(b, 12, 0.15);
    expect(b.mode).toBe('slide');
    run(b, 0, 1);
    expect(b.mode).toBe('rest');
    expect(b.slid).toBeLessThan(params.ledge);
  });
});
