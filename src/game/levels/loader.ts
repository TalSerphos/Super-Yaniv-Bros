/**
 * Level format: an ASCII grid (one char per 16×16 tile) plus metadata. Agents and humans can both edit it,
 * diff it and validate it (tests/unit/levels.test.ts checks every shipped level).
 *
 * Grid legend (feet = the entity stands on the cell's bottom edge)
 *   terrain   '#' floor slab   'B' overhead bin (solid)   '-' one-way platform (stand on top only)
 *             'b' breakable bin panel (32×32, top-left cell; Big Yaniv smashes it from below)
 *   blocks    (32×32, top-left cell) '?' call button: nut   'H' power: hummus or golden plunger
 *             'A' bamba rush   'U' sabich (+1 heart)
 *   items     'o' brass nut
 *   enemies   'T' trolley spawner (feet)   'C' suitcase shell (feet)   'Y' baby bomber seat (seat cell)
 *             'W' bin biter (top-left cell; hangs from the bin above)   'L' luggage-rain zone (top cell)
 *   swing     'M' oxygen-mask anchor (the mask hangs MASK_LENGTH below it)
 *   seats     'E' 'Z' 'R' 'K' (leftmost cell, feet): empty, sleeper, reader, kid. Their seatback is a one-way platform.
 *   markers   'P' player start (feet)   'X' exit curtain / gate (bottom-left)   'D' cockpit door exit (bottom-left)
 *             'G' checkpoint (feet)   'N' the Captain (feet)   'Q' screaming passenger (feet)
 *   World 7   'O' clogged drain (feet; the level's objective: plunge them all)   'a' algae blob (feet)
 *             'J' reporter (feet)   'F' paparazzo (feet)   'V' the President (feet, 7-4)
 *   World 3   '>' '<' conveyor belt / travelator (solid; carries whoever stands on it right or left)
 *             'S' Duty-Free Bill cannon (feet; fires left)   'c' runaway baggage cart (feet; rolls in from ahead)
 *             'm' Mr. Spritz, the duty-free mascot (feet; the exit stays shut until he is beaten)
 *             'd' metal detector arch (feet)   'u' security officer (feet)   'x' X-ray machine (feet, on a belt)
 *             'g' gate agent (feet)
 *   '.' or ' ' empty
 */
import { TILE } from '../config.ts';

export interface TiltKey {
  /** Furthest x the player has reached (world units) at which this bank angle applies. */
  x: number;
  deg: number;
}

export interface LevelData {
  id: string;
  name: string;
  /** ALT start (ft) and fall rate (ft/s). */
  altitude: { start: number; rate: number };
  /** Tilt keyed to progress through the level (see systems/tilt.ts). */
  tilt: TiltKey[];
  /** Optional mood: 'sunset' (default) or 'alarm' (red alarm lighting, World 5-4). */
  mood?: 'sunset' | 'alarm';
  /** Look of the level (default 'cabin'); World 3 is DXB airport, World 7 is on the ground in Washington. */
  theme?: 'cabin' | 'mall' | 'lawn' | 'oval' | 'terminal' | 'dutyfree' | 'gate';
  /** Conveyor belts (3-1) and travelators (3-2, 3-4): world units/s for '>' (and minus that for '<'). */
  beltSpeed?: number;
  /** Intro card subtitle (overrides the default). */
  intro?: string;
  /** Clear card heading and subtitle (overrides the default). */
  clear?: { title: string; sub: string };
  /** Ground levels: a TIME counter in seconds instead of ALT. */
  timer?: number;
  grid: string[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type SolidKind = 'floor' | 'bin' | 'belt';
export type SeatKind = 'empty' | 'sleeper' | 'reader' | 'kid';
export type BlockKind = 'nut' | 'power' | 'bamba' | 'sabich';
export interface Point {
  x: number;
  y: number;
}

export interface ParsedLevel {
  width: number;
  height: number;
  solids: (Rect & { kind: SolidKind })[];
  oneWays: Rect[];
  /** The '-' platforms among the one-ways (seatback tops are drawn by their seats). */
  shelves: Rect[];
  start: Point;
  exit: Rect & { kind: 'curtain' | 'door' };
  nuts: Point[];
  blocks: (Point & { kind: BlockKind })[];
  breakables: Point[];
  trolleys: Point[];
  suitcases: Point[];
  babies: Point[];
  binBiters: Point[];
  luggage: Point[];
  masks: Point[];
  checkpoints: Point[];
  seats: (Point & { kind: SeatKind })[];
  captain?: Point;
  screamer?: Point;
  drains: Point[];
  algae: Point[];
  reporters: Point[];
  paparazzi: Point[];
  president?: Point;
  /** World 3: belt surfaces (also solids of kind 'belt'), with their speed. */
  belts: (Rect & { speed: number })[];
  launchers: Point[];
  carts: Point[];
  mascot?: Point;
  detectors: Point[];
  officers: Point[];
  xrays: Point[];
  gateAgent?: Point;
}

/** Seat sprite footprint (world units), seatback top inset, and the standable seatback span. */
export const SEAT = { w: 48, h: 64, topInset: 10, backX: 0, backW: 28 };
export const EXIT = { w: 64, h: 128 };
export const BLOCK = 32;
export const MASK_LENGTH = 104;

const SEAT_CHARS: Record<string, SeatKind> = { E: 'empty', Z: 'sleeper', R: 'reader', K: 'kid' };
const SOLID_CHARS: Record<string, SolidKind> = { '#': 'floor', B: 'bin', '>': 'belt', '<': 'belt' };
/** Default belt speed (world units/s) when the level doesn't set one. */
export const BELT_SPEED = 60;
const BLOCK_CHARS: Record<string, BlockKind> = { '?': 'nut', H: 'power', A: 'bamba', U: 'sabich' };

export function parseLevel(level: LevelData): ParsedLevel {
  const rows = level.grid;
  if (!rows.length) throw new Error(`${level.id}: empty grid`);
  const cols = Math.max(...rows.map((r) => r.length));
  const out: ParsedLevel = {
    width: cols * TILE,
    height: rows.length * TILE,
    solids: [],
    oneWays: [],
    shelves: [],
    start: { x: 0, y: 0 },
    exit: { x: 0, y: 0, w: 0, h: 0, kind: 'curtain' },
    nuts: [],
    blocks: [],
    breakables: [],
    trolleys: [],
    suitcases: [],
    babies: [],
    binBiters: [],
    luggage: [],
    masks: [],
    checkpoints: [],
    seats: [],
    drains: [],
    algae: [],
    reporters: [],
    paparazzi: [],
    belts: [],
    launchers: [],
    carts: [],
    detectors: [],
    officers: [],
    xrays: [],
  };
  const beltSpeed = level.beltSpeed ?? BELT_SPEED;
  let starts = 0;
  let exits = 0;

  rows.forEach((row, r) => {
    let run: { kind: SolidKind | 'oneway'; from: number; ch: string } | null = null;
    const flush = (c: number) => {
      if (!run) return;
      const rect = { x: run.from * TILE, y: r * TILE, w: (c - run.from) * TILE, h: TILE };
      // Only a belt's top row moves (a travelator is as deep as the floor slab it is set into).
      const above = rows[r - 1]?.[run.from];
      if (run.kind === 'belt' && above !== '>' && above !== '<') out.belts.push({ ...rect, speed: run.ch === '<' ? -beltSpeed : beltSpeed });
      if (run.kind === 'oneway') {
        out.oneWays.push(rect);
        out.shelves.push(rect);
      } else out.solids.push({ ...rect, kind: run.kind });
      run = null;
    };
    for (let c = 0; c <= cols; c++) {
      const ch = row[c] ?? '.';
      const kind: SolidKind | 'oneway' | undefined = SOLID_CHARS[ch] ?? (ch === '-' ? 'oneway' : undefined);
      // A belt run also ends where its direction changes ('>' then '<').
      if (run && (run.kind !== kind || (kind === 'belt' && run.ch !== ch))) flush(c);
      if (kind && !run) run = { kind, from: c, ch };

      const x = c * TILE;
      const top = r * TILE;
      const bottom = top + TILE;
      const feet = { x: x + TILE / 2, y: bottom };
      if (BLOCK_CHARS[ch]) {
        out.blocks.push({ x, y: top, kind: BLOCK_CHARS[ch] });
        continue;
      }
      if (SEAT_CHARS[ch] || ch === 'Y') {
        if (ch === 'Y') out.babies.push({ x, y: bottom - SEAT.h });
        else out.seats.push({ x, y: bottom - SEAT.h, kind: SEAT_CHARS[ch] });
        // Only the seatback (left part of the sprite) is standable, not the passenger's head.
        out.oneWays.push({ x: x + SEAT.backX, y: bottom - SEAT.h + SEAT.topInset, w: SEAT.backW, h: 6 });
        continue;
      }
      switch (ch) {
        case 'P':
          out.start = feet;
          starts++;
          break;
        case 'X':
        case 'D':
          out.exit = { x, y: bottom - EXIT.h, w: EXIT.w, h: EXIT.h, kind: ch === 'X' ? 'curtain' : 'door' };
          exits++;
          break;
        case 'o':
          out.nuts.push({ x: x + TILE / 2, y: top + TILE / 2 });
          break;
        case 'b':
          out.breakables.push({ x, y: top });
          break;
        case 'T':
          out.trolleys.push(feet);
          break;
        case 'C':
          out.suitcases.push(feet);
          break;
        case 'W':
          out.binBiters.push({ x, y: top });
          break;
        case 'L':
          out.luggage.push({ x: x + TILE / 2, y: top });
          break;
        case 'M':
          out.masks.push({ x: x + TILE / 2, y: top });
          break;
        case 'G':
          out.checkpoints.push(feet);
          break;
        case 'N':
          out.captain = feet;
          break;
        case 'Q':
          out.screamer = feet;
          break;
        case 'O':
          out.drains.push(feet);
          break;
        case 'a':
          out.algae.push(feet);
          break;
        case 'J':
          out.reporters.push(feet);
          break;
        case 'F':
          out.paparazzi.push(feet);
          break;
        case 'V':
          out.president = feet;
          break;
        case 'S':
          out.launchers.push(feet);
          break;
        case 'c':
          out.carts.push(feet);
          break;
        case 'm':
          out.mascot = feet;
          break;
        case 'd':
          out.detectors.push(feet);
          break;
        case 'u':
          out.officers.push(feet);
          break;
        case 'x':
          out.xrays.push(feet);
          break;
        case 'g':
          out.gateAgent = feet;
          break;
      }
    }
  });

  if (starts !== 1) throw new Error(`${level.id}: expected exactly one 'P', found ${starts}`);
  if (exits !== 1) throw new Error(`${level.id}: expected exactly one exit ('X' or 'D'), found ${exits}`);
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

/** Top of the main aisle floor (the most common floor height). */
export function floorTopOf(level: ParsedLevel): number {
  return Math.max(...level.solids.filter((s) => s.kind === 'floor').map((s) => s.y));
}
