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

export const freshRun = (hearts: number): RunState => ({ hearts, power: 'small', nuts: 0, score: 0 });
