# World 6 (the cockpit boss): asset contract

Same conventions as `docs/levels/w5-assets.md`:
- Art is 2×, drawn at scale 0.5 (frame sizes below are in world units; the built files are twice that in px).
- Files go to `src/assets/w6/<id>.webp`, masters to `art/masters/`, manifest entries to `art/manifest/w6.yaml`.
- Frames sit in one horizontal strip in the listed order.
- Characters stand bottom-centre with feet on the bottom row, facing **right** unless noted.
- Scale: Yaniv is 118 px tall at 2× (≈ 53 world units). Jacuzzam is a hulking ~1.6× Yaniv.

The engine draws labelled placeholders until each file exists.

Reference: `art/reference/w6-cockpit.webp` (the cockpit, Jacuzzam, the HUD), plus the spec's cast table
(`docs/GAME_SPEC.md`). The character bible for Yaniv is `art/masters/char.yaniv.sheet.webp`.

| id | kind | frame (world units) | frames (in order) | notes |
|---|---|---|---|---|
| `char.jacuzzam.sheet` | bible (master only) | n/a | front, side, back, 3/4 | **Jacuzzam Al-Jacuzzi**: hulking first officer, dark navy uniform with gold sleeve stripes, oversized pilot cap with a **gold rubber-duck badge**, **mirrored black aviator goggles** hiding the eyes, smug grin, **white fluffy spa bathrobe worn as a cape**, white gloves, chrome **jacuzzi-jet nozzles on both wrist cuffs**. Cartoon clown, no ethnic or national markers, no weapon. Not built into `src/assets` |
| `boss.jacuzzam` | spritesheet | 96×112 | idle0, idle1, throw, jetWind, jetFire, lean, slap, hit, stagger, held, tied, wriggle0, wriggle1 | facing **left** (he stands on the right, toward the yoke). `throw` = arm overhead tossing a binder. `jetWind` = both wrists forward, nozzles glowing. `jetFire` = recoil, bubbles start at the wrists (stream drawn in-engine). `lean` = leaning on something low in front (the yoke). `slap` = one arm swiping down-forward. `hit` = goggles askew, bubbles popping. `stagger` = dizzy, cap tilted, stars/bubbles. `held` = arms pinned, struggling (as if held from behind; the holder is not drawn). `tied` = sitting on the floor wrapped in tangled white headphone cables. `wriggle0/1` = tied and squirming |
| `enemy.ducky` | spritesheet | 24×24 | walk0, walk1, squash | **Rubber Ducky**: yellow bath duck in a tiny pilot cap, waddling, facing left. `squash` = flattened |
| `proj.binder` | spritesheet | 24×24 | spin0, spin1 | thick red ring binder (the QRH), **no text**, tumbling |
| `proj.bubble` | spritesheet | 16×16 | b0, b1 | cluster of soap bubbles (jacuzzi-jet stream segment) |
| `proj.bathbomb` | spritesheet | 16×16 | fizz0, fizz1 | pastel fizzing bath-bomb ball |
| `yaniv.action` | spritesheet | 48×64 | pull, choke, tighten | Yaniv on-model (same scale as `yaniv.small`). `pull` = leaning back pulling something at chest height with both hands. `choke` = arms locked forward around an (unseen) big torso. `tighten` = yanking a cable with both hands. No plunger in these frames |
| `npc.assaf` | spritesheet | 48×64 | idle, pin | **Assaf** (insurance): broad shoulders, white shirt, sleeves rolled. `pin` = lunging forward with both arms |
| `npc.zvika` | spritesheet | 48×64 | idle, throw | **Zvika** (banker): glasses, navy waistcoat, red tie, coil of white headphone cables. `throw` = tossing a cable coil |
| `npc.shota` | spritesheet | 48×64 | idle, help | **Shota** (dentist): green polo, dental mirror, white first-aid kit. `help` = kneeling, tending someone |
| `w6.yoke` | spritesheet | 32×48 | neutral, pulled, pushed | side view of a cockpit control column with a ram's-horn yoke; `pulled` leans back toward the viewer's left, `pushed` forward (right) |
| `w6.seat.pilot` | image | 48×64 | n/a | pilot seat, side view: dark teal-grey with a sheepskin cover, armrests |
| `item.zipties` | image | 16×16 | n/a | bundle of black zip ties |
| `prop.cable` | image | 16×16 | n/a | coil of white headphone cables |
| `w6.bg.cockpit` | image | 640×360 | n/a | cockpit interior background, as in the reference: overhead panel at the top, windscreen across the middle showing blue sky with a desert/sea coastline below, instrument panel along the bottom third. No characters, no seats, no yoke (those are sprites). Painted so it can be shown slightly rotated. **No text** on any screen |
| `w6.bg.galley` | image | 640×360 | n/a | the forward galley in calm daylight: stainless galley carts and ovens, a small window with desert mountains outside, cream walls, warm light. No characters, **no text** |

Style: everything per `art/prompts/style.md`. Check every frame by eye (props, extra limbs, text).
Navy + brown + red together stay reserved for Yaniv: Jacuzzam's uniform is a darker blue-black navy with gold
and a white robe, so his silhouette never reads as Yaniv.
