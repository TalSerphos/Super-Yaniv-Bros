import Phaser from 'phaser';
import { frameIndex } from '../assets.ts';
import { ART_SCALE, PHYS } from '../config.ts';
import type { Power } from '../systems/progress.ts';
import type { ButtonEdges } from '../systems/input.ts';
import { degToRad } from '../systems/tilt.ts';
import { sizeBody, type Body, type GameWorld, type Sprite } from '../world.ts';
import type { MaskVine } from './masks.ts';

/** Body sizes in world units for each power state. */
const BODY = { small: { w: 20, h: 50 }, big: { w: 24, h: 62 } };
/** Big/Golden Yaniv is the same art drawn larger (matches the concept art's proportions). */
const BIG_SCALE = 1.25;
export const BAMBA_SECONDS = 8;
const SHEET = 'yaniv.small';

/**
 * Yaniv: movement (run, variable jump, coyote time, jump buffer), power states (small / big / golden),
 * Bamba Rush, invulnerability after hits, and hanging from oxygen-mask vines.
 */
export class Player {
  readonly sprite: Sprite;
  power: Power = 'small';
  /** Seconds of Bamba Rush left (invincible, faster). */
  bamba = 0;
  invulnerable = 0;
  hurtTimer = 0;
  /** Seconds of ignored movement input (after a respawn). */
  controlLock = 0;
  plungeCooldown = 0;
  swing: MaskVine | null = null;
  /** Can't grab any vine until this runs out (after letting go). */
  swingCooldown = 0;
  /** The vine just let go of: not grabbable again until Yaniv lands (no instant re-grab on a hop-off). */
  releasedVine: MaskVine | null = null;
  lastSafe: { x: number; y: number };
  /** Held action pose from the `yaniv.action` sheet (pull the yoke, chokehold, tighten a knot): no walking. */
  pose: 'pull' | 'choke' | 'tighten' | null = null;
  private coyote = 0;
  private jumpBuffer = 0;
  private jumpCut = false;
  private bambaHue = 0;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
    power: Power,
  ) {
    const scene = world.stage;
    this.sprite = scene.physics.add.sprite(x, y, SHEET, 0).setOrigin(0.5, 1).setDepth(10);
    const body = this.body;
    body.setMaxVelocity(PHYS.runSpeed * 2.2, PHYS.maxFall);
    body.setCollideWorldBounds(true); // left/right/top only: the world's bottom stays open for pits
    this.lastSafe = { x, y };
    this.setPower(power, true);
    this.sprite.play(`${SHEET}:idle`);
  }

  get body(): Body {
    return this.sprite.body as Body;
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get big(): boolean {
    return this.power !== 'small';
  }

  get grounded(): boolean {
    return this.body.blocked.down || this.body.touching.down;
  }

  get facing(): 1 | -1 {
    return this.sprite.flipX ? -1 : 1;
  }

  setPower(power: Power, instant = false): void {
    this.power = power;
    const scale = ART_SCALE * (power === 'small' ? 1 : BIG_SCALE);
    const apply = () => {
      this.sprite.setScale(scale);
      const size = power === 'small' ? BODY.small : BODY.big;
      sizeBody(this.sprite, size.w, size.h);
    };
    if (instant) apply();
    else {
      // Classic grow/shrink flicker: alternate sizes for a moment, then settle.
      const from = this.sprite.scaleX;
      let n = 0;
      this.world.stage.time.addEvent({
        delay: 70,
        repeat: 6,
        callback: () => {
          this.sprite.setScale(n++ % 2 ? from : scale);
          if (n === 7) apply();
        },
      });
      apply();
    }
    const fx = this.sprite.preFX;
    fx?.clear();
    if (power === 'golden') fx?.addGlow(0xffd23f, 3, 0, false, 0.1, 10);
  }

  /** Can a stomp land on something whose top is at `top`? (falling, feet near its top) */
  canStomp(top: number): boolean {
    return this.body.velocity.y > 0 && this.body.bottom - top < 16;
  }

  /** Bounce off a stomped enemy: full jump height if jump is held. */
  bounce(jumpHeld: boolean): void {
    this.body.setVelocityY(-(jumpHeld ? PHYS.jumpVelocity : PHYS.stompBounce));
    this.jumpCut = !jumpHeld;
  }

  knockback(dir: number): void {
    this.hurtTimer = 1.05;
    this.jumpCut = true; // knockback height must not depend on the jump button
    this.body.setVelocity(dir * 160, -220);
  }

  /**
   * One fixed physics step of player control. Returns true when the plunger button fired this step
   * (the scene decides between a melee poke and a thrown golden plunger).
   */
  step(dt: number, edges: ButtonEdges): boolean {
    const b = edges.current;
    const body = this.body;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.controlLock = Math.max(0, this.controlLock - dt);
    this.plungeCooldown = Math.max(0, this.plungeCooldown - dt);
    this.swingCooldown = Math.max(0, this.swingCooldown - dt);
    this.stepBamba(dt);

    if (this.pose) {
      body.setVelocityX(0);
      this.sprite.anims.stop();
      this.sprite.setTexture('yaniv.action', frameIndex('yaniv.action', this.pose));
      return false;
    }
    if (this.swing) return this.stepSwing(dt, edges);

    const grounded = this.grounded;
    if (grounded) this.releasedVine = null;
    this.coyote = grounded ? PHYS.coyoteTime : Math.max(0, this.coyote - dt);
    this.jumpBuffer = edges.pressed('jump') ? PHYS.jumpBuffer : Math.max(0, this.jumpBuffer - dt);

    const dir = this.controlLock > 0 ? 0 : (b.right ? 1 : 0) - (b.left ? 1 : 0);
    // Running downhill (toward the cockpit) is a little faster, uphill a little slower. Bamba: faster still.
    const slope = Math.sin(degToRad(this.world.tiltDeg));
    const speed = PHYS.runSpeed * (this.bamba > 0 ? 1.35 : 1);
    const target = dir * speed * (1 + 0.6 * slope * dir);
    const accel = (grounded ? PHYS.groundAccel : PHYS.airAccel) * dt;
    if (this.hurtTimer <= 0.9) body.setVelocityX(body.velocity.x + Phaser.Math.Clamp(target - body.velocity.x, -accel, accel));
    // Standing still on the slope: no creeping (the slope is felt while moving, not while idle).
    if (grounded && !dir && Math.abs(body.velocity.x) < 6) body.setVelocityX(0);

    if (this.jumpBuffer > 0 && this.coyote > 0 && this.controlLock <= 0) {
      body.setVelocityY(-PHYS.jumpVelocity);
      this.jumpBuffer = this.coyote = 0;
      this.jumpCut = false;
      this.world.sfx('jump');
    }
    if (!b.jump && body.velocity.y < 0 && !this.jumpCut) {
      body.setVelocityY(body.velocity.y * PHYS.jumpCutFactor);
      this.jumpCut = true;
    }

    if (dir) this.sprite.setFlipX(dir < 0);
    this.animate(grounded);

    if (grounded && body.blocked.down && this.world.standableAt(this.x - 40, this.y) && this.world.standableAt(this.x + 40, this.y)) {
      this.lastSafe = { x: this.x, y: this.y };
    }
    const fire = edges.pressed('grab') && this.plungeCooldown <= 0;
    if (fire) this.plungeCooldown = 0.25;
    return fire;
  }

  private animate(grounded: boolean): void {
    const p = this.sprite;
    if (this.hurtTimer > 0) this.showFrame('hurt');
    else if (this.swing) this.showFrame('jump');
    else if (!grounded) this.showFrame(this.body.velocity.y < 0 ? 'jump' : 'fall');
    else if (Math.abs(this.body.velocity.x) > 12) p.anims.play(`${SHEET}:run`, true);
    else p.anims.play(`${SHEET}:idle`, true);
    p.setAlpha(this.bamba <= 0 && this.invulnerable > 0 && Math.floor(this.invulnerable * 12) % 2 ? 0.35 : 1);
  }

  showFrame(name: string): void {
    this.sprite.anims.stop();
    this.sprite.setTexture(SHEET, frameIndex(SHEET, name));
  }

  private stepBamba(dt: number): void {
    if (this.bamba <= 0) return;
    this.bamba = Math.max(0, this.bamba - dt);
    this.bambaHue = (this.bambaHue + dt * 2.5) % 1;
    const c = Phaser.Display.Color.HSVToRGB(this.bambaHue, 0.55, 1) as Phaser.Types.Display.ColorObject;
    if (this.bamba > 0) this.sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
    else this.sprite.clearTint();
  }

  // ---------- oxygen-mask vines ----------

  grab(vine: MaskVine): void {
    this.swing = vine;
    vine.attach(this.body.velocity.x);
    this.body.setAllowGravity(false);
    this.body.stop();
    this.world.sfx('thwop');
  }

  private stepSwing(dt: number, edges: ButtonEdges): boolean {
    const vine = this.swing!;
    const b = edges.current;
    const dir = (b.right ? 1 : 0) - (b.left ? 1 : 0);
    vine.pump(dir, dt);
    if (dir) this.sprite.setFlipX(dir < 0);
    // Hang by the hands: the mask sits at the top of the head.
    let hand = vine.end;
    // Swinging into an overhead bin (or any solid) stops the swing there instead of passing through it.
    if (this.world.solidAt(this.swingBox(hand))) {
      vine.collide();
      hand = vine.end;
    }
    this.placeAt(hand.x, hand.y + this.body.height + 4);
    this.animate(false);
    if (edges.pressed('jump') || edges.pressed('grab')) this.letGo(true);
    return false;
  }

  /** The body box Yaniv would have hanging from a mask end at `hand`. */
  private swingBox(hand: { x: number; y: number }) {
    const { width: w, height: h } = this.body;
    return { left: hand.x - w / 2, right: hand.x + w / 2, top: hand.y + 4, bottom: hand.y + 4 + h };
  }

  /** Release the vine, keeping the swing's momentum; a jump release adds an upward kick. */
  letGo(jump: boolean): void {
    const vine = this.swing;
    if (!vine) return;
    const v = vine.release();
    this.swing = null;
    this.releasedVine = vine;
    this.swingCooldown = 0.35;
    this.body.setAllowGravity(true);
    this.body.setVelocity(v.x, v.y - (jump ? 240 : 0));
    this.jumpCut = !jump;
    if (jump) this.world.sfx('jump');
  }

  /**
   * Move the feet to (x, y). Body.reset() would place the body at the sprite's top-left and ignore the
   * body offset, which can leave it overlapping the floor and falling through; resync from the sprite.
   */
  placeAt(x: number, y: number): void {
    const body = this.body;
    this.sprite.setPosition(x, y);
    body.updateFromGameObject();
    body.stop();
    body.prev.copy(body.position);
    body.prevFrame.copy(body.position);
  }
}
