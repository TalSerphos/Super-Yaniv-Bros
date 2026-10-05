import Phaser from 'phaser';
import { ART_SCALE } from '../config.ts';
import { FX, FxPool, allowedWithReducedMotion, shardOffset, shardPaths, type FxKind } from '../systems/fx.ts';

const reducedMotion = (): boolean => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * One-shot impact effects for a scene (rules in systems/fx.ts). Effects are decoration: they never touch
 * physics or the level's random dice, so bots and tests play exactly as before.
 */
export class Effects {
  private pool = new FxPool<Phaser.GameObjects.Sprite>();
  /** Effects spawned so far (test hook: `__syb.state().fx`). */
  spawned = 0;
  private readonly calm = reducedMotion();

  constructor(private readonly scene: Phaser.Scene) {}

  play(kind: FxKind, x: number, y: number, flip = false): void {
    if (this.calm && !allowedWithReducedMotion(kind)) return;
    const spec = FX[kind];
    if (!this.scene.textures.exists(spec.sheet)) return;
    const s = this.scene.add.sprite(x, y, spec.sheet, 0).setOrigin(0.5, spec.originY).setScale(ART_SCALE).setDepth(12).setFlipX(flip);
    this.spawned++;
    this.pool.push(s)?.destroy();
    s.play({ key: `${spec.sheet}:play`, frameRate: spec.frameRate });
    s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.pool.remove(s);
      s.destroy();
    });
  }

  /** A smashed bin panel: four shards pop up and tumble down, the classic brick break. */
  shards(x: number, y: number): void {
    this.spawned++;
    shardPaths().forEach((path, i) => {
      const bit = this.scene.add.sprite(x, y, 'fx.shard', i).setScale(ART_SCALE).setDepth(12);
      const t = { v: 0 };
      this.scene.tweens.add({
        targets: t,
        v: 1,
        duration: path.duration,
        onUpdate: () => {
          const o = shardOffset(path, t.v);
          bit.setPosition(x + o.x, y + o.y).setAngle(path.spin * t.v);
        },
        onComplete: () => bit.destroy(),
      });
    });
  }
}
