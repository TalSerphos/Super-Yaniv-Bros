import { describe, expect, it } from 'vitest';
import { missingAssets } from '../../src/game/assets.ts';

describe('asset registry', () => {
  it('every registered sheet and image has built art (no placeholder boxes in the shipped game)', () => {
    expect(missingAssets()).toEqual([]);
  });
});
