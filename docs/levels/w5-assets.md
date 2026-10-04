# World 5 slice: asset contract

The engine and art pipeline both build against this table. The engine draws a labelled placeholder for any
id whose file does not exist yet, so code and art can progress in parallel.

**Units.** The world is 640×360 units (camera zoom 2 on a 1280×720 canvas). All art is authored at **2×**:
files are twice the world-unit size, and the engine draws them at scale 0.5. On screen that is 1 file pixel
to 1 screen pixel, crisp and detailed like the concept art.

Files go to `src/assets/w5/<id>.webp` (lossless WebP for sprites, lossy q85 for the opaque background).
For spritesheets, frames are laid out in **one horizontal strip**, left to right, in the listed order. Each
frame is exactly `frame` × 2 pixels. Characters stand bottom-centre in their frame, with feet on the bottom
pixel row, facing **right**.

| id | kind | frame (world units) | frames (in order) | notes |
|---|---|---|---|---|
| `yaniv.small` | spritesheet | 48×64 | idle0, idle1, run0, run1, run2, run3, run4, run5, jump, fall, hurt | Yaniv per the style canon; red plunger in hand |
| `enemy.trolley` | spritesheet | 64×56 | roll0, roll1, roll2, flat | Trolley Troll: navy drink cart with angry face, coffee cups; `flat` = squashed |
| `item.nut` | spritesheet | 16×16 | spin0, spin1, spin2, spin3 | brass hex nut (coin) |
| `block.call` | spritesheet | 32×32 | active, used | flight-attendant call-button block; active glows amber with a bell icon |
| `w5.seat` | spritesheet | 48×64 | empty, sleeper, reader, kid | side view teal seat; sleeper = woman with headphones, reader = bearded man with book, kid = boy in cap |
| `w5.curtain` | image | 64×128 | n/a | galley curtain / doorway with a glowing "exit" feel; the level goal |
| `w5.bg.wall` | image, seamless horizontally | 640×360 | n/a | far layer: cream cabin wall, row of oval windows with purple-orange sunset, overhead bins along the top, amber light strip. No seats, no people, no text |
| `w5.tex.floor` | image, seamless horizontally | 64×32 | n/a | aisle floor slab: dark carpet with an amber floor-light strip on the top edge |
| `w5.tex.bin` | image, seamless horizontally | 64×32 | n/a | overhead-bin underside used as a high platform (cream/grey panel, latch details) |
| `w5.bg.hold` | image, seamless horizontally | 320×160 | n/a | the cargo hold under the floor, packed with luggage behind cargo nets (also under the World 6 cockpit); loose `prop.luggage` bags slide off in front of it when the plane banks hard |
| `hud.icons` | spritesheet | 16×16 | heart, heartEmpty, nut, plane | HUD icons |

The level runs nose-down (pitch about 12°), and the camera rotates the whole world. Nothing in the art
itself should be tilted.
