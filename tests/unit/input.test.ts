import { describe, expect, it } from 'vitest';
import { BotInput, ButtonEdges, KeyboardInput, noButtons, type BotView } from '../../src/game/systems/input.ts';

describe('KeyboardInput', () => {
  it('latches a tap released before the next read, then clears it', () => {
    const kb = new KeyboardInput(window);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    const first = noButtons();
    kb.read(first);
    expect(first.jump).toBe(true);
    const second = noButtons();
    kb.read(second);
    expect(second.jump).toBe(false);
    kb.destroy();
  });

  it('reports held keys every read and ignores Ctrl shortcuts', () => {
    const kb = new KeyboardInput(window);
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', ctrlKey: true }));
    for (let i = 0; i < 2; i++) {
      const b = noButtons();
      kb.read(b);
      expect(b.right).toBe(true);
    }
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowRight' }));
    kb.destroy();
  });
});

describe('BotInput', () => {
  const view = (over: Partial<BotView> = {}): BotView => ({
    x: 100,
    y: 320,
    vx: 140,
    grounded: true,
    groundAt: () => true,
    wallAt: () => false,
    threats: [],
    ...over,
  });

  it('runs right on open floor without jumping', () => {
    const bot = new BotInput();
    bot.view = view();
    const b = noButtons();
    bot.read(b);
    expect(b).toMatchObject({ right: true, jump: false });
  });

  it('lets go of the arrows after a pit respawn (a held direction is ignored until released), then runs on', () => {
    const bot = new BotInput();
    bot.view = view({ mustRelease: true });
    const released = noButtons();
    bot.read(released);
    expect(released.right).toBe(false);
    bot.view = view();
    const after = noButtons();
    bot.read(after);
    expect(after.right).toBe(true);
  });

  it('jumps at a pit edge and keeps holding for a full jump', () => {
    const bot = new BotInput();
    bot.view = view({ groundAt: (x) => x < 120 });
    const b = noButtons();
    bot.read(b);
    expect(b.jump).toBe(true);
    bot.view = view({ grounded: false });
    const held = noButtons();
    bot.read(held);
    expect(held.jump).toBe(true);
  });

  it('jumps when a faster trolley closes in from behind', () => {
    const bot = new BotInput();
    bot.view = view({ threats: [{ kind: 'trolley', dx: -50, dy: 0, vx: 210 }] });
    const b = noButtons();
    bot.read(b);
    expect(b.jump).toBe(true);
  });

  it('pokes an enemy in plunger reach, then waits for the cooldown', () => {
    const bot = new BotInput();
    bot.view = view({ threats: [{ kind: 'suitcase', dx: 60, dy: 0, vx: -36 }] });
    const b = noButtons();
    bot.read(b);
    expect(b.grab).toBe(true);
    const again = noButtons();
    bot.read(again);
    expect(again.grab).toBe(false);
  });

  it('stops under a bag dropping just ahead, then runs on once it has landed', () => {
    const bot = new BotInput();
    bot.view = view({ threats: [{ kind: 'luggage', dx: 30, dy: -90, vx: 0 }] });
    const b = noButtons();
    bot.read(b);
    expect(b).toMatchObject({ right: false, jump: false });
    bot.view = view();
    const go = noButtons();
    bot.read(go);
    expect(go.right).toBe(true);
  });
});

describe('ButtonEdges', () => {
  const pause = { ...noButtons(), pause: true };

  it('reports a press once while held', () => {
    const e = new ButtonEdges();
    e.next(pause);
    expect(e.pressed('pause')).toBe(true);
    e.next(pause);
    expect(e.pressed('pause')).toBe(false);
  });

  it('after clear(), a press straight after resuming is a new edge (WebKit regression)', () => {
    const e = new ButtonEdges();
    e.next(pause); // the step that paused the game
    e.clear(); // done when pausing
    e.next(pause); // first step after resume: Escape was pressed again before it
    expect(e.pressed('pause')).toBe(true);
  });

  it('without clear(), that second press would be lost', () => {
    const e = new ButtonEdges();
    e.next(pause);
    e.next(pause);
    expect(e.pressed('pause')).toBe(false);
  });
});
