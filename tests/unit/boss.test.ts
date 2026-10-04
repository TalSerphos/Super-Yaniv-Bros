import { describe, expect, it } from 'vitest';
import {
  ATTACKS,
  BOSS_HP,
  CHOKE_SECONDS,
  CHOKE_TAPS,
  JET_WINDUP,
  KNOTS,
  Knots,
  PITCH,
  PhaseA,
  PitchControl,
  RECOVER_HP,
  STAGGER_SECONDS,
  type BossEvent,
} from '../../src/game/systems/boss.ts';

/** Run `seconds` of ticks at 60 Hz, collecting events. */
function run<E>(tick: (dt: number) => E[], seconds: number): E[] {
  const out: E[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) out.push(...tick(1 / 60));
  return out;
}

/** Advance Phase A until it is winding up a jet attack. */
function toJetWindup(a: PhaseA): void {
  for (let i = 0; i < 60 * 30 && !a.jetWindup; i++) a.tick(1 / 60);
}

describe('Phase A: fight', () => {
  it('cycles through its attacks: binders throw three times, ducks spawn two', () => {
    const a = new PhaseA();
    const events = run((dt) => a.tick(dt), 20).map((e) => e.type);
    expect(events.filter((t) => t === 'throw').length).toBeGreaterThanOrEqual(3);
    expect(events).toContain('jetStart');
    expect(events).toContain('jetEnd');
    expect(events.filter((t) => t === 'duck').length).toBe(ATTACKS.ducks.at!.length);
    expect(events).toContain('lean');
  });

  it('a jet wind-up can be plunged: it reverses onto him and costs 1 HP', () => {
    const a = new PhaseA();
    toJetWindup(a);
    expect(a.jetWindup).toBe(true);
    const ev = a.plungeNozzle().map((e) => e.type);
    expect(ev).toEqual(['reverse', 'hit']);
    expect(a.hp).toBe(BOSS_HP - 1);
    expect(a.nozzleOpen).toBe(false); // the attack is interrupted
    expect(a.plungeNozzle()).toEqual([]); // and can't be plunged twice
  });

  it('the stream starts after the wind-up', () => {
    const a = new PhaseA();
    toJetWindup(a);
    const ev = run((dt) => a.tick(dt), JET_WINDUP + 0.1).map((e) => e.type);
    expect(ev).toContain('jetStart');
    expect(a.jetFiring).toBe(true);
  });

  it('is briefly invulnerable after a hit, then 5 hits make him stagger', () => {
    const a = new PhaseA();
    expect(a.stomp().length).toBeGreaterThan(0);
    expect(a.stomp()).toEqual([]); // invulnerable
    for (let i = 0; i < BOSS_HP - 1; i++) {
      run((dt) => a.tick(dt), 1);
      a.mode = 'idle'; // between hits, whatever he was doing
      a.stomp();
    }
    expect(a.hp).toBe(0);
    const ev = run((dt) => a.tick(dt), 1).map((e) => e.type);
    expect(ev).toContain('stagger');
    expect(a.mode).toBe('stagger');
  });

  function staggered(): PhaseA {
    const a = new PhaseA();
    a.hp = 1;
    a.stomp();
    run((dt) => a.tick(dt), 1);
    expect(a.mode).toBe('stagger');
    return a;
  }

  it('the chokehold lands after enough GRAB taps', () => {
    const a = staggered();
    expect(a.grabFromBehind()).toBe(true);
    let events: BossEvent[] = [];
    for (let i = 0; i < CHOKE_TAPS; i++) events = a.tap();
    expect(events).toEqual([{ type: 'won' }]);
    expect(a.mode).toBe('won');
  });

  it('a stagger or chokehold left too long lets him recover some HP', () => {
    const a = staggered();
    run((dt) => a.tick(dt), STAGGER_SECONDS + 0.1);
    expect(a.mode).toBe('idle');
    expect(a.hp).toBe(RECOVER_HP);

    const b = staggered();
    b.grabFromBehind();
    b.tap();
    const ev = run((dt) => b.tick(dt), CHOKE_SECONDS + 0.1).map((e) => e.type);
    expect(ev).toContain('recover');
    expect(b.hp).toBe(RECOVER_HP);
  });

  it('grabbing only works while he staggers', () => {
    expect(new PhaseA().grabFromBehind()).toBe(false);
  });
});

describe('Phase B: fight + fly', () => {
  it('holding the yoke pulls the nose up; letting go lets it sag', () => {
    const b = new PitchControl();
    run((dt) => b.tick(dt, true), 2);
    expect(b.pitch).toBeGreaterThan(PITCH.start + 15);
    const up = b.pitch;
    b.pinned = 99; // no slaps for this check
    run((dt) => b.tick(dt, false), 2);
    expect(b.pitch).toBeLessThan(up);
  });

  it('he slaps the yoke forward on a timer unless Assaf pins him', () => {
    const b = new PitchControl();
    const ev = run((dt) => b.tick(dt, false), PITCH.slapEvery + 0.1).map((e) => e.type);
    expect(ev).toContain('slap');

    const pinned = new PitchControl();
    expect(pinned.pin().map((e) => e.type)).toEqual(['pinned']);
    expect(pinned.assistReady).toBe(false);
    const ev2 = run((dt) => pinned.tick(dt, false), PITCH.pinSeconds - 0.1).map((e) => e.type);
    expect(ev2).not.toContain('slap');
  });

  it('CONTROL is 0 at −35° and 100% at level flight', () => {
    const b = new PitchControl();
    expect(b.control).toBe(0);
    b.pitch = 0;
    expect(b.control).toBe(1);
  });

  it('wins only with his HP at 0 AND the pitch held in the green band for 5 s', () => {
    const b = new PitchControl();
    b.pitch = 0;
    run((dt) => b.tick(dt, false), 1);
    expect(b.steady).toBe(0); // he still has HP

    const c = new PitchControl(1);
    c.exposed = 1;
    expect(c.hit().map((e) => e.type)).toEqual(['hit']);
    expect(c.subdued).toBe(true);
    c.pitch = 0;
    // Hold the yoke just enough to stay level (the pull overshoots past the band otherwise).
    const ev = run((dt) => c.tick(dt, c.pitch < 0), PITCH.steadySeconds + 0.5).map((e) => e.type);
    expect(ev).toContain('won');
    expect(c.won).toBe(true);
  });

  it('can only be hit while off balance after a slap, or pinned by Assaf; once per opening', () => {
    const b = new PitchControl();
    expect(b.hit()).toEqual([]); // standing firm
    run((dt) => b.tick(dt, true), PITCH.slapEvery + 0.05);
    expect(b.open).toBe(true);
    b.hit();
    expect(b.hp).toBe(4);
    expect(b.hit()).toEqual([]); // that opening is used up
    const p = new PitchControl();
    p.pin();
    expect(p.hit().map((e) => e.type)).toEqual(['hit']);
  });

  it('starts at half HP after a slipped knot', () => {
    expect(new PitchControl(3).hp).toBe(3);
  });
});

describe('Phase C: keep him tied', () => {
  it('the wriggled knot weakens; tightening it restores strength', () => {
    const k = new Knots(() => 0);
    run((dt) => k.tick(dt, true), 2);
    expect(k.strength[k.target]).toBeLessThan(KNOTS.max);
    const before = k.strength[k.target];
    k.tighten(k.target);
    expect(k.strength[k.target]).toBeCloseTo(before + KNOTS.tighten);
  });

  it('runs the 50-minute clock at 30× and drops zip ties at 25:00', () => {
    const k = new Knots(() => 0);
    expect(k.clockText).toBe('50:00');
    let events: string[] = [];
    // Keep every knot topped up and the Captain helped, so only the clock matters.
    for (let i = 0; i < 60 * 105 && !k.done; i++) {
      events = events.concat(k.tick(1 / 60, true).map((e) => e.type));
      k.strength = k.strength.map(() => k.max);
    }
    expect(events).toContain('zipties');
    expect(events).toContain('won');
    expect(k.done).toBe('won');
  });

  it('a knot that fully slips ends the phase with a slip', () => {
    const k = new Knots(() => 0);
    k.strength[k.target] = 1;
    const ev = run((dt) => k.tick(dt, true), 0.5);
    expect(ev).toContainEqual({ type: 'slip', knot: k.target });
    expect(k.done).toBe('slip');
  });

  it('the clock stops while the Captain needs help', () => {
    const k = new Knots(() => 0);
    k.captain = 0;
    const clock = k.clock;
    k.tick(0.1, false);
    expect(k.clock).toBe(clock);
  });

  it('zip ties raise the cap and halve the wriggle', () => {
    const k = new Knots(() => 0);
    k.upgrade();
    expect(k.max).toBe(KNOTS.zipMax);
    const s = k.strength[k.target];
    k.tick(1, true);
    expect(s - k.strength[k.target]).toBeCloseTo(KNOTS.wriggle / 2, 0);
  });
});
