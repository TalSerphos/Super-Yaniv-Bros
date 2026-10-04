/** Level registry, in play order: World 5, World 6 (the three boss phases) and World 7 (The White House). */
import type { LevelData } from './loader.ts';
import l51 from './w5/5-1.json';
import l52 from './w5/5-2.json';
import l53 from './w5/5-3.json';
import l54 from './w5/5-4.json';
import l71 from './w7/7-1.json';
import l72 from './w7/7-2.json';
import l73 from './w7/7-3.json';
import l74 from './w7/7-4.json';

/** A boss phase (World 6): the arena and rules live in BossScene and systems/boss.ts. */
export interface BossData {
  kind: 'boss';
  id: string;
  name: string;
  phase: 'A' | 'B' | 'C';
  /** ALT at the start (ft). Phases A and B drop it at a rate set by the pitch; C cruises to Tabuk. */
  altitude: { start: number };
}

export type Stage = LevelData | BossData;
export const isBoss = (s: Stage): s is BossData => (s as BossData).kind === 'boss';

export const WORLD5: LevelData[] = [l51, l52, l53, l54] as LevelData[];
export const WORLD5_ORDER = WORLD5.map((l) => l.id);

export const WORLD6: BossData[] = [
  { kind: 'boss', id: '6-1', name: 'THE CO-PILOT', phase: 'A', altitude: { start: 14000 } },
  { kind: 'boss', id: '6-2', name: 'FIGHT + FLY', phase: 'B', altitude: { start: 10200 } },
  { kind: 'boss', id: '6-3', name: 'KEEP HIM TIED', phase: 'C', altitude: { start: 12000 } },
];

export const WORLD7: LevelData[] = [l71, l72, l73, l74] as LevelData[];

export interface World {
  id: number;
  name: string;
  stages: Stage[];
}

export const WORLDS: World[] = [
  { id: 5, name: 'THE ATTACK', stages: WORLD5 },
  { id: 6, name: 'THE COCKPIT', stages: WORLD6 },
  { id: 7, name: 'THE WHITE HOUSE', stages: WORLD7 },
];

/** Every stage in play order (unlocking follows this). */
export const STAGES: Stage[] = WORLDS.flatMap((w) => w.stages);
export const ORDER = STAGES.map((s) => s.id);

export function levelById(id: string): Stage | undefined {
  return STAGES.find((l) => l.id === id);
}

export const worldOf = (id: string): World => WORLDS.find((w) => w.stages.some((s) => s.id === id))!;
