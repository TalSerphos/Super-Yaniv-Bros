"""World 7 (The White House) level generator: writes src/game/levels/w7/7-1..7-4.json.

Usage: python3 tools/levels/gen-w7.py src/game/levels/w7
Same grid conventions as gen-w5.py (legend in src/game/levels/loader.ts). World 7 is on the ground: no tilt,
a TIME counter instead of ALT. Pits are pools/fountains (water is drawn in them). Run `npm test` after.
"""
import json, sys
H = 22
FLOOR = 20          # floor slab rows 20-21 (top y = 320)
FEET = 19           # entities stand on the floor
BLOCKROW = 14       # 2x2 blocks rows 14-15 (hit from the floor)

class L:
    def __init__(s, W): s.W = W; s.g = [['.'] * W for _ in range(H)]
    def put(s, r, c, ch): s.g[r][c] = ch
    def h(s, r, c0, c1, ch):
        for c in range(c0, c1 + 1): s.g[r][c] = ch
    def floor(s, pits=()):
        for r in (FLOOR, FLOOR + 1): s.h(r, 0, s.W - 1, '#')
        for c0, c1 in pits:                      # inclusive; keep pools <= 6 tiles (the jump envelope)
            assert c1 - c0 + 1 <= 6, (c0, c1)
            for r in (FLOOR, FLOOR + 1): s.h(r, c0, c1, '.')
    def marble(s, r, c0, c1, nuts=False):
        # A marble ledge: one-way ('-'), so it never bumps a head or blocks a jump from below. Row 16 (top 256)
        # is reachable from the walkway (rise 64 of a 76 apex).
        s.h(r, c0, c1, '-')
        if nuts: s.h(r - 1, c0, c1, 'o')
    def nuts(s, r, cols):
        for c in cols: s.put(r, c, 'o')
    def dump(s, meta):
        return {**meta, "tilt": [{"x": 0, "deg": 0}], "grid": [''.join(r).rstrip('.') or '.' for r in s.g]}

def l71():
    W = 220; l = L(W)
    l.floor(pits=[(40, 45), (78, 83), (118, 123), (156, 161), (190, 195)])
    l.put(FEET, 3, 'P')
    l.nuts(17, range(8, 20, 2)); l.put(BLOCKROW, 14, 'H')
    # the pool is choked with algae: three clogged drains along its edge spit Algae Blobs until plunged
    l.put(FEET, 34, 'O'); l.put(FEET, 26, 'a')
    l.marble(16, 41, 44, nuts=True)              # stepping stones over the water
    l.put(FEET, 52, 'a'); l.put(BLOCKROW, 60, '?'); l.put(FEET, 68, 'a')
    l.marble(16, 79, 82, nuts=True)
    l.put(FEET, 95, 'a'); l.put(FEET, 100, 'G')
    l.put(FEET, 110, 'O'); l.nuts(17, range(104, 110))
    l.marble(16, 118, 123, nuts=True)
    l.put(BLOCKROW, 130, 'A'); l.put(FEET, 140, 'a'); l.put(FEET, 148, 'a')
    l.marble(16, 157, 160, nuts=True)
    l.put(BLOCKROW, 172, 'U'); l.put(FEET, 182, 'O'); l.put(FEET, 176, 'a')
    l.marble(16, 191, 194, nuts=True)
    l.nuts(17, range(200, 212, 2))
    l.put(FEET, 214, 'X')                        # the gate opens once the pool is clean
    return l.dump({"id": "7-1", "name": "THE REFLECTING POOL", "theme": "mall", "timer": 200, "altitude": {"start": 0, "rate": 0}})

def l72():
    W = 220; l = L(W)
    l.floor(pits=[(60, 64), (150, 155)])
    l.put(FEET, 3, 'P')
    l.nuts(17, range(8, 18, 2)); l.put(BLOCKROW, 20, 'H')
    l.put(FEET, 30, 'J'); l.put(FEET, 48, 'J')
    l.marble(16, 58, 66, nuts=True)              # over the fountain
    l.put(FEET, 75, 'J'); l.marble(16, 84, 90, nuts=True); l.put(FEET, 92, 'J')
    l.h(18, 100, 101, 'B'); l.h(19, 100, 101, 'B')   # a low marble wall to hop
    l.put(BLOCKROW, 110, '?'); l.put(FEET, 112, 'G')
    l.put(FEET, 120, 'J'); l.put(FEET, 138, 'J')
    l.marble(16, 149, 156, nuts=True); l.put(BLOCKROW, 162, 'A')
    l.put(FEET, 168, 'J'); l.put(FEET, 185, 'J'); l.put(BLOCKROW, 195, 'U')
    l.put(FEET, 200, 'J'); l.nuts(17, range(204, 212, 2))
    l.put(FEET, 214, 'X')
    return l.dump({"id": "7-2", "name": "PRESS GAGGLE", "theme": "lawn", "timer": 200, "altitude": {"start": 0, "rate": 0}})

def l73():
    W = 230; l = L(W)
    l.floor(pits=[(64, 69), (120, 125), (185, 190)])
    l.put(FEET, 3, 'P')
    l.put(BLOCKROW, 15, 'H'); l.nuts(17, range(20, 30, 2))
    # paparazzi line the path behind the velvet rope; their flashes white out the screen just before the pools
    l.put(FEET, 25, 'F'); l.put(FEET, 40, 'J'); l.put(FEET, 56, 'F')
    l.marble(16, 65, 68, nuts=True)
    l.put(FEET, 82, 'F'); l.put(BLOCKROW, 90, '?'); l.put(FEET, 95, 'J')
    l.put(FEET, 112, 'F'); l.marble(16, 121, 124, nuts=True); l.put(FEET, 130, 'G')
    l.put(FEET, 142, 'F'); l.put(FEET, 155, 'J'); l.put(BLOCKROW, 160, 'U')
    l.put(FEET, 176, 'F'); l.marble(16, 186, 189, nuts=True)
    l.put(FEET, 200, 'F'); l.put(FEET, 210, 'J'); l.nuts(17, range(214, 222, 2))
    l.put(FEET, 224, 'X')
    return l.dump({"id": "7-3", "name": "PAPARAZZI ROW", "theme": "lawn", "timer": 220, "altitude": {"start": 0, "rate": 0}})

def l74():
    W = 40; l = L(W)
    l.floor()
    l.put(FEET, 4, 'P'); l.put(FEET, 30, 'V'); l.put(FEET, 38, 'X')
    return l.dump({"id": "7-4", "name": "THE OVAL OFFICE", "theme": "oval", "altitude": {"start": 0, "rate": 0}})

out = sys.argv[1]
for f in (l71, l72, l73, l74):
    d = f()
    json.dump(d, open(f"{out}/{d['id']}.json", 'w'), indent=2)
    print(d['id'], max(map(len, d['grid'])), 'cols')
