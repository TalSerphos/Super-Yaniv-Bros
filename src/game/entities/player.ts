import Phaser from 'phaser';
import { frameIndex } from '../assets.ts';
import { ART_SCALE, PHYS } from '../config.ts';
import type { Power } from '../systems/progress.ts';
import type { ButtonEdges } from '../systems/input.ts';
import { SKID_COOLDOWN, landingDust, skidding } from '../systems/fx.ts';
import { degToRad } from '../systems/tilt.ts';
import { sizeBody, type Body, type GameWorld, type Sprite } from '../world.ts';
import type { MaskVine } from './masks.ts';

/** Body sizes in world units for each power state. */
const BODY = { small: { w: 20, h: 50 }, big: { w: 24, h: 62 } };
/** Big/Golden Yaniv is the same art drawn larger (matches the concept art's proportions). */
const BIG_SCALE = 1.25;
export const BAMBA_SECONDS = 8;
const SHEET = 'yaniv.small';
/** Skid and pole-slide frames (64 wide, so drawn by a visual-only twin sprite). */
const EXTRA = 'yaniv.extra';
const EXTRA_FRAMES = ['skid', 'pole'];
/** Sliding down the goal pole (world units/s), and the hands' offset from the pole. */
const POLE_SLIDE_SPEED = 150;
const POLE_GRIP = 10;
/** The skid frame shows at least this long (the brake itself takes ~3 physics steps). */
const SKID_SHOW = 0.16;

/**
 * Yaniv: movement (run, variable jump, coyote time, jump buffer), power states (small / big / golden),
 * Bamba Rush, invulnerability after hits, and hanging from oxygen-mask vines.
 */
/** Offsets checked for solid ground before a spot counts as a safe respawn point. */
const SAFE_PROBES = [-64, -48, -32, -16, 0, 16, 32, 48, 64];

export class Player {
  readonly sprite: Sprite;
  power: Power = 'small';
  /** Seconds of Bamba Rush left (invincible, faster). */
  bamba = 0;
  invulnerable = 0;
  hurtTimer = 0;
  /** Seconds of ignored movement input (after a respawn). */
  controlLock = 0;
  /** Speed of the surface under the feet (World 3 belts and travelators), set by the scene every step. */
  carry = 0;
  /**
   * After a pit respawn, a direction still held from before the fall is ignored until it is let go (holding ▶
   * through the respawn ran Yaniv straight back into the same pit, over and over).
   */
  heldThroughRespawn = false;
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
  /** For landing dust and skid puffs: the last step's ground contact and fall speed, and a puff cooldown. */
  private wasGrounded = true;
  private fallSpeed = 0;
  private skidCooldown = 0;
  /** Braking against a run (shows the skid frame). */
  private skid = false;
  /** Sliding down the goal pole (flagpole style) until the feet touch the ground. */
  poleSlide: { x: number; base: number } | null = null;
  /** Seconds the skid frame stays up (the brake itself lasts only a few steps). */
  private skidShow = 0;
  /**
   * Skid and pole-slide poses are drawn by this visual-only twin (their frames are wider): the physics
   * sprite keeps its texture, size and body, and is only hidden meanwhile.
   */
  private readonly extra: Phaser.GameObjects.Sprite;

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
    this.extra = scene.add.sprite(x, y, EXTRA, 0).setOrigin(0.5, 1).setDepth(10).setVisible(false);
    // Follow the physics sprite after the physics step has moved it (no one-step lag).
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncExtra, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncExtra, this));
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
    this.world.fx('poof', this.x, this.y);
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
      this.hideExtra();
      body.setVelocityX(0);
      this.sprite.anims.stop();
      this.sprite.setTexture('yaniv.action', frameIndex('yaniv.action', this.pose));
      return false;
    }
    if (this.swing) return this.stepSwing(dt, edges);
    if (this.poleSlide) return this.stepPoleSlide();

    const grounded = this.grounded;
    if (grounded) this.releasedVine = null;
    this.coyote = grounded ? PHYS.coyoteTime : Math.max(0, this.coyote - dt);
    this.jumpBuffer = edges.pressed('jump') ? PHYS.jumpBuffer : Math.max(0, this.jumpBuffer - dt);

    if (this.heldThroughRespawn && !b.left && !b.right) this.heldThroughRespawn = false;
    const dir = this.controlLock > 0 || this.heldThroughRespawn ? 0 : (b.right ? 1 : 0) - (b.left ? 1 : 0);
    // Running downhill (toward the cockpit) is a little faster, uphill a little slower. Bamba: faster still.
    const slope = Math.sin(degToRad(this.world.tiltDeg));
    const speed = PHYS.runSpeed * (this.bamba > 0 ? 1.35 : 1);
    // On a belt the ground itself moves: Yaniv's running speed adds to it (he keeps the momentum in the air).
    const carry = grounded && this.controlLock <= 0 ? this.carry : 0;
    const target = dir * speed * (1 + 0.6 * slope * dir) + carry;
    const accel = (grounded ? PHYS.groundAccel : PHYS.airAccel) * dt;
    if (this.hurtTimer <= 0.9) body.setVelocityX(body.velocity.x + Phaser.Math.Clamp(target - body.velocity.x, -accel, accel));
    // Standing still on the slope: no creeping (the slope is felt while moving, not while idle).
    if (grounded && !dir && Math.abs(body.velocity.x - carry) < 6) body.setVelocityX(carry);

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
    this.skid = skidding(grounded, dir, body.velocity.x - this.carry);
    this.skidShow = this.skid ? SKID_SHOW : grounded && dir ? Math.max(0, this.skidShow - dt) : 0;
    this.animate(grounded);
    this.stepDust(grounded, dir, dt);

    // A safe respawn point has solid ground well to both sides (at least 64 units from any edge), and it
    // stands still (a travelator would carry a freshly respawned Yaniv straight back into the gap).
    // (Sampled every 16 units: two far points alone would let a hatch between them pass as solid.)
    const safe = this.carry === 0 && SAFE_PROBES.every((dx) => this.world.standableAt(this.x + dx, this.y));
    if (grounded && body.blocked.down && safe) {
      this.lastSafe = { x: this.x, y: this.y };
    }
    const fire = edges.pressed('grab') && this.plungeCooldown <= 0;
    if (fire) this.plungeCooldown = 0.25;
    return fire;
  }

  /** Classic dust: a puff on a hard landing, and skid puffs when reversing at a run. */
  private stepDust(grounded: boolean, dir: number, dt: number): void {
    this.skidCooldown = Math.max(0, this.skidCooldown - dt);
    if (grounded && !this.wasGrounded && landingDust(this.fallSpeed)) this.world.fx('dust', this.x, this.y);
    if (this.skidCooldown <= 0 && this.skid) {
      this.world.fx('skid', this.x - Math.sign(dir) * 6, this.y, dir < 0);
      this.skidCooldown = SKID_COOLDOWN;
    }
    // (velocity.y is already 0 on the touchdown step, so remember the speed from the airborne steps)
    this.fallSpeed = grounded ? 0 : Math.max(0, this.body.velocity.y);
    this.wasGrounded = grounded;
  }

  /** Grab the goal pole in the air: hands on the bar, slide straight down at a steady speed. */
  startPoleSlide(poleX: number, base: number): void {
    const side = this.x <= poleX ? -1 : 1; // which side of the pole he hangs on
    this.poleSlide = { x: poleX, base };
    this.sprite.setFlipX(side > 0);
    this.sprite.setPosition(poleX + side * POLE_GRIP, this.y);
    // (prev too, as in placeAt: otherwise the next physics step applies the jump to the hands a second time)
    this.body.updateFromGameObject();
    this.body.prev.copy(this.body.position);
    this.body.prevFrame.copy(this.body.position);
    this.body.setAllowGravity(false);
    this.body.setVelocity(0, POLE_SLIDE_SPEED);
  }

  private stepPoleSlide(): boolean {
    const body = this.body;
    // (A real landing or the pole's foot: `touching` is also set by overlaps, e.g. a nut beside the pole.)
    if (body.blocked.down || this.y >= this.poleSlide!.base - 0.5 || this.hurtTimer > 0) {
      this.poleSlide = null;
      body.setAllowGravity(true);
      this.controlLock = Math.max(this.controlLock, 0.2);
      this.wasGrounded = true;
      this.animate(this.grounded);
      return false;
    }
    body.setVelocity(0, POLE_SLIDE_SPEED);
    this.showExtra('pole', this.sprite.flipX);
    return false;
  }

  /** Show a frame of the extra sheet (skid, pole) on the twin; the physics sprite hides meanwhile. */
  private showExtra(name: string, flip: boolean): void {
    this.extra.setFrame(frameIndex(EXTRA, name)).setFlipX(flip).setVisible(true);
    this.sprite.setVisible(false);
  }

  private hideExtra(): void {
    if (!this.extra.visible) return;
    this.extra.setVisible(false);
    this.sprite.setVisible(true);
  }

  /** Which extra pose is up, if any (test hook). */
  get extraPose(): string | null {
    return this.extra.visible ? EXTRA_FRAMES[Number(this.extra.frame.name)] : null;
  }

  private syncExtra(): void {
    const p = this.sprite;
    this.extra.setPosition(p.x, p.y).setScale(p.scaleX).setAlpha(p.alpha).setTint(p.tintTopLeft);
    if (!p.isTinted) this.extra.clearTint();
  }

  private animate(grounded: boolean): void {
    const p = this.sprite;
    this.hideExtra();
    if (this.hurtTimer > 0) this.showFrame('hurt');
    else if (this.poleSlide) this.showExtra('pole', p.flipX);
    else if (this.swing) this.showFrame('jump');
    else if (!grounded) this.showFrame(this.body.velocity.y < 0 ? 'jump' : 'fall');
    // The brake faces the way he is still sliding, leaning back against it (then he turns around).
    else if (this.skidShow > 0) this.showExtra('skid', this.body.velocity.x - this.carry < 0);
    else if (Math.abs(this.body.velocity.x - this.carry) > 12) p.anims.play(`${SHEET}:run`, true); // (riding a belt is standing)
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
    if (this.poleSlide) {
      this.poleSlide = null;
      body.setAllowGravity(true);
    }
    this.sprite.setPosition(x, y);
    body.updateFromGameObject();
    body.stop();
    body.prev.copy(body.position);
    body.prevFrame.copy(body.position);
  }
}
