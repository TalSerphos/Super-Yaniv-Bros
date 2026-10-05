/**
 * Background decor placement (park benches and cherry trees in Washington, palms and kiosks at DXB). Pure and
 * unit-tested (tests/unit/decor.test.ts). The rules keep the Super Mario feel: decor is sparse, sits behind the
 * play layer, and never stands where it could be mistaken for part of the action (next to a pit edge, an
 * enemy, a block, a checkpoint, the goal pole or the exit).
 */

export interface DecorKind {
  frame: string;
  /** Relative chance of being picked. */
  weight: number;
  /** Little animals that scatter when Yaniv comes close. */
  critter?: boolean;
}

export const DECOR: Record<'w3' | 'w7', DecorKind[]> = {
  w7: [
    { frame: 'bench', weight: 2 },
    { frame: 'cherry', weight: 3 },
    { frame: 'urn', weight: 1 },
    { frame: 'bin', weight: 1 },
    { frame: 'squirrel', weight: 1, critter: true },
    { frame: 'pigeons', weight: 1, critter: true },
    { frame: 'shrub', weight: 2 },
    { frame: 'tulips', weight: 2 },
  ],
  w3: [
    { frame: 'palm', weight: 3 },
    { frame: 'seats', weight: 2 },
    { frame: 'kiosk', weight: 1 },
    { frame: 'cone', weight: 1 },
    { frame: 'board', weight: 1 },
    { frame: 'fountain', weight: 1 },
    { frame: 'planter', weight: 2 },
    { frame: 'bin', weight: 1 },
  ],
};

/** Minimum distance between two props (world units): at most one per this stretch, like SMW's bushes. */
export const DECOR_SPACING = 160;
/** Keep this far from anything that matters to play (centre to centre), and from pit edges. */
export const DECOR_CLEARANCE = 48;

export interface DecorSpot {
  x: number;
  kind: DecorKind;
}

/**
 * Place decor along floor spans. `avoid` lists the x of everything that matters to play; `random` is a seeded
 * generator of its own (never the level's gameplay dice).
 */
export function placeDecor(spans: [number, number][], avoid: number[], kinds: DecorKind[], random: () => number): DecorSpot[] {
  const total = kinds.reduce((a, k) => a + k.weight, 0);
  const pick = (): DecorKind => {
    let r = random() * total;
    for (const k of kinds) if ((r -= k.weight) < 0) return k;
    return kinds[kinds.length - 1];
  };
  const out: DecorSpot[] = [];
  let last = -Infinity;
  for (const [x0, x1] of [...spans].sort((a, b) => a[0] - b[0])) {
    for (let x = x0 + DECOR_CLEARANCE + random() * DECOR_SPACING * 0.5; x <= x1 - DECOR_CLEARANCE; x += DECOR_SPACING * (1 + random() * 0.6)) {
      if (x - last < DECOR_SPACING) continue;
      if (avoid.some((a) => Math.abs(a - x) < DECOR_CLEARANCE)) continue;
      const kind = pick();
      out.push({ x: Math.round(x), kind });
      last = x;
    }
  }
  return out;
}

/** Does a critter at `x` scatter now (Yaniv within reach)? */
export function critterScatters(critterX: number, playerX: number): boolean {
  return Math.abs(critterX - playerX) < 64;
}
