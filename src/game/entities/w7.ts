/**
 * World 7, The White House: the Reflecting Pool's clogged drains, Reporters and Paparazzi.
 */
import Phaser from 'phaser';
import { frameIndex } from '../assets.ts';
import { ART_SCALE, PHYS, RULES } from '../config.ts';
import { overlaps, sizeBody, type Body, type GameWorld, type Sprite } from '../world.ts';
import { Bubble, Walker } from './boss.ts';
import { contact, physicsSprite, type Enemy } from './enemies.ts';
import type { Player } from './player.ts';

/** Plunger pushes needed to clear one drain. */
export const DRAIN_PLUNGES = 3;

/** An Algae Blob: oozes out of a clogged drain and patrols its stretch of walkway. */
export const algaeBlob = (world: GameWorld, x: number, y: number) => new Walker(world, x, y, 'algae', 'enemy.algae', 28, true);

/**
 * A clogged drain at the Reflecting Pool's edge (7-1's objective). It spits Algae Blobs while Yaniv is near;
 * plunge it a few times and it runs clear.
 */
export class Drain {
  clogged = true;
  plunges = 0;
  private spawnTimer = 1.2;
  private readonly s: Phaser.GameObjects.Sprite;

  constructor(
    private readonly world: GameWorld,
    readonly x: number,
    readonly y: number,
  ) {
    this.s = world.stage.add.sprite(x, y, 'prop.drain', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(3);
  }

  get box() {
    return { left: this.x - 16, right: this.x + 16, top: this.y - 32, bottom: this.y };
  }

  /** Called every step; `spawn` adds a new blob (the scene caps how many are alive). */
  step(dt: number, canSpawn: boolean, spawn: (e: Enemy) => void): void {
    if (!this.clogged || Math.abs(this.world.player.x - this.x) > 340) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || !canSpawn) return;
    this.spawnTimer = 3.2;
    spawn(algaeBlob(this.world, this.x - 4, this.y - 6));
    this.world.stage.tweens.add({ targets: this.s, scaleY: ART_SCALE * 1.15, duration: 90, yoyo: true });
    this.world.sfx('bump');
  }

  /** A plunger push. Returns true when this push cleared it. */
  plunge(): boolean {
    if (!this.clogged) return false;
    this.plunges++;
    this.world.sfx('thwop');
    this.world.stage.tweens.add({ targets: this.s, x: this.x + 2, duration: 40, yoyo: true, repeat: 2 });
    if (this.plunges < DRAIN_PLUNGES) return false;
    this.clogged = false;
    this.s.setFrame(frameIndex('prop.drain', 'clear'));
    this.world.sfx('splash');
    return true;
  }
}

type ReporterState = 'walk' | 'wind' | 'swing' | 'cool';

/**
 * Reporter: walks up to Yaniv, winds up and thrusts a boom mic at head height ("Yaniv! One question!"), and
 * from further away lobs question bubbles. Stomp him or plunge the mic: he sits down ("NO COMMENT!").
 */
export class Reporter implements Enemy {
  readonly kind = 'reporter';
  live = true;
  private dir = -1;
  private state: ReporterState = 'walk';
  private t = 0;
  private askTimer: number;
  private readonly s: Sprite;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
    private readonly spawn: (e: Enemy) => void,
  ) {
    this.s = physicsSprite(world, x, y, 'enemy.reporter').play('enemy.reporter:walk');
    sizeBody(this.s, 22, 50).setMaxVelocity(120, PHYS.maxFall);
    this.askTimer = 1 + (x % 7) / 7;
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

  /** The boom mic's reach while it is thrust out (world units). */
  get mic() {
    const [a, b] = this.dir < 0 ? [this.s.x - 66, this.s.x - 14] : [this.s.x + 14, this.s.x + 66];
    return { left: a, right: b, top: this.s.y - 58, bottom: this.s.y - 40 };
  }

  step(dt: number): void {
    if (!this.live) return;
    const p = this.world.player;
    const body = this.s.body as Body;
    const dx = p.x - this.s.x;
    this.t += dt;
    switch (this.state) {
      case 'walk': {
        if (Math.abs(dx) < 320) this.dir = dx < 0 ? -1 : 1;
        const ahead = this.s.x + this.dir * 14;
        const canWalk = !body.blocked.down || this.world.standableAt(ahead, this.s.y);
        body.setVelocityX(canWalk ? this.dir * 30 : 0);
        this.s.setFlipX(this.dir > 0);
        if (!this.s.anims.isPlaying) this.s.play('enemy.reporter:walk');
        // "One question!": a bubble from a distance.
        this.askTimer -= dt;
        if (this.askTimer <= 0 && Math.abs(dx) > 110 && Math.abs(dx) < 290) {
          this.askTimer = 2.8;
          this.spawn(new Bubble(this.world, this.s.x + this.dir * 20, this.s.y - 40, this.dir * 120, 300, 'question', 'proj.question'));
        }
        if (Math.abs(dx) < 84 && Math.abs(p.y - this.s.y) < 30) this.setState('wind');
        break;
      }
      case 'wind':
        body.setVelocityX(0);
        this.s.x += Math.sin(this.t * 60) * 0.4; // a little lean-in wobble: the tell
        if (this.t >= 0.4) {
          this.setState('swing');
          this.s.anims.stop();
          this.s.setFrame(frameIndex('enemy.reporter', 'swing'));
          this.world.sfx('thwop');
        }
        break;
      case 'swing':
        if (overlaps(p.body, this.mic)) this.world.hurtPlayer(this.s.x, 'mic');
        if (this.t >= 0.5) {
          this.setState('cool');
          this.s.setFrame(frameIndex('enemy.reporter', 'walk0'));
        }
        break;
      case 'cool':
        body.setVelocityX(0);
        if (this.t >= 1.1) this.setState('walk');
        break;
    }
    if (this.s.y > this.world.level.height + 100) this.destroy();
  }

  private setState(state: ReporterState): void {
    this.state = state;
    this.t = 0;
  }

  hitbox() {
    return this.live ? { left: (this.s.body as Body).left, right: (this.s.body as Body).right, top: (this.s.body as Body).top, bottom: (this.s.body as Body).bottom } : null;
  }

  touch(player: Player, jumpHeld: boolean): void {
    contact(this.world, player, jumpHeld, (this.s.body as Body).top, this.s.x, () => this.sit());
  }

  hit(): boolean {
    if (!this.live) return false;
    this.sit();
    return true;
  }

  /** Out of the scrum: sits down for good, harmless. */
  private sit(): void {
    if (!this.live) return;
    this.live = false;
    this.s.anims.stop();
    this.s.setFrame(frameIndex('enemy.reporter', 'sit'));
    (this.s.body as Body).setVelocityX(0);
    this.world.addScore(RULES.stompScore, this.s.x, this.s.y - 60);
    this.world.popText?.(this.s.x, this.s.y - 76, 'NO COMMENT!');
    this.world.sfx('stomp');
  }

  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}

type FlashState = 'idle' | 'aim' | 'flash';

/**
 * Paparazzo: stands behind the velvet rope and fires his flash: the screen whites out for a moment, and
 * up close it dazzles Yaniv. The bulb glows first (the tell). He can't be hurt: just get past.
 */
export class Paparazzo implements Enemy {
  readonly kind = 'paparazzi';
  live = true;
  readonly vx = 0;
  private state: FlashState = 'idle';
  private t: number;
  private readonly s: Phaser.GameObjects.Sprite;

  constructor(
    private readonly world: GameWorld,
    readonly x: number,
    readonly y: number,
  ) {
    // Behind the rope line: drawn under Yaniv and the walkway's front edge.
    this.s = world.stage.add.sprite(x, y - 6, 'enemy.paparazzi', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(2);
    this.t = (x / 16) % 1.5; // stagger the row
  }

  step(dt: number): void {
    const p = this.world.player;
    const dx = Math.abs(p.x - this.x);
    if (dx > 420) return;
    this.t += dt;
    const next = (state: FlashState, frame: string) => {
      this.state = state;
      this.t = 0;
      this.s.setFrame(frameIndex('enemy.paparazzi', frame));
    };
    if (this.state === 'idle' && this.t >= 2.2) {
      next('aim', 'aim');
      this.world.stage.tweens.add({ targets: this.s, scaleX: ART_SCALE * 1.04, scaleY: ART_SCALE * 1.04, duration: 120, yoyo: true, repeat: 2 });
    } else if (this.state === 'aim' && this.t >= 0.7) {
      next('flash', 'flash');
      this.world.sfx('flash');
      if (dx < 260) this.world.flashScreen?.();
      if (dx < 70) p.controlLock = Math.max(p.controlLock, 0.4); // dazzled
    } else if (this.state === 'flash' && this.t >= 0.3) {
      next('idle', 'idle');
    }
  }

  hitbox() {
    return null;
  }
  touch(): void {}
  hit(): boolean {
    return false;
  }
  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}
