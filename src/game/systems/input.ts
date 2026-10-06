/**
 * All gameplay input goes through `Buttons`. Keyboard, gamepad, touch and the test bot each set flags,
 * and the level reads the OR of them once per step, so every source behaves identically.
 */

export interface Buttons {
  left: boolean;
  right: boolean;
  /** ▼: pull the yoke (World 6) and other "use" actions. */
  down: boolean;
  jump: boolean;
  grab: boolean;
  pause: boolean;
}

export const noButtons = (): Buttons => ({ left: false, right: false, down: false, jump: false, grab: false, pause: false });

/** Current and previous step's buttons, for edge detection ("pressed this step"). */
export class ButtonEdges {
  current: Buttons = noButtons();
  private previous: Buttons = noButtons();

  /** Start a new step with freshly read buttons. */
  next(read: Buttons): void {
    this.previous = this.current;
    this.current = read;
  }

  pressed(b: keyof Buttons): boolean {
    return this.current[b] && !this.previous[b];
  }

  /** Forget everything (e.g. when pausing), so the next press after resuming is always an edge. */
  clear(): void {
    this.current = noButtons();
    this.previous = noButtons();
  }
}

export interface InputSource {
  read(into: Buttons): void;
  /** Forget pending taps/held state (level start, resume), so keys pressed on a card don't leak into play. */
  reset?(): void;
  destroy?(): void;
}

const KEYMAP: Record<string, keyof Buttons> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowUp: 'jump',
  KeyW: 'jump',
  Space: 'jump',
  KeyZ: 'jump',
  KeyX: 'grab',
  ShiftLeft: 'grab',
  ShiftRight: 'grab',
  KeyJ: 'grab',
  Escape: 'pause',
  KeyP: 'pause',
};

export class KeyboardInput implements InputSource {
  private held = new Set<keyof Buttons>();
  /** Presses since the last read: a tap shorter than one physics step (16 ms) still registers. */
  private tapped = new Set<keyof Buttons>();
  private readonly down = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const b = KEYMAP[e.code];
    if (!b) return;
    e.preventDefault();
    this.held.add(b);
    this.tapped.add(b);
  };
  private readonly up = (e: KeyboardEvent) => {
    const b = KEYMAP[e.code];
    if (b) this.held.delete(b);
  };
  private readonly blur = () => {
    this.held.clear();
    this.tapped.clear();
  };

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.down);
    target.addEventListener('keyup', this.up);
    target.addEventListener('blur', this.blur);
  }

  read(into: Buttons): void {
    for (const b of this.held) into[b] = true;
    for (const b of this.tapped) into[b] = true;
    this.tapped.clear();
  }

  reset(): void {
    this.held.clear();
    this.tapped.clear();
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.down);
    this.target.removeEventListener('keyup', this.up);
    this.target.removeEventListener('blur', this.blur);
  }
}

export class GamepadInput implements InputSource {
  read(into: Buttons): void {
    if (!('getGamepads' in navigator)) return;
    for (const p of navigator.getGamepads()) {
      if (!p) continue;
      const x = p.axes[0] ?? 0;
      if (p.buttons[14]?.pressed || x < -0.4) into.left = true;
      if (p.buttons[15]?.pressed || x > 0.4) into.right = true;
      if (p.buttons[13]?.pressed || (p.axes[1] ?? 0) > 0.5) into.down = true;
      if (p.buttons[0]?.pressed || p.buttons[12]?.pressed) into.jump = true;
      if (p.buttons[1]?.pressed || p.buttons[2]?.pressed) into.grab = true;
      if (p.buttons[9]?.pressed) into.pause = true;
    }
  }
}

/** On-screen buttons: any element with data-btn="left|right|jump|grab|pause" inside `root`. */
export class TouchInput implements InputSource {
  private held = new Map<number, keyof Buttons>();
  private tapped = new Set<keyof Buttons>();
  private readonly down = (e: PointerEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-btn]');
    if (!el) return;
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    this.held.set(e.pointerId, el.dataset.btn as keyof Buttons);
    this.tapped.add(el.dataset.btn as keyof Buttons);
    this.syncPressed();
  };
  private readonly up = (e: PointerEvent) => {
    this.held.delete(e.pointerId);
    this.syncPressed();
  };
  /** Sliding a thumb from ◀ to ▶ (or onto JUMP) switches buttons without lifting it. */
  private readonly move = (e: PointerEvent) => {
    if (!this.held.has(e.pointerId)) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-btn]');
    const btn = el?.dataset.btn as keyof Buttons | undefined;
    if (!btn || btn === 'pause' || btn === this.held.get(e.pointerId)) return;
    this.held.set(e.pointerId, btn);
    this.tapped.add(btn);
    this.syncPressed();
  };

  constructor(private readonly root: HTMLElement) {
    root.addEventListener('pointerdown', this.down);
    root.addEventListener('pointermove', this.move);
    root.addEventListener('pointerup', this.up);
    root.addEventListener('pointercancel', this.up);
  }

  private syncPressed(): void {
    const on = new Set(this.held.values());
    this.root.querySelectorAll<HTMLElement>('[data-btn]').forEach((el) => el.classList.toggle('pressed', on.has(el.dataset.btn as keyof Buttons)));
  }

  read(into: Buttons): void {
    for (const b of this.held.values()) into[b] = true;
    for (const b of this.tapped) into[b] = true;
    this.tapped.clear();
  }

  reset(): void {
    this.tapped.clear();
  }

  destroy(): void {
    this.root.removeEventListener('pointerdown', this.down);
    this.root.removeEventListener('pointermove', this.move);
    this.root.removeEventListener('pointerup', this.up);
    this.root.removeEventListener('pointercancel', this.up);
  }
}

/** What the test bot can see each step (all in cabin-space world units). */
export interface BotView {
  x: number;
  y: number;
  vx: number;
  grounded: boolean;
  /** Hanging from an oxygen-mask vine, the vine's horizontal speed, and the mask's x offset from its anchor. */
  swinging?: boolean;
  swingVx?: number;
  swingDx?: number;
  /**
   * Just respawned after a pit, with the direction held through the fall still ignored (Player.heldThroughRespawn):
   * the bot must let go once, as a person does, or it never moves again.
   */
  mustRelease?: boolean;
  /** Is there something solid to stand on at this x, near the player's feet? */
  groundAt(x: number): boolean;
  /** Is the space at (x, feet-8) blocked by a wall the player would run into? */
  wallAt(x: number): boolean;
  /**
   * Live hazards that can currently touch the player: offset of their feet from the player's feet
   * (dx, dy; negative dy is above), speed, and kind ('trolley', 'suitcase', 'pacifier', 'luggage', ...).
   */
  threats: BotThreat[];
  /** 7-1: drains along the pool (offset from the player, and whether still clogged). */
  drains?: { dx: number; clogged: boolean }[];
}

export interface BotThreat {
  kind: string;
  dx: number;
  dy: number;
  vx: number;
}

/** Things the bot rolls into or jumps over at ground level (and pokes first when it can). */
const GROUND_THREATS = new Set(['trolley', 'suitcase', 'cart', 'mascot']);

/**
 * Rule-based bot that runs right, pokes anything in plunger reach, waits out falling bags, and jumps over
 * pits, walls and enemies. Used by e2e tests to prove levels are completable in a real browser;
 * deliberately simple, so a level it can finish is comfortably finishable by a person.
 */
export class BotInput implements InputSource {
  private jumpHeld = 0;
  private pokeCooldown = 0;
  view: BotView | null = null;

  read(into: Buttons): void {
    const v = this.view;
    if (!v) return;
    this.pokeCooldown = Math.max(0, this.pokeCooldown - 1);
    if (v.mustRelease) return; // hands off the arrows for a step after a pit respawn

    if (v.swinging) {
      // Pump right, let go on the forward upswing (ahead of the anchor and still moving right).
      into.right = true;
      if ((v.swingVx ?? 0) > 60 && (v.swingDx ?? 0) > 10) into.jump = true;
      return;
    }
    // 3-3's fake boss: face Mr. Spritz, swat his perfume, and jump onto his cap from close range.
    const mascot = v.threats.find((t) => t.kind === 'mascot' && Math.abs(t.dx) < 420);
    if (mascot) return this.fightMascot(v, mascot, into);
    // Plunger poke: reaches ~70 ahead at body height and a little above the head (also calms babies and
    // stuns open bin biters). Pacifiers are lobbed, so swat them anywhere in that box, including overhead.
    const lobbed = (t: BotThreat) => t.kind === 'pacifier' || t.kind === 'question';
    // (Duty-Free Bills and perfume clouds come at chest height: the plunger pops them too.)
    const inReach = (t: BotThreat) =>
      lobbed(t) ? t.dx > -6 && t.dx < 70 && t.dy > -90 && t.dy < 6 : t.kind !== 'luggage' && t.dx > -6 && t.dx < 66 && Math.abs(t.dy) < 38;
    if (this.pokeCooldown === 0 && v.threats.some(inReach)) {
      into.grab = true;
      this.pokeCooldown = 16;
    }
    // 7-1: stop at a clogged drain and plunge it clear.
    const drain = v.grounded && v.drains?.find((d) => d.clogged && d.dx > -14 && d.dx < 50);
    if (drain) {
      if (this.pokeCooldown === 0) {
        into.grab = true;
        this.pokeCooldown = 16;
      }
      return;
    }
    // A bag dropping just ahead: let it land first (it is harmless once down).
    const bagAhead = v.threats.some((t) => t.kind === 'luggage' && t.dy < -20 && t.dx > -14 && t.dx < 64);
    into.right = !(bagAhead && v.grounded);
    if (this.jumpHeld > 0) {
      this.jumpHeld--;
      into.jump = true;
      return;
    }
    if (!v.grounded || bagAhead) return;
    const pitAhead = !v.groundAt(v.x + 22) || !v.groundAt(v.x + 38);
    const wallAhead = v.wallAt(v.x + 20);
    const ground = v.threats.filter((t) => GROUND_THREATS.has(t.kind) && Math.abs(t.dy) < 30);
    const rushingBehind = ground.some((t) => t.dx < 0 && t.dx > -70 && t.vx > v.vx);
    const enemyAhead = ground.some((t) => t.dx > 0 && t.dx < 46 && t.vx < 120);
    if (pitAhead || wallAhead || rushingBehind || enemyAhead) {
      this.jumpHeld = 18; // hold for a full-height jump
      into.jump = true;
    }
  }

  private fightMascot(v: BotView, m: BotThreat, into: Buttons): void {
    const dir = Math.sign(m.dx) || 1;
    const toward = () => (dir > 0 ? (into.right = true) : (into.left = true));
    const cloud = v.threats.some((t) => t.kind === 'perfume' && t.dx * dir > -6 && t.dx * dir < 70 && Math.abs(t.dy) < 44);
    if (cloud && this.pokeCooldown === 0) {
      into.grab = true;
      this.pokeCooldown = 16;
    }
    if (this.jumpHeld > 0) {
      this.jumpHeld--;
      into.jump = true;
      toward();
      return;
    }
    if (!v.grounded) {
      toward(); // steer onto his cap
      return;
    }
    // Too close to jump onto him: back off first (bumping into him hurts).
    if (Math.abs(m.dx) < 34) {
      if (dir > 0) into.left = true;
      else into.right = true;
      return;
    }
    if (Math.abs(m.dx) > 56) toward();
    if (Math.abs(m.dx) < 84) {
      this.jumpHeld = 18;
      into.jump = true;
      toward();
    }
  }
}

// ---------------------------------------------------------------------------------------------------------

/** What the boss bot sees each step (world units; boss x/top are his body's centre and head). */
export interface BossBotView {
  phase: 'A' | 'B' | 'C';
  x: number;
  y: number;
  grounded: boolean;
  facing: 1 | -1;
  threats: BotThreat[];
  boss: { x: number; top: number; mode: string; jetWindup: boolean; jetFiring: boolean; staggered: boolean; choking: boolean };
  /** Phase B: where to stand to pull the yoke, and whether a hit can land now. */
  yokeX?: number;
  atYoke?: boolean;
  pitch?: number;
  bossHittable?: boolean;
  subdued?: boolean;
  /** Phase C: knot positions and strengths, the knot he is working on, Shota, the Captain, zip ties. */
  knots?: { x: number; value: number }[];
  target?: number;
  shotaX?: number;
  captain?: number;
  zipX?: number | null;
}

/**
 * Rule-based player for the three boss phases, used by e2e tests to prove each phase is winnable in a real
 * browser. Phase A: stand off in front of him, swat what he throws, jump the bubble stream, plunge a jet
 * during its wind-up, then grab him from behind and mash. Phase B: hold the yoke, plunge his goggles when
 * he is open, level out. Phase C: work the weakest knot, help Shota when the Captain fades, grab zip ties.
 */
export class BossBot implements InputSource {
  view: BossBotView | null = null;
  private tick = 0;
  private jumpHeld = 0;

  read(into: Buttons): void {
    const v = this.view;
    if (!v) return;
    this.tick++;
    const mash = this.tick % 4 < 2; // a fresh GRAB press every 4 steps
    const go = (x: number, slack = 6) => {
      if (v.x < x - slack) into.right = true;
      else if (v.x > x + slack) into.left = true;
    };
    if (v.phase === 'A') return this.phaseA(v, into, go, mash);
    if (v.phase === 'B') return this.phaseB(v, into, go, mash);
    return this.phaseC(v, into, go, mash);
  }

  private phaseA(v: BossBotView, into: Buttons, go: (x: number, slack?: number) => void, mash: boolean): void {
    const b = v.boss;
    if (b.choking) {
      into.grab = mash;
      return;
    }
    if (b.staggered) {
      // Behind him (he faces left), then GRAB.
      const behind = b.x + 44;
      go(behind, 4);
      if (Math.abs(v.x - behind) < 10) {
        if (v.facing > 0) into.left = true; // face him
        into.grab = mash;
      }
      return;
    }
    // Stand off in front of him; step in to plunge a winding-up jet.
    go(b.jetWindup ? b.x - 70 : b.x - 130, 6);
    if (b.jetWindup && Math.abs(v.x - (b.x - 70)) < 14) {
      if (v.facing < 0) into.right = true;
      into.grab = mash;
    }
    if (this.jumpHeld > 0) {
      this.jumpHeld--;
      into.jump = true;
    }
    const near = (t: BotThreat) => t.dx > -20 && t.dx < 90;
    const swat = v.threats.some((t) => (t.kind === 'binder' || t.kind === 'ducky') && t.dx * v.facing > -6 && t.dx * v.facing < 66 && t.dy > -90 && t.dy < 6);
    if (swat) into.grab = mash;
    const jumpIt = v.threats.some((t) => (t.kind === 'bubble' && near(t) && Math.abs(t.dy) < 50) || (t.kind === 'ducky' && t.dx > 0 && t.dx < 40));
    if (jumpIt && v.grounded && this.jumpHeld === 0) {
      this.jumpHeld = 18;
      into.jump = true;
    }
  }

  private phaseB(v: BossBotView, into: Buttons, go: (x: number, slack?: number) => void, mash: boolean): void {
    if (!v.atYoke) {
      go(v.yokeX!, 3);
      return;
    }
    // Face him (he stands to the right of the yoke).
    if (v.facing < 0) into.right = true;
    const pitch = v.pitch ?? 0;
    if (v.subdued) {
      into.down = pitch < 0; // level out and hold steady
      return;
    }
    // A bath bomb on its way down toward us: let go of the yoke and swat it (it is lobbed high).
    const incoming = v.threats.some((t) => t.kind === 'bathbomb' && t.dx > -20 && t.dx < 110 && t.dy > -140 && t.dy < 10);
    const swat = v.threats.some((t) => t.kind === 'bathbomb' && t.dx > -6 && t.dx < 72 && t.dy > -110 && t.dy < 8);
    if ((v.bossHittable && pitch > -26) || swat) into.grab = mash;
    else if (!incoming) into.down = pitch < 2;
  }

  private helping = false;

  private phaseC(v: BossBotView, into: Buttons, go: (x: number, slack?: number) => void, mash: boolean): void {
    const knots = v.knots!;
    const weakest = knots.reduce((w, k, i) => (k.value < knots[w].value ? i : w), 0);
    const captain = v.captain ?? 100;
    // Help Shota once the Captain fades, until he is stable again; a knot about to slip comes first.
    if (captain < 30) this.helping = true;
    if (captain > 90 || knots[weakest].value < 30) this.helping = false;
    if (v.zipX != null && knots[weakest].value > 40) return go(v.zipX, 4);
    if (this.helping) {
      go(v.shotaX!, 6);
      if (Math.abs(v.x - v.shotaX!) < 20) into.down = true;
      return;
    }
    const pick = knots[v.target!].value < knots[weakest].value + 25 ? v.target! : weakest;
    go(knots[pick].x, 4);
    if (Math.abs(v.x - knots[pick].x) < 10) into.grab = mash;
  }
}
