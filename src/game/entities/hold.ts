/**
 * The cargo hold under the plane's floor (Worlds 5 and 6): a backdrop packed with luggage, and loose bags in
 * front of it that hold still while the plane banks gently, then slide downhill and tumble off when it tilts too
 * far. Decoration only: nothing here touches the player.
 */
import type Phaser from 'phaser';
import { ART_SCALE, VIEW_H } from '../config.ts';
import type { Vec2 } from '../systems/tilt.ts';

/** Height of the hold art below the floor slab (world units); below it the hold fades to dark. */
export const HOLD_H = 160;
const HOLD_DARK = 0x15142a;

/** Kinetic friction as a share of the grip: once a bag moves it keeps sliding at a slightly lower tilt. */
const KINETIC = 0.7;

export interface BagState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
  mode: 'rest' | 'slide' | 'fall' | 'gone';
  slid: number;
}

export interface BagParams {
  /** Static grip: the bag starts to slide once tan(tilt) exceeds this (0.18 ≈ 10°). */
  grip: number;
  /** How far it slides along its stack before it tips over the edge and falls. */
  ledge: number;
  /** World y where a falling bag drops out of sight. */
  lostAt: number;
}

/** Advance one bag under the cabin's gravity `g` (world axes, from cabinGravity). */
export function stepBag(b: BagState, p: BagParams, g: Vec2, dt: number): void {
  if (b.mode === 'gone') return;
  const holds = Math.abs(g.x) <= p.grip * g.y;
  if (b.mode === 'rest') {
    if (holds) return;
    b.mode = 'slide';
  }
  if (b.mode === 'slide') {
    const dir = b.vx !== 0 ? Math.sign(b.vx) : Math.sign(g.x);
    const vx = b.vx + (g.x - dir * KINETIC * p.grip * g.y) * dt;
    if (Math.sign(vx) !== dir && holds) {
      // Friction stopped it and the plane is level enough again: it stays where it got to.
      b.vx = 0;
      b.mode = 'rest';
      return;
    }
    b.vx = vx;
    b.x += vx * dt;
    b.slid += Math.abs(vx * dt);
    b.spin += (vx * dt) / 40; // a little wobble as it drags
    if (b.slid >= p.ledge) {
      b.mode = 'fall';
      b.vy = 0;
    }
    return;
  }
  // Falling: tumbling end over end toward the low side.
  b.vx += g.x * dt;
  b.vy += g.y * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.spin += Math.sign(b.vx || 1) * 7 * dt;
  if (b.y > p.lostAt) b.mode = 'gone';
}

const gone = (s: BagState): boolean => s.mode === 'gone';

interface Bag {
  sprite: Phaser.GameObjects.Sprite;
  s: BagState;
  p: BagParams;
}

export interface HoldOptions {
  left: number;
  right: number;
  /** World y of the hold's ceiling (the bottom of the floor slab). */
  top: number;
  /** Where loose bags may rest (x ranges under solid floor, so none sits in a pit). */
  spans: [number, number][];
  /** Their bottoms rest this far below the ceiling: [min, max]. */
  restBand: [number, number];
  /** Random numbers in [0, 1) (seeded by the scene). */
  random: () => number;
  /** Tint for the alarm worlds. */
  tint?: number;
}

export class CargoHold {
  private bags: Bag[] = [];

  constructor(scene: Phaser.Scene, o: HoldOptions) {
    const w = o.right - o.left;
    const art = scene.add.tileSprite(o.left, o.top, w, HOLD_H, 'w5.bg.hold').setOrigin(0).setTileScale(ART_SCALE);
    if (o.tint) art.setTint(o.tint);
    scene.add.rectangle(o.left, o.top + HOLD_H, w, VIEW_H * 2, HOLD_DARK).setOrigin(0);
    // A soft shadow under the floor slab.
    scene.add.rectangle(o.left, o.top, w, 6, 0x000000, 0.35).setOrigin(0);
    for (const [x0, x1] of o.spans) {
      for (let x = x0 + 24 + o.random() * 60; x < x1 - 24; x += 90 + o.random() * 80) {
        const frame = Math.floor(o.random() * 3);
        const sprite = scene.add.sprite(x, 0, 'prop.luggage', frame).setScale(ART_SCALE * 0.85);
        if (o.tint) sprite.setTint(o.tint);
        const half = sprite.displayHeight / 2;
        const bottom = o.top + o.restBand[0] + o.random() * (o.restBand[1] - o.restBand[0]);
        sprite.setPosition(x, bottom - half);
        this.bags.push({
          sprite,
          s: { x, y: bottom - half, vx: 0, vy: 0, spin: 0, mode: 'rest', slid: 0 },
          // Grip between ~7° and ~13°: the first bags go when the bank warning starts, more as it worsens.
          p: { grip: 0.12 + o.random() * 0.11, ledge: 16 + o.random() * 48, lostAt: o.top + HOLD_H + 40 },
        });
      }
    }
  }

  /** Call every physics step with the cabin's gravity. */
  step(g: Vec2, dt: number): void {
    for (const b of this.bags) {
      if (gone(b.s)) continue;
      stepBag(b.s, b.p, g, dt);
      if (gone(b.s)) b.sprite.setVisible(false);
      else b.sprite.setPosition(b.s.x, b.s.y).setRotation(b.s.spin);
    }
  }

  /** Test hook: how many bags are still resting, sliding, falling, or gone. */
  counts(): Record<BagState['mode'], number> {
    const out = { rest: 0, slide: 0, fall: 0, gone: 0 };
    for (const b of this.bags) out[b.s.mode]++;
    return out;
  }
}
