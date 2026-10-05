/**
 * The goal pole: the flagpole twin of the Mario contract (GAME_SPEC.md). A few tiles before the exit stands a
 * pole (the seatbelt sign in the plane, a boarding sign at DXB, the flagpole in Washington); the higher Yaniv
 * touches it, the bigger the bonus. Pure rules, unit-tested (tests/unit/goal.test.ts).
 */

/** Visual height of the pole (world units); the art is 32×144. */
export const POLE_H = 144;
/** Half-width of the touch zone around the pole's centre line. */
export const POLE_REACH = 6;

/**
 * Bonus bands by how high the feet are above the pole's base (world units) at the touch. A full jump from the
 * floor tops out at about 76, so the top band asks for a near-perfect jump at the right spot, or a launch
 * from something higher (a shelf, a stomp bounce).
 */
export const POLE_BANDS: { minHeight: number; points: number }[] = [
  { minHeight: 70, points: 5000 },
  { minHeight: 48, points: 2000 },
  { minHeight: 28, points: 800 },
  { minHeight: 10, points: 400 },
  { minHeight: -Infinity, points: 100 },
];

/** Points for touching the pole with the feet `height` units above its base. */
export function poleBonus(height: number): number {
  return POLE_BANDS.find((b) => height >= b.minHeight)!.points;
}

/** Does a player body box touch the pole standing at (x, base)? */
export function touchesPole(box: { left: number; right: number; top: number; bottom: number }, x: number, base: number): boolean {
  return box.right >= x - POLE_REACH && box.left <= x + POLE_REACH && box.bottom >= base - POLE_H && box.top <= base;
}
