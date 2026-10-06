/**
 * Saved progress (localStorage, best effort: private mode or blocked storage just means no save).
 * Also the run state carried between levels in one session: hearts, power, nuts, score.
 */

export type Power = 'small' | 'big' | 'golden';

export interface RunState {
  hearts: number;
  power: Power;
  nuts: number;
  score: number;
}

export interface Progress {
  /** Highest level id unlocked, e.g. "5-3". */
  unlocked: string;
  best: Record<string, number>;
}

const KEY = 'syb.progress.v1';

export function loadProgress(first: string): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      if (typeof p.unlocked === 'string') return { unlocked: p.unlocked, best: p.best ?? {} };
    }
  } catch {
    /* unreadable or blocked storage: start fresh */
  }
  return { unlocked: first, best: {} };
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress lasts for this session only */
  }
}

/** Record a cleared level: unlock the next one and keep the best score. Pure, returns a new object. */
export function recordClear(p: Progress, order: string[], id: string, score: number): Progress {
  const i = order.indexOf(id);
  const next = order[i + 1];
  const unlockedIdx = Math.max(order.indexOf(p.unlocked), next ? i + 1 : i);
  return {
    unlocked: order[unlockedIdx] ?? p.unlocked,
    best: { ...p.best, [id]: Math.max(score, p.best[id] ?? 0) },
  };
}

/**
 * Bring a save from an older story order up to date (pure). The game used to start at the airport; it now
 * starts on the plane and opens the airport after the first win:
 * - a save that only reached the airport starts the story on the plane;
 * - a save whose player already won keeps (or gains) the airport.
 */
export function migrateProgress(p: Progress, order: string[], bonusStart: string, finale: string): Progress {
  const won = finale in p.best;
  const at = order.indexOf(p.unlocked);
  const bonusAt = order.indexOf(bonusStart);
  if (at < 0) return { ...p, unlocked: order[0] };
  if (!won && at >= bonusAt) return { ...p, unlocked: order[0] };
  if (won && at < bonusAt) return { ...p, unlocked: bonusStart };
  return p;
}

export const freshRun = (hearts: number): RunState => ({ hearts, power: 'small', nuts: 0, score: 0 });
