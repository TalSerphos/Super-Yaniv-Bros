/**
 * Classic 16-bit impact effects: when they fire and how they look. Pure rules (unit-tested in
 * tests/unit/fx.test.ts); the scenes only spawn the sprites. Every effect is a short one-shot strip of 3-4 hard-
 * edged frames, never a soft particle cloud: the Super Mario World vocabulary of puffs, stars and twinkles.
 */

export type FxKind = 'dust' | 'skid' | 'poof' | 'sparkle' | 'splash';

export interface FxSpec {
  /** Sprite strip (src/assets/w5/fx.*.webp). */
  sheet: string;
  frameRate: number;
  /** Vertical origin: 1 = the effect sits on the point (ground puffs, splashes), 0.5 = centred on it. */
  originY: number;
}

export const FX: Record<FxKind, FxSpec> = {
  dust: { sheet: 'fx.dust', frameRate: 16, originY: 1 },
  skid: { sheet: 'fx.dust', frameRate: 20, originY: 1 },
  poof: { sheet: 'fx.poof', frameRate: 18, originY: 0.5 },
  sparkle: { sheet: 'fx.sparkle', frameRate: 18, originY: 0.5 },
  splash: { sheet: 'fx.splash', frameRate: 12, originY: 1 },
};

/** Live effects at once; past this the oldest is recycled (a stampede of stomps never floods the screen). */
export const FX_CAP = 16;
/** A landing raises dust only after a real drop (world units/s at touchdown), not after every jump. */
export const LAND_DUST_SPEED = 400; // a full jump lands at ~370: only real drops (> ~90 units) puff
/** Skid dust: reversing while still running at least this fast the other way. */
export const SKID_SPEED = 90;
/** Seconds between two skid puffs. */
export const SKID_COOLDOWN = 0.14;

/** Should touching down at this fall speed raise dust? */
export function landingDust(fallSpeed: number): boolean {
  return fallSpeed >= LAND_DUST_SPEED;
}

/**
 * Is the player skidding: on the ground, pressing one way while still sliding the other way fast? `vx` is
 * relative to the ground (a belt's speed already taken out).
 */
export function skidding(grounded: boolean, dir: number, vx: number): boolean {
  return grounded && dir !== 0 && Math.sign(vx) === -Math.sign(dir) && Math.abs(vx) >= SKID_SPEED;
}

/** Fewer effects for players who asked the system for reduced motion: only the informative ones remain. */
export function allowedWithReducedMotion(kind: FxKind): boolean {
  return kind === 'poof' || kind === 'sparkle';
}

export interface ShardPath {
  dx: number;
  dy: number;
  /** How high the shard pops before it falls (world units). */
  up: number;
  spin: number;
  duration: number;
}
/**
 * Where the four shards of a smashed bin panel fly: a classic brick-break fan (two high, two low, mirrored),
 * as end offsets from the block centre after `duration` ms.
 */
export function shardPaths(): ShardPath[] {
  return [
    { dx: -26, dy: 60, up: 34, spin: -360, duration: 620 },
    { dx: 26, dy: 60, up: 34, spin: 360, duration: 620 },
    { dx: -14, dy: 70, up: 16, spin: -240, duration: 560 },
    { dx: 14, dy: 70, up: 16, spin: 240, duration: 560 },
  ];
}

/** A shard's offset from the block centre at progress t (0..1): pops up, then falls past where it started. */
export function shardOffset(path: ShardPath, t: number): { x: number; y: number } {
  return { x: path.dx * t, y: path.dy * t * t - path.up * 4 * t * (1 - t) };
}

/** Ring buffer of live effect handles: `push` returns the handle to recycle when over the cap. */
export class FxPool<T> {
  private live: T[] = [];
  constructor(readonly cap = FX_CAP) {}

  push(item: T): T | undefined {
    this.live.push(item);
    return this.live.length > this.cap ? this.live.shift() : undefined;
  }

  remove(item: T): void {
    const i = this.live.indexOf(item);
    if (i >= 0) this.live.splice(i, 1);
  }

  get size(): number {
    return this.live.length;
  }
}
