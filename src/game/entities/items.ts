import Phaser from 'phaser';
import { frameIndex } from '../assets.ts';
import { ART_SCALE, RULES } from '../config.ts';
import { BLOCK, type BlockKind } from '../levels/loader.ts';
import { sizeBody, type Body, type GameWorld, type Sprite } from '../world.ts';
import type { Enemy } from './enemies.ts';
import type { Player } from './player.ts';
import { BAMBA_SECONDS } from './player.ts';

export type PowerKind = 'hummus' | 'goldenPlunger' | 'bamba' | 'sabich';

/**
 * Power-ups that pop out of call-button blocks:
 *  Hummus → Big Yaniv · Golden Plunger → throws plungers · Bamba → 8 s Rush · Sabich → +1 heart.
 */
export class PowerItem {
  live = true;
  private readonly s: Sprite;
  private dir = 1;
  private emerging = true;

  constructor(
    private readonly world: GameWorld,
    readonly kind: PowerKind,
    x: number,
    y: number,
  ) {
    this.s = world.stage.physics.add.sprite(x, y, 'item.power', frameIndex('item.power', kind)).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(6);
    const body = sizeBody(this.s, 14, 14);
    body.enable = false;
    world.stage.physics.add.collider(this.s, world.terrain);
    // Rise out of the block, then start moving.
    world.stage.tweens.add({
      targets: this.s,
      y: y - BLOCK / 2 - 2,
      duration: 380,
      onComplete: () => {
        this.emerging = false;
        body.enable = true;
        body.updateFromGameObject();
        if (kind === 'goldenPlunger') body.setAllowGravity(false);
        this.dir = world.player.x < x ? 1 : -1; // move away from Yaniv, like the classic mushroom
      },
    });
    world.sfx('ding');
  }

  get bounds() {
    const b = this.s.body as Body;
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
  }

  step(): void {
    if (!this.live || this.emerging) return;
    const body = this.s.body as Body;
    if (this.kind === 'goldenPlunger') return;
    if (body.blocked.left) this.dir = 1;
    if (body.blocked.right) this.dir = -1;
    body.setVelocityX(this.dir * (this.kind === 'bamba' ? 80 : 50));
    if (this.kind === 'bamba' && body.blocked.down) body.setVelocityY(-260);
    if (this.s.y > this.world.level.height + 100) this.destroy();
  }

  /** Apply to the player; returns a label for the score pop. */
  collect(player: Player): void {
    if (!this.live || this.emerging) return;
    this.live = false;
    const w = this.world;
    switch (this.kind) {
      case 'hummus':
        if (player.power === 'small') player.setPower('big');
        w.sfx('powerup');
        w.addScore(1000, this.s.x, this.s.y - 20);
        break;
      case 'goldenPlunger':
        player.setPower('golden');
        w.sfx('powerup');
        w.addScore(1000, this.s.x, this.s.y - 20);
        break;
      case 'bamba':
        player.bamba = BAMBA_SECONDS;
        w.sfx('powerup');
        w.addScore(1000, this.s.x, this.s.y - 20);
        break;
      case 'sabich':
        w.addHeart();
        w.sfx('powerup');
        break;
    }
    this.destroy();
  }

  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}

/** Call-button blocks (with contents) and breakable bin panels, as one static group the player bumps from below. */
export class Blocks {
  readonly group: Phaser.Physics.Arcade.StaticGroup;

  constructor(
    private readonly world: GameWorld,
    blocks: { x: number; y: number; kind: BlockKind }[],
    breakables: { x: number; y: number }[],
    private readonly onPower: (item: PowerItem) => void,
  ) {
    this.group = world.stage.physics.add.staticGroup();
    for (const b of blocks) {
      const s = this.group.create(b.x + BLOCK / 2, b.y + BLOCK / 2, 'block.call', 0) as Sprite;
      s.setScale(ART_SCALE).refreshBody().setData({ used: false, kind: b.kind });
    }
    for (const b of breakables) {
      const s = this.group.create(b.x + BLOCK / 2, b.y + BLOCK / 2, 'block.bin', 0) as Sprite;
      s.setScale(ART_SCALE).refreshBody().setData({ breakable: true });
    }
  }

  /** Collider callback: only a hit from below (player's head) counts. */
  bump(block: Sprite, player: Player): void {
    const pb = player.body;
    if (!(pb.blocked.up || pb.touching.up)) return;
    if (block.getData('breakable')) return this.smash(block, player);
    if (block.getData('used')) return;
    block.setData('used', true).setFrame(frameIndex('block.call', 'used'));
    this.world.stage.tweens.add({ targets: block, y: block.y - 4, yoyo: true, duration: 80 });
    const kind = block.getData('kind') as BlockKind;
    const w = this.world;
    if (kind === 'nut') {
      w.sfx('ding');
      const nut = w.stage.add.sprite(block.x, block.y - 14, 'item.nut', 0).setScale(ART_SCALE).play('item.nut:spin');
      w.stage.tweens.add({ targets: nut, y: nut.y - 26, alpha: 0, duration: 450, onComplete: () => nut.destroy() });
      w.addNut();
      w.addScore(RULES.blockScore);
      return;
    }
    const power: PowerKind =
      kind === 'power' ? (player.power === 'small' ? 'hummus' : 'goldenPlunger') : kind === 'bamba' ? 'bamba' : 'sabich';
    this.onPower(new PowerItem(w, power, block.x, block.y - BLOCK / 2 + 16));
  }

  private smash(block: Sprite, player: Player): void {
    const w = this.world;
    if (!player.big) {
      w.sfx('bump');
      w.stage.tweens.add({ targets: block, y: block.y - 3, yoyo: true, duration: 70 });
      return;
    }
    w.sfx('stomp');
    w.addScore(50, block.x, block.y - 20);
    for (let i = 0; i < 4; i++) {
      const bit = w.stage.add.rectangle(block.x, block.y, 6, 6, 0xc9c2b4).setDepth(12);
      w.stage.tweens.add({
        targets: bit,
        x: block.x + (i % 2 ? 1 : -1) * (14 + i * 6),
        y: block.y + 40,
        angle: 180,
        alpha: 0,
        duration: 500,
        onComplete: () => bit.destroy(),
      });
    }
    block.destroy();
  }
}

/**
 * Thrown golden plunger: flies with a gentle drop, knocks out the first enemy it touches, and sticks into
 * walls where it becomes a one-shot step for a few seconds (spec: "a stuck plunger becomes a platform").
 */
export class ThrownPlunger {
  live = true;
  private readonly s: Sprite;
  private stuck = false;
  private age = 0;

  constructor(
    private readonly world: GameWorld,
    x: number,
    y: number,
    dir: number,
    private readonly stickInto: (x: number, y: number) => void,
  ) {
    this.s = world.stage.physics.add.sprite(x, y, 'proj.plunger', 0).setScale(ART_SCALE).setDepth(11).play('proj.plunger:fly');
    this.s.setFlipX(dir < 0);
    const body = this.s.body as Body;
    body.setSize(20, 14).setAllowGravity(false).setVelocity(dir * 320, -30);
    world.stage.physics.add.collider(this.s, world.terrain, () => this.stick());
    world.sfx('thwop');
  }

  step(dt: number, enemies: Enemy[]): void {
    if (!this.live || this.stuck) return;
    this.age += dt;
    const body = this.s.body as Body;
    body.setVelocityY(body.velocity.y + 260 * dt);
    const box = { left: body.left, right: body.right, top: body.top, bottom: body.bottom };
    for (const e of enemies) {
      const h = e.live ? e.hitbox() : null;
      if (h && box.left < h.right && box.right > h.left && box.top < h.bottom && box.bottom > h.top && e.hit('projectile')) {
        this.world.addScore(RULES.stompScore, e.x, e.y - 30);
        return this.destroy();
      }
    }
    const view = this.world.stage.cameras.main.worldView;
    if (this.age > 2 || this.s.x < view.left - 64 || this.s.x > view.right + 64 || this.s.y > this.world.level.height + 50) this.destroy();
  }

  private stick(): void {
    if (this.stuck || !this.live) return;
    this.stuck = true;
    const body = this.s.body as Body;
    body.stop();
    body.enable = false;
    this.s.anims.stop();
    this.s.setFrame(frameIndex('proj.plunger', 'stuck'));
    this.stickInto(this.s.x, this.s.y - 4);
    this.world.stage.tweens.add({ targets: this.s, alpha: 0, delay: 3500, duration: 400, onComplete: () => this.destroy() });
  }

  destroy(): void {
    this.live = false;
    this.s.destroy();
  }
}
