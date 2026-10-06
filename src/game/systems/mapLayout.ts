/**
 * The overworld map (boot.ts showMap): where each level's node sits on the map art (src/assets/w5/map.bg.webp,
 * 1280×720, the same 16:9 as the stage), and the dotted path that joins them in the order the trip is played.
 * Pure and unit-tested (tests/unit/mapLayout.test.ts).
 *
 * The picture: World 0, DXB airport, is the island on the left; one giant airliner with its roof cut away fills
 * the middle, World 1 down its cabin aisle (1-4, COCKPIT DOOR, at the door) and World 2 in the cockpit at its
 * nose; World 3 is the White House park island on the right.
 */

export const MAP_W = 1280;
export const MAP_H = 720;

/** Node centres in map pixels. */
export const MAP_NODES: Record<string, [number, number]> = {
  '3-1': [100, 575],
  '3-2': [215, 545],
  '3-3': [275, 450],
  '3-4': [230, 290],
  '5-1': [450, 348],
  '5-2': [560, 348],
  '5-3': [670, 348],
  '5-4': [775, 348],
  '6-1': [855, 300],
  '6-2': [855, 394],
  '6-3': [945, 347],
  '7-1': [1020, 445],
  '7-2': [1095, 470],
  '7-3': [1130, 295],
  '7-4': [1092, 192],
};

/**
 * World name plaques (by world number), centred on these points, clear of the path, the title panel (top left)
 * and the caption and buttons (bottom right, taller on phones where buttons keep 44 px).
 */
export const MAP_PLAQUES: Record<number, [number, number]> = {
  0: [180, 672],
  1: [450, 482],
  2: [815, 478],
  3: [1100, 36],
};

/**
 * The path along the map, in walking order: the airport, board at the back of the plane, up the aisle to the
 * cockpit, then Washington. (Story order starts at World 1; World 0 opens after the first win and leads
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
