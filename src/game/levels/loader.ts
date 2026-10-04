/**
 * Level format: an ASCII grid (one char per 16×16 tile) plus metadata. Agents and humans can both edit it,
 * diff it and validate it (tools/levels/validate.ts).
 *
 * Grid legend
 *   '#' floor slab (solid)          'B' overhead bin (solid)
 *   '-' one-way platform (stand on top, pass through from below)
 *   'P' player start (feet on the cell's bottom edge)
 *   'o' brass nut                   '?' call-button block (top-left cell of a 2×2 block)
 *   'T' trolley spawner (feet on the cell's bottom edge)
 *   'X' exit curtain (bottom-left cell)
 *   'E' 'Z' 'R' 'K' seats (leftmost cell; seat bottom on the cell's bottom edge): empty, sleeper, reader, kid.
 *       Each seat adds a one-way platform along its seatback top.
 *   '.' or ' ' empty
 */
import { TILE } from '../config.ts';
import type { TiltKey } from '../systems/tilt.ts';

export interface LevelData {
  id: string;
  name: string;
  /** ALT start (ft) and fall rate (ft/s). */
  altitude: { start: number; rate: number };
  tilt: TiltKey[];
  grid: string[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SolidKind = 'floor' | 'bin';
export type SeatKind = 'empty' | 'sleeper' | 'reader' | 'kid';

export interface ParsedLevel {
  width: number;
  height: number;
  solids: (Rect & { kind: SolidKind })[];
  oneWays: Rect[];
  start: { x: number; y: number };
  exit: Rect;
  nuts: { x: number; y: number }[];
  blocks: { x: number; y: number }[];
  trolleys: { x: number; y: number }[];
  seats: { x: number; y: number; kind: SeatKind }[];
}

/** Seat sprite footprint (world units) and the height of its seatback top above the floor. */
export const SEAT = { w: 48, h: 64, topInset: 10, backX: 0, backW: 28 };
export const EXIT = { w: 64, h: 128 };
export const BLOCK = 32;

const SEAT_CHARS: Record<string, SeatKind> = { E: 'empty', Z: 'sleeper', R: 'reader', K: 'kid' };
const SOLID_CHARS: Record<string, SolidKind> = { '#': 'floor', B: 'bin' };

export function parseLevel(level: LevelData): ParsedLevel {
  const rows = level.grid;
  if (!rows.length) throw new Error(`${level.id}: empty grid`);
  const cols = Math.max(...rows.map((r) => r.length));
  const out: ParsedLevel = {
    width: cols * TILE,
    height: rows.length * TILE,
    solids: [],
    oneWays: [],
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0, w: 0, h: 0 },
    nuts: [],
    blocks: [],
    trolleys: [],
    seats: [],
  };
  let starts = 0;
  let exits = 0;

  rows.forEach((row, r) => {
    let run: { kind: SolidKind | 'oneway'; from: number } | null = null;
    const flush = (c: number) => {
      if (!run) return;
      const rect = { x: run.from * TILE, y: r * TILE, w: (c - run.from) * TILE, h: TILE };
      if (run.kind === 'oneway') out.oneWays.push(rect);
      else out.solids.push({ ...rect, kind: run.kind });
      run = null;
    };
    for (let c = 0; c <= cols; c++) {
      const ch = row[c] ?? '.';
      const kind: SolidKind | 'oneway' | undefined = SOLID_CHARS[ch] ?? (ch === '-' ? 'oneway' : undefined);
      if (run && run.kind !== kind) flush(c);
      if (kind && !run) run = { kind, from: c };

      const x = c * TILE;
      const bottom = (r + 1) * TILE;
      switch (ch) {
        case 'P':
          out.start = { x: x + TILE / 2, y: bottom };
          starts++;
          break;
        case 'X':
          out.exit = { x, y: bottom - EXIT.h, w: EXIT.w, h: EXIT.h };
          exits++;
          break;
        case 'o':
          out.nuts.push({ x: x + TILE / 2, y: r * TILE + TILE / 2 });
          break;
        case '?':
          out.blocks.push({ x, y: r * TILE });
          break;
        case 'T':
          out.trolleys.push({ x: x + TILE / 2, y: bottom });
          break;
        default:
          if (SEAT_CHARS[ch]) {
            out.seats.push({ x, y: bottom - SEAT.h, kind: SEAT_CHARS[ch] });
            // Only the seatback (left part of the sprite) is standable, not the passenger's head.
            out.oneWays.push({ x: x + SEAT.backX, y: bottom - SEAT.h + SEAT.topInset, w: SEAT.backW, h: 6 });
          }
      }
    }
  });

  if (starts !== 1) throw new Error(`${level.id}: expected exactly one 'P', found ${starts}`);
  if (exits !== 1) throw new Error(`${level.id}: expected exactly one 'X', found ${exits}`);
  // Merge vertically stacked solid runs with identical spans into single bodies (fewer physics objects).
  out.solids = mergeVertical(out.solids);
  return out;
}

function mergeVertical<T extends Rect & { kind: SolidKind }>(rects: T[]): T[] {
  const sorted = [...rects].sort((a, b) => a.x - b.x || a.w - b.w || a.y - b.y);
  const merged: T[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.kind === r.kind && last.x === r.x && last.w === r.w && last.y + last.h === r.y) last.h += r.h;
    else merged.push({ ...r });
  }
  return merged;
}
