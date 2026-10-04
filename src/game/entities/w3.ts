/**
 * World 3, DXB Airport: Duty-Free Bills (giant perfume bottles fired from display cannons) and Mr. Spritz, the
 * duty-free mascot, the fake boss at the end of 3-3. Runaway baggage carts reuse the Trolley (enemies.ts).
 */
import type Phaser from 'phaser';
import { frameIndex } from '../assets.ts';
import { ART_SCALE, RULES } from '../config.ts';
import { sizeBody, type Body, type GameWorld, type Sprite } from '../world.ts';
import { contact, knockOff, physicsSprite, type Enemy, type HitKind } from './enemies.ts';
import type { Player } from './player.ts';

export const BILL = {
  /** Flight speed (world units/s), straight and level. */
  speed: 150,
  /** Seconds between shots while Yaniv is in range. */
  every: 2.6,
  /** The cannon wakes up when Yaniv is this close (it only fires left, at him). */
  range: 420,
  /** The bottle flies at chest height: jump it, stomp it, or plunge it. */
  height: 30,
};

/**
 * A perfume cannon on a marble display stand. It fires a Duty-Free Bill to the left every few seconds while
 * Yaniv is in front of it (never at point blank: it holds fire when he is right at the muzzle).
 */
export class BillCannon {
  private timer = 1;
  private readonly s: Phaser.GameObjects.Sprite;

  constructor(
    private readonly world: GameWorld,
    readonly x: number,
    readonly y: number,
  ) {
    this.s = world.stage.add.sprite(x, y, 'w3.launcher', 0).setOrigin(0.5, 1).setScale(ART_SCALE * 1.6).setDepth(4); // a showpiece
  }

  step(dt: number, spawn: (e: Enemy) => void): void {
    const dx = this.x - this.world.player.x;
    if (dx < 40 || dx > BILL.range) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = BILL.every;
    spawn(new DutyFreeBill(this.world, this.x - 26, this.y - BILL.height));
    this.s.setFrame(frameIndex('w3.launcher', 'fire'));
    this.world.stage.time.delayedCall(220, () => this.s.setFrame(frameIndex('w3.launcher', 'idle')));
    this.world.sfx('thwop');
  }
}

/** Duty-Free Bill: a giant perfume bottle flying straight at Yaniv. Stomp it (it drops) or plunge it (pop!). */
export class DutyFreeBill implements Enemy {
  readonly kind = 'bill';
  live = true;
  private readonly s: Sprite;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
  ) {
    this.s = world.stage.physics.add.sprite(x, y, 'proj.bill', 0).setOrigin(0.5, 0.5).setScale(ART_SCALE).setDepth(8).play('proj.bill:fly');
    const body = this.s.body as Body;
    body.setAllowGravity(false).setVelocityX(-BILL.speed);
    body.setSize(26 / ART_SCALE, 14 / ART_SCALE);
  }

  get x() {
    return this.s.x;
  }
  get y() {
    return this.s.y + 8;
  }
  get vx() {
    return -BILL.speed;
  }

  step(): void {
    const view = this.world.stage.cameras.main.worldView;
    if (this.s.x < view.left - 80) this.destroy();
  }

  hitbox() {
    if (!this.live) return null;
    const b = this.s.body as Body;
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
  }

  touch(player: Player, jumpHeld: boolean): void {
    contact(this.world, player, jumpHeld, (this.s.body as Body).top, this.s.x, () => this.drop(true));
  }

  hit(): boolean {
    if (!this.live) return false;
    this.drop(true);
    return true;
  }

  /** Stomped: it drops out of the air. Plunged: it pops in a pink puff. */
  private drop(pop: boolean): void {
    if (!this.live) return;
    this.live = false;
    this.world.addScore(RULES.stompScore, this.s.x, this.s.y - 20);
    this.world.sfx('stomp');
    const body = this.s.body as Body;
    body.setAllowGravity(true);
    if (pop) {
      this.s.anims.stop();
      this.world.stage.tweens.add({ targets: this.s, scale: ART_SCALE * 1.8, alpha: 0, duration: 260, onComplete: () => this.destroy() });
      body.setVelocity(0, 0).setAllowGravity(false);
    } else knockOff(this.world, this.s, -1);
  }

  destroy(): void {
    this.live = false;
    if (this.s.active) this.s.destroy();
  }
}

/** A puff of perfume from Mr. Spritz's atomizer: drifts forward, slows and fades. Touching it hurts. */
export class PerfumeCloud implements Enemy {
  readonly kind = 'perfume';
  live = true;
  private life = 1.5;
  private readonly s: Sprite;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
    private dir: number,
  ) {
    this.s = world.stage.physics.add.sprite(x, y, 'proj.perfume', 0).setOrigin(0.5, 0.5).setScale(ART_SCALE).setDepth(9).play('proj.perfume:puff');
    const body = this.s.body as Body;
    body.setAllowGravity(false).setVelocityX(dir * 120).setDrag(90, 0);
    body.setSize(26 / ART_SCALE, 18 / ART_SCALE);
    this.s.setFlipX(dir > 0);
  }

  get x() {
    return this.s.x;
  }
  get y() {
    return this.s.y + 10;
  }
  get vx() {
    return (this.s.body as Body).velocity.x;
  }

  step(dt: number): void {
    this.life -= dt;
    if (this.life < 0.4) this.s.setAlpha(Math.max(0, this.life / 0.4));
    if (this.life <= 0) this.destroy();
  }

  hitbox() {
    if (!this.live || this.life < 0.25) return null;
    const b = this.s.body as Body;
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
  }

  touch(): void {
    this.world.hurtPlayer(this.s.x - this.dir * 10, 'perfume');
  }

  /** A plunger swat clears the air. */
  hit(): boolean {
    if (!this.live) return false;
    this.destroy();
    return true;
  }

  destroy(): void {
    this.live = false;
    if (this.s.active) this.s.destroy();
  }
}

export const MASCOT = {
  hp: 3,
  /** Walking speed (world units/s); each hit makes him a little faster. */
  speed: 46,
  speedUp: 14,
  /** He stays within this distance of where he started: his duty-free stage, up to the gate he guards. */
  roam: 340,
  /** Seconds between sprays, the wind-up before one (he leans in, bottle glowing), and his reach. */
  sprayEvery: 3.2,
  windup: 0.55,
  sprayRange: 150,
  /** Invulnerable after a hit. */
  stunned: 1.1,
};

type MascotState = 'walk' | 'wind' | 'spray' | 'hurt' | 'done';

/**
 * Mr. Spritz, the duty-free mascot (3-3's fake boss): a man in a giant perfume-bottle costume. He waddles after
 * Yaniv and sprays perfume clouds; stomp his cap 3 times. A plunger only stuns him for a moment. Beaten, his
 * costume head pops off: just a tired intern. ("Thank you Yaniv! But the cockpit is in another cabin!")
 */
export class Mascot implements Enemy {
  readonly kind = 'mascot';
  live = true;
  hp = MASCOT.hp;
  state: MascotState = 'walk';
  private timer = 0;
  private sprayTimer = 2;
  private facing = -1;
  private readonly home: number;
  private readonly s: Sprite;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
    private readonly spawn: (e: Enemy) => void,
    private readonly onDefeated: () => void,
  ) {
    this.home = x;
    this.s = physicsSprite(world, x, y, 'boss.mascot');
    sizeBody(this.s, 40, 60); // a little under his cap: a running jump (apex ~76) clears it with room to stomp
    this.s.play('boss.mascot:walk');
  }

  get x() {
    return this.s.x;
  }
  get y() {
    return this.s.y;
  }
  get vx() {
    return (this.s.body as Body).velocity.x;
  }

  /** Active once Yaniv comes near his stage. */
  private get awake(): boolean {
    return Math.abs(this.world.player.x - this.s.x) < 360;
  }

  step(dt: number): void {
    if (this.state === 'done') return;
    const body = this.s.body as Body;
    const p = this.world.player;
    this.timer -= dt;
    if (this.state === 'hurt') {
      body.setVelocityX(0);
      if (this.timer <= 0) this.toWalk();
      return;
    }
    if (this.state === 'wind') {
      body.setVelocityX(0);
      this.s.setTint(Math.floor(this.timer * 14) % 2 ? 0xff4fa8 : 0xffffff);
      if (this.timer <= 0) {
        this.state = 'spray';
        this.timer = 0.45;
        this.s.setFrame(frameIndex('boss.mascot', 'spray')).clearTint();
        this.spawn(new PerfumeCloud(this.world, this.s.x + this.facing * 38, this.s.y - 40, this.facing));
        this.world.sfx('thwop');
      }
      return;
    }
    if (this.state === 'spray') {
      if (this.timer <= 0) this.toWalk();
      return;
    }
    // Walk: waddle toward Yaniv (within his stage), spray when he is in reach.
    if (!this.awake) {
      body.setVelocityX(0);
      return;
    }
    const dx = p.x - this.s.x;
    this.facing = Math.sign(dx) || this.facing;
    const speed = MASCOT.speed + (MASCOT.hp - this.hp) * MASCOT.speedUp;
    const inStage = Math.abs(this.s.x + this.facing * 8 - this.home) < MASCOT.roam;
    body.setVelocityX(inStage && Math.abs(dx) > 24 ? this.facing * speed : 0);
    this.s.setFlipX(this.facing > 0); // the sheet faces left
    this.sprayTimer -= dt;
    if (this.sprayTimer <= 0 && Math.abs(dx) < MASCOT.sprayRange && this.world.player.grounded) {
      this.sprayTimer = MASCOT.sprayEvery - (MASCOT.hp - this.hp) * 0.4;
      this.state = 'wind';
      this.timer = MASCOT.windup;
      // The tell (unlike the spray frame, which already shows the puff): he stops and flashes hot pink
      // (blinking in step(); a scale tween would resize his hitbox mid-fight).
      this.s.anims.stop();
      this.s.setFrame(frameIndex('boss.mascot', 'walk0'));
      this.world.popText?.(this.s.x, this.s.y - 96, 'SPRITZ?');
    }
  }

  private toWalk(): void {
    // Never straight from a stun into a spray: a moment to get clear.
    if (this.state === 'hurt') this.sprayTimer = Math.max(this.sprayTimer, 0.9);
    this.state = 'walk';
    this.s.clearTint().play('boss.mascot:walk', true);
  }

  hitbox() {
    if (!this.live || this.state === 'done') return null;
    const b = this.s.body as Body;
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
  }

  touch(player: Player, jumpHeld: boolean): void {
    if (this.state === 'hurt') return; // stunned: harmless (and no double stomps)
    contact(this.world, player, jumpHeld, (this.s.body as Body).top, this.s.x, () => this.stomped());
  }

  hit(how: HitKind): boolean {
    if (!this.live || this.state === 'hurt' || this.state === 'done') return false;
    // A kicked suitcase shell or a Bamba Rush counts like a stomp.
    if (how === 'shell' || how === 'bamba') {
      this.stomped();
      return true;
    }
    // A plunger to the face: stunned for a moment, but no damage (stomp his cap!).
    this.stun(0.6);
    this.world.popText?.(this.s.x, this.s.y - 96, 'HEY!');
    return true;
  }

  private stomped(): void {
    if (this.state === 'hurt' || this.state === 'done') return;
    this.hp--;
    this.world.sfx('stomp');
    this.world.addScore(500, this.s.x, this.s.y - 90);
    if (this.hp <= 0) return this.defeat();
    this.stun(MASCOT.stunned);
    this.world.popText?.(this.s.x, this.s.y - 100, this.hp === 2 ? 'NO SAMPLES FOR YOU!' : 'LAST CHANCE: 2 FOR 1!');
  }

  private stun(seconds: number): void {
    this.state = 'hurt';
    this.timer = seconds;
    this.s.anims.stop();
    this.s.setFrame(frameIndex('boss.mascot', 'hurt')).clearTint();
    this.world.stage.cameras.main.shake(120, 0.004);
  }

  private defeat(): void {
    this.state = 'done';
    this.live = false;
    const body = this.s.body as Body;
    body.setVelocityX(0);
    this.s.anims.stop();
    this.s.setFrame(frameIndex('boss.mascot', 'defeated')).clearTint();
    this.world.sfx('powerup');
    this.world.addScore(2000, this.s.x, this.s.y - 110);
    this.world.popText?.(this.s.x, this.s.y - 100, "I'M JUST THE INTERN!");
    this.onDefeated();
  }

  destroy(): void {
    this.live = false;
    if (this.s.active) this.s.destroy();
  }
}
