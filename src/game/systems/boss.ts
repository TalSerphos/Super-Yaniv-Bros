/**
 * Jacuzzam Al-Jacuzzi, the World 6 boss: the rules of each phase as plain state machines (no Phaser), so
 * they are unit-tested on their own and the scene only draws them and routes input to them.
 *
 *   Phase A (6-1) Fight: hit him 5 times (stomp his cap, or plunge a jacuzzi jet so it reverses onto him),
 *                        he staggers, grab him from behind and mash GRAB to land the chokehold.
 *   Phase B (6-2) Fight + Fly: hold ▼ at the yoke to pull the nose up from −35° while he slaps it forward.
 *                        Each slap leaves him off balance for a moment (or Assaf pins him): plunge his
 *                        goggles then. Take his HP to 0, then hold the pitch in the green band for 5 s.
 *   Phase C (6-3) Keep Him Tied: tighten the knot he is wriggling; the Tabuk clock runs 50:00 at 30×.
 *                        A knot that fully slips sends you back to Phase B at half HP.
 */

export const BOSS_HP = 5;
export const BOSS_NAME = 'JACUZZAM AL-JACUZZI';

export type BossEvent =
  | { type: 'throw' }
  | { type: 'jetStart' }
  | { type: 'jetEnd' }
  | { type: 'reverse' }
  | { type: 'duck' }
  | { type: 'lean'; on: boolean }
  | { type: 'hit'; hp: number }
  | { type: 'stagger' }
  | { type: 'recover' }
  | { type: 'won' };

// ---------------------------------------------------------------------------------------------------------
// Phase A

export type AttackKind = 'binders' | 'jets' | 'lean' | 'ducks';
export type ModeA = 'idle' | 'attack' | 'hit' | 'stagger' | 'choke' | 'won';

/** Attack timings (seconds from the start of the attack). */
export const ATTACKS: Record<AttackKind, { duration: number; at?: number[] }> = {
  binders: { duration: 1.8, at: [0.45, 0.95, 1.45] },
  // Wind-up 0.8 s (nozzles glow: plunge now!), then the bubble stream until 2.4 s.
  jets: { duration: 2.4 },
  lean: { duration: 3 },
  ducks: { duration: 1, at: [0.3, 0.7] },
};
export const JET_WINDUP = 0.8;
const SCRIPT: AttackKind[] = ['binders', 'jets', 'ducks', 'lean', 'jets', 'binders'];
const IDLE_GAP = 1.4;
const HIT_INVULNERABLE = 0.8;
export const STAGGER_SECONDS = 4;
export const CHOKE_TAPS = 10;
export const CHOKE_SECONDS = 4;
/** HP he gets back when he shakes off a stagger or a failed chokehold. */
export const RECOVER_HP = 2;

export class PhaseA {
  hp = BOSS_HP;
  mode: ModeA = 'idle';
  attack: AttackKind | null = null;
  /** Seconds into the current mode/attack. */
  t = 0;
  chokeTaps = 0;
  private next = 0;
  private fired = 0;

  /** The jet nozzles can be plunged: during the wind-up and while the stream runs. */
  get nozzleOpen(): boolean {
    return this.mode === 'attack' && this.attack === 'jets';
  }

  /** In the wind-up only (the stream has not started): the safe moment to plunge. */
  get jetWindup(): boolean {
    return this.nozzleOpen && this.t < JET_WINDUP;
  }

  get jetFiring(): boolean {
    return this.nozzleOpen && this.t >= JET_WINDUP;
  }

  get leaning(): boolean {
    return this.mode === 'attack' && this.attack === 'lean';
  }

  /** Can take a hit (stomp or reversed jet) right now. */
  get vulnerable(): boolean {
    return this.mode === 'idle' || this.mode === 'attack';
  }

  tick(dt: number): BossEvent[] {
    const out: BossEvent[] = [];
    this.t += dt;
    switch (this.mode) {
      case 'idle':
        if (this.t >= IDLE_GAP) this.startAttack(out);
        break;
      case 'attack': {
        const a = ATTACKS[this.attack!];
        const at = a.at ?? [];
        while (this.fired < at.length && this.t >= at[this.fired]) {
          out.push(this.attack === 'ducks' ? { type: 'duck' } : { type: 'throw' });
          this.fired++;
        }
        if (this.attack === 'jets' && this.fired === 0 && this.t >= JET_WINDUP) {
          this.fired = 1;
          out.push({ type: 'jetStart' });
        }
        if (this.t >= a.duration) this.endAttack(out);
        break;
      }
      case 'hit':
        if (this.t >= HIT_INVULNERABLE) this.setMode(this.hp <= 0 ? 'stagger' : 'idle', out);
        break;
      case 'stagger':
        if (this.t >= STAGGER_SECONDS) this.recover(out);
        break;
      case 'choke':
        if (this.t >= CHOKE_SECONDS) this.recover(out);
        break;
    }
    return out;
  }

  /** Stomped on the cap. */
  stomp(): BossEvent[] {
    return this.damage();
  }

  /** Plunged a jet nozzle: the stream reverses onto him. */
  plungeNozzle(): BossEvent[] {
    if (!this.nozzleOpen) return [];
    return [{ type: 'reverse' }, ...this.damage()];
  }

  /** GRAB from behind while he staggers: the chokehold starts. */
  grabFromBehind(): boolean {
    if (this.mode !== 'stagger') return false;
    this.mode = 'choke';
    this.t = 0;
    this.chokeTaps = 0;
    return true;
  }

  /** One GRAB press during the chokehold. */
  tap(): BossEvent[] {
    if (this.mode !== 'choke') return [];
    this.chokeTaps++;
    if (this.chokeTaps < CHOKE_TAPS) return [];
    this.mode = 'won';
    this.t = 0;
    return [{ type: 'won' }];
  }

  private damage(): BossEvent[] {
    if (!this.vulnerable) return [];
    const out: BossEvent[] = [];
    if (this.mode === 'attack') this.endAttack(out, true);
    this.hp = Math.max(0, this.hp - 1);
    out.push({ type: 'hit', hp: this.hp });
    this.setMode('hit', out);
    return out;
  }

  private recover(out: BossEvent[]): void {
    this.hp = RECOVER_HP;
    out.push({ type: 'recover' });
    this.setMode('idle', out);
  }

  private startAttack(out: BossEvent[]): void {
    this.attack = SCRIPT[this.next++ % SCRIPT.length];
    this.fired = 0;
    this.mode = 'attack';
    this.t = 0;
    if (this.attack === 'lean') out.push({ type: 'lean', on: true });
  }

  private endAttack(out: BossEvent[], interrupted = false): void {
    if (this.attack === 'jets' && this.fired > 0) out.push({ type: 'jetEnd' });
    if (this.attack === 'lean') out.push({ type: 'lean', on: false });
    this.attack = null;
    if (!interrupted) this.setMode('idle', out);
  }

  private setMode(mode: ModeA, out: BossEvent[]): void {
    this.mode = mode;
    this.t = 0;
    if (mode === 'stagger') out.push({ type: 'stagger' });
  }
}

// ---------------------------------------------------------------------------------------------------------
// Phase B

export const PITCH = {
  start: -35,
  /** Degrees per second while ▼ is held at the yoke. */
  pull: 9,
  /** The nose sags this fast when nobody holds the yoke. */
  sag: 1.5,
  max: 6,
  /** Each slap on the yoke. */
  slap: 8,
  slapEvery: 4.5,
  bombEvery: 5,
  band: 3,
  steadySeconds: 5,
  pinSeconds: 3,
  pinCooldown: 12,
  /** After each slap he is off balance for this long: the moment to plunge his goggles. */
  exposed: 1.3,
};

export type BossEventB = { type: 'slap' } | { type: 'bomb' } | { type: 'hit'; hp: number } | { type: 'pinned'; on: boolean } | { type: 'won' };

export class PitchControl {
  pitch = PITCH.start;
  /** Seconds the pitch has stayed in the green band with his HP at 0. */
  steady = 0;
  /** Seconds left of Assaf's pin, and until Assaf can pin again. */
  pinned = 0;
  pinCooldown = 0;
  invulnerable = 0;
  /** Seconds left of the opening after a slap. */
  exposed = 0;
  won = false;
  private slapTimer = PITCH.slapEvery;
  private bombTimer = PITCH.bombEvery * 0.6;

  constructor(public hp = BOSS_HP) {}

  /** CONTROL RESTORED: 0 at −35°, 1 at level flight. */
  get control(): number {
    return Math.max(0, Math.min(1, (this.pitch - PITCH.start) / -PITCH.start));
  }

  get inBand(): boolean {
    return Math.abs(this.pitch) <= PITCH.band;
  }

  /** At 0 HP he is out of the fight (held down): no more slaps or bombs. */
  get subdued(): boolean {
    return this.hp <= 0;
  }

  /** He can be hit: just after a slap (off balance) or while Assaf pins his arms. */
  get open(): boolean {
    return !this.subdued && this.invulnerable <= 0 && (this.exposed > 0 || this.pinned > 0);
  }

  get assistReady(): boolean {
    return this.pinCooldown <= 0 && !this.subdued;
  }

  tick(dt: number, pulling: boolean): BossEventB[] {
    const out: BossEventB[] = [];
    if (this.won) return out;
    this.pitch = Math.min(PITCH.max, Math.max(-60, this.pitch + (pulling ? PITCH.pull : -PITCH.sag) * dt));
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.exposed = Math.max(0, this.exposed - dt);
    this.pinCooldown = Math.max(0, this.pinCooldown - dt);
    if (this.pinned > 0) {
      this.pinned = Math.max(0, this.pinned - dt);
      if (this.pinned === 0) out.push({ type: 'pinned', on: false });
    }
    if (!this.subdued && this.pinned <= 0) {
      this.slapTimer -= dt;
      this.bombTimer -= dt;
      if (this.slapTimer <= 0) {
        this.slapTimer = PITCH.slapEvery;
        this.pitch -= PITCH.slap;
        this.exposed = PITCH.exposed;
        out.push({ type: 'slap' });
      }
      if (this.bombTimer <= 0) {
        this.bombTimer = PITCH.bombEvery;
        out.push({ type: 'bomb' });
      }
    }
    this.steady = this.subdued && this.inBand ? this.steady + dt : 0;
    if (this.steady >= PITCH.steadySeconds) {
      this.won = true;
      out.push({ type: 'won' });
    }
    return out;
  }

  /** A stomp or a plunger to the goggles: only lands while he is open (see `open`). */
  hit(): BossEventB[] {
    if (!this.open) return [];
    this.hp--;
    this.exposed = 0;
    this.invulnerable = 1;
    return [{ type: 'hit', hp: this.hp }];
  }

  /** Assaf pins his arms: no slaps or bombs for a few seconds. */
  pin(): BossEventB[] {
    if (!this.assistReady) return [];
    this.pinned = PITCH.pinSeconds;
    this.pinCooldown = PITCH.pinCooldown;
    return [{ type: 'pinned', on: true }];
  }
}

// ---------------------------------------------------------------------------------------------------------
// Phase C

export const KNOTS = {
  names: ['ANKLES', 'CHEST', 'WRISTS'] as const,
  max: 100,
  zipMax: 150,
  /** Strength lost per second by the knot he is working on (halved with zip ties). */
  wriggle: 13,
  switchEvery: 4,
  tighten: 12,
  houdiniEvery: 20,
  houdiniLoss: 30,
  cableEvery: 15,
  cableGain: 35,
  /** The flight to Tabuk: 50 game minutes at 30× (100 s of play). */
  clockStart: 50 * 60,
  clockSpeed: 30,
  zipAt: 25 * 60,
  captainDrain: 4,
  captainHelp: 30,
};

export type BossEventC =
  | { type: 'switch'; knot: number }
  | { type: 'houdiniSoon' }
  | { type: 'houdini' }
  | { type: 'cable'; knot: number }
  | { type: 'zipties' }
  | { type: 'slip'; knot: number }
  | { type: 'won' };

export class Knots {
  strength: number[] = KNOTS.names.map(() => KNOTS.max);
  target = 0;
  /** Game seconds until Tabuk. */
  clock = KNOTS.clockStart;
  captain = 100;
  zip = false;
  zipDropped = false;
  done: 'won' | 'slip' | null = null;
  private switchTimer = KNOTS.switchEvery;
  private houdiniTimer = KNOTS.houdiniEvery;
  private cableTimer = KNOTS.cableEvery;

  constructor(
    private readonly random: () => number = Math.random,
    clock: number = KNOTS.clockStart,
  ) {
    this.clock = clock;
    this.zipDropped = clock <= KNOTS.zipAt;
  }

  /** He is about to try a Houdini (a 2-second warning). */
  get houdiniSoon(): boolean {
    return this.houdiniTimer <= 2;
  }

  get max(): number {
    return this.zip ? KNOTS.zipMax : KNOTS.max;
  }

  /** "TABUK IN 49:58" */
  get clockText(): string {
    const s = Math.max(0, Math.ceil(this.clock));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  /** The clock stands still while the Captain needs help (Shota can't do both). */
  get clockPaused(): boolean {
    return this.captain <= 0;
  }

  tick(dt: number, helpingShota: boolean): BossEventC[] {
    const out: BossEventC[] = [];
    if (this.done) return out;
    this.captain = Math.min(100, Math.max(0, this.captain + (helpingShota ? KNOTS.captainHelp : -KNOTS.captainDrain) * dt));
    if (!this.clockPaused) this.clock = Math.max(0, this.clock - dt * KNOTS.clockSpeed);

    this.switchTimer -= dt;
    if (this.switchTimer <= 0) {
      this.switchTimer = KNOTS.switchEvery;
      const others = [0, 1, 2].filter((k) => k !== this.target);
      this.target = others[Math.floor(this.random() * others.length)];
      out.push({ type: 'switch', knot: this.target });
    }
    const rate = KNOTS.wriggle * (this.zip ? 0.5 : 1);
    this.strength[this.target] -= rate * dt;

    const before = this.houdiniTimer;
    this.houdiniTimer -= dt;
    if (before > 2 && this.houdiniTimer <= 2) out.push({ type: 'houdiniSoon' });
    if (this.houdiniTimer <= 0) {
      this.houdiniTimer = KNOTS.houdiniEvery;
      this.strength = this.strength.map((s) => s - KNOTS.houdiniLoss);
      out.push({ type: 'houdini' });
    }
    this.cableTimer -= dt;
    if (this.cableTimer <= 0) {
      this.cableTimer = KNOTS.cableEvery;
      const weakest = this.strength.indexOf(Math.min(...this.strength));
      this.strength[weakest] = Math.min(this.max, this.strength[weakest] + KNOTS.cableGain);
      out.push({ type: 'cable', knot: weakest });
    }
    if (!this.zipDropped && this.clock <= KNOTS.zipAt) {
      this.zipDropped = true;
      out.push({ type: 'zipties' });
    }

    const slipped = this.strength.findIndex((s) => s <= 0);
    if (slipped >= 0) {
      this.strength[slipped] = 0;
      this.done = 'slip';
      out.push({ type: 'slip', knot: slipped });
    } else if (this.clock <= 0) {
      this.done = 'won';
      out.push({ type: 'won' });
    }
    return out;
  }

  /** One GRAB press at a knot. */
  tighten(knot: number): void {
    if (this.done) return;
    this.strength[knot] = Math.min(this.max, this.strength[knot] + KNOTS.tighten);
  }

  /** Picked up Zvika's zip ties: his wriggling works knots loose half as fast, and they can be cinched tighter. */
  upgrade(): void {
    this.zip = true;
  }
}
