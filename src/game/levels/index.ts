/** World 5 level registry, in play order. */
import type { LevelData } from './loader.ts';
import l51 from './w5/5-1.json';
import l52 from './w5/5-2.json';
import l53 from './w5/5-3.json';
import l54 from './w5/5-4.json';

export const WORLD5: LevelData[] = [l51, l52, l53, l54] as LevelData[];
export const WORLD5_ORDER = WORLD5.map((l) => l.id);

export function levelById(id: string): LevelData | undefined {
  return WORLD5.find((l) => l.id === id);
}
