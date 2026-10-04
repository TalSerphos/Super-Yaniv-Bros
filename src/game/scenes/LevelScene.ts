import Phaser from 'phaser';
import { play } from '../../audio/sfx.ts';
import { ensurePlaceholders, frameIndex, preloadAssets } from '../assets.ts';
import { ART_SCALE, PHYS, RULES, VIEW_H, VIEW_W, ZOOM } from '../config.ts';
import { BLOCK, EXIT, SEAT, parseLevel, type LevelData, type ParsedLevel } from '../levels/loader.ts';
import { Altitude } from '../systems/altitude.ts';
import { BotInput, ButtonEdges, noButtons, type Buttons, type InputSource } from '../systems/input.ts';
import { cabinGravity, degToRad, tiltAt } from '../systems/tilt.ts';

export interface HudState {
  hearts: number;
  maxHearts: number;
  nuts: number;
  score: number;
  alt: string;
  bank: number;
  label: string;
}

export type GameEvent =
  | { type: 'intro'; label: string; name: string }
  | { type: 'warn' }
  | { type: 'pause' }
  | { type: 'clear'; score: number; nuts: number; seconds: number }
  | { type: 'gameover'; reason: 'hearts' | 'altitude'; score: number };

export interface LevelInit {
  level: LevelData;
  inputs: InputSource[];
  bot?: BotInput;
  onHud(state: HudState): void;
  onEvent(e: GameEvent): void;
}

type Body = Phaser.Physics.Arcade.Body;
type Sprite = Phaser.Physics.Arcade.Sprite;

/** Body sizes in world units (sprites are drawn at ART_SCALE, so source-pixel sizes are ×2). */
const PLAYER_BODY = { w: 20, h: 50 };
/** Walking pace through the exit curtain (world units/s). */
const EXIT_WALK_SPEED = 70;
const TROLLEY_BODY = { w: 52, h: 42 };

export class LevelScene extends Phaser.Scene {
  private cfg!: LevelInit;
  private lvl!: ParsedLevel;
  private player!: Sprite;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private oneWays!: Phaser.Physics.Arcade.StaticGroup;
  private nuts!: Phaser.Physics.Arcade.StaticGroup;
  private blocks!: Phaser.Physics.Arcade.StaticGroup;
  private trolleys!: Phaser.Physics.Arcade.Group;
  private pendingTrolleys: { x: number; y: number }[] = [];
  private exitZone!: Phaser.GameObjects.Zone;
  private altitude!: Altitude;

  private edges = new ButtonEdges();
  private coyote = 0;
  private jumpBuffer = 0;
  private jumpCut = false;
  private invulnerable = 0;
  private hurtTimer = 0;
  private hearts = RULES.hearts;
  private nutCount = 0;
  private score = 0;
  private elapsed = 0;
  private finished = false;
  private lastSafe = { x: 0, y: 0 };
  /** Seconds of ignored movement input after a respawn. */
  private controlLock = 0;
  private plungeCooldown = 0;
  /** Test/debug log of every heart lost. */
  private hurtLog: { cause: string; x: number; y: number; t: number }[] = [];
  private hudTimer = 0;
  private tiltDeg = 0;

  constructor() {
    super('level');
  }

  create(data: LevelInit): void {
    this.cfg = data;
    this.lvl = parseLevel(data.level);
    this.resetState();
    ensurePlaceholders(this);
    this.createAnimations();

    const { width, height } = this.lvl;
    this.physics.world.setBounds(0, -VIEW_H, width, height + VIEW_H * 2, true, true, true, false);
    this.cameras.main.setBackgroundColor('#d9cdb4'); // cabin ceiling, seen past the wall's top edge when tilted

    this.createBackground();
    this.createTerrain();
    this.createSeats();
    this.createForeground();
    this.createExit();
    this.createItems();
    this.createPlayer();
    this.trolleys = this.physics.add.group();
    this.pendingTrolleys = this.lvl.trolleys.map((t) => ({ ...t }));
    this.createColliders();

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(-VIEW_W / 2, -VIEW_H, width + VIEW_W, height + VIEW_H * 1.5);
    cam.startFollow(this.player, true, 0.12, 0.1);
    cam.setFollowOffset(-70, 22); // look ahead toward the cockpit; aisle and seat rows fill the lower third
    this.applyTilt(0);

    this.altitude = new Altitude(data.level.altitude.start, data.level.altitude.rate);
    this.physics.world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, (delta: number) => this.step(delta));
    data.inputs.forEach((i) => i.reset?.()); // drop keys pressed during the intro card
    data.onEvent({ type: 'intro', label: data.level.id, name: data.level.name });
    this.pushHud();
    this.exposeTestHooks();
  }

  preload(): void {
    preloadAssets(this);
  }

  private resetState(): void {
    this.edges.clear();
    this.coyote = this.jumpBuffer = this.invulnerable = this.hurtTimer = this.controlLock = this.plungeCooldown = 0;
    this.jumpCut = false;
    this.hearts = RULES.hearts;
    this.nutCount = this.score = this.elapsed = this.hudTimer = 0;
    this.hurtLog = [];
    this.finished = false;
  }

  // ---------- world construction ----------

  private createAnimations(): void {
    const sheet = (key: string, names: string[], frameRate: number, repeat = -1) => {
      if (this.anims.exists(key)) return;
      const [tex] = key.split(':');
      this.anims.create({
        key,
        frames: names.map((n) => ({ key: tex, frame: frameIndex(tex, n) })),
        frameRate,
        repeat,
      });
    };
    sheet('yaniv.small:idle', ['idle0', 'idle1'], 2);
    sheet('yaniv.small:run', ['run0', 'run1', 'run2', 'run3', 'run4', 'run5'], 12);
    sheet('enemy.trolley:roll', ['roll0', 'roll1', 'roll2'], 10);
    sheet('item.nut:spin', ['spin0', 'spin1', 'spin2', 'spin3'], 8);
  }

  /** Top of the aisle floor: the wall art and foreground seats are laid out relative to it. */
  private get floorTop(): number {
    return Math.max(...this.lvl.solids.filter((s) => s.kind === 'floor').map((s) => s.y));
  }

  private createBackground(): void {
    // The cabin wall sits on the floor at 1:1 scale and scrolls slower than the play layer (parallax).
    // It is wide enough to cover the whole level at that scroll speed; above it is the ceiling colour.
    const top = this.floorTop - VIEW_H;
    this.add
      .tileSprite(-VIEW_W, top, this.lvl.width + VIEW_W * 2, VIEW_H, 'w5.bg.wall')
      .setOrigin(0)
      .setScrollFactor(0.45, 1)
      .setTileScale(ART_SCALE);
    // Cargo hold: everything below the floor line, so hatches read as dark holes.
    this.add.rectangle(-VIEW_W, this.floorTop, this.lvl.width + VIEW_W * 2, VIEW_H * 2, 0x15142a).setOrigin(0);
  }

  private createTerrain(): void {
    this.solids = this.physics.add.staticGroup();
    for (const r of this.lvl.solids) {
      const tex = r.kind === 'floor' ? 'w5.tex.floor' : 'w5.tex.bin';
      this.add.tileSprite(r.x, r.y, r.w, r.h, tex).setOrigin(0).setTileScale(ART_SCALE);
      if (r.kind === 'floor') this.add.rectangle(r.x, r.y + r.h, r.w, VIEW_H, 0x22233c).setOrigin(0);
      const zone = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      this.solids.add(zone);
    }
    // Visual-only floor past both level ends, so the tilted view never shows a fake pit at the edges.
    const ft = this.floorTop;
    for (const x of [-VIEW_W, this.lvl.width]) {
      this.add.tileSprite(x, ft, VIEW_W, 32, 'w5.tex.floor').setOrigin(0).setTileScale(ART_SCALE);
      this.add.rectangle(x, ft + 32, VIEW_W, VIEW_H, 0x22233c).setOrigin(0);
    }
    this.oneWays = this.physics.add.staticGroup();
    for (const r of this.lvl.oneWays) {
      const zone = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      this.oneWays.add(zone);
      const body = zone.body as Phaser.Physics.Arcade.StaticBody;
      body.checkCollision.down = false;
      body.checkCollision.left = false;
      body.checkCollision.right = false;
    }
  }

  private createSeats(): void {
    for (const s of this.lvl.seats) {
      this.add.image(s.x, s.y + SEAT.h, 'w5.seat', frameIndex('w5.seat', s.kind)).setOrigin(0, 1).setScale(ART_SCALE);
    }
  }

  /** A darker row of seatbacks in front of the floor (closer to the camera), as in the concept art. */
  private createForeground(): void {
    const scale = ART_SCALE * 1.6;
    const step = 52;
    const kinds = ['empty', 'sleeper', 'empty', 'reader', 'empty', 'kid'];
    for (const r of this.lvl.solids.filter((s) => s.kind === 'floor')) {
      for (let x = r.x + 6, i = Math.floor(r.x / step); x + step <= r.x + r.w; x += step, i++) {
        this.add
          .image(x, r.y + 104, 'w5.seat', frameIndex('w5.seat', kinds[i % kinds.length]))
          .setOrigin(0, 1)
          .setScale(scale)
          .setTint(0x6f7894)
          .setDepth(15);
      }
    }
  }

  private createExit(): void {
    const e = this.lvl.exit;
    this.add.image(e.x, e.y + EXIT.h, 'w5.curtain').setOrigin(0, 1).setScale(ART_SCALE);
    this.exitZone = this.add.zone(e.x + e.w / 2, e.y + e.h / 2, e.w * 0.6, e.h);
    this.physics.add.existing(this.exitZone, true);
  }

  private createItems(): void {
    this.nuts = this.physics.add.staticGroup();
    for (const n of this.lvl.nuts) {
      const nut = this.nuts.create(n.x, n.y, 'item.nut', 0) as Sprite;
      nut.setScale(ART_SCALE).refreshBody().play('item.nut:spin');
    }
    this.blocks = this.physics.add.staticGroup();
    for (const b of this.lvl.blocks) {
      const block = this.blocks.create(b.x + BLOCK / 2, b.y + BLOCK / 2, 'block.call', 0) as Sprite;
      block.setScale(ART_SCALE).refreshBody().setData('used', false);
    }
  }

  private createPlayer(): void {
    const { x, y } = this.lvl.start;
    this.player = this.physics.add.sprite(x, y, 'yaniv.small', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(10);
    const body = this.player.body as Body;
    const src = (v: number) => v / ART_SCALE;
    body.setSize(src(PLAYER_BODY.w), src(PLAYER_BODY.h));
    body.setOffset((this.player.width - src(PLAYER_BODY.w)) / 2, this.player.height - src(PLAYER_BODY.h));
    body.setMaxVelocity(PHYS.runSpeed * 2, PHYS.maxFall);
    body.setCollideWorldBounds(true); // left/right/top only: the world's bottom stays open for pits
    this.player.play('yaniv.small:idle');
    this.lastSafe = { x, y };
  }

  private createColliders(): void {
    const p = this.player;
    this.physics.add.collider(p, this.solids);
    this.physics.add.collider(p, this.oneWays);
    this.physics.add.collider(p, this.blocks, (_p, b) => this.hitBlock(b as Sprite));
    this.physics.add.collider(this.trolleys, this.solids);
    this.physics.add.overlap(p, this.nuts, (_p, n) => this.collectNut(n as Sprite));
    this.physics.add.overlap(p, this.trolleys, (_p, t) => this.touchTrolley(t as Sprite));
    this.physics.add.overlap(p, this.exitZone, () => this.clearLevel());
  }

  private applyTilt(t: number): void {
    const deg = tiltAt(this.cfg.level.tilt, t);
    if (deg === this.tiltDeg && t > 0) return;
    this.tiltDeg = deg;
    const g = cabinGravity(PHYS.gravity, deg);
    this.physics.world.gravity.set(g.x, g.y);
    // The player only feels a fraction of the slope; trolleys and luggage feel all of it.
    (this.player.body as Body).setGravityX(-g.x * (1 - PHYS.playerSlopeFeel));
    this.cameras.main.setRotation(degToRad(deg));
  }

  // ---------- gameplay ----------

  /**
   * Gameplay runs on the fixed 60 Hz physics step (Arcade's 'worldstep'), not the render frame, so input,
   * jumps, timers and the bot behave identically at any frame rate (slow phones, loaded CI machines).
   */
  private step(deltaSeconds: number): void {
    if (this.finished) return;
    const dt = deltaSeconds;
    this.elapsed += dt;
    this.readInput();
    if (this.pressed('pause')) {
      // Forget this step's buttons: otherwise, after resuming, the edge detector still sees 'pause' held and
      // a quick second press would be missed (seen on WebKit, where resume-then-Escape lands before a step).
      this.edges.clear();
      this.cfg.onEvent({ type: 'pause' });
      return;
    }
    this.applyTilt(this.elapsed);
    this.updatePlayer(dt);
    this.updateTrolleys();

    this.altitude.tick(dt);
    if (this.altitude.crashed) return this.gameOver('altitude');
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) this.pushHud();
  }

  private readInput(): void {
    const read = noButtons();
    if (this.cfg.bot) this.cfg.bot.view = this.botView();
    for (const src of this.cfg.inputs) src.read(read);
    this.cfg.bot?.read(read);
    this.edges.next(read);
  }

  private get buttons(): Buttons {
    return this.edges.current;
  }

  private pressed(b: keyof Buttons): boolean {
    return this.edges.pressed(b);
  }

  private updatePlayer(dt: number): void {
    const p = this.player;
    const body = p.body as Body;
    const grounded = body.blocked.down || body.touching.down;
    const b = this.buttons;

    this.coyote = grounded ? PHYS.coyoteTime : Math.max(0, this.coyote - dt);
    this.jumpBuffer = this.pressed('jump') ? PHYS.jumpBuffer : Math.max(0, this.jumpBuffer - dt);
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hurtTimer = Math.max(0, this.hurtTimer - dt);
    this.controlLock = Math.max(0, this.controlLock - dt);
    this.plungeCooldown = Math.max(0, this.plungeCooldown - dt);

    const dir = this.controlLock > 0 ? 0 : (b.right ? 1 : 0) - (b.left ? 1 : 0);
    // Running downhill (toward the cockpit) is a little faster, uphill a little slower.
    const slope = Math.sin(degToRad(this.tiltDeg));
    const target = dir * PHYS.runSpeed * (1 + 0.6 * slope * dir);
    const accel = (grounded ? PHYS.groundAccel : PHYS.airAccel) * dt;
    if (this.hurtTimer <= 0.9) body.setVelocityX(body.velocity.x + Phaser.Math.Clamp(target - body.velocity.x, -accel, accel));
    // Standing still on the slope: no creeping (the slope is felt while moving, not while idle).
    if (grounded && !dir && Math.abs(body.velocity.x) < 6) body.setVelocityX(0);

    if (this.jumpBuffer > 0 && this.coyote > 0 && this.controlLock <= 0) {
      body.setVelocityY(-PHYS.jumpVelocity);
      this.jumpBuffer = this.coyote = 0;
      this.jumpCut = false;
      play('jump');
    }
    if (!b.jump && body.velocity.y < 0 && !this.jumpCut) {
      body.setVelocityY(body.velocity.y * PHYS.jumpCutFactor);
      this.jumpCut = true;
    }
    if (this.pressed('grab') && this.plungeCooldown <= 0) this.plunge();

    if (dir) p.setFlipX(dir < 0);
    if (this.hurtTimer > 0) this.showFrame('hurt');
    else if (!grounded) this.showFrame(body.velocity.y < 0 ? 'jump' : 'fall');
    else if (Math.abs(body.velocity.x) > 12) p.anims.play('yaniv.small:run', true);
    else p.anims.play('yaniv.small:idle', true);
    p.setAlpha(this.invulnerable > 0 && Math.floor(this.invulnerable * 12) % 2 ? 0.35 : 1);

    // A respawn point needs floor on both sides, so falling in from either direction is safe.
    if (grounded && body.blocked.down && this.solidUnder(p.x - 40, p.y) && this.solidUnder(p.x + 40, p.y)) {
      this.lastSafe = { x: p.x, y: p.y };
    }
    if (p.y > this.lvl.height + 48) this.fellInPit();
  }

  /**
   * Move the player's feet to (x, y). Body.reset() would place the body at the sprite's top-left and ignore
   * the body offset, which can leave it overlapping the floor and falling through; resync from the sprite.
   */
  private placePlayer(x: number, y: number): void {
    const body = this.player.body as Body;
    this.player.setPosition(x, y);
    body.updateFromGameObject();
    body.stop();
    body.prev.copy(body.position);
    body.prevFrame.copy(body.position);
  }

  /** Is there floor (solid or one-way) right under (x, feetY)? */
  private solidUnder(x: number, feetY: number): boolean {
    return [...this.lvl.solids, ...this.lvl.oneWays].some((r) => x >= r.x && x <= r.x + r.w && Math.abs(r.y - feetY) < 3);
  }

  private showFrame(name: string): void {
    this.player.anims.stop();
    this.player.setFrame(frameIndex('yaniv.small', name));
  }

  private plunge(): void {
    const p = this.player;
    const facing = p.flipX ? -1 : 1;
    this.plungeCooldown = 0.25;
    play('thwop');
    const reach = this.add.rectangle(p.x + facing * 22, p.y - 30, 18, 8, 0xd61f1f).setDepth(11);
    this.tweens.add({ targets: reach, x: reach.x + facing * 12, alpha: 0, duration: 160, onComplete: () => reach.destroy() });
    for (const t of this.trolleys.getChildren() as Sprite[]) {
      if (t.getData('flat')) continue;
      const dx = (t.x - p.x) * facing;
      // Reach well past body contact (~36): the plunger must win against a trolley rolling in at speed.
      if (dx > -8 && dx < 72 && Math.abs(t.y - p.y) < 30) this.flattenTrolley(t);
    }
  }

  private updateTrolleys(): void {
    const px = this.player.x;
    for (let i = this.pendingTrolleys.length - 1; i >= 0; i--) {
      const s = this.pendingTrolleys[i];
      if (px - s.x < RULES.trolleyTriggerDistance) continue;
      this.pendingTrolleys.splice(i, 1);
      this.spawnTrolley(s.x, s.y);
    }
    const right = this.cameras.main.worldView.right + VIEW_W;
    for (const t of [...(this.trolleys.getChildren() as Sprite[])]) {
      if (t.x > right || t.y > this.lvl.height + 200) t.destroy();
    }
  }

  private spawnTrolley(x: number, y: number): void {
    const t = this.trolleys.create(x, y, 'enemy.trolley', 0) as Sprite;
    t.setOrigin(0.5, 1).setScale(ART_SCALE).setData('flat', false).play('enemy.trolley:roll');
    const body = t.body as Body;
    const src = (v: number) => v / ART_SCALE;
    body.setSize(src(TROLLEY_BODY.w), src(TROLLEY_BODY.h));
    body.setOffset((t.width - src(TROLLEY_BODY.w)) / 2, t.height - src(TROLLEY_BODY.h));
    body.setMaxVelocity(PHYS.trolleyMaxSpeed, PHYS.maxFall);
    body.setVelocityX(80);
    body.setFriction(0, 0);
    play('warn');
    this.cfg.onEvent({ type: 'warn' });
  }

  private touchTrolley(t: Sprite): void {
    if (t.getData('flat') || this.finished) return;
    const pb = this.player.body as Body;
    const tb = t.body as Body;
    const fromAbove = pb.velocity.y > 0 && pb.bottom - tb.top < 16;
    if (fromAbove) {
      this.flattenTrolley(t);
      // Holding jump turns a stomp into a full-height bounce (and it can still be cut short).
      const held = this.buttons.jump;
      pb.setVelocityY(-(held ? PHYS.jumpVelocity : PHYS.stompBounce));
      this.jumpCut = !held;
    } else {
      this.hurt(Math.sign(this.player.x - t.x) || -1, 'trolley');
    }
  }

  private flattenTrolley(t: Sprite): void {
    t.setData('flat', true).anims.stop();
    t.setFrame(frameIndex('enemy.trolley', 'flat'));
    const body = t.body as Body;
    body.setVelocity(0, 0);
    body.setAllowGravity(false);
    body.checkCollision.none = true;
    this.score += RULES.stompScore;
    play('stomp');
    this.popText(t.x, t.y - 30, `${RULES.stompScore}`);
    this.tweens.add({ targets: t, alpha: 0, delay: 600, duration: 400, onComplete: () => t.destroy() });
    this.pushHud();
  }

  private hitBlock(block: Sprite): void {
    const pb = this.player.body as Body;
    if (block.getData('used') || !(pb.blocked.up || pb.touching.up)) return;
    block.setData('used', true).setFrame(frameIndex('block.call', 'used'));
    play('ding');
    this.tweens.add({ targets: block, y: block.y - 4, yoyo: true, duration: 80 });
    const nut = this.add.sprite(block.x, block.y - 14, 'item.nut', 0).setScale(ART_SCALE).play('item.nut:spin');
    this.tweens.add({ targets: nut, y: nut.y - 26, alpha: 0, duration: 450, onComplete: () => nut.destroy() });
    this.nutCount++;
    this.score += RULES.blockScore;
    this.pushHud();
  }

  private collectNut(nut: Sprite): void {
    nut.destroy();
    this.nutCount++;
    this.score += RULES.nutScore;
    play('nut');
    this.pushHud();
  }

  private hurt(dir: number, cause: string): void {
    if (this.invulnerable > 0 || this.finished) return;
    this.hearts--;
    this.hurtLog.push({ cause, x: Math.round(this.player.x), y: Math.round(this.player.y), t: Math.round(this.elapsed * 100) / 100 });
    play('hurt');
    this.cameras.main.shake(180, 0.006);
    this.pushHud();
    if (this.hearts <= 0) return this.gameOver('hearts');
    this.invulnerable = PHYS.hurtInvulnerable;
    this.hurtTimer = 1.05;
    this.jumpCut = true; // knockback height must not depend on the jump button
    (this.player.body as Body).setVelocity(dir * 160, -220);
  }

  private fellInPit(): void {
    this.invulnerable = 0;
    this.hurt(0, 'pit');
    if (this.finished) return;
    this.placePlayer(this.lastSafe.x, this.lastSafe.y - 1);
    this.controlLock = 0.6;
    this.cameras.main.flash(200, 20, 16, 34);
  }

  /**
   * Exit sequence: controls off, Yaniv walks steadily through the curtain (the slope's pull fully cancelled,
   * so no creeping or sliding off the level), fades out behind it, then the card appears.
   */
  private clearLevel(): void {
    if (this.finished) return;
    this.finished = true;
    const body = this.player.body as Body;
    body.setGravityX(-this.physics.world.gravity.x);
    body.setVelocityX(EXIT_WALK_SPEED);
    this.player.setFlipX(false).anims.play('yaniv.small:run', true);
    for (const t of this.trolleys.getChildren() as Sprite[]) {
      (t.body as Body).setVelocity(0, 0).setAllowGravity(false);
      this.tweens.add({ targets: t, alpha: 0, duration: 300 });
    }
    play('chime');
    this.pushHud();
    this.tweens.add({
      targets: this.player,
      alpha: 0,
      delay: 250,
      duration: 450,
      onComplete: () => {
        body.stop();
        body.enable = false;
        this.player.anims.stop();
      },
    });
    const result = { type: 'clear' as const, score: this.score, nuts: this.nutCount, seconds: Math.round(this.elapsed) };
    this.time.delayedCall(900, () => this.cfg.onEvent(result));
  }

  private gameOver(reason: 'hearts' | 'altitude'): void {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    this.player.anims.stop();
    this.player.setFrame(frameIndex('yaniv.small', 'hurt'));
    this.pushHud();
    this.cfg.onEvent({ type: 'gameover', reason, score: this.score });
  }

  private popText(x: number, y: number, text: string): void {
    const t = this.add.text(x, y, text, { fontFamily: '"Press Start 2P", monospace', fontSize: '16px', color: '#fff8e7' });
    t.setOrigin(0.5).setScale(0.5).setDepth(20).setStroke('#000', 4);
    this.tweens.add({ targets: t, y: y - 20, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private pushHud(): void {
    this.hudTimer = 0.1;
    this.cfg.onHud({
      hearts: Math.max(0, this.hearts),
      maxHearts: RULES.hearts,
      nuts: this.nutCount,
      score: this.score,
      alt: this.altitude?.format() ?? '',
      bank: Math.round(this.tiltDeg),
      label: `${this.cfg.level.id}  ${this.cfg.level.name}`,
    });
  }

  // ---------- bot + test hooks ----------

  private botView() {
    const p = this.player;
    const body = p.body as Body;
    const standable = [...this.lvl.solids, ...this.lvl.oneWays];
    const feet = body.bottom;
    return {
      x: p.x,
      y: feet,
      vx: body.velocity.x,
      grounded: body.blocked.down || body.touching.down,
      groundAt: (x: number) => standable.some((r) => x >= r.x && x <= r.x + r.w && r.y >= feet - 4 && r.y <= feet + 40),
      // Anything overlapping the player's body height (feet-46 .. feet-8) at x is a wall to jump over.
      wallAt: (x: number) =>
        this.lvl.solids.some((r) => x >= r.x && x <= r.x + r.w && r.y < feet - 8 && r.y + r.h > feet - 46) ||
        this.lvl.blocks.some((k) => x >= k.x && x <= k.x + BLOCK && k.y < feet - 8 && k.y + BLOCK > feet - 46),
      trolleys: (this.trolleys.getChildren() as Sprite[])
        .filter((t) => !t.getData('flat'))
        .map((t) => ({ dx: t.x - p.x, vx: (t.body as Body).velocity.x })),
    };
  }

  private exposeTestHooks(): void {
    (window as unknown as { __syb?: unknown }).__syb = {
      state: () => ({
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        hearts: this.hearts,
        nuts: this.nutCount,
        score: this.score,
        finished: this.finished,
        tilt: this.tiltDeg,
        width: this.lvl.width,
        hurts: [...this.hurtLog],
      }),
      /** Test-only: move the player (feet at y) to set up a situation quickly. */
      teleport: (x: number, y: number) => {
        this.placePlayer(x, y);
        this.lastSafe = { x, y };
      },
      /** Test-only: remove all trolleys (pending and live) to isolate other mechanics. */
      clearTrolleys: () => {
        this.pendingTrolleys = [];
        this.trolleys.clear(true, true);
      },
    };
  }
}
