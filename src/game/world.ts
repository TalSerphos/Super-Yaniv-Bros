/**
 * The context entities share with the level scene. Entities never reach into the scene directly; they
 * call these methods, which keeps each enemy/item self-contained and the scene a thin orchestrator.
 */
import type Phaser from 'phaser';
import type { Sfx } from '../audio/sfx.ts';
import { ART_SCALE } from './config.ts';
import type { ParsedLevel } from './levels/loader.ts';
import type { Player } from './entities/player.ts';

export type Body = Phaser.Physics.Arcade.Body;
export type Sprite = Phaser.Physics.Arcade.Sprite;

export interface GameWorld {
  /** The level scene (named `stage` because Phaser.Scene already has a `scene` property). */
  readonly stage: Phaser.Scene;
  readonly level: ParsedLevel;
  readonly player: Player;
  /** Current bank angle (degrees, positive = nose down). */
  readonly tiltDeg: number;
  /** Gravity in cabin space (world units/s²). */
  readonly gravity: { x: number; y: number };
  readonly elapsed: number;
  readonly finished: boolean;
  /** Static terrain groups (solids, one-ways, blocks) for entity colliders. */
  readonly terrain: Phaser.Physics.Arcade.StaticGroup[];
  addScore(points: number, x?: number, y?: number): void;
  addNut(): void;
  addHeart(): void;
  sfx(name: Sfx): void;
  warn(): void;
  hurtPlayer(fromX: number, cause: string): void;
  /** Does this box overlap solid terrain (floor slabs, bins)? */
  solidAt(box: { left: number; right: number; top: number; bottom: number }): boolean;
  /** Is there something to stand on at (x, y) (top surface within a few units)? */
  standableAt(x: number, y: number): boolean;
  /** Deterministic per-level random number in [0, 1). */
  random(): number;
  /** A paparazzo's flash: white out the screen for a moment (World 7). */
  flashScreen?(): void;
  /** Floating text above something ("NO COMMENT!"). */
  popText?(x: number, y: number, text: string): void;
}

/** Size an Arcade body in world units, bottom-centred in the frame (sprites are drawn at ART_SCALE or more). */
export function sizeBody(sprite: Sprite, w: number, h: number, bottomInset = 0): Body {
  const body = sprite.body as Body;
  const scale = sprite.scaleX || ART_SCALE;
  const [sw, sh, inset] = [w / scale, h / scale, bottomInset / scale];
  body.setSize(sw, sh);
  body.setOffset((sprite.width - sw) / 2, sprite.height - sh - inset);
  return body;
}

/** Axis-aligned overlap between two Arcade bodies (or body-like rects). */
export function overlaps(a: { left: number; right: number; top: number; bottom: number }, b: { left: number; right: number; top: number; bottom: number }): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}
