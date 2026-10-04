# World 3 (DXB Airport): asset contract

Same conventions as `docs/levels/w5-assets.md`:
- Art is 2×, drawn at scale 0.5 (frame sizes below are in world units; the built files are twice that in px).
- Files go to `src/assets/w3/<id>.webp`, masters to `art/masters/`, manifest entries to `art/manifest/w3.yaml`.
- Frames sit in one horizontal strip in the listed order; characters stand bottom-centre, facing **left** unless noted.
- Scale: Yaniv is 118 px tall at 2× (≈ 53 world units, `art/masters/yaniv.small.webp`).
- Mood: a gleaming Dubai terminal. 3-1..3-3 in golden daylight, 3-4 at sunset (Tal's concepts:
  `art/reference/w3-security.webp`, `art/reference/w3-gate.webp`). **No text anywhere** (signs and boards are
  drawn in-engine if needed).

| id | kind | frame | frames | notes |
|---|---|---|---|---|
| `w3.bg.terminal` | image | 640×360 | n/a | **seamless**: glass wall, airliners at jet bridges, control tower, desert-city skyline; a far concourse with travellers |
| `w3.bg.sunset` | image | 640×360 | n/a | **seamless**: the gate area at sunset (3-4), seats, planes, runway lights |
| `w3.bg.dutyfree` | image | 640×360 | n/a | **seamless**: glowing shelves of perfume, chocolates and dates, gold pillars, chandeliers (3-3) |
| `w3.tex.floor` | image | 64×32 | n/a | **seamless**: polished terminal floor slab edge |
| `w3.tex.counter` | image | 64×32 | n/a | **seamless**: steel conveyor/counter panels (raised platforms) |
| `w3.tex.belt` | image | 64×16 | n/a | **seamless**: conveyor belt with rollers (scrolls with the belt) |
| `w3.tex.travelator` | image | 64×16 | n/a | **seamless**: moving-walkway pallets (scrolls) |
| `w3.xray` | image | 112×72 | n/a | X-ray scanner housing, straddles a raised belt |
| `w3.detector` | image | 48×96 | n/a | walk-through metal detector (beeps at the plunger) |
| `prop.tray` | image | 32×16 | n/a | security tray with a shoe and sunglasses (rides the belts) |
| `w3.rope` | image | 64×32 | n/a | **seamless**, keyed: blue queue-barrier tape on chrome posts (foreground, along the floor's front edge) |
| `enemy.cart` | spritesheet | 64×56 | roll0, roll1, roll2, flat | **Runaway Cart**: a baggage trolley with angry eyes; faces right (flipped when rolling left) |
| `proj.bill` | spritesheet | 32×24 | fly0, fly1 | **Duty-Free Bill**: a giant angry perfume bottle flying left |
| `w3.launcher` | spritesheet | 32×48 | idle, fire | perfume cannon on a marble stand (fires Bills left) |
| `boss.mascot` | spritesheet | 64×80 | walk0, walk1, spray, hurt, defeated | **Mr. Spritz**, the duty-free mascot (3-3's fake boss); `defeated` = costume head off, a tired intern |
| `proj.perfume` | spritesheet | 32×24 | puff0, puff1 | his pink perfume cloud |
| `npc.officer` | spritesheet | 48×64 | idle, thumbsUp | friendly security officer |
| `npc.gateagent` | spritesheet | 48×64 | idle, wave | gate agent at B32 (3-4) |
| `w3.gate` | spritesheet | 64×128 | closed, open | boarding gate door (every World 3 exit) |
| `w3.checkpoint` | image | 32×96 | n/a | flight-information pillar with a green check |

Under the floor, the airport reuses `w5.bg.hold` (the baggage hall, tinted) and `prop.luggage`.
