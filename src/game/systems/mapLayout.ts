/**
 * The overworld map (boot.ts showMap): where each level's node sits on the map art (src/assets/w5/map.bg.webp,
 * 1280×720, the same 16:9 as the stage), and the dotted path that joins them in the order the trip is played.
 * Pure and unit-tested (tests/unit/mapLayout.test.ts).
 *
 * Islands: World 0, DXB airport (bottom left); World 1, the plane on the clouds (top); World 2, the cockpit
 * fight down to the Tabuk desert (bottom centre); World 3, the White House park (right).
 */

export const MAP_W = 1280;
export const MAP_H = 720;

/** Node centres in map pixels. */
export const MAP_NODES: Record<string, [number, number]> = {
  '3-1': [430, 418],
  '3-2': [330, 478],
  '3-3': [195, 488],
  '3-4': [85, 405],
  '5-1': [165, 170],
  '5-2': [290, 225],
  '5-3': [455, 225],
  '5-4': [640, 198],
  '6-1': [500, 480],
  '6-2': [585, 615],
  '6-3': [790, 585],
  '7-1': [870, 462],
  '7-2': [1000, 478],
  '7-3': [1112, 335],
  '7-4': [1035, 300],
};

/**
 * World name plaques (by world number), centred on these points, clear of the path, the title panel (top right)
 * and the caption and buttons (bottom right, taller on phones where buttons keep 44 px).
 */
export const MAP_PLAQUES: Record<number, [number, number]> = {
  0: [240, 552],
  1: [215, 86],
  2: [765, 672],
  3: [1150, 158],
};

/**
 * The path along the map, in walking order: the airport, take off to the clouds, the cockpit fight down to
 * the desert, then Washington. (Story order starts at World 1; World 0 opens after the first win and leads
 * back to the plane, so on the map it comes first.)
 */
export const MAP_PATH = ['3-1', '3-2', '3-3', '3-4', '5-1', '5-2', '5-3', '5-4', '6-1', '6-2', '6-3', '7-1', '7-2', '7-3', '7-4'];

/** A node's centre as percentages of the map (for CSS left/top). */
export function nodePercent(id: string): { left: number; top: number } {
  const [x, y] = MAP_NODES[id];
  return { left: (x / MAP_W) * 100, top: (y / MAP_H) * 100 };
}

export interface PathSegment {
  from: string;
  to: string;
  /** Both ends are playable: drawn bright. Otherwise faint, like a path not yet revealed. */
  open: boolean;
}

/** The path's segments, each marked open when both of its levels can be played. */
export function pathSegments(isOpen: (id: string) => boolean): PathSegment[] {
  return MAP_PATH.slice(1).map((to, i) => {
    const from = MAP_PATH[i];
    return { from, to, open: isOpen(from) && isOpen(to) };
  });
}

/** The levels next to this one on the path (the arrow keys walk along it first). */
export function pathNeighbours(id: string): string[] {
  const i = MAP_PATH.indexOf(id);
  return [MAP_PATH[i - 1], MAP_PATH[i + 1]].filter((n): n is string => !!n);
}
