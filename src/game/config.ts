/** Shared tuning constants. World units: the camera shows 640×360 of them (zoom 2 on a 1280×720 canvas). */

export const VIEW_W = 640;
export const VIEW_H = 360;
export const CANVAS_W = 1280;
export const CANVAS_H = 720;
export const ZOOM = CANVAS_W / VIEW_W;
export const TILE = 16;
/**
 * One-screen rooms keep their floor line this far above the bottom of the view (view units): the boss arena on
 * touch devices, where the on-screen buttons sit, and the Oval Office (its secret basement shows below).
 */
export const ROOM_FLOOR_MARGIN = 74;
/** Art is authored at 2× (see docs/levels/w5-assets.md) and drawn at this scale. */
export const ART_SCALE = 0.5;

export const PHYS = {
  gravity: 900,
  maxFall: 520,
  runSpeed: 140,
  groundAccel: 1100,
  airAccel: 650,
  jumpVelocity: 370, // apex ≈ v²/2g ≈ 76 units: clears a seatback from the aisle
  jumpCutFactor: 0.45, // releasing jump early multiplies upward speed by this
  coyoteTime: 0.1,
  jumpBuffer: 0.12,
  /** Fraction of the slope's pull the player feels (1 = slides like a trolley). */
  playerSlopeFeel: 0.12,
  stompBounce: 260,
  hurtInvulnerable: 1.3,
  trolleyMaxSpeed: 210,
};

export const RULES = {
  hearts: 3,
  nutScore: 10,
  stompScore: 100,
  blockScore: 50,
  /** Trolleys spawn when the player is this far past their spawner, so they arrive from off-screen behind. */
  trolleyTriggerDistance: 360,
};
