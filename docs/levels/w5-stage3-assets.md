# World 5, Stage 3: asset contract (additions)

Same conventions as `docs/levels/w5-assets.md`:
- Art is 2×, drawn at scale 0.5.
- Files go to `src/assets/w5/<id>.webp`.
- Frames sit in one horizontal strip in the listed order.
- Characters stand bottom-centre with feet on the bottom row, facing **right**.

The engine draws labelled placeholders until each file exists.

| id | kind | frame (world units) | frames (in order) | notes |
|---|---|---|---|---|
| `item.power` | spritesheet | 16×16 | hummus, goldenPlunger, bamba, sabich | power-ups. **Hummus**: bowl of hummus with olive oil and chickpeas. **Golden Plunger**: shiny gold plunger. **Bamba**: yellow peanut-snack bag, *no brand text*. **Sabich**: pita stuffed with eggplant and egg |
| `proj.plunger` | spritesheet | 16×16 | fly0, fly1, stuck | thrown golden plunger: two spin frames, then stuck cup-first |
| `enemy.suitcase` | spritesheet | 32×32 | walk0, walk1, shell, spin | **Suitcase Shell**: a grumpy hard-shell rolling suitcase on tiny legs. `shell` = closed, legs tucked in. `spin` = same, motion-blurred. Colours: purple/teal. Never navy+brown+red together |
| `enemy.baby` | spritesheet | 48×64 | idle, wind, throw | **Baby Bomber**: a frazzled parent in a teal seat, with a crying baby on their lap who lobs pacifiers. `wind` = baby rears back, `throw` = arm forward |
| `proj.pacifier` | spritesheet | 16×16 | spin0, spin1 | baby pacifier/dummy, pastel |
| `enemy.binbiter` | spritesheet | 48×32 | closed, half, open | **Bin Biter**: overhead luggage bin with a jagged "mouth" lid and angry eyes. Hangs from the bin row and snaps open and shut |
| `prop.luggage` | spritesheet | 32×32 | duffel, roller, box | luggage that rains from open bins (5-3) |
| `prop.mask` | spritesheet | 16×16 | mask, maskGrab | yellow drop-down oxygen mask. The tube is drawn in-engine. `maskGrab` = slightly squashed |
| `block.bin` | spritesheet | 32×32 | intact, cracked | breakable overhead-bin panel block; Big Yaniv smashes it from below |
| `npc.captain` | spritesheet | 48×64 | idle, thumbsUp, hurt | **The Captain**: captain's uniform with 4 gold stripes, cap, white head bandage, brave. Respectful, not comic |
| `npc.screamer` | spritesheet | 48×64 | calm, scream0, scream1 | passenger woman standing in the aisle: calm, then screaming (5-1 opening beat) |
| `w5.door` | spritesheet | 64×128 | closed, open | **cockpit door**: grey reinforced door with a small keypad. `open` shows the warm-lit flight deck beyond |
| `w5.galley` | image | 96×128 | n/a | galley bulkhead with the curtain half-open and trolley stowage. Used as a mid-level checkpoint marker |

Style: everything per `art/prompts/style.md`. No text in any image (the cockpit-door keypad has no legible digits).
