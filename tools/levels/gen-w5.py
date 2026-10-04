"""World 5 level generator: writes src/game/levels/w5/5-1..5-4.json.

Usage: python3 tools/levels/gen-w5.py src/game/levels/w5
Legend: see src/game/levels/loader.ts. Edit the layouts here, regenerate, then run `npm test` (levels.test.ts
checks gaps against the jump envelope, block reach, start/exit placement and tilt keys).
"""
import json, sys
H = 22
FLOOR = 20          # floor slab rows 20-21 (top y = 320)
SEATROW = 19        # seats / feet-entities stand on the floor
BLOCKROW = 14       # 2x2 blocks rows 14-15 (hit from the floor)
BINROW = 11         # overhead bins rows 11-12 (top y = 176)
class L:
    def __init__(s, W): s.W = W; s.g = [['.'] * W for _ in range(H)]
    def put(s, r, c, ch): s.g[r][c] = ch
    def h(s, r, c0, c1, ch):
        for c in range(c0, c1 + 1): s.g[r][c] = ch
    def floor(s, pits=()):
        for r in (FLOOR, FLOOR + 1): s.h(r, 0, s.W - 1, '#')
        for c0, c1 in pits:
            for r in (FLOOR, FLOOR + 1): s.h(r, c0, c1, '.')
    def bins(s, c0, c1, nuts=True):
        for r in (BINROW, BINROW + 1): s.h(r, c0, c1, 'B')
        if nuts:
            for c in range(c0 + 1, c1, 2): s.put(BINROW - 1, c, 'o')
    def seat(s, c, k='E'): s.put(SEATROW, c, k)
    def nuts(s, r, cols):
        for c in cols: s.put(r, c, 'o')
    def dump(s, meta):
        return {**meta, "grid": [''.join(r).rstrip('.') or '.' for r in s.g]}

def l51():
    W = 210; l = L(W)
    l.floor(pits=[(118, 121), (170, 173)])
    l.put(SEATROW, 3, 'P')
    # calm cruise: teach running, nuts, a call block and the first power-up
    l.nuts(17, range(8, 22, 2)); l.seat(10, 'Z'); l.seat(16, 'R')
    l.put(BLOCKROW, 24, '?'); l.put(BLOCKROW, 28, 'H')
    l.seat(36, 'K'); l.nuts(14, [37, 38]); l.seat(42, 'E')
    l.put(SEATROW, 48, 'C')                       # first Suitcase Shell: stomp it, kick it
    l.nuts(17, range(52, 60, 2))
    # the scream: a woman shouts, the plane shakes and starts to tilt
    l.put(SEATROW, 70, 'Q'); l.seat(76, 'Z'); l.seat(82, 'R')
    l.put(SEATROW, 86, 'T')                       # first trolley, rolling in from behind
    l.nuts(14, [77, 78, 83, 84]); l.put(BLOCKROW, 92, '?'); l.put(BLOCKROW, 96, '?')
    l.seat(102, 'K'); l.put(SEATROW, 108, 'C')
    l.nuts(16, range(118, 122))                    # nuts over the first hatch
    l.seat(126, 'E'); l.h(14, 130, 135, '-'); l.bins(136, 150)
    l.put(SEATROW, 140, 'C'); l.seat(146, 'R'); l.put(BLOCKROW, 156, 'U')
    l.put(SEATROW, 150, 'T'); l.seat(160, 'Z')
    l.nuts(16, range(170, 174))
    l.nuts(17, range(178, 196, 2)); l.seat(184, 'K')
    l.put(SEATROW, 200, 'X')
    return l.dump({"id": "5-1", "name": "THE SCREAM", "altitude": {"start": 37000, "rate": 60},
                   "tilt": [{"x": 0, "deg": 0}, {"x": 1180, "deg": 6}, {"x": 2300, "deg": 8}]})

def l52():
    W = 220; l = L(W)
    l.floor(pits=[(62, 65), (101, 106), (150, 153)])
    l.put(SEATROW, 3, 'P')
    l.nuts(17, range(8, 30, 3)); l.seat(10, 'E'); l.seat(16, 'Z'); l.put(BLOCKROW, 22, '?')
    l.put(SEATROW, 30, 'T'); l.seat(38, 'R'); l.seat(45, 'K'); l.put(SEATROW, 50, 'C')
    l.nuts(14, [39, 40, 46, 47]); l.nuts(16, range(62, 66))
    l.put(BLOCKROW, 56, 'H')
    l.put(SEATROW, 70, 'Y')                       # Baby Bomber
    l.h(14, 74, 79, '-'); l.bins(80, 96); l.put(SEATROW, 72, 'T'); l.seat(84, 'E'); l.put(SEATROW, 90, 'C')
    # mask vines over the long hatch
    l.put(6, 100, 'M'); l.put(6, 106, 'M'); l.nuts(9, [101, 103, 105])
    l.seat(112, 'Z'); l.put(SEATROW, 116, 'Y'); l.seat(122, 'K')
    l.put(BLOCKROW, 128, '?'); l.put(BLOCKROW, 132, 'A'); l.put(SEATROW, 120, 'T'); l.put(SEATROW, 136, 'C')
    l.put(SEATROW, 142, 'G')                      # galley checkpoint
    l.nuts(16, range(150, 154))
    l.seat(158, 'R'); l.h(14, 162, 166, '-'); l.bins(167, 180); l.put(SEATROW, 160, 'T')
    l.put(SEATROW, 172, 'C'); l.put(SEATROW, 186, 'Y'); l.put(BLOCKROW, 192, 'U')
    l.nuts(17, range(196, 210, 2)); l.put(SEATROW, 210, 'X')
    return l.dump({"id": "5-2", "name": "THE AISLE", "altitude": {"start": 24300, "rate": 110},
                   "tilt": [{"x": 0, "deg": 8}, {"x": 900, "deg": 12}, {"x": 2300, "deg": 15}]})

def l53():
    W = 230; l = L(W)
    l.floor(pits=[(84, 89), (156, 161)])
    l.put(SEATROW, 3, 'P')
    l.nuts(17, range(8, 20, 2)); l.put(BLOCKROW, 12, 'H')
    # the bin avalanche: bags rain from open bins, biters snap overhead
    l.bins(22, 40, nuts=False); l.put(13, 26, 'W'); l.put(13, 34, 'W'); l.nuts(17, range(24, 40, 3))
    l.put(10, 46, 'L'); l.put(10, 54, 'L'); l.seat(48, 'Z'); l.seat(56, 'R')
    l.put(BLOCKROW, 60, 'b'); l.put(BLOCKROW, 62, 'b'); l.put(BLOCKROW, 66, '?')   # Big Yaniv smashes bin panels
    l.put(SEATROW, 70, 'C'); l.put(SEATROW, 74, 'T')
    l.put(6, 84, 'M'); l.put(6, 90, 'M'); l.nuts(9, [85, 87, 89])
    l.put(SEATROW, 96, 'G')                       # galley checkpoint
    l.put(BLOCKROW, 102, 'A')                     # Bamba Rush before the gauntlet
    l.put(10, 108, 'L'); l.put(10, 114, 'L'); l.put(10, 120, 'L'); l.nuts(17, range(106, 124, 2))
    l.bins(126, 142, nuts=True); l.put(13, 130, 'W'); l.put(13, 138, 'W'); l.put(SEATROW, 128, 'C')
    l.seat(146, 'K'); l.put(SEATROW, 150, 'Y'); l.put(SEATROW, 140, 'T')
    l.put(6, 156, 'M'); l.put(6, 162, 'M'); l.nuts(9, [157, 159, 161])
    l.put(BLOCKROW, 168, 'U'); l.put(10, 176, 'L'); l.put(10, 184, 'L')
    l.bins(190, 204); l.put(13, 196, 'W'); l.put(SEATROW, 194, 'C'); l.put(SEATROW, 200, 'T')
    l.nuts(17, range(208, 220, 2)); l.put(SEATROW, 222, 'X')
    return l.dump({"id": "5-3", "name": "BIN AVALANCHE", "altitude": {"start": 18000, "rate": 85},
                   "tilt": [{"x": 0, "deg": 12}, {"x": 1600, "deg": 15}, {"x": 2900, "deg": 10}]})

def l54():
    W = 240; l = L(W)
    l.floor(pits=[(70, 74), (150, 155)])
    l.put(SEATROW, 3, 'P')
    l.put(BLOCKROW, 10, 'H'); l.nuts(17, range(14, 30, 2)); l.put(SEATROW, 20, 'T'); l.seat(26, 'Z')
    l.put(SEATROW, 34, 'C'); l.put(SEATROW, 40, 'Y'); l.bins(46, 60); l.put(13, 50, 'W'); l.put(13, 56, 'W')
    l.put(SEATROW, 52, 'C'); l.put(SEATROW, 62, 'T')
    l.put(6, 70, 'M'); l.put(6, 75, 'M'); l.nuts(9, [71, 73, 75])
    l.seat(82, 'R'); l.put(SEATROW, 88, 'Y'); l.put(BLOCKROW, 94, '?'); l.put(BLOCKROW, 98, 'H')
    l.put(10, 104, 'L'); l.put(10, 112, 'L'); l.put(SEATROW, 108, 'C'); l.put(SEATROW, 116, 'T')
    l.put(SEATROW, 124, 'G')                      # last galley before the flight deck
    l.put(BLOCKROW, 130, 'U'); l.bins(134, 146); l.put(13, 138, 'W'); l.put(13, 144, 'W'); l.put(SEATROW, 140, 'C')
    l.put(6, 150, 'M'); l.put(6, 156, 'M'); l.nuts(9, [151, 153, 155])
    l.put(SEATROW, 162, 'Y'); l.put(SEATROW, 168, 'T'); l.put(SEATROW, 172, 'C'); l.put(BLOCKROW, 178, 'A')
    l.put(10, 186, 'L'); l.put(10, 194, 'L'); l.put(SEATROW, 200, 'C'); l.put(SEATROW, 206, 'T')
    l.nuts(17, range(212, 226, 2))
    l.put(SEATROW, 226, 'N')                      # the wounded Captain, by the cockpit door
    l.put(SEATROW, 230, 'D')
    return l.dump({"id": "5-4", "name": "COCKPIT DOOR", "altitude": {"start": 12000, "rate": 55}, "mood": "alarm",
                   "tilt": [{"x": 0, "deg": 15}, {"x": 1800, "deg": 18}, {"x": 3000, "deg": 16}]})

out = sys.argv[1]
for f in (l51, l52, l53, l54):
    d = f()
    json.dump(d, open(f"{out}/{d['id']}.json", 'w'), indent=2)
    print(d['id'], max(map(len, d['grid'])), 'cols')
