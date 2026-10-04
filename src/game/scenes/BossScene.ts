/**
 * World 6: the fight with Jacuzzam Al-Jacuzzi in the cockpit, one phase per stage (6-1 A, 6-2 B, 6-3 C).
 * The rules live in systems/boss.ts; this scene builds the one-screen arena, draws the boss and the Bros.,
 * and routes Yaniv's actions to the phase's state machine.
 */
import Phaser from 'phaser';
import { music } from '../../audio/music.ts';
import { play, type Sfx } from '../../audio/sfx.ts';
import { createAnimations, ensurePlaceholders, frameIndex, preloadAssets } from '../assets.ts';
import { ART_SCALE, PHYS, RULES, VIEW_H, VIEW_W, ZOOM } from '../config.ts';
import { Bubble, Ducky } from '../entities/boss.ts';
import { Lobbed, lobVelocity, type Enemy } from '../entities/enemies.ts';
import { Player } from '../entities/player.ts';
import type { BossData } from '../levels/index.ts';
import { parseLevel, type ParsedLevel } from '../levels/loader.ts';
import { Altitude } from '../systems/altitude.ts';
import { BOSS_HP, BOSS_NAME, KNOTS, Knots, PITCH, PhaseA, PitchControl, type BossEvent, type BossEventB, type BossEventC } from '../systems/boss.ts';
import { ButtonEdges, noButtons, type BossBot, type BossBotView, type InputSource } from '../systems/input.ts';
import type { RunState } from '../systems/progress.ts';
import { cabinGravity, degToRad } from '../systems/tilt.ts';
import { overlaps, type GameWorld } from '../world.ts';
import { MAX_HEARTS, type BossHud, type GameEvent, type HudState } from './LevelScene.ts';

export interface BossInit {
  level: BossData;
  run: RunState;
  inputs: InputSource[];
  bot?: BossBot;
  god?: boolean;
  /** Phase B restarted after a slipped knot begins with the boss at this HP. */
  bossHp?: number;
  /** Phase C resumed after a slip: the Tabuk clock keeps its progress (game seconds left). */
  clock?: number;
  onHud(state: HudState): void;
  onEvent(e: GameEvent): void;
}

/** Arena layout (world units). One screen: 640 wide, floor top at FLOOR. */
const FLOOR = 304;
const W = 640;
const SEATS = [144, 400]; // captain's and first officer's seat (left edge, 48 wide)
const YOKE_X = 320;
/** Stand here (left of and at the yoke) to pull it. ▼ well away from it calls Assaf instead. */
const YOKE_ZONE = { left: 280, right: 332 };
const ASSAF_CALL_DISTANCE = 56;
const BOSS_A = { min: 470, max: 580, home: 540 };
const BOSS_B_X = 380;
const BOSS_C_X = 320;
const KNOT_X = [276, 320, 364];
const DOOR_X = 40;
const ZVIKA_X = 84;
const SHOTA_X = 520;
const CAPTAIN_X = 572;
const ZIP_X = 170;
/** Boss body (world units): a hulking 1.6× Yaniv. */
const BOSS_BODY = { w: 56, h: 96 };
/** Jet bubbles fly at shin-to-hip height (a seat-top stance clears them) and fizzle out after this range. */
const BUBBLE_Y = FLOOR - 34;
const BUBBLE_RANGE = 260;
/** Standable seatback tops (the pilot seats face right, the backrest is on their left). */
const SEAT_TOP = { dx: 2, w: 24, y: FLOOR - 58 };

/** The arena as a level grid: floor, two seat tops (one-way) in the cockpit, nothing else. */
function arenaGrid(phase: BossData['phase']): string[] {
  const rows = Array.from({ length: 22 }, () => Array<string>(W / 16).fill('.'));
  for (let r = 19; r < 22; r++) rows[r].fill('#');
  rows[18][phase === 'C' ? 12 : 14] = 'P'; // clear of the Bros. at the door
  rows[18][38] = 'X';
  return rows.map((r) => r.join(''));
}

export class BossScene extends Phaser.Scene implements GameWorld {
  private cfg!: BossInit;
  level!: ParsedLevel;
  player!: Player;
  terrain: Phaser.Physics.Arcade.StaticGroup[] = [];
  gravity = { x: 0, y: PHYS.gravity };
  tiltDeg = 0;
  elapsed = 0;
  finished = false;

  private phase!: BossData['phase'];
  private a?: PhaseA;
  private b?: PitchControl;
  private c?: Knots;
  private boss!: Phaser.GameObjects.Sprite;
  private bossX = 0;
  private bossFlash = 0;
  private yoke?: Phaser.GameObjects.Sprite;
  private assaf?: Phaser.GameObjects.Sprite;
  private zvika?: Phaser.GameObjects.Sprite;
  private zip?: Phaser.GameObjects.Image;
  private knotMarks?: Phaser.GameObjects.Graphics;
  private enemies: Enemy[] = [];
  private altitude!: Altitude;
  private rng!: Phaser.Math.RandomDataGenerator;
  private edges = new ButtonEdges();
  private hearts = RULES.hearts;
  private nuts = 0;
  private score = 0;
  private hudTimer = 0;
  private leanTilt = 0;
  private jetTimer = 0;
  private slapTimer = 0;
  private poseTimer = 0;
  private hurtLog: { cause: string; x: number; y: number; t: number }[] = [];

  constructor() {
    super('boss');
  }

  get stage(): Phaser.Scene {
    return this;
  }

  preload(): void {
    preloadAssets(this);
  }

  create(data: BossInit): void {
    this.cfg = data;
    this.phase = data.level.phase;
    this.level = parseLevel({ id: data.level.id, name: data.level.name, altitude: { start: 0, rate: 0 }, tilt: [], grid: arenaGrid(this.phase) });
    this.hearts = data.run.hearts;
    this.nuts = data.run.nuts;
    this.score = data.run.score;
    this.elapsed = this.hudTimer = this.leanTilt = this.jetTimer = this.slapTimer = this.poseTimer = 0;
    this.finished = false;
    this.enemies = [];
    this.hurtLog = [];
    this.edges.clear();
    this.a = this.b = this.c = undefined;
    this.zip = undefined;
    ensurePlaceholders(this);
    createAnimations(this);
    this.rng = new Phaser.Math.RandomDataGenerator([data.level.id]);

    this.physics.world.setBounds(0, -VIEW_H, W, this.level.height + VIEW_H * 2, true, true, true, false);
    this.createArena();
    const terrain = this.physics.add.staticGroup();
    for (const r of this.level.solids) terrain.add(this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h));
    const oneWays = this.physics.add.staticGroup();
    this.level.oneWays = this.phase === 'C' ? [] : SEATS.map((x) => ({ x: x + SEAT_TOP.dx, y: SEAT_TOP.y, w: SEAT_TOP.w, h: 6 }));
    for (const r of this.level.oneWays) {
      const z = this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      oneWays.add(z);
      const body = z.body as Phaser.Physics.Arcade.StaticBody;
      body.checkCollision.down = body.checkCollision.left = body.checkCollision.right = false;
    }
    this.terrain = [terrain, oneWays];

    const start = this.phase === 'B' ? { x: YOKE_ZONE.left + 10, y: FLOOR } : this.level.start;
    this.player = new Player(this, start.x, start.y, data.run.power);
    this.physics.add.collider(this.player.sprite, terrain);
    this.physics.add.collider(this.player.sprite, oneWays);

    if (this.phase === 'A') this.a = new PhaseA();
    if (this.phase === 'B') this.b = new PitchControl(data.bossHp ?? BOSS_HP);
    if (this.phase === 'C') this.c = new Knots(() => this.rng.frac(), data.clock);
    this.createCast();

    const cam = this.cameras.main;
    cam.setZoom(ZOOM);
    // On touch devices the floor sits higher, so the on-screen buttons cover the floor, not the fight.
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    cam.centerOn(W / 2, FLOOR + (touch ? 0 : 50) - VIEW_H / 2);
    this.applyTilt(true); // always set gravity: the arcade world starts with none
    if (this.phase !== 'C') this.createAlarmLight();

    // Rate 1 ft per "tick unit": step() ticks it by dt × altRate(), which follows the pitch.
    this.altitude = new Altitude(data.level.altitude.start, 1);
    this.physics.world.on(Phaser.Physics.Arcade.Events.WORLD_STEP, (delta: number) => this.step(delta));
    data.inputs.forEach((i) => i.reset?.());
    this.pushHud();
    this.exposeTestHooks();
  }

  // ---------- arena + cast ----------

  private createArena(): void {
    const bg = this.phase === 'C' ? 'w6.bg.galley' : 'w6.bg.cockpit';
    // Drawn larger than the view so a tilted camera never shows its edges.
    this.add.image(W / 2, FLOOR + 50 - VIEW_H / 2, bg).setScale(ART_SCALE * 1.5).setDepth(-10);
    this.add.tileSprite(-VIEW_W / 2, FLOOR, W + VIEW_W, 32, 'w5.tex.floor').setOrigin(0).setTileScale(ART_SCALE);
    this.add.rectangle(-VIEW_W / 2, FLOOR + 32, W + VIEW_W, VIEW_H, 0x22233c).setOrigin(0);
    if (this.phase !== 'C') {
      for (const x of SEATS) this.add.image(x, FLOOR, 'w6.seat.pilot').setOrigin(0, 1).setScale(ART_SCALE).setDepth(2);
      this.yoke = this.add.sprite(YOKE_X, FLOOR, 'w6.yoke', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(3);
      // The dark yoke disappears against the dark panel: a soft amber glow marks it (it's what you fly with).
      this.yoke.preFX?.addGlow(0xffb347, 2, 0, false, 0.1, 8);
    }
  }

  private createCast(): void {
    const npc = (key: string, x: number, flip = false) =>
      this.add.sprite(x, FLOOR, key, 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(4).setFlipX(flip);
    if (this.phase !== 'C') {
      // Assaf and Zvika wait at the door (concept art); Assaf pins his arms in Phase B.
      this.assaf = npc('npc.assaf', DOOR_X);
      this.zvika = npc('npc.zvika', ZVIKA_X);
    } else {
      this.zvika = npc('npc.zvika', ZVIKA_X);
      npc('npc.shota', SHOTA_X, true).setFrame(frameIndex('npc.shota', 'help'));
      this.add.sprite(CAPTAIN_X, FLOOR, 'npc.captain', frameIndex('npc.captain', 'hurt')).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(3).setFlipX(true);
      this.knotMarks = this.add.graphics().setDepth(12);
    }
    this.bossX = this.phase === 'A' ? BOSS_A.home : this.phase === 'B' ? BOSS_B_X : BOSS_C_X;
    // He faces left (toward Yaniv); the sheet is drawn facing left.
    this.boss = this.add.sprite(this.bossX, FLOOR, 'boss.jacuzzam', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(6);
    if (this.phase === 'C') this.boss.play('boss.jacuzzam:wriggle');
    else this.boss.play('boss.jacuzzam:idle');
  }

  private createAlarmLight(): void {
    const cam = this.cameras.main;
    const light = this.add.rectangle(cam.width / 2, cam.height / 2, VIEW_W * 2, VIEW_H * 2, 0xff1a1a, 1).setScrollFactor(0).setDepth(50).setAlpha(0);
    this.tweens.add({ targets: light, alpha: 0.13, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  // ---------- GameWorld ----------

  addScore(points: number, x?: number, y?: number): void {
    this.score += points;
    if (x !== undefined && y !== undefined) this.popText(x, y, `${points}`);
    this.pushHud();
  }

  addNut(): void {
    this.nuts++;
  }

  addHeart(): void {
    if (this.hearts < MAX_HEARTS) this.hearts++;
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
    return this.level.solids.some((r) => x >= r.x && x <= r.x + r.w && Math.abs(r.y - y) < 3);
  }

  hurtPlayer(fromX: number, cause: string): void {
    const p = this.player;
    if (p.invulnerable > 0 || p.bamba > 0 || this.finished || this.phase === 'C') return;
    if (this.cfg.god) return;
    this.cameras.main.shake(180, 0.006);
    p.pose = null;
    if (p.power !== 'small') {
      p.setPower('small');
      this.sfx('hurt');
      p.invulnerable = PHYS.hurtInvulnerable;
      return;
    }
    this.hearts--;
    this.hurtLog.push({ cause, x: Math.round(p.x), y: Math.round(p.y), t: Math.round(this.elapsed * 100) / 100 });
    this.sfx('hurt');
    this.pushHud();
    if (this.hearts <= 0) return this.gameOver('hearts');
    p.invulnerable = PHYS.hurtInvulnerable;
    p.knockback(Math.sign(p.x - fromX) || -1);
  }

  // ---------- the fixed step ----------

  private step(dt: number): void {
    if (this.finished) return;
    this.elapsed += dt;
    const read = noButtons();
    if (this.cfg.bot) this.cfg.bot.view = this.botView();
    for (const src of this.cfg.inputs) src.read(read);
    this.cfg.bot?.read(read);
    this.edges.next(read);
    if (this.edges.pressed('pause')) {
      this.edges.clear();
      this.cfg.onEvent({ type: 'pause' });
      return;
    }
    const p = this.player;
    this.poseTimer = Math.max(0, this.poseTimer - dt);
    this.bossFlash = Math.max(0, this.bossFlash - dt);
    if (this.phase === 'A') this.stepA(dt);
    else if (this.phase === 'B') this.stepB(dt);
    else this.stepC(dt);
    if (this.finished) return;
    if (p.step(dt, this.edges)) this.poke();
    this.applyTilt();
    this.stepEnemies(dt);
    this.boss.setTint(this.bossFlash > 0 && Math.floor(this.bossFlash * 20) % 2 ? 0xff8080 : 0xffffff);

    if (p.y > this.level.height + 48) p.placeAt(p.lastSafe.x, p.lastSafe.y - 1); // no pits here: just in case
    if (this.phase !== 'C') {
      this.altitude.tick(dt * this.altRate());
      if (this.altitude.crashed) return this.gameOver('altitude');
    }
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) this.pushHud();
  }

  /** ALT lost per second: the steeper the dive, the faster (Phase A ~45–100 ft/s, Phase B up to 420). */
  private altRate(): number {
    if (this.phase === 'A') return 5 * this.tiltDeg;
    return Math.max(0, -(this.b?.pitch ?? 0)) * 12;
  }

  private applyTilt(force = false): void {
    let deg = 0;
    if (this.phase === 'A') deg = Math.min(14, 8 + this.elapsed / 10) + this.leanTilt;
    if (this.phase === 'B') deg = Math.max(0, -this.b!.pitch) * 0.5; // the cabin shows half the true pitch
    if (!force && Math.abs(deg - this.tiltDeg) < 0.01) return;
    this.tiltDeg = deg;
    const g = cabinGravity(PHYS.gravity, deg);
    this.gravity = g;
    this.physics.world.gravity.set(g.x, g.y);
    this.player.body.setGravityX(-g.x * (1 - PHYS.playerSlopeFeel));
    this.cameras.main.setRotation(degToRad(deg));
  }

  /** The boss's body box (feet at FLOOR). */
  private bossBox() {
    return { left: this.bossX - BOSS_BODY.w / 2, right: this.bossX + BOSS_BODY.w / 2, top: FLOOR - BOSS_BODY.h, bottom: FLOOR };
  }

  /** Yaniv touching the boss: a stomp from above, else a bump (hurts when he is dangerous). */
  private touchBoss(dangerous: boolean, onStomp: () => boolean): void {
    const p = this.player;
    const box = this.bossBox();
    if (!overlaps(p.body, box)) return;
    if (p.canStomp(box.top) && onStomp()) {
      p.bounce(this.edges.current.jump);
      this.sfx('stomp');
      return;
    }
    if (dangerous) this.hurtPlayer(this.bossX, 'boss');
  }

  /** The plunger poke reach (same box as World 5's poke). */
  private reachBox() {
    const p = this.player;
    const [x0, x1] = p.facing > 0 ? [p.x - 8, p.x + 72] : [p.x - 72, p.x + 8];
    return { left: x0, right: x1, top: p.body.top - 36, bottom: p.y + 4 };
  }

  /** GRAB: a plunger poke. Swats projectiles and ducks; in A it plunges a jet nozzle, in B his goggles. */
  private poke(): void {
    const p = this.player;
    if (this.phase === 'C') return;
    if (this.a?.mode === 'stagger' || this.a?.mode === 'choke') return; // GRAB is for the chokehold (stepA)
    this.sfx('thwop');
    const reach = this.add.rectangle(p.x + p.facing * 22, p.y - 30, 18, 8, 0xd61f1f).setDepth(11);
    this.tweens.add({ targets: reach, x: reach.x + p.facing * 12, alpha: 0, duration: 160, onComplete: () => reach.destroy() });
    const box = this.reachBox();
    for (const e of this.enemies) {
      const h = e.live ? e.hitbox() : null;
      if (h && overlaps(box, h)) e.hit('plunger');
    }
    if (this.a) {
      const nozzle = { left: this.bossX - 52, right: this.bossX - 28, top: FLOOR - 68, bottom: FLOOR - 44 };
      if (overlaps(box, nozzle)) this.onA(this.a.plungeNozzle());
    }
    if (this.b && overlaps(box, this.bossBox())) this.onB(this.b.hit());
  }

  private stepEnemies(dt: number): void {
    const p = this.player;
    const jumpHeld = this.edges.current.jump;
    for (const e of this.enemies) {
      if (!e.live) continue;
      e.step(dt);
      const box = e.live ? e.hitbox() : null;
      if (box && overlaps(p.body, box)) e.touch(p, jumpHeld);
    }
    this.enemies = this.enemies.filter((e) => e.live);
  }

  /** Lob something at Yaniv from the boss's raised hand; never point-blank, always a readable arc. */
  private lob(kind: string, key: string, bounces = 1): void {
    const p = this.player;
    const [x0, y0] = [this.bossX - 16, FLOOR - 120];
    if (Math.abs(p.x - x0) < 40) return;
    const v = lobVelocity(this, x0, y0, p.x, p.y - 24, 1.1);
    this.enemies.push(new Lobbed(this, kind, key, x0, y0, v.x, v.y, bounces));
    this.sfx('bump');
  }

  private bossFrame(name: string): void {
    this.boss.anims.stop();
    this.boss.setFrame(frameIndex('boss.jacuzzam', name));
  }

  // ---------- Phase A: fight ----------

  private stepA(dt: number): void {
    const a = this.a!;
    const p = this.player;
    this.onA(a.tick(dt));
    // He paces between the windscreen and the first officer's seat while idle.
    if (a.mode === 'idle') {
      const target = p.x < this.bossX - 150 ? BOSS_A.min : BOSS_A.home;
      this.bossX += Phaser.Math.Clamp(target - this.bossX, -30 * dt, 30 * dt);
      this.bossX = Phaser.Math.Clamp(this.bossX, BOSS_A.min, BOSS_A.max);
      this.boss.x = this.bossX;
      if (!this.boss.anims.isPlaying) this.boss.play('boss.jacuzzam:idle');
    }
    if (a.jetFiring) {
      this.jetTimer -= dt;
      if (this.jetTimer <= 0) {
        this.jetTimer = 0.12;
        this.enemies.push(new Bubble(this, this.bossX - 44, BUBBLE_Y, -230, BUBBLE_RANGE));
      }
    }
    if (a.jetWindup) this.bossFrame('jetWind');
    else if (a.jetFiring) this.bossFrame('jetFire');
    else if (a.leaning) this.bossFrame('lean');
    else if (a.mode === 'stagger') this.bossFrame('stagger');
    else if (a.mode === 'choke') this.bossFrame('held');

    if (a.mode === 'stagger') {
      // GRAB from behind (he faces left, so "behind" is to his right).
      const behind = p.x > this.bossX + 8 && p.x - this.bossX < 64 && p.grounded;
      if (!behind && this.edges.pressed('grab') && Math.abs(p.x - this.bossX) < 90) this.popText(this.bossX, FLOOR - 130, 'FROM BEHIND!');
      if (behind && this.edges.pressed('grab') && a.grabFromBehind()) {
        p.pose = 'choke';
        p.placeAt(this.bossX + 30, FLOOR);
        p.sprite.setFlipX(true);
        this.sfx('thwop');
      }
    } else if (a.mode === 'choke') {
      if (this.edges.pressed('grab')) {
        this.onA(a.tap());
        this.cameras.main.shake(60, 0.004);
      }
    } else {
      this.touchBoss(a.mode !== 'hit', () => this.onA(a.stomp()).length > 0 || a.mode === 'hit');
    }
  }

  private onA(events: BossEvent[]): BossEvent[] {
    for (const e of events) {
      switch (e.type) {
        case 'throw':
          this.bossFrame('throw');
          this.lob('binder', 'proj.binder');
          break;
        case 'duck':
          this.enemies.push(new Ducky(this, this.bossX - 40, FLOOR)); // out from under his robe
          this.sfx('bump');
          break;
        case 'lean':
          this.leanTilt = e.on ? 6 : 0;
          if (e.on) this.warn();
          break;
        case 'jetStart':
          this.sfx('warn');
          break;
        case 'reverse':
          // The jet blasts back into his own goggles.
          for (let i = 0; i < 6; i++) {
            const bub = this.add.image(this.bossX - 40, FLOOR - 56, 'proj.bubble', 0).setScale(ART_SCALE).setDepth(11);
            this.tweens.add({ targets: bub, x: this.bossX + (i - 3) * 6, y: FLOOR - 90 - i * 4, alpha: 0, duration: 380, onComplete: () => bub.destroy() });
          }
          this.sfx('thwop');
          break;
        case 'hit':
          this.bossFrame('hit');
          this.bossFlash = 0.6;
          this.addScore(1000, this.bossX, FLOOR - 120);
          for (const en of this.enemies) if (en.kind === 'bubble') en.hit('plunger');
          break;
        case 'stagger':
          this.popText(this.bossX, FLOOR - 130, 'GRAB HIM FROM BEHIND!');
          break;
        case 'recover':
          this.player.pose = null;
          this.player.knockback(1);
          this.popText(this.bossX, FLOOR - 130, 'HE SHOOK YOU OFF!');
          this.boss.play('boss.jacuzzam:idle');
          break;
        case 'won':
          this.win(5000);
          break;
      }
    }
    return events;
  }

  // ---------- Phase B: fight + fly ----------

  private stepB(dt: number): void {
    const b = this.b!;
    const p = this.player;
    const atYoke = p.x >= YOKE_ZONE.left && p.x <= YOKE_ZONE.right && p.grounded;
    const pulling = atYoke && this.edges.current.down && p.hurtTimer <= 0;
    p.pose = pulling ? 'pull' : null;
    if (pulling) p.sprite.setFlipX(false); // facing the yoke (and Jacuzzam behind it), leaning back
    this.onB(b.tick(dt, pulling));
    // ▼ well away from the yoke calls Assaf to pin his arms.
    if (Math.abs(p.x - YOKE_X) > ASSAF_CALL_DISTANCE && this.edges.pressed('down')) this.onB(b.pin());

    this.slapTimer = Math.max(0, this.slapTimer - dt);
    if (b.subdued || b.pinned > 0) this.bossFrame('held');
    else if (this.slapTimer > 0) this.bossFrame('slap');
    else if (b.invulnerable > 0.6) this.bossFrame('hit');
    else if (!this.boss.anims.isPlaying) this.boss.play('boss.jacuzzam:idle');
    this.yoke?.setFrame(frameIndex('w6.yoke', pulling ? 'pulled' : this.slapTimer > 0 ? 'pushed' : 'neutral'));
    // Landing on his head is always a safe bounce; it only counts as a hit while he is open.
    this.touchBoss(!b.subdued && b.pinned <= 0, () => (this.onB(b.hit()), true));
  }

  private onB(events: BossEventB[]): BossEventB[] {
    const b = this.b!;
    for (const e of events) {
      switch (e.type) {
        case 'slap':
          this.slapTimer = 0.4;
          this.cameras.main.shake(200, 0.008);
          this.sfx('bump');
          this.warn();
          break;
        case 'bomb':
          // Wind-up first (arm raised, a fizz), then a high lob: time to let go of the yoke and swat or jump.
          this.bossFrame('throw');
          this.sfx('warn');
          this.time.delayedCall(450, () => !this.finished && !b.subdued && this.lob('bathbomb', 'proj.bathbomb', 3));
          break;
        case 'pinned':
          if (e.on) {
            this.assaf?.setFrame(frameIndex('npc.assaf', 'pin')).setFlipX(true).setDepth(7);
            this.tweens.add({ targets: this.assaf, x: this.bossX + 22, duration: 300 });
            this.popText(this.bossX, FLOOR - 130, 'ASSAF: FULL COVERAGE!');
          } else if (!b.subdued) {
            this.assaf?.setFrame(frameIndex('npc.assaf', 'idle')).setFlipX(false).setDepth(4);
            this.tweens.add({ targets: this.assaf, x: DOOR_X, duration: 400 });
          }
          break;
        case 'hit':
          this.bossFlash = 0.6;
          this.addScore(1000, this.bossX, FLOOR - 120);
          if (e.hp <= 0) {
            // Out of fight: Assaf holds him down for good. Now level the plane.
            this.assaf?.setFrame(frameIndex('npc.assaf', 'pin')).setFlipX(true).setDepth(7);
            this.tweens.add({ targets: this.assaf, x: this.bossX + 22, duration: 300 });
            this.popText(this.bossX, FLOOR - 130, 'NOW LEVEL HER OUT!');
            for (const en of this.enemies) en.hit('plunger');
          }
          break;
        case 'won':
          this.win(5000);
          break;
      }
    }
    return events;
  }

  // ---------- Phase C: keep him tied ----------

  private stepC(dt: number): void {
    const c = this.c!;
    const p = this.player;
    const nearShota = Math.abs(p.x - SHOTA_X) < 26 && p.grounded;
    const helping = nearShota && this.edges.current.down;
    if (this.edges.pressed('grab')) {
      const k = KNOT_X.findIndex((x) => Math.abs(p.x - x) < 14);
      if (k >= 0) {
        c.tighten(k);
        this.poseTimer = 0.18;
        this.sfx('thwop');
      }
    }
    p.pose = this.poseTimer > 0 || helping ? 'tighten' : null;
    if (this.zip && overlaps(p.body, { left: this.zip.x - 10, right: this.zip.x + 10, top: this.zip.y - 16, bottom: this.zip.y + 2 })) {
      this.zip.destroy();
      this.zip = undefined;
      c.upgrade();
      this.popText(p.x, p.y - 70, 'ZIP TIES!');
      this.sfx('powerup');
    }
    for (const e of c.tick(dt, helping)) this.onC(e);
    this.drawKnots();
  }

  private onC(e: BossEventC): void {
    const c = this.c!;
    switch (e.type) {
      case 'houdiniSoon':
        this.popText(this.bossX, FLOOR - 110, "HE'S PLANNING SOMETHING!");
        this.boss.anims.timeScale = 3;
        break;
      case 'houdini':
        this.boss.anims.timeScale = 1;
        this.cameras.main.shake(500, 0.01);
        this.popText(this.bossX, FLOOR - 110, 'HOUDINI ATTEMPT!');
        this.warn();
        break;
      case 'switch':
        if (this.rng.frac() < 0.35) this.popText(this.bossX, FLOOR - 110, 'I JUST NEED TO STRETCH MY LEGS!');
        break;
      case 'cable': {
        this.zvika?.setFrame(frameIndex('npc.zvika', 'throw'));
        this.time.delayedCall(500, () => this.zvika?.setFrame(frameIndex('npc.zvika', 'idle')));
        const coil = this.add.image(ZVIKA_X, FLOOR - 50, 'prop.cable').setScale(ART_SCALE).setDepth(12);
        this.tweens.add({ targets: coil, x: KNOT_X[e.knot], y: FLOOR - 24, duration: 500, ease: 'Quad.Out', onComplete: () => coil.destroy() });
        break;
      }
      case 'zipties':
        this.zip = this.add.image(ZIP_X, FLOOR - 120, 'item.zipties').setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(12);
        this.zip.preFX?.addGlow(0xffd23f, 4, 0, false, 0.1, 10);
        this.tweens.add({ targets: this.zip, y: FLOOR, duration: 600, ease: 'Bounce.Out' });
        this.popText(ZIP_X, FLOOR - 80, 'ZVIKA: ZIP TIES!');
        break;
      case 'slip':
        this.finished = true;
        this.bossFrame('stagger');
        this.sfx('hurt');
        this.pushHud();
        this.time.delayedCall(700, () => this.cfg.onEvent({ type: 'slip', clock: c.clock }));
        break;
      case 'won':
        this.win(5000 + Math.round(c.captain) * 10);
        break;
    }
  }

  private drawKnots(): void {
    const c = this.c!;
    const g = this.knotMarks!.clear();
    KNOT_X.forEach((x, i) => {
      const f = Math.max(0, c.strength[i] / c.max);
      const color = f > 0.5 ? 0x4ade80 : f > 0.25 ? 0xffb347 : 0xe5262b;
      g.lineStyle(2, i === c.target ? 0xffd23f : 0x000000, 1).fillStyle(color, 1);
      g.fillCircle(x, FLOOR - 26, 5).strokeCircle(x, FLOOR - 26, 5);
    });
  }

  // ---------- ending ----------

  private win(bonus: number): void {
    if (this.finished) return;
    this.finished = true;
    this.player.pose = null;
    this.score += bonus;
    for (const e of this.enemies) e.hit('plunger');
    this.pushHud();
    const run: RunState = { hearts: this.hearts, power: this.player.power, nuts: this.nuts, score: this.score };
    const clear = () => this.cfg.onEvent({ type: 'clear', run, seconds: Math.round(this.elapsed), door: false });
    if (this.phase !== 'C') {
      this.popText(this.bossX, FLOOR - 140, this.phase === 'A' ? 'GOT HIM!' : 'LEVEL FLIGHT!');
      this.sfx('chime');
      this.time.delayedCall(1100, clear);
      return;
    }
    // The final win: everyone claps and sings (the victory song keeps playing under the card).
    music.play('victory', true);
    this.popText(W / 2, FLOOR - 170, 'TABUK!', 2600);
    this.time.delayedCall(700, () => this.popText(W / 2, FLOOR - 150, 'AM YISRAEL CHAI!', 2600));
    this.time.delayedCall(1700, () => this.popText(W / 2, FLOOR - 130, 'OD AVINU CHAI!', 2600));
    const crowd = this.children.list.filter((o) => o instanceof Phaser.GameObjects.Sprite && o !== this.boss) as Phaser.GameObjects.Sprite[];
    for (const [i, s] of crowd.entries()) {
      this.tweens.add({ targets: s, y: s.y - 10, duration: 180, yoyo: true, repeat: 7, delay: (i % 3) * 90, ease: 'Quad.Out' });
    }
    this.time.delayedCall(3200, clear);
  }

  private gameOver(reason: 'hearts' | 'altitude'): void {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    this.player.pose = null;
    this.player.showFrame('hurt');
    this.pushHud();
    this.cfg.onEvent({ type: 'gameover', reason, score: this.score });
  }

  popText(x: number, y: number, text: string, hold = 300): void {
    const t = this.add.text(x, y, text, { fontFamily: '"Press Start 2P", monospace', fontSize: '16px', color: '#fff8e7' });
    t.setOrigin(0.5).setScale(0.5).setDepth(20).setStroke('#000', 4);
    this.tweens.add({ targets: t, y: y - 20, alpha: 0, delay: hold, duration: 900, onComplete: () => t.destroy() });
  }

  // ---------- HUD ----------

  private prompt(): string | undefined {
    const p = this.player;
    if (this.a) {
      if (this.a.mode === 'choke') return 'MASH GRAB!';
      if (this.a.mode === 'stagger') return 'GRAB HIM FROM BEHIND!';
      if (this.a.jetWindup) return 'PLUNGE THE JET!';
      return undefined;
    }
    if (this.b) {
      const atYoke = p.x >= YOKE_ZONE.left && p.x <= YOKE_ZONE.right;
      if (this.b.subdued) {
        if (this.b.inBand) return 'HOLD STEADY!';
        if (this.b.pitch > 0) return 'LET GO OF ▼: EASE THE NOSE DOWN';
        return atYoke ? '▼ LEVEL HER OUT' : 'GET TO THE YOKE!';
      }
      if (this.b.open) return 'PLUNGE HIS GOGGLES!';
      if (this.b.pitch < -20) return atYoke ? '▼ PULL UP!' : 'PULL UP! GET TO THE YOKE';
      if (this.b.assistReady && !atYoke) return '▼ CALL ASSAF';
      return undefined;
    }
    const c = this.c!;
    // A slipping knot loses the phase; a fading Captain only stops the clock, so knots come first.
    const weakest = c.strength.indexOf(Math.min(...c.strength));
    if (c.strength[weakest] < c.max * 0.35) return `GRAB: TIGHTEN THE ${KNOTS.names[weakest]}!`;
    if (c.captain < 30) return c.captain <= 0 ? 'CLOCK STOPPED: ▼ HELP SHOTA!' : '▼ HELP SHOTA WITH THE CAPTAIN';
    if (this.zip) return 'GRAB THE ZIP TIES!';
    if (c.houdiniSoon) return "HE'S PLANNING SOMETHING!";
    return undefined;
  }

  private bossHud(): BossHud {
    const base = { name: BOSS_NAME, phase: this.phase, maxHp: BOSS_HP, prompt: this.prompt() };
    if (this.a) return { ...base, hp: this.a.hp };
    if (this.b) return { ...base, hp: Math.max(0, this.b.hp), pitch: this.b.pitch, control: this.b.control, steady: this.b.steady, band: PITCH.band };
    const c = this.c!;
    return {
      ...base,
      hp: 0,
      knots: KNOTS.names.map((name, i) => ({ name, value: Math.round(c.strength[i]), max: c.max, target: i === c.target })),
      clock: c.clockText,
      captain: c.captain,
    };
  }

  private pushHud(): void {
    this.hudTimer = 0.1;
    this.cfg.onHud({
      hearts: Math.max(0, this.hearts),
      maxHearts: Math.max(RULES.hearts, this.hearts),
      nuts: this.nuts,
      score: this.score,
      alt: this.altitude?.format() ?? '',
      altLabel: this.c ? `TABUK IN ${this.c.clockText}` : undefined,
      bank: this.b ? Math.round(Math.max(0, -this.b.pitch)) : Math.round(this.tiltDeg),
      bankWarning: this.leanTilt > 0,
      label: `${this.cfg.level.id}  ${this.cfg.level.name}`,
      boss: this.bossHud(),
    });
  }

  // ---------- bot + test hooks ----------

  private botView(): BossBotView {
    const p = this.player;
    const a = this.a;
    const b = this.b;
    const c = this.c;
    return {
      phase: this.phase,
      x: p.x,
      y: p.y,
      grounded: p.grounded,
      facing: p.facing,
      threats: this.enemies
        .filter((e) => e.live && e.hitbox())
        .map((e) => ({ kind: e.kind, dx: e.x - p.x, dy: e.y - p.y, vx: e.vx })),
      boss: {
        x: this.bossX,
        top: FLOOR - BOSS_BODY.h,
        mode: a?.mode ?? '',
        jetWindup: !!a?.jetWindup,
        jetFiring: !!a?.jetFiring,
        staggered: a?.mode === 'stagger',
        choking: a?.mode === 'choke',
      },
      yokeX: (YOKE_ZONE.left + YOKE_ZONE.right) / 2,
      atYoke: p.x >= YOKE_ZONE.left && p.x <= YOKE_ZONE.right && p.grounded,
      pitch: b?.pitch,
      bossHittable: !!b && b.open,
      subdued: b?.subdued,
      knots: c ? KNOT_X.map((x, i) => ({ x, value: c.strength[i] })) : undefined,
      target: c?.target,
      shotaX: SHOTA_X,
      captain: c?.captain,
      zipX: this.zip ? this.zip.x : null,
    };
  }

  private exposeTestHooks(): void {
    (window as unknown as { __syb?: unknown }).__syb = {
      state: () => ({
        level: this.cfg.level.id,
        x: Math.round(this.player.x),
        y: Math.round(this.player.y),
        hearts: this.hearts,
        nuts: this.nuts,
        score: this.score,
        power: this.player.power,
        bamba: 0,
        swinging: false,
        finished: this.finished,
        tilt: Math.round(this.tiltDeg),
        width: W,
        hurts: [...this.hurtLog],
        enemies: this.enemies.filter((e) => e.live).map((e) => ({ kind: e.kind, x: Math.round(e.x), y: Math.round(e.y) })),
        items: [],
      }),
      boss: () => ({
        phase: this.phase,
        hp: this.a?.hp ?? this.b?.hp ?? 0,
        mode: this.a?.mode,
        chokeTaps: this.a?.chokeTaps,
        pitch: this.b ? Math.round(this.b.pitch * 10) / 10 : undefined,
        control: this.b?.control,
        steady: this.b?.steady,
        subdued: this.b?.subdued,
        knots: this.c?.strength.map((s) => Math.round(s)),
        target: this.c?.target,
        clock: this.c?.clockText,
        captain: this.c ? Math.round(this.c.captain) : undefined,
        zip: this.c?.zip,
        bossX: Math.round(this.bossX),
        grounded: this.player.grounded,
        pose: this.player.pose,
      }),
      teleport: (x: number, y: number) => {
        this.player.placeAt(x, y);
        this.player.lastSafe = { x, y };
      },
      clearEnemies: () => {
        for (const e of this.enemies) e.destroy();
      },
      clearTrolleys: () => undefined,
      /** Test-only: set the boss's HP (Phase A/B). */
      setBossHp: (hp: number) => {
        if (this.a) this.a.hp = hp;
        if (this.b) this.b.hp = hp;
      },
      /** Test-only: land the final hit in Phase A (he staggers 0.8 s later). */
      finalHit: () => {
        if (!this.a) return;
        this.a.hp = 1;
        this.a.mode = 'idle';
        this.onA(this.a.stomp());
      },
      /** Test-only: weaken a knot (Phase C). */
      drainKnot: (i: number, to = 1) => {
        if (this.c) this.c.strength[i] = to;
      },
      /** Test-only: run the Tabuk clock forward (game seconds). */
      skipClock: (seconds: number) => {
        if (this.c) this.c.clock = Math.max(1, this.c.clock - seconds);
      },
    };
  }
}
