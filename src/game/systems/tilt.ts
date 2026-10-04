/**
 * Tilt: physics runs in cabin space (tiles stay axis-aligned) and the camera rotates by the tilt angle.
 * For the world to look tilted clockwise (nose down, cockpit to the lower right) while "true down" stays
 * straight down on screen, gravity in cabin space must point along (sin θ, cos θ).
 *
 * Levels script the plane's attitude against progress: each key says "from this x on, bank this much".
 * The angle follows the furthest x the player has reached (so it never un-tilts when backtracking), and
 * the HUD warns WARNING_DISTANCE before each change (about 2 s of running, per the spec).
 */
import type { TiltKey } from '../levels/loader.ts';

export interface Vec2 {
  x: number;
  y: number;
}

/** Warn this far (world units) before a tilt change: ~2 s at run speed. */
export const WARNING_DISTANCE = 280;
/** Each change eases in over this distance after its key. */
export const EASE_DISTANCE = 120;

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

/** Gravity vector in cabin space for a nose-down tilt of `deg` degrees (positive = right side lower). */
export function cabinGravity(g: number, deg: number): Vec2 {
  const t = degToRad(deg);
  return { x: g * Math.sin(t), y: g * Math.cos(t) };
}

/** Bank angle at progress `x`: each key's angle eases in over EASE_DISTANCE after the key. */
export function tiltAt(keys: TiltKey[], x: number): number {
  if (!keys.length) return 0;
  let deg = keys[0].deg;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (x < k.x) break;
    const t = Math.min(1, (x - k.x) / EASE_DISTANCE);
    deg = deg + (k.deg - deg) * t;
  }
  return deg;
}

/** The next tilt change within WARNING_DISTANCE ahead of `x`, if any (for the HUD warning). */
export function upcomingTilt(keys: TiltKey[], x: number): TiltKey | undefined {
  return keys.find((k, i) => i > 0 && k.x > x && k.x - x <= WARNING_DISTANCE && k.deg !== keys[i - 1].deg);
}
