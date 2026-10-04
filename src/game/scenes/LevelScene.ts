import Phaser from 'phaser';
import { play, type Sfx } from '../../audio/sfx.ts';
import { createAnimations, ensurePlaceholders, frameIndex, preloadAssets } from '../assets.ts';
import { ART_SCALE, PHYS, ROOM_FLOOR_MARGIN, RULES, VIEW_H, VIEW_W, ZOOM } from '../config.ts';
import { BabyBomber, BinBiter, LuggageRain, Suitcase, Trolley, type Enemy } from '../entities/enemies.ts';
import { Blocks, PowerItem, ThrownPlunger } from '../entities/items.ts';
import { CargoHold, HOLD_H } from '../entities/hold.ts';
import { MaskVine } from '../entities/masks.ts';
import { BillCannon, Mascot } from '../entities/w3.ts';
import { Drain, Paparazzo, Reporter, algaeBlob } from '../entities/w7.ts';
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
  /** Replaces "ALT …" in the top-right box (e.g. the Tabuk clock in 6-3, TIME on the ground). */
  altLabel?: string;
  /** On the ground (World 7) there is no bank to show. */
  hideBank?: boolean;
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
  /** A checkpoint reached (with the 7-1 drains already cleared, so a retry keeps them clear). */
  | { type: 'checkpoint'; at: Point; drains?: number[] }
  /** A cutscene starts or ends (the touch buttons step aside). */
  | { type: 'cutscene'; on: boolean }
  | { type: 'clear'; run: RunState; seconds: number; door: boolean; bonus?: number }
  | { type: 'gameover'; reason: 'hearts' | 'altitude' | 'time'; score: number }
  /** World 6 Phase C: a knot fully slipped, back to Phase B. */
  | { type: 'slip'; clock: number }
  /** 7-4: the handshake and the photo (a snapshot of the moment, as a data URL). */
  | { type: 'finale'; run: RunState; photo?: string };

export interface LevelInit {
  level: LevelData;
  /** Hearts, power, nuts and score carried in from the previous level. */
  run: RunState;
  /** Retry from this galley checkpoint instead of the level start. */
  checkpoint?: Point;
  /** 7-1: drains cleared before that checkpoint. */
  clearedDrains?: number[];
  inputs: InputSource[];
  bot?: BotInput;
  /** Test/bot mode: no damage (pits still respawn). Used to prove every level's geometry is completable. */
  god?: boolean;
  onHud(state: HudState): void;
  onEvent(e: GameEvent): void;
}

type ThemeName = NonNullable<LevelData['theme']>;
interface Theme {
  bgColor: string;
  floorTex: string;
  solidTex: string;
  /** Pits show water (World 7 pools and fountains) instead of the dark cargo hold. */
  water: boolean;
}
/** The floor slab's thickness (world units); the cargo hold starts under it. */
const FLOOR_SLAB = 32;
const HOLD_DARK = 0x15142a;
/** The Oval Office floor is a thin cut, so the secret basement below it shows. */
const OVAL_SLAB = 10;

const THEMES: Record<ThemeName, Theme> = {
  cabin: { bgColor: '#d9cdb4', floorTex: 'w5.tex.floor', solidTex: 'w5.tex.bin', water: false },
  mall: { bgColor: '#9fd3f2', floorTex: 'w7.tex.path', solidTex: 'w7.tex.stone', water: true },
  lawn: { bgColor: '#9fd3f2', floorTex: 'w7.tex.path', solidTex: 'w7.tex.stone', water: true },
  oval: { bgColor: '#e9dcc0', floorTex: 'w7.tex.stone', solidTex: 'w7.tex.stone', water: false },
  // World 3, DXB Airport: the terminal (daylight), the duty-free shop, and the gates at sunset.
  terminal: { bgColor: '#cfe3f2', floorTex: 'w3.tex.floor', solidTex: 'w3.tex.counter', water: false },
  dutyfree: { bgColor: '#f3e2c0', floorTex: 'w3.tex.floor', solidTex: 'w3.tex.counter', water: false },
  gate: { bgColor: '#f0a060', floorTex: 'w3.tex.floor', solidTex: 'w3.tex.counter', water: false },
};
const AIRPORT_BG: Partial<Record<ThemeName, string>> = { terminal: 'w3.bg.terminal', dutyfree: 'w3.bg.dutyfree', gate: 'w3.bg.sunset' };

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
  private drains: Drain[] = [];
  private algaeLayers: Phaser.GameObjects.TileSprite[] = [];
  /** In the air: the luggage hold under the cabin floor. */
  private hold?: CargoHold;
  /** World 3: belt surfaces scroll; security trays ride the raised conveyors; props and cannons. */
  private beltArt: { sprite: Phaser.GameObjects.TileSprite; speed: number }[] = [];
  private trays: { sprite: Phaser.GameObjects.Image; belt: { x: number; w: number; speed: number } }[] = [];
  private officers: Phaser.GameObjects.Sprite[] = [];
  private gateAgent?: Phaser.GameObjects.Sprite;
  private detectors: { x: number; beeped: boolean }[] = [];
  private cannons: BillCannon[] = [];
  private pendingCarts: Point[] = [];
  private mascot?: Mascot;
  /** The last few pop-up texts (test hook). */
  private popLog: string[] = [];
  private gate?: Phaser.GameObjects.Sprite;
  private president?: Phaser.GameObjects.Sprite;
  private gateNagged = 0;
  private gateWall?: Phaser.GameObjects.Zone;
  private lastFlash = -9;
  private lowTimeWarned = false;
  /** ALT in the air, or TIME on the ground (null: no clock, e.g. the Oval Office). */
  private altitude!: Altitude | null;
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
    this.cameras.main.setBackgroundColor(data.level.mood === 'alarm' ? '#c9a99c' : this.theme.bgColor);

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
    // On the ground the sky and landmarks matter more than what's under the walkway: look a little higher.
    if (this.ground) cam.setFollowOffset(-70, 84);
    if (data.level.theme === 'oval') {
      // The Oval Office is one room on one screen: fixed camera, the floor line ROOM_FLOOR_MARGIN above the
      // bottom (clear of the touch buttons), with the past presidents' poker night in the basement below.
      const bottom = this.floorTop + ROOM_FLOOR_MARGIN;
      cam.stopFollow();
      cam.setBounds(0, bottom - VIEW_H, width, VIEW_H);
      cam.centerOn(width / 2, bottom - VIEW_H / 2);
    }
    this.applyTilt(true);
    if (data.level.mood === 'alarm') this.createAlarmLight();

    // In the air the clock is ALT; on the ground it is TIME (seconds); the Oval Office has none.
    this.altitude = data.level.timer
      ? new Altitude(data.level.timer, 1)
      : data.level.altitude.rate > 0
        ? new Altitude(data.level.altitude.start, data.level.altitude.rate)
        : null;
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
    this.drains = [];
    this.algaeLayers = [];
    this.hold = undefined;
    this.beltArt = [];
    this.trays = [];
    this.officers = [];
    this.gateAgent = undefined;
    this.detectors = [];
    this.cannons = [];
    this.pendingCarts = [];
    this.mascot = undefined;
    this.popLog = [];
    this.gate = this.president = undefined;
    this.gateNagged = 0;
    this.gateWall = undefined;
    this.lastFlash = -9;
    this.lowTimeWarned = false;
  }

  // ---------- world construction ----------

  private get theme(): Theme {
    return THEMES[this.cfg.level.theme ?? 'cabin'];
  }

  /** On the ground (World 7): no tilt, a TIME counter. */
  private get ground(): boolean {
    return (this.cfg.level.theme ?? 'cabin') !== 'cabin';
  }

  /** World 3: DXB airport (on the ground, no tilt, a TIME counter, the baggage hall under the floor). */
  private get airport(): boolean {
    return !!AIRPORT_BG[this.cfg.level.theme ?? 'cabin'];
  }

  private get floorTop(): number {
    return floorTopOf(this.level);
  }

  private createBackground(): void {
    const theme = this.cfg.level.theme ?? 'cabin';
    if (theme !== 'cabin') return this.createGroundBackground(theme);
    // The cabin wall sits on the floor at 1:1 scale and scrolls slower than the play layer (parallax).
    const wall = this.add
      .tileSprite(-VIEW_W, this.floorTop - VIEW_H, this.level.width + VIEW_W * 2, VIEW_H, 'w5.bg.wall')
      .setOrigin(0)
      .setScrollFactor(0.45, 1)
      .setTileScale(ART_SCALE);
    const tint = this.cfg.level.mood === 'alarm' ? 0xffb4a8 : undefined;
    if (tint) wall.setTint(tint);
    this.createHold(tint);
  }

  /**
   * Below the floor line: the plane's cargo hold (Worlds 5-6) or the airport's baggage hall (World 3), packed
   * with luggage; in the air, loose bags slide off when the plane banks hard.
   */
  private createHold(tint?: number): void {
    const top = this.floorTop + FLOOR_SLAB;
    // (The visual floor continues past both level ends: no fake hatch there.)
    const slabs = [
      [-VIEW_W, 0] as [number, number],
      ...this.level.solids.filter((r) => (r.kind === 'floor' || r.kind === 'belt') && r.y === this.floorTop).map((r): [number, number] => [r.x, r.x + r.w]),
      [this.level.width, this.level.width + VIEW_W] as [number, number],
    ].sort((a, b) => a[0] - b[0]);
    // Behind the open hatches (pits) it is dark from the floor line down, so they still read as holes.
    this.add.rectangle(-VIEW_W, this.floorTop, this.level.width + VIEW_W * 2, FLOOR_SLAB, HOLD_DARK).setOrigin(0);
    const holdRng = new Phaser.Math.RandomDataGenerator([`${this.cfg.level.id}:hold`]);
    this.hold = new CargoHold(this, {
      left: -VIEW_W,
      right: this.level.width + VIEW_W,
      top,
      spans: slabs,
      restBand: [34, 96],
      random: () => holdRng.frac(),
      tint,
    });
    let x = -VIEW_W;
    for (const [x0, x1] of [...slabs, [this.level.width + VIEW_W, this.level.width + VIEW_W] as [number, number]]) {
      if (x0 > x) this.add.rectangle(x, top, x0 - x, HOLD_H + VIEW_H, HOLD_DARK, 0.82).setOrigin(0);
      x = Math.max(x, x1);
    }
  }

  /** World 7: the National Mall / the White House lawn (parallax park, a landmark) or the Oval Office. */
  private createGroundBackground(theme: ThemeName): void {
    const { width } = this.level;
    const airportBg = AIRPORT_BG[theme];
    if (airportBg) {
      // DXB: the terminal / duty-free / sunset gates behind (parallax), the baggage hall below the floor.
      this.add
        .tileSprite(-VIEW_W, this.floorTop - VIEW_H + 40, width + VIEW_W * 2, VIEW_H, airportBg)
        .setOrigin(0)
        .setScrollFactor(0.45, 1)
        .setTileScale(ART_SCALE);
      this.createHold(0x9a9ab0);
      return;
    }
    if (theme === 'oval') {
      // The room fills the screen above the floor line (the camera is fixed, see create()).
      this.add.image(width / 2, this.floorTop + 22, 'w7.bg.oval').setOrigin(0.5, 1).setScale(ART_SCALE);
      this.createBasement();
      return;
    }
    this.add
      .tileSprite(-VIEW_W, this.floorTop - VIEW_H + 24, width + VIEW_W * 2, VIEW_H, 'w7.bg.park')
      .setOrigin(0)
      .setScrollFactor(0.45, 1)
      .setTileScale(ART_SCALE);
    // A landmark far behind, scrolling slower still: the Washington Monument, or the White House near the end.
    if (theme === 'mall') {
      // Far away, standing at the tree line (smaller than life: it is a mile off).
      this.add.image(width * 0.35, this.floorTop - 86, 'w7.prop.monument').setOrigin(0.5, 1).setScale(ART_SCALE * 0.62).setScrollFactor(0.2, 1);
    } else {
      this.add.image(width * 0.55, this.floorTop - 20, 'w7.prop.whitehouse').setOrigin(0.5, 1).setScale(ART_SCALE).setScrollFactor(0.45, 1);
    }
    // Water under the walkway: the pools and fountains show through the gaps. In 7-1 it meets the pool strip
    // (a gap there let the park's grass show through as a green line over every pit).
    const y = this.floorTop + (this.level.drains.length ? 0 : 10);
    // One rippled band at the surface, then plain deep water: the tile repeated down the pit showed seams.
    this.add.tileSprite(-VIEW_W, y, width + VIEW_W * 2, 32, 'w7.tex.water').setOrigin(0).setTileScale(ART_SCALE);
    this.add.rectangle(-VIEW_W, y + 32, width + VIEW_W * 2, VIEW_H, 0x48c8f6).setOrigin(0);
    // 7-1: the Reflecting Pool itself runs alongside the walkway, choked with algae until its drains are plunged.
    if (this.level.drains.length) {
      const poolY = this.floorTop - 30;
      this.add.rectangle(-VIEW_W, poolY - 3, width + VIEW_W * 2, 3, 0xe8e2d0).setOrigin(0); // the stone rim
      this.add.tileSprite(-VIEW_W, poolY, width + VIEW_W * 2, 30, 'w7.tex.water').setOrigin(0).setTileScale(ART_SCALE);
      const scum = this.add.tileSprite(-VIEW_W, poolY, width + VIEW_W * 2, 30, 'w7.tex.algae').setOrigin(0).setTileScale(ART_SCALE);
      this.algaeLayers.push(scum);
      this.algaeLayers.push(this.add.tileSprite(-VIEW_W, y, width + VIEW_W * 2, VIEW_H, 'w7.tex.algae').setOrigin(0).setTileScale(ART_SCALE));
      if (this.cfg.clearedDrains?.length === this.level.drains.length) this.algaeLayers.forEach((l) => l.setAlpha(0));
    }
  }

  /**
   * 7-4: under the Oval Office floor, the past presidents' secret poker night: lamplight, cards, cigar smoke.
   * It sits in the middle, where the gap between the touch buttons leaves it in view on phones.
   */
  private createBasement(): void {
    const { width } = this.level;
    const top = this.floorTop + OVAL_SLAB;
    const h = ROOM_FLOOR_MARGIN - OVAL_SLAB + 8;
    this.add.tileSprite(-VIEW_W / 2, top, width + VIEW_W, h, 'w7.tex.basement').setOrigin(0).setTileScale(ART_SCALE);
    const cx = width / 2;
    const fx = new Phaser.Math.RandomDataGenerator(['basement']); // decoration only: leaves the level's dice alone
    // The lamp hangs from the ceiling (the Oval Office floor); its glow breathes a little.
    const glow = this.add.circle(cx, top + 14, 46, 0xffd27a, 0.22).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, alpha: 0.32, scale: 1.08, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const table = this.add.image(cx, this.floorTop + ROOM_FLOOR_MARGIN + 2, 'w7.prop.poker').setOrigin(0.5, 1).setScale(ART_SCALE);
    // Cigar smoke curls up from the right half of the table (Taft and FDR) and spreads under the ceiling.
    this.time.addEvent({
      delay: 380,
      loop: true,
      callback: () => {
        const x = table.x + table.displayWidth * (0.12 + fx.frac() * 0.3);
        const y = table.y - table.displayHeight * 0.62;
        const puff = this.add.circle(x, y, 1.2 + fx.frac() * 1.3, 0xd8d4cc, 0.32);
        this.tweens.add({
          targets: puff,
          y: Math.max(top + 4, y - 18 - fx.frac() * 10),
          x: x + (fx.frac() - 0.5) * 14,
          scale: 3,
          alpha: 0,
          duration: 2200,
          onComplete: () => puff.destroy(),
        });
      },
    });
    // A floor-cut shadow under the Oval Office.
    this.add.rectangle(-VIEW_W / 2, top, width + VIEW_W, 5, 0x000000, 0.4).setOrigin(0);
  }

  private createTerrain() {
    const solids = this.physics.add.staticGroup();
    for (const r of this.level.solids) {
      const tex =
        r.kind === 'floor' ? this.theme.floorTex : r.kind === 'belt' ? (r.y === this.floorTop ? 'w3.tex.travelator' : 'w3.tex.belt') : this.theme.solidTex;
      const oval = r.kind === 'floor' && this.cfg.level.theme === 'oval';
      const beltH = 16;
      const art = this.add.tileSprite(r.x, r.y, r.w, oval ? OVAL_SLAB : r.kind === 'belt' ? beltH : r.h, tex).setOrigin(0).setTileScale(ART_SCALE);
      // A travelator is set into the floor slab: the slab shows under its moving surface.
      if (r.kind === 'belt' && r.h > beltH) this.add.tileSprite(r.x, r.y + beltH, r.w, r.h - beltH, this.theme.floorTex).setOrigin(0, 0).setTileScale(ART_SCALE);
      if (r.kind === 'belt') {
        const belt = this.level.belts.find((b) => b.x === r.x && b.y === r.y)!;
        this.beltArt.push({ sprite: art, speed: belt.speed });
        // Security trays ride the raised conveyors (they vanish into the X-ray machines).
        if (r.y < this.floorTop) {
          for (let x = r.x + 6; x < r.x + r.w - 30; x += 58) {
            const sprite = this.add.image(x, r.y, 'prop.tray').setOrigin(0, 1).setScale(ART_SCALE).setDepth(6);
            this.trays.push({ sprite, belt: { x: r.x, w: r.w, speed: belt.speed } });
          }
        }
      }
      if (r.kind === 'floor') this.underFloor(r.x, r.y + r.h, r.w);
      solids.add(this.add.zone(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h));
    }
    // Visual-only floor past both level ends, so the tilted view never shows a fake pit at the edges.
    for (const x of [-VIEW_W, this.level.width]) {
      this.add.tileSprite(x, this.floorTop, VIEW_W, 32, this.theme.floorTex).setOrigin(0).setTileScale(ART_SCALE);
      this.underFloor(x, this.floorTop + 32, VIEW_W);
    }
    const oneWays = this.physics.add.staticGroup();
    for (const r of this.level.oneWays) this.addOneWay(oneWays, r.x, r.y, r.w, r.h);
    // '-' platforms: a thin luggage shelf (its top is the standable edge) with a shadow underneath.
    for (const r of this.level.shelves) {
      this.add.rectangle(r.x + 2, r.y + 10, r.w - 4, 4, 0x000000, 0.25).setOrigin(0);
      this.add.tileSprite(r.x, r.y, r.w, 10, this.theme.solidTex).setOrigin(0).setTileScale(ART_SCALE);
      this.add.rectangle(r.x, r.y, r.w, 2, 0xfff8e7).setOrigin(0);
    }
    return { solids, oneWays };
  }

  /** What's below a floor slab: the cabin's dark underside, or a marble terrace wall on the ground. */
  private underFloor(x: number, y: number, w: number): void {
    if (this.ground && !this.airport && this.cfg.level.theme !== 'oval') {
      this.add.tileSprite(x, y, w, VIEW_H, this.theme.solidTex).setOrigin(0).setTileScale(ART_SCALE).setTint(0xd8d2c4);
      this.add.rectangle(x, y, w, 3, 0x000000, 0.25).setOrigin(0); // the walkway's shadow on the wall
    }
    // The Oval Office has its basement (createBasement); in the air and at the airport the hold (createHold) shows.
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
    if (this.airport) {
      // Blue queue-barrier tape on chrome posts along the front, as in the concept art (not over the gaps).
      for (const r of this.level.solids.filter((k) => (k.kind === 'floor' || k.kind === 'belt') && k.y === this.floorTop)) {
        this.add.tileSprite(r.x, this.floorTop + FLOOR_SLAB + 2, r.w, 32, 'w3.rope').setOrigin(0, 1).setTileScale(ART_SCALE * 1.5).setDepth(15);
      }
      return;
    }
    if (this.ground) {
      return; // (each paparazzo brings his own stretch of velvet rope)
    }
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
    else if (this.cfg.level.theme === 'oval') {
      // The Oval Office has no exit: the visit ends with the handshake.
    } else if (this.airport) {
      // A boarding gate door; in 3-3 it stays shut while Mr. Spritz guards the duty-free.
      const shut = !!this.level.mascot;
      this.gate = this.add.sprite(e.x, e.y + EXIT.h, 'w3.gate', frameIndex('w3.gate', shut ? 'closed' : 'open')).setOrigin(0, 1).setScale(ART_SCALE);
    } else if (this.ground) {
      // The gate is shut while 7-1's drains are still clogged.
      const shut = this.level.drains.length > 0;
      this.gate = this.add.sprite(e.x, e.y + EXIT.h, 'w7.gate', frameIndex('w7.gate', shut ? 'closed' : 'open')).setOrigin(0, 1).setScale(ART_SCALE);
    } else this.add.image(e.x, e.y + EXIT.h, 'w5.curtain').setOrigin(0, 1).setScale(ART_SCALE);
    this.exitZone = this.add.zone(e.x + e.w / 2, e.y + e.h / 2, e.w * 0.6, e.h);
    this.physics.add.existing(this.exitZone, true);
    this.checkpoints = [...this.level.checkpoints];
    const marker = this.airport ? 'w3.checkpoint' : this.ground ? 'w7.checkpoint' : 'w5.galley';
    for (const g of this.level.checkpoints) this.add.image(g.x, g.y, marker).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(1);
  }

  private createNpcs(): void {
    const { captain, screamer, president, gateAgent } = this.level;
    // World 3: friendly security officers, metal detectors, X-ray machines over the belts, the gate agent.
    for (const o of this.level.officers) this.officers.push(this.add.sprite(o.x, o.y, 'npc.officer', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(5));
    for (const d of this.level.detectors) {
      this.add.image(d.x, d.y, 'w3.detector').setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(11);
      this.detectors.push({ x: d.x, beeped: false });
    }
    for (const x of this.level.xrays) this.add.image(x.x, x.y + 4, 'w3.xray').setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(7);
    if (gateAgent) this.gateAgent = this.add.sprite(gateAgent.x, gateAgent.y, 'npc.gateagent', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(5);
    if (president) this.president = this.add.sprite(president.x, president.y, 'npc.president', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(5);
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
    for (const d of this.level.drains) this.drains.push(new Drain(this, d.x, d.y));
    for (const i of this.cfg.clearedDrains ?? []) this.drains[i]?.setClear();
    for (const a of this.level.algae) spawn(algaeBlob(this, a.x, a.y));
    for (const r of this.level.reporters) spawn(new Reporter(this, r.x, r.y, spawn));
    for (const p of this.level.paparazzi) spawn(new Paparazzo(this, p.x, p.y));
    for (const l of this.level.launchers) this.cannons.push(new BillCannon(this, l.x, l.y));
    // Runaway carts roll in from ahead when Yaniv comes near (skip ones already behind a checkpoint).
    this.pendingCarts = this.level.carts.filter((c) => c.x > (this.cfg.checkpoint?.x ?? -Infinity)).map((c) => ({ ...c }));
    const m = this.level.mascot;
    if (m) {
      this.mascot = new Mascot(this, m.x, m.y, spawn, () => this.mascotBeaten());
      spawn(this.mascot);
    }
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
    if (this.cfg.level.theme !== 'oval') this.physics.add.overlap(p, this.exitZone, () => this.clearLevel());
    // 7-1: the shut gate is a real barrier until the pool is clean (its zone reaches into the exit zone, so
    // walking up to it still shows the hint).
    if (this.level.drains.length || this.level.mascot) {
      const e = this.level.exit;
      // Floor to well above the top of the screen: no jumping over a locked gate.
      this.gateWall = this.add.zone(e.x + 24, e.y + e.h - VIEW_H, 16, VIEW_H * 2);
      this.physics.add.existing(this.gateWall, true);
      this.physics.add.collider(p, this.gateWall, () => this.clearLevel());
      if (this.objectiveDone) this.gateWall.destroy();
    }
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
    this.hold?.step(this.gravity, dt);
    this.stepBelts(dt);

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
    this.stepAirport(dt);
    this.stepDrains(dt);
    if (this.finished) return; // the 7-4 finale started

    if (p.y > this.level.height + 48 && !p.swing) this.fellInPit();
    if (this.altitude) {
      if (this.cfg.level.timer && !this.lowTimeWarned && this.altitude.value <= 30) {
        this.lowTimeWarned = true;
        this.sfx('warn');
        this.warn();
        this.popText(p.x, p.y - 80, 'HURRY UP!', 900, true);
      }
      this.altitude.tick(dt);
      if (this.altitude.crashed) return this.gameOver(this.cfg.level.timer ? 'time' : 'altitude');
    }
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
    // 7-1: plunge a clogged drain.
    for (const d of this.drains) {
      if (!overlaps(reachBox, d.box) || !d.plunge()) continue;
      this.addScore(500, d.x, d.y - 40);
      if (this.drains.every((k) => !k.clogged)) this.poolCleared();
      else this.popText(d.x, d.y - 60, `${this.drains.filter((k) => k.clogged).length} TO GO!`);
    }
  }

  /** World 3: belts carry whoever stands on them; their surfaces scroll and the security trays ride along. */
  private stepBelts(dt: number): void {
    const p = this.player;
    // Standing on a belt (feet on its top surface, within its span): the belt carries Yaniv along.
    const belt = p.grounded ? this.level.belts.find((b) => p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && Math.abs(b.y - p.y) < 3) : undefined;
    p.carry = belt?.speed ?? 0;
    // The texture is drawn at ART_SCALE: one world unit is two texture pixels.
    for (const b of this.beltArt) b.sprite.tilePositionX -= (b.speed * dt) / ART_SCALE;
    for (const t of this.trays) {
      const { x, w, speed } = t.belt;
      let tx = t.sprite.x + speed * dt;
      if (tx > x + w - 30) tx = x;
      else if (tx < x) tx = x + w - 30;
      t.sprite.x = tx;
    }
  }

  /** World 3: perfume cannons, runaway carts, metal detectors, and the friendly staff. */
  private stepAirport(dt: number): void {
    const p = this.player;
    const spawn = (e: Enemy) => this.enemies.push(e);
    for (const c of this.cannons) c.step(dt, spawn);
    for (let i = this.pendingCarts.length - 1; i >= 0; i--) {
      const c = this.pendingCarts[i];
      if (c.x - p.x > 420) continue;
      this.pendingCarts.splice(i, 1);
      spawn(new Trolley(this, c.x, c.y, { cart: true }));
    }
    for (const d of this.detectors) {
      if (d.beeped || Math.abs(p.x - d.x) > 8) continue;
      // Every plumber's tool belt sets it off.
      d.beeped = true;
      this.sfx('warn');
      this.popText(d.x, p.y - 80, 'BEEP! IT\'S JUST A PLUNGER!');
    }
    for (const o of this.officers) {
      const near = Math.abs(p.x - o.x) < 90;
      o.setFrame(frameIndex('npc.officer', near ? 'thumbsUp' : 'idle')).setFlipX(p.x > o.x);
    }
    if (this.gateAgent) {
      const near = this.level.exit.x - p.x < 260;
      this.gateAgent.setFrame(frameIndex('npc.gateagent', near ? 'wave' : 'idle'));
    }
  }

  /** 3-3: Mr. Spritz is beaten (he was just the intern): the gate opens. */
  private mascotBeaten(): void {
    this.gate?.setFrame(frameIndex('w3.gate', 'open'));
    this.gateWall?.destroy();
    this.gateWall = undefined;
    this.time.delayedCall(900, () => this.popText(this.player.x, this.player.y - 110, 'THANK YOU YANIV!', 1500, true));
    this.time.delayedCall(2300, () => this.popText(this.player.x, this.player.y - 110, 'BUT THE COCKPIT IS IN ANOTHER CABIN!', 1700, true));
  }

  /** All drains clear: the algae washes away and the gate swings open. */
  private poolCleared(): void {
    this.popText(this.player.x, this.player.y - 90, 'THE POOL IS CLEAN!');
    this.sfx('powerup');
    if (this.algaeLayers.length) this.tweens.add({ targets: this.algaeLayers, alpha: 0, duration: 1800 });
    for (const e of this.enemies) if (e.kind === 'algae') e.hit('plunger');
    this.gate?.setFrame(frameIndex('w7.gate', 'open'));
    this.gateWall?.destroy();
    this.gateWall = undefined;
  }

  /** Top-right of the HUD on the ground: TIME, and 7-1's drains still to clear. */
  private groundLabel(): string {
    if (!this.altitude) return this.airport ? 'DXB AIRPORT' : 'WASHINGTON, D.C.';
    const left = this.drains.filter((d) => d.clogged).length;
    return `TIME ${Math.ceil(this.altitude.value)}${this.drains.length ? ` · DRAINS ${left}` : ''}`;
  }

  private get objectiveDone(): boolean {
    return this.drains.every((d) => !d.clogged) && (!this.mascot || this.mascot.state === 'done');
  }

  private stepDrains(dt: number): void {
    const algae = this.enemies.filter((e) => e.live && e.kind === 'algae').length;
    for (const d of this.drains) d.step(dt, algae < 4, (e) => this.enemies.push(e));
    // 7-4: walk up to the President for the handshake.
    // (Any height: jumping over him still ends in the handshake.)
    if (this.president && this.player.x > this.president.x - 46) this.finale();
  }

  /** A paparazzo's flash: the whole screen whites out for a moment. */
  flashScreen(): void {
    // One flash at a time (a row of paparazzi would otherwise strobe), and a gentler one with reduced motion.
    if (this.elapsed - this.lastFlash < 1.6) return;
    this.lastFlash = this.elapsed;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const cam = this.cameras.main;
      const veil = this.add.rectangle(cam.width / 2, cam.height / 2, VIEW_W * 2, VIEW_H * 2, 0xffffff, 0.45).setScrollFactor(0).setDepth(60);
      this.tweens.add({ targets: veil, alpha: 0, duration: 650, onComplete: () => veil.destroy() });
    } else this.cameras.main.flash(650, 255, 255, 255, true);
  }

  /**
   * 7-4: the handshake, the Bros. and the Captain join in, everyone poses, the camera flashes, and the
   * photo becomes the ending card. No fight.
   */
  private finale(): void {
    if (this.finished || !this.president) return;
    this.finished = true;
    const p = this.player;
    const pres = this.president;
    this.cfg.onEvent({ type: 'cutscene', on: true });
    p.placeAt(pres.x - 34, this.floorTop);
    p.body.stop();
    p.body.enable = false;
    p.sprite.anims.stop();
    p.sprite.setFlipX(false).setTexture('yaniv.ending', frameIndex('yaniv.ending', 'shake'));
    p.sprite.x = pres.x - 34;
    pres.setFrame(frameIndex('npc.president', 'handshake'));
    this.sfx('chime');
    this.popText(pres.x - 17, pres.y - 90, 'THANK YOU, YANIV!');
    // The Bros. and the Captain come in for the photo.
    const cast: [string, number][] = [
      ['npc.captain', 2],
      ['npc.assaf', 0],
      ['npc.zvika', 0],
      ['npc.shota', 0],
    ];
    cast.forEach(([key, frame], i) => {
      const s = this.add.sprite(-40 - i * 30, this.floorTop, key, frame).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(4);
      if (key === 'npc.captain') s.setFrame(frameIndex('npc.captain', 'thumbsUp'));
      this.tweens.add({ targets: s, x: pres.x - 80 - i * 34, delay: 600 + i * 150, duration: 1400, ease: 'Sine.Out' });
    });
    this.time.delayedCall(2600, () => {
      p.sprite.setTexture('yaniv.ending', frameIndex('yaniv.ending', 'pose'));
      pres.setFrame(frameIndex('npc.president', 'photo'));
      // Frame the group for the photo.
      const cam = this.cameras.main;
      cam.pan(pres.x - 75, this.floorTop - 90, 500, 'Sine.easeInOut'); // the floor line near the photo's bottom
      cam.zoomTo(ZOOM * 1.7, 500, 'Sine.easeInOut');
    });
    const run: RunState = { hearts: this.hearts, power: p.power, nuts: this.nutCount, score: this.score };
    this.time.delayedCall(3300, () => {
      this.sfx('flash');
      this.game.renderer.snapshot(
        (image) => {
          const photo = image instanceof HTMLImageElement ? image.src : undefined;
          this.cameras.main.flash(500, 255, 255, 255, true);
          this.time.delayedCall(700, () => this.cfg.onEvent({ type: 'finale', run, photo }));
        },
        'image/jpeg',
        0.85,
      );
    });
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
      const drains = this.drains.flatMap((d, i) => (d.clogged ? [] : [i]));
      this.cfg.onEvent({ type: 'checkpoint', at: c, drains });
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
    if (this.theme.water) this.sfx('splash');
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
    if (this.finished || this.cfg.level.theme === 'oval') return;
    if (!this.objectiveDone) {
      // 7-1: the gate stays shut until the pool's drains are clear; 3-3: until Mr. Spritz is beaten.
      if (this.elapsed - this.gateNagged > 2) {
        this.gateNagged = this.elapsed;
        const left = this.drains.filter((d) => d.clogged).length;
        const text = left ? `LOCKED: ${left} DRAIN${left === 1 ? '' : 'S'} STILL CLOGGED!` : 'MR. SPRITZ BLOCKS THE GATE!';
        this.popText(this.level.exit.x, this.level.exit.y - 10, text, 1300, true);
        this.sfx('bump');
      }
      return;
    }
    this.finished = true;
    const p = this.player;
    // On the ground the time left becomes points, like the flagpole bonus of old.
    const bonus = this.cfg.level.timer && this.altitude ? Math.floor(this.altitude.value) * 10 : 0;
    this.score += bonus;
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
    this.time.delayedCall(door ? 1400 : 900, () => this.cfg.onEvent({ type: 'clear', run, seconds: Math.round(this.elapsed), door, bonus }));
  }

  private gameOver(reason: 'hearts' | 'altitude' | 'time'): void {
    if (this.finished) return;
    this.finished = true;
    this.physics.pause();
    this.player.showFrame('hurt');
    this.pushHud();
    this.cfg.onEvent({ type: 'gameover', reason, score: this.score });
  }

  popText(x: number, y: number, text: string, hold = 0, big = false): void {
    this.popLog.push(text); // canvas text is invisible to the DOM: tests read it from here
    if (this.popLog.length > 20) this.popLog.shift();
    const t = this.add.text(x, y, text, { fontFamily: '"Press Start 2P", monospace', fontSize: big ? '24px' : '16px', color: '#fff8e7' });
    t.setOrigin(0.5).setScale(0.5).setDepth(20).setStroke('#000', 4);
    this.tweens.add({ targets: t, y: y - 20, alpha: 0, delay: hold, duration: 700, onComplete: () => t.destroy() });
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
      altLabel: this.ground ? this.groundLabel() : undefined,
      hideBank: this.ground,
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
      drains: this.drains.map((d) => ({ dx: d.x - p.x, clogged: d.clogged })),
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
        drains: this.drains.filter((d) => d.clogged).length,
        pops: [...this.popLog],
        time: this.cfg.level.timer && this.altitude ? Math.ceil(this.altitude.value) : undefined,
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
      /** Test-only: unclog every 7-1 drain at once. */
      clearPool: () => {
        if (!this.drains.some((d) => d.clogged)) return;
        this.drains.forEach((d) => d.setClear());
        this.poolCleared();
      },
    };
  }
}

export type { Body };
