/** Menu cursor state, kept free of DOM so it can be unit tested. */
export class MenuState {
  private index = 0;

  constructor(private readonly size: number) {
    if (size < 1) throw new Error('menu needs at least one item');
  }

  get current(): number {
    return this.index;
  }

  /** Moves the cursor with wrap-around. Returns true if the cursor changed. */
  move(delta: number): boolean {
    const next = (((this.index + delta) % this.size) + this.size) % this.size;
    const changed = next !== this.index;
    this.index = next;
    return changed;
  }

  set(i: number): boolean {
    if (i < 0 || i >= this.size || i === this.index) return false;
    this.index = i;
    return true;
  }
}

export type MenuAction = 'up' | 'down' | 'confirm' | 'back';

const KEYMAP: Record<string, MenuAction> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Enter: 'confirm',
  Space: 'confirm',
  KeyZ: 'confirm',
  Escape: 'back',
  Backspace: 'back',
  KeyX: 'back',
};

export function keyToAction(code: string): MenuAction | undefined {
  return KEYMAP[code];
}

/**
 * Polls connected gamepads (standard mapping) and emits edge-triggered menu actions.
 * Only runs while a pad is connected, so it costs nothing on phones and desktops without one.
 */
export function watchGamepads(emit: (a: MenuAction) => void): void {
  if (!('getGamepads' in navigator)) return;
  const held = new Set<string>();
  let raf = 0;
  const poll = () => {
    const pads = navigator.getGamepads().filter((p): p is Gamepad => !!p);
    if (!pads.length) {
      raf = 0;
      return;
    }
    const now = new Set<string>();
    for (const p of pads) {
      const axis = p.axes[1] ?? 0;
      if (p.buttons[12]?.pressed || axis < -0.6) now.add('up');
      if (p.buttons[13]?.pressed || axis > 0.6) now.add('down');
      if (p.buttons[0]?.pressed || p.buttons[9]?.pressed) now.add('confirm');
      if (p.buttons[1]?.pressed) now.add('back');
    }
    for (const a of now) if (!held.has(a)) emit(a as MenuAction);
    held.clear();
    now.forEach((a) => held.add(a));
    raf = requestAnimationFrame(poll);
  };
  window.addEventListener('gamepadconnected', () => {
    if (!raf) raf = requestAnimationFrame(poll);
  });
}
