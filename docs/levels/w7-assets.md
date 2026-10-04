# World 7 (The White House): asset contract

Same conventions as `docs/levels/w5-assets.md`:
- Art is 2×, drawn at scale 0.5 (frame sizes below are in world units; the built files are twice that in px).
- Files go to `src/assets/w7/<id>.webp`, masters to `art/masters/`, manifest entries to `art/manifest/w7.yaml`.
- Frames sit in one horizontal strip in the listed order.
- Characters stand bottom-centre with feet on the bottom row, facing **right** unless noted.
- Scale: Yaniv is 118 px tall at 2× (≈ 53 world units, `art/masters/yaniv.small.webp`).
- Mood: **bright morning in Washington**: clear blue sky, warm sun, white marble, green lawns. Same 16-bit
  painterly pixel style as the cabin (`art/prompts/style.md`), but daylight instead of cabin light.
- **No text anywhere** (no signs, no logos, no letters on microphones, cameras, flags' stripes are fine).

The engine draws labelled placeholders until each file exists.

| id | kind | frame (world units) | frames (in order) | notes |
|---|---|---|---|---|
| `w7.bg.park` | image | 640×360 | n/a | **seamless horizontally**. The National Mall in the morning: blue sky with a few clouds, rows of big elm trees, a low distant city skyline. NO landmarks (they are separate props), no people. The bottom ~20% is lawn |
| `w7.prop.monument` | image | 96×256 | n/a | the Washington Monument obelisk with its plaza, on magenta, for a far parallax layer |
| `w7.prop.whitehouse` | image | 480×240 | n/a | the White House north facade (columned portico, white walls, lawn and fountain in front), on magenta |
| `w7.bg.oval` | image | 640×360 | n/a | the Oval Office interior, side view: curved cream walls, tall windows with golden drapes, two flags on poles, a big wooden desk on the right third, a navy oval rug with an abstract golden eagle emblem (no letters). No people |
| `w7.tex.path` | image | 64×32 | n/a | **seamless horizontally**: pale gravel/stone walkway with a granite curb edge on top (the ground the player runs on) |
| `w7.tex.stone` | image | 64×32 | n/a | **seamless horizontally**: white marble block course (platforms, steps) |
| `w7.tex.water` | image | 64×32 | n/a | **seamless horizontally**: clean blue reflecting-pool water with soft highlights |
| `w7.tex.algae` | image | 64×32 | n/a | **seamless horizontally**: thick murky green algae scum on water (laid over the clean water and faded out when the pool is cleared) |
| `prop.drain` | spritesheet | 32×32 | clogged, clear | a round stone drain grate at the pool's edge: `clogged` = choked with green algae gunk and bubbles, `clear` = clean grate with a water swirl |
| `enemy.algae` | spritesheet | 24×24 | walk0, walk1, squash | **Algae Blob**: green slime blob with googly eyes, oozing, facing left. `squash` = flattened splat |
| `enemy.reporter` | spritesheet | 48×64 | walk0, walk1, swing, sit | **Reporter**: generic TV reporter in a beige trench coat with a notepad and a long boom microphone, eager grin, facing **left**. `swing` = the boom mic thrust far forward at head height. `sit` = sitting on the ground dazed, mic drooping. No logos, no letters |
| `proj.question` | spritesheet | 16×16 | q0, q1 | a white speech bubble with a big bold question mark, slightly bobbing (q1 a little squashed) |
| `enemy.paparazzi` | spritesheet | 48×64 | idle, aim, flash | **Paparazzo**: photographer with a big lens camera and flash bulb, standing behind a velvet rope, facing the viewer (3/4 to the right). `aim` = camera raised, bulb glowing; `flash` = a bright white burst from the bulb |
| `w7.rope` | image | 64×32 | n/a | **seamless horizontally**: velvet rope line on brass stanchions (foreground decor) |
| `w7.gate` | spritesheet | 64×128 | closed, open | wrought-iron gate set in white stone pillars with lamps; the level exit. `open` = gates swung open |
| `w7.checkpoint` | image | 32×96 | n/a | a classic Washington lamppost with a small US flag on it (checkpoint marker) |
| `npc.president` | spritesheet | 48×72 | idle, handshake, photo | **The President** (7-4): a respectful, warm, stylized 16-bit depiction of President Donald Trump: dark navy suit, white shirt, long red tie, US flag lapel pin, swept golden-blond hair, standing tall, facing **left** (toward Yaniv). `handshake` = arm extended for a handshake, `photo` = smiling, thumbs up, facing the camera. Not a caricature, never mocking. **If the image model refuses a real person**, fall back to the same figure seen from the side with the face turned away (no likeness), and say so in the report |
| `yaniv.ending` | spritesheet | 48×64 | shake, pose | Yaniv on-model (same scale as `yaniv.small`). `shake` = right arm extended for a handshake, `pose` = proud photo pose, thumbs up, plunger raised in the other hand |
| `npc.captain.ending` | n/a | | | (reuse `npc.captain`: no new art) |

Style: everything per `art/prompts/style.md`. Check every frame by eye (props, extra limbs, text).
Navy + brown + red together stay reserved for Yaniv: no enemy uses all three.
