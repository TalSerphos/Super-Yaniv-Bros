"""World 3 (DXB Airport) level generator: writes src/game/levels/w3/3-1..3-4.json.

Usage: python3 tools/levels/gen-w3.py src/game/levels/w3
Same grid conventions as gen-w7.py (legend in src/game/levels/loader.ts). World 3 is on the ground: no tilt,
a TIME counter. New pieces: '>' '<' conveyor belts / travelators (they carry Yaniv), 'S' Duty-Free Bill
cannons, 'c' runaway baggage carts, 'm' Mr. Spritz (3-3's fake boss), and decor ('x' X-ray, 'd' metal
detector, 'u' security officer, 'g' gate agent). Gaps in the floor are baggage chutes. Run `npm test` after.
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
        for c0, c1 in pits:                      # inclusive; keep chutes <= 5 tiles (the jump envelope, belts aside)
            assert c1 - c0 + 1 <= 5, (c0, c1)
            for r in (FLOOR, FLOOR + 1): s.h(r, c0, c1, '.')
    def travelator(s, c0, c1, d):
        # A moving walkway set into the floor ('>' right, '<' left), as deep as the slab: only its top surface
        # moves (the loader registers the top row; the scene draws the slab texture under it).
        for r in (FLOOR, FLOOR + 1): s.h(r, c0, c1, d)
    def conveyor(s, c0, c1, d, xray=None):
        # A raised security conveyor: a counter two tiles high (rows 18-19, top 288) with a belt on top (row 17,
        # top 272: a 48 rise, an easy hop). Trays ride it; an X-ray machine may straddle it.
        s.h(17, c0, c1, d)
        for r in (18, 19): s.h(r, c0, c1, 'B')
        if xray is not None: s.put(16, xray, 'x')
    def counter(s, c0, c1, rows=2):
        for r in range(FEET - rows + 1, FEET + 1): s.h(r, c0, c1, 'B')
    def shelf(s, r, c0, c1, nuts=False):
        s.h(r, c0, c1, '-')
        if nuts: s.h(r - 1, c0, c1, 'o')
    def nuts(s, r, cols):
        for c in cols: s.put(r, c, 'o')
    def dump(s, meta):
        return {**meta, "tilt": [{"x": 0, "deg": 0}], "altitude": {"start": 0, "rate": 0},
                "grid": [''.join(r).rstrip('.') or '.' for r in s.g]}

def l31():
    W = 230; l = L(W)
    l.floor(pits=[(104, 108), (186, 189)])
    l.put(FEET, 3, 'P'); l.put(FEET, 9, 'u')                 # an officer waves you into the line
    l.nuts(17, range(12, 20, 2)); l.put(BLOCKROW, 18, '?')
    l.put(FEET, 24, 'C')
    l.conveyor(30, 44, '>', xray=39); l.nuts(15, range(31, 37, 2))
    l.put(FEET, 50, 'd'); l.put(FEET, 54, 'u')               # BEEP! it's just a plunger
    l.put(BLOCKROW, 60, 'H')
    l.conveyor(70, 90, '<', xray=80); l.nuts(15, range(72, 78, 2))
    l.put(FEET, 98, 'c')
    l.shelf(16, 104, 108, nuts=True)                         # over the first baggage chute
    l.put(FEET, 114, 'G')
    l.conveyor(120, 136, '>', xray=130)
    l.put(FEET, 144, 'C'); l.put(BLOCKROW, 150, 'A'); l.put(FEET, 158, 'C')
    l.counter(166, 167, rows=2); l.counter(170, 171, rows=3); l.nuts(15, range(170, 172))
    l.put(FEET, 178, 'c')
    l.shelf(16, 186, 189, nuts=True)
    l.put(FEET, 196, 'd'); l.put(FEET, 200, 'u'); l.put(BLOCKROW, 206, 'U')
    l.nuts(17, range(210, 218, 2))
    l.put(FEET, 219, 'I')                                    # the goal pole: touch it high
    l.put(FEET, 222, 'X')
    return l.dump({"id": "3-1", "name": "SECURITY LINE", "theme": "terminal", "timer": 120, "beltSpeed": 50,
                   "intro": "Through security! Belts carry you; the metal detectors know a plumber when they see one.",
                   "clear": {"title": "SECURITY CLEAR!", "sub": "The plunger was cleared as a hand-held tool."}})

def l32():
    W = 230; l = L(W)
    l.floor(pits=[(51, 54), (119, 122), (171, 174)])
    l.put(FEET, 3, 'P'); l.nuts(17, range(8, 16, 2))
    l.travelator(21, 50, '>'); l.nuts(16, range(30, 46, 3))
    l.shelf(15, 51, 54, nuts=True)
    l.travelator(55, 80, '>'); l.put(FEET, 70, 'C')
    l.put(BLOCKROW, 84, '?'); l.put(BLOCKROW, 88, 'H')
    l.travelator(91, 118, '<'); l.put(FEET, 112, 'c')        # against you: run hard, or jump the cart
    l.shelf(16, 119, 122, nuts=True)
    l.put(FEET, 128, 'G')
    l.travelator(136, 170, '>'); l.put(FEET, 150, 'C'); l.put(FEET, 164, 'C')
    l.shelf(15, 171, 174, nuts=True)
    l.put(BLOCKROW, 180, 'A')
    l.travelator(186, 210, '<'); l.put(FEET, 206, 'c')
    l.nuts(17, range(212, 220, 2))
    l.put(FEET, 219, 'I')
    l.put(FEET, 222, 'X')
    return l.dump({"id": "3-2", "name": "TRAVELATOR RUSH", "theme": "terminal", "bg": "w3.bg.concourse", "timer": 100, "beltSpeed": 70,
                   "intro": "Ride the moving walkways, and mind the gap!",
                   "clear": {"title": "STAGE CLEAR!", "sub": "Gate B32 is that way. Duty-free first, of course."}})

def l33():
    W = 230; l = L(W)
    l.floor(pits=[(96, 99)])
    l.put(FEET, 3, 'P'); l.nuts(17, range(8, 16, 2))
    l.put(FEET, 32, 'S')                                     # perfume cannons fire Duty-Free Bills to the left
    l.counter(40, 43); l.nuts(16, range(40, 44))
    l.put(BLOCKROW, 50, '?'); l.put(FEET, 58, 'C')
    l.counter(66, 69); l.put(FEET, 74, 'S')                  # a cannon behind a display counter (shots at chest height)
    l.put(BLOCKROW, 78, 'H'); l.put(FEET, 88, 'C')
    l.shelf(16, 96, 99, nuts=True)
    l.put(FEET, 108, 'S'); l.put(FEET, 118, 'G')
    l.counter(126, 129); l.put(BLOCKROW, 134, 'A')
    l.put(FEET, 144, 'S'); l.put(FEET, 152, 'C')
    l.counter(158, 161); l.put(FEET, 166, 'S'); l.nuts(16, range(158, 162))
    l.put(FEET, 174, 'G')                                    # a checkpoint just before Mr. Spritz's stage
    # Mr. Spritz's stage: two low display shelves to jump from (one-way: he waddles under them) and the gate
    # behind him; he follows Yaniv right up to the gate.
    l.shelf(17, 184, 187, nuts=True); l.shelf(17, 206, 209)
    l.put(FEET, 200, 'm')
    l.put(FEET, 222, 'X')
    return l.dump({"id": "3-3", "name": "DUTY-FREE", "theme": "dutyfree", "timer": 120,
                   "intro": "Duty-Free Bills fly at chest height: jump, stomp or plunge them. Beware the mascot!",
                   "clear": {"title": "THANK YOU YANIV!", "sub": "But the cockpit is in another cabin!"}})

def l34():
    W = 230; l = L(W)
    l.floor(pits=[(60, 63), (128, 131), (176, 179)])
    l.put(FEET, 3, 'P')
    l.travelator(8, 59, '>'); l.put(FEET, 34, 'C'); l.nuts(16, range(20, 56, 4))
    l.shelf(15, 60, 63, nuts=True)
    l.travelator(64, 100, '>'); l.put(FEET, 92, 'c'); l.put(BLOCKROW, 80, 'H')
    l.put(FEET, 108, 'G'); l.put(FEET, 116, 'C')
    l.travelator(112, 127, '<')
    l.shelf(16, 128, 131, nuts=True)
    l.travelator(132, 175, '>'); l.put(FEET, 150, 'c'); l.put(FEET, 166, 'C')
    l.shelf(15, 176, 179, nuts=True)
    l.travelator(180, 212, '>'); l.put(BLOCKROW, 192, 'U')
    l.put(FEET, 214, 'I')                                    # the boarding-sign pole, then the agent
    l.put(FEET, 217, 'g')                                    # the gate agent waves you on
    l.put(FEET, 222, 'X')
    return l.dump({"id": "3-4", "name": "GATE CLOSING", "theme": "gate", "timer": 50, "beltSpeed": 80,
                   "intro": "Final call for Flight 1073! Gate B32 is closing. RUN!"})

out = sys.argv[1]
for f in (l31, l32, l33, l34):
    d = f()
    with open(f"{out}/{d['id']}.json", 'w') as fh:
        json.dump(d, fh, indent=1)
    print(d['id'], len(d['grid'][FLOOR]), 'cols')
