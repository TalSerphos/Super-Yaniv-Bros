/**
 * Level registry, in story order. The game starts in the air:
 * - World 1, the attack (internal world 5);
 * - World 2, the three boss phases in the cockpit (internal 6);
 * - World 3, The White House (internal 7);
 * - then World 0, DXB Airport (internal 3): a prequel that opens once the game has been won once.
 *
 * Level ids keep their internal world digit ('5-1', '3-4'), because saves, URLs (?level=) and tests use them.
 * Players see `stageLabel(id)` instead: '5-1' shows as 1-1, the airport's '3-2' as 0-2.
 */
import type { LevelData } from './loader.ts';
import l31 from './w3/3-1.json';
import l32 from './w3/3-2.json';
import l33 from './w3/3-3.json';
import l34 from './w3/3-4.json';
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

export const WORLD3: LevelData[] = [l31, l32, l33, l34] as LevelData[];
export const WORLD5: LevelData[] = [l51, l52, l53, l54] as LevelData[];
export const WORLD5_ORDER = WORLD5.map((l) => l.id);

export const WORLD6: BossData[] = [
  { kind: 'boss', id: '6-1', name: 'THE CO-PILOT', phase: 'A', altitude: { start: 14000 } },
  { kind: 'boss', id: '6-2', name: 'FIGHT + FLY', phase: 'B', altitude: { start: 10200 } },
  { kind: 'boss', id: '6-3', name: 'KEEP HIM TIED', phase: 'C', altitude: { start: 12000 } },
];

export const WORLD7: LevelData[] = [l71, l72, l73, l74] as LevelData[];

export interface World {
  /** Internal number (the first digit of its level ids, its asset folder). */
  id: number;
  /** The number players see. */
  number: number;
  name: string;
  stages: Stage[];
}

export const WORLDS: World[] = [
  { id: 5, number: 1, name: 'THE ATTACK', stages: WORLD5 },
  { id: 6, number: 2, name: 'THE COCKPIT', stages: WORLD6 },
  { id: 7, number: 3, name: 'THE WHITE HOUSE', stages: WORLD7 },
  { id: 3, number: 0, name: 'DXB AIRPORT', stages: WORLD3 },
];

/** The last stage of the story; winning it for the first time opens the airport (World 0). */
export const FINALE_ID = '7-4';
/** The airport prequel's first stage (it unlocks right after the story, in `ORDER`). */
export const BONUS_START_ID = '3-1';
/** The airport ends by boarding Flight 1073: its last stage leads back to the start of the story. */
const NEXT_AFTER: Record<string, string> = { '3-4': '5-1' };

/** Every stage in play order (unlocking follows this). */
export const STAGES: Stage[] = WORLDS.flatMap((w) => w.stages);
export const ORDER = STAGES.map((s) => s.id);

export function levelById(id: string): Stage | undefined {
  return STAGES.find((l) => l.id === id);
}

export const worldOf = (id: string): World => WORLDS.find((w) => w.stages.some((s) => s.id === id))!;

/** The label players see for a stage: its world's number and its place in that world ('5-1' → '1-1'). */
export function stageLabel(id: string): string {
  const w = worldOf(id);
  return `${w.number}-${w.stages.findIndex((s) => s.id === id) + 1}`;
}

/** What plays after a stage: the next in story order, or the jump from the airport back onto the plane. */
export function stageAfter(id: string): Stage | undefined {
  return NEXT_AFTER[id] ? levelById(NEXT_AFTER[id]) : STAGES[ORDER.indexOf(id) + 1];
}

/** Worlds in the order players count them (0, 1, 2, 3): the map's columns. */
export const WORLDS_BY_NUMBER: World[] = [...WORLDS].sort((a, b) => a.number - b.number);
