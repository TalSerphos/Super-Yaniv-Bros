import { describe, expect, it } from 'vitest';
import { STAGES, WORLDS } from '../../src/game/levels/index.ts';
import { MAP_H, MAP_NODES, MAP_PATH, MAP_PLAQUES, MAP_W, nodePercent, pathNeighbours, pathSegments } from '../../src/game/systems/mapLayout.ts';

describe('overworld map layout', () => {
  it('places every level once, on the map, and walks the path through all of them', () => {
    const ids = STAGES.map((s) => s.id).sort();
    expect(Object.keys(MAP_NODES).sort()).toEqual(ids);
    expect([...MAP_PATH].sort()).toEqual(ids);
    for (const [x, y] of Object.values(MAP_NODES)) {
      expect(x).toBeGreaterThan(40);
      expect(x).toBeLessThan(MAP_W - 40);
      expect(y).toBeGreaterThan(40);
      expect(y).toBeLessThan(MAP_H - 40);
    }
  });

  it('keeps nodes far enough apart for 44 px touch targets on a phone (915 px wide stage)', () => {
    const min = (44 / 915) * MAP_W;
    const pts = Object.entries(MAP_NODES);
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i][1][0] - pts[j][1][0], pts[i][1][1] - pts[j][1][1]);
        expect(d, `${pts[i][0]} – ${pts[j][0]}`).toBeGreaterThanOrEqual(min);
      }
  });

  it('follows each world in order, World 0 leading to the plane', () => {
    for (const w of WORLDS) {
      const at = w.stages.map((s) => MAP_PATH.indexOf(s.id));
      expect(at).toEqual(at.map((_, k) => at[0] + k));
    }
    expect(MAP_PATH[MAP_PATH.indexOf('3-4') + 1]).toBe('5-1');
    expect(pathNeighbours('5-1')).toEqual(['3-4', '5-2']);
    expect(pathNeighbours('7-4')).toEqual(['7-3']);
  });

  it('has a plaque per world and converts nodes to percentages', () => {
    expect(Object.keys(MAP_PLAQUES).map(Number).sort()).toEqual(WORLDS.map((w) => w.number).sort());
    const p = nodePercent('5-1');
    expect(p.left).toBeCloseTo((MAP_NODES['5-1'][0] / MAP_W) * 100);
    expect(p.top).toBeCloseTo((MAP_NODES['5-1'][1] / MAP_H) * 100);
  });

  it('lights a path segment only when both ends can be played', () => {
    const open = new Set(['5-1', '5-2']);
    const segs = pathSegments((id) => open.has(id));
    expect(segs).toHaveLength(MAP_PATH.length - 1);
    expect(segs.find((s) => s.from === '5-1')!.open).toBe(true);
    expect(segs.find((s) => s.from === '5-2')!.open).toBe(false);
    expect(segs.find((s) => s.to === '5-1')!.open).toBe(false); // the airport is still shut
  });
});
