# Enrichment pass (v0.8): asset contract

More life and depth in the existing levels (Worlds 3, 5, 7 and the world-complete cards), with the Super Mario
feel kept. Every entry maps to a classic-platformer beat (the Mario contract in `GAME_SPEC.md`) or to SMW-era
presentation: impact FX, the flagpole twin, themed bonus blocks, layered parallax, and sparse background decor.

Same conventions as `docs/levels/w5-assets.md`:
- Art is 2× and drawn at scale 0.5 (frame sizes are in world units).
- Manifest: `art/manifest/enrich.yaml`. Entries with `from:` are cut from another entry's master, with no extra
  paid call.
- Readability first: decor and backgrounds are washed or hazed toward the background. Nothing looks standable
  unless it is solid. Decor keeps 48 units clear of anything that matters to play (`systems/decor.ts`).
- Spend: **$8.10 estimated** (low exploration for all, one prompt fix, high finals for most, medium for the
  blocks, hedge and baggage hall).

| id | kind | frame (world units) | frames | where / notes |
|---|---|---|---|---|
| `fx.sheet` | reference | n/a | 4×5 grid | one paid sheet that feeds the five strips below |
| `fx.dust` | spritesheet | 32×16 | d0–d3 | landing dust (drops higher than a full jump) and skid puffs |
| `fx.poof` | spritesheet | 32×32 | p0–p3 | stomp star poof (`Player.bounce`, so every stomp, boss included) |
| `fx.sparkle` | spritesheet | 16×16 | s0–s3 | nut pickup, the nut popping out of a block, and the pole touch |
| `fx.splash` | spritesheet | 32×48 | w0–w3 | W7: dropping through a pool's surface |
| `fx.shard` | spritesheet | 8×8 | a–d | bin-panel shards (classic brick break, `shardPaths`) |
| `goal.pole` | spritesheet | 32×144 | planeLit, planeOff, gateLit, gateOff, flagDown, flagUp | the flagpole twin ('I' in the level grid) |
| `blocks.themed` | reference | n/a | 4 cells | feeds `block.w3` and `block.w7` |
| `block.w3` | spritesheet | 32×32 | active, used | DXB bonus block: a concierge bell on a gold bevelled block |
| `block.w7` | spritesheet | 32×32 | active, used | Washington bonus block: a gold star seal |
| `yaniv.extra` | spritesheet | 64×64 | skid, pole | drawn by a visual-only twin of the player sprite (wider frames, the body never changes) |
| `w7.bg.sky` | image | 640×360 | n/a | far layer (scroll 0.15): morning sky, puffy clouds, the Capitol dome |
| `w7.bg.park` | image | 640×360 | n/a | **redo**: the v1 tree line with its sky keyed out (v1 kept as `art/reference/w7-park-v1.webp`) |
| `w7.prop.whitehouse` | image | 480×240 | n/a | **redo**: no lawn strip, rounded hedge ends (the hard left edge is gone) |
| `w7.fg.hedge` | image | 64×32 | n/a | foreground boxwood and tulips along the walkway wall, never over a pool |
| `w7.decor` | spritesheet | 64×96 | bench, cherry, urn, bin, squirrel, pigeons, shrub, tulips | squirrels and pigeons scatter when Yaniv comes close |
| `w3.bg.concourse` | image | 640×360 | n/a | 3-2's backdrop: a shopping concourse with palms and the skyline (`bg` in the level JSON) |
| `w3.bg.baggage` | image | 320×160 | n/a | the airport's baggage hall under the floor (was the plane's cargo hold, tinted) |
| `w3.decor` | spritesheet | 64×96 | palm, seats, kiosk, cone, board, fountain, planter, bin | |
| `w5.bg.wall.dusk` | image | 640×360 | n/a | 5-3: the same wall with dusk in the windows |
| `w5.bg.wall.night` | image | 640×360 | n/a | 5-4: night, stars and a crescent moon (under the red alarm tint) |
| `card.w3`, `card.w5`, `card.w6` | image | 960×540 px | n/a | DOM backdrops behind the WORLD n COMPLETE card: the pushback at sunset, the cockpit door ajar, the landing at Tabuk |
| `map.bg` | image | 1280×720 px | n/a | v0.9: the overworld map behind the DOM nodes (four islands, no roads or text) |
