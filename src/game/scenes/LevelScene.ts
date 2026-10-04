import Phaser from 'phaser';
import { play, type Sfx } from '../../audio/sfx.ts';
import { createAnimations, ensurePlaceholders, frameIndex, preloadAssets } from '../assets.ts';
import { ART_SCALE, PHYS, RULES, VIEW_H, VIEW_W, ZOOM } from '../config.ts';
import { BabyBomber, BinBiter, LuggageRain, Suitcase, Trolley, type Enemy } from '../entities/enemies.ts';
import { Blocks, PowerItem, ThrownPlunger } from '../entities/items.ts';
import { MaskVine } from '../entities/masks.ts';
import { Player } from '../entities/player.ts';
import { BLOCK, EXIT, SEAT, floorTopOf, parseLevel, type LevelData, type ParsedLevel, type Point } from '../levels/loader.ts';
import { Altitude } from '../systems/altitude.ts';
import { BotInput, ButtonEdges, noButtons, type BotView, type InputSource } from '../systems/input.ts';
import type { RunState } from '../systems/progress.ts';
import { cabinGravity, degToRad, tiltAt, upcomingTilt } from '../systems/tilt.ts';
import { overlaps, type Body, type GameWorld, type Sprite } from '../world.ts';

export interface HudState {
  hearts: number;
  maxHearts: number;
  nuts: number;
  score: number;
  alt: string;
  bank: number;
  /** A tilt change is coming: the BANK gauge flashes. */
  bankWarning: boolean;
  label: string;
  /** Replaces "ALT …" in the top-right box (e.g. the Tabuk clock in 6-3). */
  altLabel?: string;
  /** Boss fights (World 6): the boss panel under the HUD bar. */
  boss?: BossHud;
}

export interface BossHud {
  name: string;
  phase: 'A' | 'B' | 'C';
  hp: number;
  maxHp: number;
  /** Big centred hint: "MASH GRAB!", "▼ PULL THE YOKE"… */
  prompt?: string;
  /** Phase B: pitch (°), CONTROL RESTORED 0..1, seconds held steady in the band (of 5). */
  pitch?: number;
  control?: number;
  steady?: number;
  band?: number;
  /** Phase C. */
  knots?: { name: string; value: number; max: number; target: boolean }[];
  clock?: string;
  captain?: number;
}

export type GameEvent =
  | { type: 'warn' }
  | { type: 'pause' }
  | { type: 'checkpoint'; at: Point }
  | { type: 'clear'; run: RunState; seconds: number; door: boolean }
  | { type: 'gameover'; reason: 'hearts' | 'altitude'; score: number }
  /** World 6 Phase C: a knot fully slipped, back to Phase B. */
  | { type: 'slip'; clock: number };

export interface LevelInit {
  level: LevelData;
  /** Hearts, power, nuts and score carried in from the previous level. */
  run: RunState;
  /** Retry from this galley checkpoint instead of the level start. */
  checkpoint?: Point;
  inputs: InputSource[];
  bot?: BotInput;
  /** Test/bot mode: no damage (pits still respawn). Used to prove every level's geometry is completable. */
  god?: boolean;
  onHud(state: HudState): void;
  onEvent(e: GameEvent): void;
}

/** Walking pace through the exit (world units/s). */
const EXIT_WALK_SPEED = 70;
export const MAX_HEARTS = 5;

export class LevelScene extends Phaser.Scene implements GameWorld {
  private cfg!: LevelInit;
  level!: ParsedLevel;
  player!: Player;
  terrain: Phaser.Physics.Arcade.StaticGroup[] = [];
  gravity = { x: 0, y: PHYS.gravity };
  tiltDeg = 0;
  elapsed = 0;
  finished = false;

  private blocks!: Blocks;
  private nuts!: Phaser.Physics.Arcade.StaticGroup;
  private stuckPlungers!: Phaser.Physics.Arcade.StaticGroup;
  private enemies: Enemy[] = [];
  private items: PowerItem[] = [];
  private projectiles: ThrownPlunger[] = [];
  private vines: MaskVine[] = [];
  private pendingTrolleys: Point[] = [];
  private checkpoints: Point[] = [];
  private exitZone!: Phaser.GameObjects.Zone;
  private door?: Phaser.GameObjects.Sprite;
  private captain?: Phaser.GameObjects.Sprite;
  private screamer?: { sprite: Phaser.GameObjects.Sprite; done: boolean };
  private altitude!: Altitude;
  private rng!: Phaser.Math.RandomDataGenerator;

  private edges = new ButtonEdges();
  private hearts = RULES.hearts;
  private nutCount = 0;
  private score = 0;
  private progressX = 0;
  private hudTimer = 0;
  private warnedTiltAt = -1;
  private hurtLog: { cause: string; x: number; y: number; t: number }[] = [];

  constructor() {
    super('level');
  }

  get stage(): Phaser.Scene {
    return this;
  }

  preload(): void {
    preloadAssets(this);
  }

  create(data: LevelInit): void {
    this.cfg = data;
    this.level = parseLevel(data.level);
    this.resetState(data.run);
    ensurePlaceholders(this);
    createAnimations(this);
    this.rng = new Phaser.Math.RandomDataGenerator([data.level.id]);

    const { width, height } = this.level;
    this.physics.world.setBounds(0, -VIEW_H, width, height + VIEW_H * 2, true, true, true, false);
    this.cameras.main.setBackgroundColor(data.level.mood === 'alarm' ? '#c9a99c' : '#d9cdb4');

    this.createBackground();
    const solids = this.createTerrain();
    this.createSeats();
    this.createForeground();
    this.createExit();
    this.createNpcs();

    const start = data.checkpoint ?? this.level.start;
    this.player = new Player(this, start.x, start.y, data.run.power);
    this.progressX = start.x;
    this.blocks = new Blocks(this, this.level.blocks, this.level.breakables, (item) => this.items.push(item));
    this.stuckPlungers = this.physics.add.staticGroup();
    this.terrain = [solids.solids, solids.oneWays, this.blocks.group];
    this.createItemsAndEnemies();
    this.createColliders(solids);

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    cam.setBounds(-VIEW_W / 2, -VIEW_H, width + VIEW_W, height + VIEW_H * 1.5);
    cam.startFollow(this.player.sprite, true, 0.12, 0.1);
    cam.setFollowOffset(-70, 22); // look ahead toward the cockpit; aisle and seat rows fill the lower third
    this.applyTilt(true);
    if (data.level.mood === 'alarm') this.createAlarmLight();

    this.altitude = new Altitude(data.level.altitude.start, data.level.altitude.rate);
    this.physics.world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, (delta: number) => this.step(delta));
    data.inputs.forEach((i) => i.reset?.()); // drop keys pressed during the intro card
    this.pushHud();
    this.exposeTestHooks();
  }

  private resetState(run: RunState): void {
    this.edges.clear();
    this.hearts = run.hearts;
    this.nutCount = run.nuts;
    this.score = run.score;
    this.elapsed = this.hudTimer = 0;
    this.finished = false;
    this.warnedTiltAt = -1;
    this.enemies = [];
    this.items = [];
    this.projectiles = [];
    this.vines = [];
    this.hurtLog = [];
    this.screamer = undefined;
    this.captain = this.door = undefined;
  }

  // ---------- world construction ----------

  private get floorTop(): number {
    return floorTopOf(this.level);
  }

  private createBackground(): void {
    // The cabin wall sits on the floor at 1:1 scale and scrolls slower than the play layer (parallax).
    const wall = this.add
      .tileSprite(-VIEW_W, this.floorTop - VIEW_H, this.level.width + VIEW_W * 2, VIEW_H, 'w5.bg.wall')
      .setOrigin(0)
      .setScrollFactor(0.45, 1)
      .setTileScale(ART_SCALE);
    if (this.cfg.level.mood === 'alarm') wall.setTint(0xffb4a8);
    // Cargo hold: everything below the floor line, so hatches read as dark holes.
    this.add.rectangle(-VIEW_W, this.floorTop, this.level.width + VIEW_W * 2, VIEW_H * 2, 0x15142a).setOrigin(0);
  }

  private createTerrain() {
    const solids = this.physics.add.staticGroup();
    for (const r of this.level.solids) {
      const tex = r.kind === 'floor' ? 'w5.tex.floor' : 'w5.tex.bin';
      this.add.tileSprite(r.x, r.y, r.w, r.h, tex).setOrigin(0).setTileScale(ART_SCALE);
      if (r.kind === 'floor') this.add.rectangle(r.x, r.y + r.h, r.w, VIEW_H, 0x22233c).setOrigin(0);
      solids.add(this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h));
    }
    // Visual-only floor past both level ends, so the tilted view never shows a fake pit at the edges.
    for (const x of [-VIEW_W, this.level.width]) {
      this.add.tileSprite(x, this.floorTop, VIEW_W, 32, 'w5.tex.floor').setOrigin(0).setTileScale(ART_SCALE);
      this.add.rectangle(x, this.floorTop + 32, VIEW_W, VIEW_H, 0x22233c).setOrigin(0);
    }
    const oneWays = this.physics.add.staticGroup();
    for (const r of this.level.oneWays) this.addOneWay(oneWays, r.x, r.y, r.w, r.h);
    // '-' platforms: a thin luggage shelf (its top is the standable edge) with a shadow underneath.
    for (const r of this.level.shelves) {
      this.add.rectangle(r.x + 2, r.y + 10, r.w - 4, 4, 0x000000, 0.25).setOrigin(0);
      this.add.tileSprite(r.x, r.y, r.w, 10, 'w5.tex.bin').setOrigin(0).setTileScale(ART_SCALE);
      this.add.rectangle(r.x, r.y, r.w, 2, 0xfff8e7).setOrigin(0);
    }
    return { solids, oneWays };
  }

  private addOneWay(group: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number) {
    const zone = this.add.zone(x + w / 2, y + h / 2, w, h);
    group.add(zone);
    const body = zone.body as Phaser.Physics.Arcade.StaticBody;
    body.checkCollision.down = body.checkCollision.left = body.checkCollision.right = false;
    return zone;
  }

  private createSeats(): void {
    for (const s of this.level.seats) {
      this.add.image(s.x, s.y + SEAT.h, 'w5.seat', frameIndex('w5.seat', s.kind)).setOrigin(0, 1).setScale(ART_SCALE);
    }
  }

  /** A darker row of seatbacks in front of the floor (closer to the camera), as in the concept art. */
  private createForeground(): void {
    const step = 52;
    const kinds = ['empty', 'sleeper', 'empty', 'reader', 'empty', 'kid'];
    const floors = this.level.solids.filter((s) => s.kind === 'floor');
    const ends = [
      { x: -VIEW_W, y: this.floorTop, w: VIEW_W, h: 32 },
      { x: this.level.width, y: this.floorTop, w: VIEW_W, h: 32 },
    ];
    for (const r of [...floors, ...ends]) {
      for (let x = r.x + 6, i = Math.floor(r.x / step); x + step <= r.x + r.w; x += step, i++) {
        this.add
          .image(x, r.y + 104, 'w5.seat', frameIndex('w5.seat', kinds[((i % kinds.length) + kinds.length) % kinds.length]))
          .setOrigin(0, 1)
          .setScale(ART_SCALE * 1.6)
          .setTint(this.cfg.level.mood === 'alarm' ? 0x7a5a6a : 0x6f7894)
          .setDepth(15);
      }
    }
  }

  private createExit(): void {
    const e = this.level.exit;
    if (e.kind === 'door') {
      // The cockpit door is set into the forward bulkhead: the cabin wall ends here.
      const top = this.floorTop - VIEW_H;
      const left = e.x + EXIT.w / 2;
      this.add.rectangle(left, top, this.level.width + VIEW_W - left, VIEW_H, 0x8f7a74).setOrigin(0);
      this.add.rectangle(left, top, 6, VIEW_H, 0x4a3a3e).setOrigin(0);
      this.add.rectangle(left + 6, top, 3, VIEW_H, 0xc9b2a6).setOrigin(0);
      // Panel seams and rivets, so it reads as a reinforced bulkhead rather than a blank wall.
      const right = this.level.width + VIEW_W;
      for (let y = top + 70; y < this.floorTop; y += 90) this.add.rectangle(left + 9, y, right - left, 2, 0x6e5c58).setOrigin(0);
      for (let x = left + 80; x < right; x += 96) {
        this.add.rectangle(x, top, 2, VIEW_H, 0x6e5c58).setOrigin(0);
        for (let y = top + 40; y < this.floorTop; y += 45) this.add.circle(x + 8, y, 1.5, 0x5a4a48);
      }
      this.door = this.add.sprite(e.x, e.y + EXIT.h, 'w5.door', 0).setOrigin(0, 1).setScale(ART_SCALE);
    }
    else this.add.image(e.x, e.y + EXIT.h, 'w5.curtain').setOrigin(0, 1).setScale(ART_SCALE);
    this.exitZone = this.add.zone(e.x + e.w / 2, e.y + e.h / 2, e.w * 0.6, e.h);
    this.physics.add.existing(this.exitZone, true);
    this.checkpoints = [...this.level.checkpoints];
    for (const g of this.level.checkpoints) this.add.image(g.x, g.y, 'w5.galley').setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(1);
  }

  private createNpcs(): void {
    const { captain, screamer } = this.level;
    if (captain) this.captain = this.add.sprite(captain.x, captain.y, 'npc.captain', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(5);
    if (screamer) {
      const sprite = this.add.sprite(screamer.x, screamer.y, 'npc.screamer', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(5);
      this.screamer = { sprite, done: false };
    }
  }

  private createItemsAndEnemies(): void {
    this.nuts = this.physics.add.staticGroup();
    for (const n of this.level.nuts) {
      const nut = this.nuts.create(n.x, n.y, 'item.nut', 0) as Sprite;
      nut.setScale(ART_SCALE).refreshBody().play('item.nut:spin');
    }
    const spawn = (e: Enemy) => this.enemies.push(e);
    const others = () => this.enemies;
    for (const s of this.level.suitcases) spawn(new Suitcase(this, s.x, s.y, others));
    for (const b of this.level.babies) spawn(new BabyBomber(this, b.x, b.y, spawn));
    for (const b of this.level.binBiters) spawn(new BinBiter(this, b.x, b.y));
    for (const l of this.level.luggage) spawn(new LuggageRain(this, l.x, l.y, spawn));
    for (const m of this.level.masks) this.vines.push(new MaskVine(this, m));
    // Trolleys roll in from behind once Yaniv is past their spawner (skip ones already behind a checkpoint).
    this.pendingTrolleys = this.level.trolleys.filter((t) => t.x > (this.cfg.checkpoint?.x ?? -Infinity) - 200).map((t) => ({ ...t }));
  }

  private createColliders(t: { solids: Phaser.Physics.Arcade.StaticGroup; oneWays: Phaser.Physics.Arcade.StaticGroup }): void {
    const p = this.player.sprite;
    this.physics.add.collider(p, t.solids);
    this.physics.add.collider(p, t.oneWays);
    this.physics.add.collider(p, this.stuckPlungers);
    this.physics.add.collider(p, this.blocks.group, (_p, b) => this.blocks.bump(b as Sprite, this.player));
    this.physics.add.overlap(p, this.nuts, (_p, n) => this.collectNut(n as Sprite));
    this.physics.add.overlap(p, this.exitZone, () => this.clearLevel());
  }

  private createAlarmLight(): void {
    const cam = this.cameras.main;
    const light = this.add
      .rectangle(cam.width / 2, cam.height / 2, VIEW_W * 2, VIEW_H * 2, 0xff1a1a, 1)
      .setScrollFactor(0)
      .setDepth(50)
      .setAlpha(0);
    this.tweens.add({ targets: light, alpha: 0.16, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  // ---------- GameWorld ----------

  addScore(points: number, x?: number, y?: number): void {
    this.score += points;
    if (x !== undefined && y !== undefined) this.popText(x, y, `${points}`);
    this.pushHud();
  }

  addNut(): void {
    this.nutCount++;
    if (this.nutCount % 100 === 0) this.addHeart();
    this.pushHud();
  }

  addHeart(): void {
    if (this.hearts < MAX_HEARTS) this.hearts++;
    else this.score += 1000;
    this.popText(this.player.x, this.player.y - 70, '1-UP');
    this.pushHud();
  }

  sfx(name: Sfx): void {
    play(name);
  }

  warn(): void {
    this.cfg.onEvent({ type: 'warn' });
  }

  random(): number {
    return this.rng.frac();
  }

  solidAt(box: { left: number; right: number; top: number; bottom: number }): boolean {
    return this.level.solids.some((r) => box.left < r.x + r.w && box.right > r.x && box.top < r.y + r.h && box.bottom > r.y);
  }

  standableAt(x: number, y: number): boolean {
    return [...this.level.solids, ...this.level.oneWays].some((r) => x >= r.x && x <= r.x + r.w && Math.abs(r.y - y) < 3);
  }

  hurtPlayer(fromX: number, cause: string): void {
    const p = this.player;
    if (p.invulnerable > 0 || p.bamba > 0 || this.finished) return;
    if (this.cfg.god && cause !== 'pit') return;
    this.cameras.main.shake(180, 0.006);
    if (p.power !== 'small') {
      // Big or Golden: lose the power-up, not a heart.
      p.setPower('small');
      this.sfx('hurt');
      p.invulnerable = PHYS.hurtInvulnerable;
      return;
    }
    if (!this.cfg.god) this.hearts--;
    this.hurtLog.push({ cause, x: Math.round(p.x), y: Math.round(p.y), t: Math.round(this.elapsed * 100) / 100 });
    this.sfx('hurt');
    this.pushHud();
    if (this.hearts <= 0) return this.gameOver('hearts');
    p.invulnerable = PHYS.hurtInvulnerable;
    if (cause !== 'pit') {
      if (p.swing) p.letGo(false);
      p.knockback(Math.sign(p.x - fromX) || -1);
    }
  }

  // ---------- gameplay ----------

  /**
   * Gameplay runs on the fixed 60 Hz physics step (Arcade's 'worldstep'), not the render frame, so input,
   * jumps, timers and the bot behave identically at any frame rate (slow phones, loaded CI machines).
   */
  private step(dt: number): void {
    if (this.finished) return;
    this.elapsed += dt;
    this.readInput();
    if (this.edges.pressed('pause')) {
      // Forget this step's buttons: otherwise, after resuming, the edge detector still sees 'pause' held and
      // a quick second press would be missed (seen on WebKit, where resume-then-Escape lands before a step).
      this.edges.clear();
      this.cfg.onEvent({ type: 'pause' });
      return;
    }
    const p = this.player;
    this.progressX = Math.max(this.progressX, p.x);
    this.applyTilt(false);

    if (p.step(dt, this.edges)) this.fire();
    this.stepVines(dt);
    this.stepEnemies(dt);
    for (const item of this.items) {
      item.step();
      if (item.live && overlaps(p.body, item.bounds)) item.collect(p);
    }
    this.items = this.items.filter((i) => i.live);
    for (const pr of this.projectiles) pr.step(dt, this.enemies);
    this.projectiles = this.projectiles.filter((pr) => pr.live);
    this.stepNpcs();

    if (p.y > this.level.height + 48 && !p.swing) this.fellInPit();
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

  private applyTilt(force: boolean): void {
    const keys = this.cfg.level.tilt;
    const deg = tiltAt(keys, this.progressX);
    const next = upcomingTilt(keys, this.progressX);
    if (next && next.x !== this.warnedTiltAt) {
      this.warnedTiltAt = next.x;
      this.sfx('warn');
      this.pushHud();
    }
    if (!force && Math.abs(deg - this.tiltDeg) < 0.01) return;
    this.tiltDeg = deg;
    const g = cabinGravity(PHYS.gravity, deg);
    this.gravity = g;
    this.physics.world.gravity.set(g.x, g.y);
    // The player only feels a fraction of the slope; trolleys, cases and luggage feel all of it.
    this.player.body.setGravityX(-g.x * (1 - PHYS.playerSlopeFeel));
    this.cameras.main.setRotation(degToRad(deg));
  }

  /** GRAB: Golden Yaniv throws a plunger; otherwise a short-range plunger poke. */
  private fire(): void {
    const p = this.player;
    if (p.power === 'golden') {
      if (this.projectiles.length >= 2) return;
      const pr = new ThrownPlunger(this, p.x + p.facing * 14, p.y - 34, p.facing, (x, y) => {
        const zone = this.addOneWay(this.stuckPlungers, x - 9, y - 3, 18, 6);
        this.time.delayedCall(3900, () => zone.destroy());
      });
      this.projectiles.push(pr);
      return;
    }
    this.sfx('thwop');
    const reach = this.add.rectangle(p.x + p.facing * 22, p.y - 30, 18, 8, 0xd61f1f).setDepth(11);
    this.tweens.add({ targets: reach, x: reach.x + p.facing * 12, alpha: 0, duration: 160, onComplete: () => reach.destroy() });
    // Reach well past body contact (~36): the plunger must win against a trolley rolling in at speed. It also
    // reaches a little above the head, so a Bin Biter can be plunged shut from the floor.
    const [x0, x1] = p.facing > 0 ? [p.x - 8, p.x + 72] : [p.x - 72, p.x + 8];
    const reachBox = { left: x0, right: x1, top: p.body.top - 36, bottom: p.y + 4 };
    for (const e of this.enemies) {
      if (!e.live) continue;
      const box = e.hitbox();
      const inReach = box ? overlaps(reachBox, box) : e.x > x0 && e.x < x1 && Math.abs(e.y - p.y) < 40;
      if (inReach) e.hit('plunger');
    }
  }

  private stepVines(dt: number): void {
    const p = this.player;
    for (const v of this.vines) {
      v.step(dt);
      if (!p.swing && p.swingCooldown <= 0 && v !== p.releasedVine && !p.grounded && p.hurtTimer <= 0 && overlaps(p.body, v.grabZone)) p.grab(v);
    }
  }

  private stepEnemies(dt: number): void {
    const p = this.player;
    for (let i = this.pendingTrolleys.length - 1; i >= 0; i--) {
      const s = this.pendingTrolleys[i];
      if (p.x - s.x < RULES.trolleyTriggerDistance) continue;
      this.pendingTrolleys.splice(i, 1);
      this.enemies.push(new Trolley(this, s.x, s.y));
    }
    const jumpHeld = this.edges.current.jump;
    for (const e of this.enemies) {
      if (!e.live) continue;
      e.step(dt);
      const box = e.live ? e.hitbox() : null;
      if (box && overlaps(p.body, box)) e.touch(p, jumpHeld);
    }
    this.enemies = this.enemies.filter((e) => e.live);
  }

  private stepNpcs(): void {
    const p = this.player;
    const s = this.screamer;
    if (s && !s.done && p.x > s.sprite.x - 150) {
      // 5-1's opening beat: a woman screams and the plane shakes.
      s.done = true;
      s.sprite.play('npc.screamer:scream');
      this.sfx('scream');
      this.cameras.main.shake(900, 0.012);
      this.warn();
      this.time.delayedCall(1800, () => {
        s.sprite.anims.stop();
        s.sprite.setFrame(frameIndex('npc.screamer', 'calm'));
      });
    }
    for (const c of this.checkpoints) {
      if (p.x < c.x) continue;
      this.checkpoints = this.checkpoints.filter((k) => k !== c);
      this.cfg.onEvent({ type: 'checkpoint', at: c });
      this.popText(c.x, c.y - 70, 'CHECKPOINT');
      this.sfx('ding');
    }
  }

  private collectNut(nut: Sprite): void {
    nut.destroy();
    this.score += RULES.nutScore;
    this.addNut();
    this.sfx('nut');
  }

  private fellInPit(): void {
    const p = this.player;
    p.invulnerable = 0;
    if (p.power !== 'small') p.setPower('small', true); // a fall costs a heart even when Big
    this.hurtPlayer(p.x, 'pit');
    if (this.finished) return;
    p.placeAt(p.lastSafe.x, p.lastSafe.y - 1);
    p.controlLock = 0.6;
    this.cameras.main.flash(200, 20, 16, 34);
  }

  /**
   * Exit sequence: controls off, Yaniv walks steadily through the curtain or cockpit door (the slope's pull
   * cancelled, so no creeping or sliding off the level), fades out behind it, then the card appears.
   */
  private clearLevel(): void {
    if (this.finished) return;
    this.finished = true;
    const p = this.player;
    if (p.swing) p.letGo(false);
    const door = this.level.exit.kind === 'door';
    if (door) {
      this.door?.setFrame(frameIndex('w5.door', 'open'));
      this.captain?.setFrame(frameIndex('npc.captain', 'thumbsUp'));
    }
    const body = p.body;
    body.setGravityX(-this.physics.world.gravity.x);
    body.setVelocityX(EXIT_WALK_SPEED);
    p.sprite.setFlipX(false).anims.play('yaniv.small:run', true);
    for (const e of this.enemies) {
      if (e instanceof Trolley && e.live) e.freeze();
    }
    this.sfx('chime');
    this.pushHud();
    this.tweens.add({
      targets: p.sprite,
      alpha: 0,
      delay: 250,
      duration: 450,
      onComplete: () => {
        body.stop();
        body.enable = false;
        p.sprite.anims.stop();
      },
    });
    const run: RunState = { hearts: this.hearts, power: p.power, nuts: this.nutCount, score: this.score };
    this.time.delayedCall(door ? 1400 : 900, () => this.cfg.onEvent({ type: 'clear', run, seconds: Math.round(this.elapsed), door }));
  }

  private gameOver(reason: 'hearts' | 'altitude'): void {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    this.player.showFrame('hurt');
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
      boss: undefined,
      hearts: Math.max(0, this.hearts),
      maxHearts: Math.max(RULES.hearts, this.hearts),
      nuts: this.nutCount,
      score: this.score,
      alt: this.altitude?.format() ?? '',
      bank: Math.round(this.tiltDeg),
      bankWarning: !!upcomingTilt(this.cfg.level.tilt, this.progressX),
      label: `${this.cfg.level.id}  ${this.cfg.level.name}`,
    });
  }

  // ---------- bot + test hooks ----------

  private botView(): BotView {
    const p = this.player;
    const body = p.body;
    const standable = [...this.level.solids, ...this.level.oneWays];
    const feet = body.bottom;
    const blocks = [...this.level.blocks, ...this.level.breakables];
    return {
      x: p.x,
      y: feet,
      vx: body.velocity.x,
      grounded: p.grounded,
      swinging: !!p.swing,
      swingVx: p.swing?.tipVelocity.x ?? 0,
      swingDx: p.swing ? p.swing.end.x - p.swing.anchor.x : 0,
      groundAt: (x: number) => standable.some((r) => x >= r.x && x <= r.x + r.w && r.y >= feet - 4 && r.y <= feet + 40),
      // Anything overlapping the player's body height (feet-46 .. feet-8) at x is a wall to jump over.
      wallAt: (x: number) =>
        this.level.solids.some((r) => x >= r.x && x <= r.x + r.w && r.y < feet - 8 && r.y + r.h > feet - 46) ||
        blocks.some((k) => x >= k.x && x <= k.x + BLOCK && k.y < feet - 8 && k.y + BLOCK > feet - 46),
      threats: this.enemies
        .filter((e) => e.live && (e.hitbox() || e.kind === 'baby'))
        .map((e) => ({ kind: e.kind, dx: e.x - p.x, dy: e.y - p.y, vx: e.vx })),
    };
  }

  private exposeTestHooks(): void {
    (window as unknown as { __syb?: unknown }).__syb = {
      state: () => ({
        level: this.cfg.level.id,
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        hearts: this.hearts,
        nuts: this.nutCount,
        score: this.score,
        power: this.player.power,
        bamba: Math.round(this.player.bamba * 10) / 10,
        swinging: !!this.player.swing,
        finished: this.finished,
        tilt: Math.round(this.tiltDeg * 10) / 10,
        width: this.level.width,
        hurts: [...this.hurtLog],
        enemies: this.enemies.filter((e) => e.live).map((e) => ({ kind: e.kind, x: Math.round(e.x), y: Math.round(e.y) })),
        items: this.items
          .filter((i) => i.ready)
          .map((i) => ({ kind: i.kind, x: Math.round((i.bounds.left + i.bounds.right) / 2), y: Math.round(i.bounds.bottom) })),
      }),
      /** Test-only: move the player (feet at y) to set up a situation quickly. */
      teleport: (x: number, y: number) => {
        this.player.placeAt(x, y);
        this.player.lastSafe = { x, y };
        this.progressX = Math.max(this.progressX, x);
      },
      /** Test-only: remove all trolleys (pending and live) to isolate other mechanics. */
      clearTrolleys: () => {
        this.pendingTrolleys = [];
        for (const e of this.enemies) if (e.kind === 'trolley') e.destroy();
      },
      /** Test-only: remove every enemy and hazard (trolleys, cases, babies, biters, luggage). */
      clearEnemies: () => {
        this.pendingTrolleys = [];
        for (const e of this.enemies) e.destroy();
      },
      setPower: (power: 'small' | 'big' | 'golden') => this.player.setPower(power, true),
      giveBamba: () => (this.player.bamba = 8),
    };
  }
}

export type { Body };
