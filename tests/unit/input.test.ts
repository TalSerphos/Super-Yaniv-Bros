import { describe, expect, it } from 'vitest';
import { BotInput, KeyboardInput, noButtons, type BotView } from '../../src/game/systems/input.ts';

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
    trolleys: [],
    ...over,
  });

  it('runs right on open floor without jumping', () => {
    const bot = new BotInput();
    bot.view = view();
    const b = noButtons();
    bot.read(b);
    expect(b).toMatchObject({ right: true, jump: false });
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
    bot.view = view({ trolleys: [{ dx: -50, vx: 210 }] });
    const b = noButtons();
    bot.read(b);
    expect(b.jump).toBe(true);
  });
});
