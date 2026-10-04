import Phaser from 'phaser';
import { ART_SCALE } from '../config.ts';
import { MASK_LENGTH } from '../levels/loader.ts';
import { degToRad } from '../systems/tilt.ts';
import type { GameWorld } from '../world.ts';

/**
 * An oxygen mask hanging on its tube: a pendulum that always rests along TRUE gravity, so on screen it
 * hangs straight down however the cabin is tilted (spec: masks become swing-vines that line up differently
 * at every angle). The angle φ is measured in cabin space from +y toward +x; at rest φ equals the tilt.
 */
export class MaskVine {
  /** Angle from cabin-space vertical (rad) and angular velocity (rad/s). */
  private phi: number;
  private omega = 0;
  private readonly tube: Phaser.GameObjects.Graphics;
  private readonly mask: Phaser.GameObjects.Image;
  attached = false;

  constructor(
    private readonly world: GameWorld,
    readonly anchor: { x: number; y: number },
    readonly length = MASK_LENGTH,
  ) {
    this.phi = degToRad(world.tiltDeg);
    this.tube = world.stage.add.graphics().setDepth(9);
    this.mask = world.stage.add.image(0, 0, 'prop.mask', 0).setScale(ART_SCALE).setDepth(9);
    this.draw();
  }

  get end(): { x: number; y: number } {
    return {
      x: this.anchor.x + Math.sin(this.phi) * this.length,
      y: this.anchor.y + Math.cos(this.phi) * this.length,
    };
  }

  /** Mask hitbox for grabbing (world units). */
  get grabZone() {
    const e = this.end;
    return { left: e.x - 12, right: e.x + 12, top: e.y - 10, bottom: e.y + 14 };
  }

  attach(vx: number): void {
    this.attached = true;
    // Carry the player's horizontal speed into the swing.
    this.omega = (vx / this.length) * 0.9;
    this.mask.setFrame(1);
  }

  /** Left/right pumps the swing (only adds energy in the direction of travel or from rest). */
  pump(dir: number, dt: number): void {
    if (!dir) return;
    this.omega += dir * 2.6 * dt;
    this.omega = Phaser.Math.Clamp(this.omega, -3.2, 3.2);
  }

  /** Tangential velocity of the mask end (world units/s). */
  get tipVelocity(): { x: number; y: number } {
    const v = this.omega * this.length;
    return { x: v * Math.cos(this.phi), y: -v * Math.sin(this.phi) };
  }

  /** Let go: returns the tangential velocity at the end. */
  release(): { x: number; y: number } {
    this.attached = false;
    this.mask.setFrame(0);
    return this.tipVelocity;
  }

  step(dt: number): void {
    const rest = degToRad(this.world.tiltDeg);
    const g = Math.hypot(this.world.gravity.x, this.world.gravity.y);
    // Pendulum about the true-gravity direction, lightly damped (less damping while someone is swinging).
    this.omega += (-(g / this.length) * Math.sin(this.phi - rest) - (this.attached ? 0.15 : 1.2) * this.omega) * dt;
    this.phi += this.omega * dt;
    this.draw();
  }

  private draw(): void {
    const e = this.end;
    this.tube.clear().lineStyle(1.5, 0xe8e2d0, 1).lineBetween(this.anchor.x, this.anchor.y, e.x, e.y);
    this.mask.setPosition(e.x, e.y);
  }

  destroy(): void {
    this.tube.destroy();
    this.mask.destroy();
  }
}
