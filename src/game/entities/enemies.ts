import Phaser from 'phaser';
import { frameIndex } from '../assets.ts';
import { ART_SCALE, PHYS, RULES } from '../config.ts';
import { SEAT } from '../levels/loader.ts';
import { overlaps, sizeBody, type Body, type GameWorld, type Sprite } from '../world.ts';
import type { Player } from './player.ts';

export type HitKind = 'plunger' | 'projectile' | 'bamba' | 'shell';

/** Every hazard implements this; the scene steps them and routes player contact and hits to them. */
export interface Enemy {
  readonly kind: string;
  /** False once defeated/finished: no longer touched, hit or stepped. */
  live: boolean;
  /** Where it is, for plunger reach, bot and tests. */
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  step(dt: number): void;
  /** Hitbox in world units, or null when it currently can't touch anything. */
  hitbox(): { left: number; right: number; top: number; bottom: number } | null;
  /** The player's body overlaps the hitbox. */
  touch(player: Player, jumpHeld: boolean): void;
  /** Returns true if the hit did something (so a thrown plunger is used up). */
  hit(how: HitKind): boolean;
  destroy(): void;
}

const bodyBox = (b: Body) => ({ left: b.left, right: b.right, top: b.top, bottom: b.bottom });

/** Shared stomp/hurt contact rule for walking enemies. */
function contact(world: GameWorld, player: Player, jumpHeld: boolean, top: number, fromX: number, onStomp: () => void): void {
  if (player.bamba > 0) return onStomp();
  if (player.canStomp(top)) {
    onStomp();
    player.bounce(jumpHeld);
  } else world.hurtPlayer(fromX, 'enemy');
}

function physicsSprite(world: GameWorld, x: number, y: number, key: string): Sprite {
  const s = world.stage.physics.add.sprite(x, y, key, 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(8);
  world.stage.physics.add.collider(s, world.terrain);
  return s;
}

function knockOff(world: GameWorld, sprite: Phaser.GameObjects.Sprite, dir: number): void {
  const body = sprite.body as Body | null;
  if (body) body.checkCollision.none = true;
  sprite.setFlipY(true);
  if (body) body.setVelocity(dir * 80, -200);
  world.stage.tweens.add({ targets: sprite, alpha: 0, delay: 500, duration: 300, onComplete: () => sprite.destroy() });
}

// ---------------------------------------------------------------------------------------------------------
/** Trolley Troll: rolls downhill from behind, gathering speed. Stomp or plunge it flat. */
export class Trolley implements Enemy {
  readonly kind = 'trolley';
  live = true;
  private readonly s: Sprite;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
  ) {
    this.s = physicsSprite(world, x, y, 'enemy.trolley').play('enemy.trolley:roll');
    const body = sizeBody(this.s, 52, 42);
    body.setMaxVelocity(PHYS.trolleyMaxSpeed, PHYS.maxFall).setVelocityX(80).setFriction(0, 0);
    world.sfx('warn');
    world.warn();
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

  step(): void {
    const view = this.world.stage.cameras.main.worldView;
    if (this.s.x > view.right + 640 || this.s.y > this.world.level.height + 200) this.destroy();
  }

  hitbox() {
    return this.live ? bodyBox(this.s.body as Body) : null;
  }

  touch(player: Player, jumpHeld: boolean): void {
    contact(this.world, player, jumpHeld, (this.s.body as Body).top, this.s.x, () => this.flatten());
  }

  hit(): boolean {
    this.flatten();
    return true;
  }

  private flatten(): void {
    if (!this.live) return;
    this.live = false;
    this.s.anims.stop();
    this.s.setFrame(frameIndex('enemy.trolley', 'flat'));
    const body = this.s.body as Body;
    body.setVelocity(0, 0).setAllowGravity(false);
    body.checkCollision.none = true;
    this.world.addScore(RULES.stompScore, this.s.x, this.s.y - 30);
    this.world.sfx('stomp');
    this.world.stage.tweens.add({ targets: this.s, alpha: 0, delay: 600, duration: 400, onComplete: () => this.destroy() });
  }

  /** Level exit: freeze and fade. */
  freeze(): void {
    this.live = false;
    (this.s.body as Body | null)?.setVelocity(0, 0).setAllowGravity(false);
    this.world.stage.tweens.add({ targets: this.s, alpha: 0, duration: 300 });
  }

  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}

// ---------------------------------------------------------------------------------------------------------
type SuitcaseState = 'walk' | 'shell' | 'spin';

/**
 * Suitcase Shell: waddles back and forth; stomp it and it snaps shut; touch the shut case to kick it
 * spinning down the sloped aisle, where it ricochets off walls and bowls over other enemies.
 */
export class Suitcase implements Enemy {
  readonly kind = 'suitcase';
  live = true;
  state: SuitcaseState = 'walk';
  private dir = -1;
  /** After a kick the case can't hurt the kicker for a moment. */
  private kickGrace = 0;
  private shellTimer = 0;
  private readonly s: Sprite;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
    private readonly others: () => Enemy[],
  ) {
    this.s = physicsSprite(world, x, y, 'enemy.suitcase').play('enemy.suitcase:walk');
    sizeBody(this.s, 26, 26).setMaxVelocity(340, PHYS.maxFall);
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

  step(dt: number): void {
    if (!this.live) return;
    const body = this.s.body as Body;
    this.kickGrace = Math.max(0, this.kickGrace - dt);
    if (this.state === 'walk') {
      // Turn at walls and ledges; the slope still nudges it (it feels gravity).
      const ahead = this.s.x + this.dir * 16;
      if (body.blocked.left || body.blocked.right || (body.blocked.down && !this.world.standableAt(ahead, this.s.y))) this.dir *= -1;
      body.setVelocityX(this.dir * 36);
      this.s.setFlipX(this.dir > 0);
    } else if (this.state === 'shell') {
      body.setVelocityX(body.velocity.x * 0.9);
      this.shellTimer += dt;
      if (this.shellTimer > 6) this.setState('walk'); // pops back open after a while
    } else {
      if (body.blocked.left) body.setVelocityX(Math.abs(body.velocity.x) || 260);
      if (body.blocked.right) body.setVelocityX(-(Math.abs(body.velocity.x) || 260));
      if (Math.abs(body.velocity.x) < 180) body.setVelocityX(Math.sign(body.velocity.x || 1) * 180);
      for (const e of this.others()) {
        if (e === this || !e.live) continue;
        const box = e.hitbox();
        if (box && overlaps(bodyBox(body), box) && e.hit('shell')) this.world.addScore(RULES.stompScore, e.x, e.y - 30);
      }
    }
    if (this.s.y > this.world.level.height + 100) this.destroy();
  }

  private setState(state: SuitcaseState): void {
    this.state = state;
    this.shellTimer = 0;
    if (state === 'walk') this.s.play('enemy.suitcase:walk');
    else {
      this.s.anims.stop();
      this.s.setFrame(frameIndex('enemy.suitcase', state === 'shell' ? 'shell' : 'spin'));
    }
  }

  hitbox() {
    return this.live ? bodyBox(this.s.body as Body) : null;
  }

  touch(player: Player, jumpHeld: boolean): void {
    const body = this.s.body as Body;
    if (player.bamba > 0) return void this.hit('bamba');
    if (this.state === 'shell') {
      if (player.canStomp(body.top)) {
        player.bounce(jumpHeld);
        return this.kick(player.x < this.s.x ? 1 : -1);
      }
      return this.kick(player.x < this.s.x ? 1 : -1);
    }
    if (this.state === 'spin' && this.kickGrace > 0) return;
    if (player.canStomp(body.top)) {
      player.bounce(jumpHeld);
      this.world.sfx('stomp');
      this.world.addScore(RULES.stompScore, this.s.x, this.s.y - 24);
      this.setState('shell');
      body.setVelocityX(0);
    } else this.world.hurtPlayer(this.s.x, 'suitcase');
  }

  private kick(dir: number): void {
    this.setState('spin');
    this.kickGrace = 0.3;
    (this.s.body as Body).setVelocityX(dir * 280);
    this.world.sfx('bump');
  }

  hit(how: HitKind): boolean {
    if (!this.live) return false;
    if (how === 'plunger' && this.state === 'walk') {
      this.setState('shell');
      (this.s.body as Body).setVelocityX(0);
      this.world.sfx('stomp');
      return true;
    }
    this.live = false;
    this.world.sfx('stomp');
    this.world.addScore(RULES.stompScore, this.s.x, this.s.y - 24);
    knockOff(this.world, this.s, this.s.x > this.world.player.x ? 1 : -1);
    return true;
  }

  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}

// ---------------------------------------------------------------------------------------------------------
/** A pacifier lobbed by a Baby Bomber: hurts on contact, bounces once and fades. */
class Pacifier implements Enemy {
  readonly kind = 'pacifier';
  live = true;
  private bounced = false;
  private readonly s: Sprite;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ) {
    this.s = world.stage.physics.add.sprite(x, y, 'proj.pacifier', 0).setScale(ART_SCALE).setDepth(9).play('proj.pacifier:spin');
    (this.s.body as Body).setSize(16, 16).setVelocity(vx, vy).setBounce(0.4);
    world.stage.physics.add.collider(this.s, world.terrain, () => this.land());
  }

  get x() {
    return this.s.x;
  }
  get y() {
    return this.s.y;
  }
  get vx() {
    return (this.s.body as Body)?.velocity.x ?? 0;
  }

  private land(): void {
    if (this.bounced) return;
    this.bounced = true;
    this.live = false;
    this.world.stage.tweens.add({ targets: this.s, alpha: 0, delay: 300, duration: 300, onComplete: () => this.destroy() });
  }

  step(): void {
    if (this.s.y > this.world.level.height + 100) this.destroy();
  }

  hitbox() {
    return this.live ? bodyBox(this.s.body as Body) : null;
  }

  touch(player: Player): void {
    if (player.bamba > 0) return void this.hit();
    this.world.hurtPlayer(this.s.x, 'pacifier');
    this.land();
  }

  hit(): boolean {
    this.land();
    return true;
  }

  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}

/**
 * Baby Bomber: a crying baby on a parent's lap in an aisle seat, lobbing pacifiers at Yaniv. Not stompable
 * (the seatback is a platform like any seat); a plunger or Bamba calms the baby down for good.
 */
export class BabyBomber implements Enemy {
  readonly kind = 'baby';
  live = true;
  private timer = 1.2;
  private state: 'idle' | 'wind' = 'idle';
  private readonly s: Phaser.GameObjects.Sprite;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
    private readonly spawn: (e: Enemy) => void,
  ) {
    this.s = world.stage.add.sprite(x, y + SEAT.h, 'enemy.baby', 0).setOrigin(0, 1).setScale(ART_SCALE).setDepth(4);
  }

  get x() {
    return this.s.x + 24;
  }
  get y() {
    return this.s.y;
  }
  readonly vx = 0;

  step(dt: number): void {
    if (!this.live) return;
    const p = this.world.player;
    const dx = p.x - this.x;
    if (Math.abs(dx) > 300) {
      this.timer = Math.max(this.timer, 0.8);
      return;
    }
    this.timer -= dt;
    if (this.state === 'idle' && this.timer <= 0.4) {
      this.state = 'wind';
      this.s.setFrame(frameIndex('enemy.baby', 'wind'));
    }
    if (this.timer <= 0) {
      this.throwAt(p.x, p.y - 30);
      this.state = 'idle';
      this.timer = 2.4;
      this.s.setFrame(frameIndex('enemy.baby', 'throw'));
      this.world.stage.time.delayedCall(250, () => this.live && this.s.setFrame(frameIndex('enemy.baby', 'idle')));
    }
  }

  /** Ballistic lob under the (tilted) cabin gravity, landing on the target after T seconds. */
  private throwAt(tx: number, ty: number): void {
    const [x0, y0] = [this.x + 8, this.s.y - 40];
    const T = Phaser.Math.Clamp(Math.abs(tx - x0) / 170, 0.7, 1.2);
    const g = this.world.gravity;
    const vx = (tx - x0 - 0.5 * g.x * T * T) / T;
    const vy = (ty - y0 - 0.5 * g.y * T * T) / T;
    this.spawn(new Pacifier(this.world, x0, y0, vx, vy));
    this.world.sfx('bump');
  }

  hitbox() {
    return null; // a seat with a baby: not something to bump into
  }

  touch(): void {}

  hit(): boolean {
    if (!this.live) return false;
    this.live = false;
    this.s.setFrame(frameIndex('enemy.baby', 'idle'));
    this.world.addScore(200, this.x, this.s.y - 60);
    this.world.sfx('nut');
    return true;
  }

  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}

// ---------------------------------------------------------------------------------------------------------
/** Bin Biter: an overhead bin that snaps open and shut. Jumping into its open mouth hurts; plunge it shut. */
export class BinBiter implements Enemy {
  readonly kind = 'binbiter';
  live = true;
  private t: number;
  private stun = 0;
  private readonly s: Phaser.GameObjects.Sprite;
  private static readonly CYCLE = [
    { frame: 'closed', time: 1.8 },
    { frame: 'half', time: 0.18 },
    { frame: 'open', time: 1.1 },
    { frame: 'half', time: 0.18 },
  ];

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
  ) {
    this.s = world.stage.add.sprite(x, y, 'enemy.binbiter', 0).setOrigin(0, 0).setScale(ART_SCALE).setDepth(7);
    this.t = (x / 16) % 3; // stagger neighbours
  }

  get x() {
    return this.s.x + 24;
  }
  get y() {
    return this.s.y + 32;
  }
  readonly vx = 0;

  private get phase(): string {
    if (this.stun > 0) return 'closed';
    const total = BinBiter.CYCLE.reduce((n, c) => n + c.time, 0);
    let t = this.t % total;
    for (const c of BinBiter.CYCLE) {
      if (t < c.time) return c.frame;
      t -= c.time;
    }
    return 'closed';
  }

  step(dt: number): void {
    this.stun = Math.max(0, this.stun - dt);
    if (this.stun <= 0) this.t += dt;
    const before = this.s.frame.name;
    this.s.setFrame(frameIndex('enemy.binbiter', this.phase));
    if (before !== this.s.frame.name && this.phase === 'open' && Math.abs(this.world.player.x - this.x) < 200) this.world.sfx('bump');
  }

  hitbox() {
    if (this.phase === 'closed') return null;
    return { left: this.s.x + 4, right: this.s.x + 44, top: this.s.y + 6, bottom: this.s.y + 32 };
  }

  touch(player: Player): void {
    if (player.bamba > 0) return void this.hit();
    this.world.hurtPlayer(this.x, 'binbiter');
  }

  hit(): boolean {
    if (this.phase === 'closed' && this.stun > 0) return false;
    this.stun = 5;
    this.world.addScore(RULES.stompScore, this.x, this.y);
    this.world.sfx('stomp');
    return true;
  }

  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}

// ---------------------------------------------------------------------------------------------------------
/** One falling bag: dangerous while it drops, harmless (and soon gone) once it lands. */
class Luggage implements Enemy {
  readonly kind = 'luggage';
  live = true;
  private readonly s: Sprite;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
    variant: number,
  ) {
    this.s = world.stage.physics.add.sprite(x, y, 'prop.luggage', variant).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(8);
    sizeBody(this.s, 26, 22).setVelocityY(40);
    this.s.setAngularVelocity((variant - 1) * 120);
    world.stage.physics.add.collider(this.s, world.terrain, () => this.land());
  }

  get x() {
    return this.s.x;
  }
  get y() {
    return this.s.y;
  }
  get vx() {
    return 0;
  }

  private land(): void {
    if (!this.live) return;
    this.live = false;
    this.s.setAngularVelocity(0).setAngle(0);
    this.world.sfx('bump');
    this.world.stage.tweens.add({ targets: this.s, alpha: 0, delay: 900, duration: 300, onComplete: () => this.destroy() });
  }

  step(): void {
    if (this.s.y > this.world.level.height + 100) this.destroy();
  }

  hitbox() {
    return this.live ? bodyBox(this.s.body as Body) : null;
  }

  touch(player: Player): void {
    if (player.bamba > 0 || player.big) return void this.hit(); // Big Yaniv shrugs off a bag (bonks it away)
    this.world.hurtPlayer(this.s.x, 'luggage');
    this.land();
  }

  hit(): boolean {
    if (!this.live) return false;
    this.live = false;
    knockOff(this.world, this.s, this.world.random() < 0.5 ? -1 : 1);
    return true;
  }

  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}

/** Luggage rain: an open bin above that drops bags while Yaniv is nearby (World 5-3). */
export class LuggageRain implements Enemy {
  readonly kind = 'luggageRain';
  live = true;
  private timer = 0.6;
  readonly vx = 0;

  constructor(
    private readonly world: GameWorld,
    readonly x: number,
    readonly y: number,
    private readonly spawn: (e: Enemy) => void,
  ) {}

  step(dt: number): void {
    if (Math.abs(this.world.player.x - this.x) > 220) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1.1 + this.world.random() * 0.6;
    const x = this.x + (this.world.random() - 0.5) * 96;
    this.spawn(new Luggage(this.world, x, this.y + 16, Math.floor(this.world.random() * 3)));
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
  }
}
