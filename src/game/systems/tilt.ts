/**
 * Tilt: physics runs in cabin space (tiles stay axis-aligned) and the camera rotates by the tilt angle.
 * For the world to look tilted clockwise (nose down, cockpit to the lower right) while "true down" stays
 * straight down on screen, gravity in cabin space must point along (sin θ, cos θ).
 */

export interface Vec2 {
  x: number;
  y: number;
}

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

/** Gravity vector in cabin space for a nose-down tilt of `deg` degrees (positive = right side lower). */
export function cabinGravity(g: number, deg: number): Vec2 {
  const t = degToRad(deg);
  return { x: g * Math.sin(t), y: g * Math.cos(t) };
}

export interface TiltKey {
  /** Seconds since level start. */
  t: number;
  deg: number;
}

/**
 * Tilt at time `t` from a timeline of keys (sorted by t), linearly interpolated, held after the last key.
 * Stage 2 uses a single key (static tilt); Stage 3 adds timelines with warnings.
 */
export function tiltAt(timeline: TiltKey[], t: number): number {
  if (!timeline.length) return 0;
  if (t <= timeline[0].t) return timeline[0].deg;
  for (let i = 1; i < timeline.length; i++) {
    const a = timeline[i - 1];
    const b = timeline[i];
    if (t <= b.t) return a.deg + ((b.deg - a.deg) * (t - a.t)) / (b.t - a.t);
  }
  return timeline[timeline.length - 1].deg;
}
