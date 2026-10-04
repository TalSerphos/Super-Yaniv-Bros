/**
 * All gameplay input goes through `Buttons`. Keyboard, gamepad, touch and the test bot each set flags,
 * and the level reads the OR of them once per step, so every source behaves identically.
 */

export interface Buttons {
  left: boolean;
  right: boolean;
  jump: boolean;
  grab: boolean;
  pause: boolean;
}

export const noButtons = (): Buttons => ({ left: false, right: false, jump: false, grab: false, pause: false });

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
  /** Is there something solid to stand on at this x, near the player's feet? */
  groundAt(x: number): boolean;
  /** Is the space at (x, feet-8) blocked by a wall the player would run into? */
  wallAt(x: number): boolean;
  /** Horizontal distances (x - player.x) to live trolleys, and their speeds. */
  trolleys: { dx: number; vx: number }[];
}

/**
 * Rule-based bot that runs right and jumps over pits, walls and incoming trolleys. Used by e2e tests to
 * prove the level is completable in a real browser; deliberately simple, so a level it can finish is
 * comfortably finishable by a person.
 */
export class BotInput implements InputSource {
  private jumpHeld = 0;
  view: BotView | null = null;

  read(into: Buttons): void {
    const v = this.view;
    if (!v) return;
    into.right = true;
    if (this.jumpHeld > 0) {
      this.jumpHeld--;
      into.jump = true;
      return;
    }
    if (!v.grounded) return;
    const pitAhead = !v.groundAt(v.x + 22) || !v.groundAt(v.x + 38);
    const wallAhead = v.wallAt(v.x + 20);
    const trolleyBehind = v.trolleys.some((t) => t.dx < 0 && t.dx > -70 && t.vx > v.vx);
    const trolleyAhead = v.trolleys.some((t) => t.dx > 0 && t.dx < 46);
    if (pitAhead || wallAhead || trolleyBehind || trolleyAhead) {
      this.jumpHeld = 18; // hold for a full-height jump
      into.jump = true;
    }
  }
}
