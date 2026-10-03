import { describe, expect, it } from 'vitest';
import { MenuState, keyToAction } from '../../src/title/menu.ts';

describe('MenuState', () => {
  it('wraps the cursor in both directions', () => {
    const m = new MenuState(2);
    expect(m.current).toBe(0);
    expect(m.move(-1)).toBe(true);
    expect(m.current).toBe(1);
    expect(m.move(1)).toBe(true);
    expect(m.current).toBe(0);
  });

  it('reports no change for a single item menu', () => {
    const m = new MenuState(1);
    expect(m.move(1)).toBe(false);
    expect(m.current).toBe(0);
  });

  it('ignores out-of-range and same-index set()', () => {
    const m = new MenuState(2);
    expect(m.set(0)).toBe(false);
    expect(m.set(5)).toBe(false);
    expect(m.set(1)).toBe(true);
    expect(m.current).toBe(1);
  });

  it('rejects empty menus', () => {
    expect(() => new MenuState(0)).toThrow();
  });
});

describe('keyToAction', () => {
  it('maps arrows, WASD and confirm/back keys', () => {
    expect(keyToAction('ArrowUp')).toBe('up');
    expect(keyToAction('KeyS')).toBe('down');
    expect(keyToAction('Enter')).toBe('confirm');
    expect(keyToAction('KeyZ')).toBe('confirm');
    expect(keyToAction('Escape')).toBe('back');
    expect(keyToAction('KeyQ')).toBeUndefined();
  });
});
