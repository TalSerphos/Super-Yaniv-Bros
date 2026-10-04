import { frameIndex } from '../assets.ts';
import { ART_SCALE, PHYS, RULES } from '../config.ts';
import { sizeBody, type Body, type GameWorld, type Sprite } from '../world.ts';
import { contact, knockOff, physicsSprite, type Enemy } from './enemies.ts';
import type { Player } from './player.ts';

const box = (b: Body) => ({ left: b.left, right: b.right, top: b.top, bottom: b.bottom });

/** Rubber Ducky: Jacuzzam's bath-toy minion. Waddles and squeaks; stomp it flat or plunge it away. */
export class Ducky implements Enemy {
  readonly kind = 'ducky';
  live = true;
  private dir = -1;
  private readonly s: Sprite;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
  ) {
    this.s = physicsSprite(world, x, y, 'enemy.ducky').play('enemy.ducky:walk');
    sizeBody(this.s, 18, 18).setMaxVelocity(200, PHYS.maxFall);
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
    if (!this.live) return;
    const body = this.s.body as Body;
    if (body.blocked.left) this.dir = 1;
    if (body.blocked.right) this.dir = -1;
    body.setVelocityX(this.dir * 46);
    this.s.setFlipX(this.dir > 0);
    if (this.s.y > this.world.level.height + 100) this.destroy();
  }

  hitbox() {
    return this.live ? box(this.s.body as Body) : null;
  }

  touch(player: Player, jumpHeld: boolean): void {
    contact(this.world, player, jumpHeld, (this.s.body as Body).top, this.s.x, () => this.squash());
  }

  private squash(): void {
    if (!this.live) return;
    this.live = false;
    this.s.anims.stop();
    this.s.setFrame(frameIndex('enemy.ducky', 'squash'));
    const body = this.s.body as Body;
    body.setVelocity(0, 0);
    body.checkCollision.none = true;
    this.world.addScore(RULES.stompScore, this.s.x, this.s.y - 20);
    this.world.sfx('stomp');
    this.world.stage.tweens.add({ targets: this.s, alpha: 0, delay: 500, duration: 300, onComplete: () => this.destroy() });
  }

  hit(): boolean {
    if (!this.live) return false;
    this.live = false;
    this.world.sfx('stomp');
    this.world.addScore(RULES.stompScore, this.s.x, this.s.y - 20);
    knockOff(this.world, this.s, this.s.x > this.world.player.x ? 1 : -1);
    return true;
  }

  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}

/** One puff of a jacuzzi-jet bubble stream: flies straight, hurts on contact, pops on anything. */
export class Bubble implements Enemy {
  readonly kind = 'bubble';
  live = true;
  private age = 0;
  private readonly s: Sprite;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
    readonly vx: number,
  ) {
    this.s = world.stage.physics.add.sprite(x, y, 'proj.bubble', 0).setScale(ART_SCALE).setDepth(9).play('proj.bubble:float');
    const body = this.s.body as Body;
    body.setSize(22, 22).setAllowGravity(false).setVelocity(vx, 0);
  }

  get x() {
    return this.s.x;
  }
  get y() {
    return this.s.y;
  }

  step(dt: number): void {
    this.age += dt;
    this.s.y += Math.sin(this.age * 14) * 0.4; // a little wobble
    if (this.age > 3 || this.s.x < -40 || this.s.x > this.world.level.width + 40) this.destroy();
  }

  hitbox() {
    return this.live ? box(this.s.body as Body) : null;
  }

  touch(player: Player): void {
    if (player.bamba > 0) return void this.hit();
    this.world.hurtPlayer(this.s.x, 'bubble');
    this.hit();
  }

  hit(): boolean {
    if (!this.live) return false;
    this.live = false;
    this.world.stage.tweens.add({ targets: this.s, scale: ART_SCALE * 1.6, alpha: 0, duration: 160, onComplete: () => this.destroy() });
    return true;
  }

  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}
