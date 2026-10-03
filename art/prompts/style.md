# Super Yaniv Bros. — Art Style Canon

Every asset prompt is prefixed with the block between the PREFIX markers
(`tools/assets/generate.ts` reads it). Edit it here, never inline in manifests.

<!-- PREFIX -->
16-bit SNES-era pixel art, crisp square pixels, no anti-aliased blur, clean dark outlines,
rich painterly shading in a limited palette, warm cinematic sunset lighting.
Original characters only: no Nintendo characters, logos or level art.
<!-- /PREFIX -->

## Palette anchors
- Cabin: teal seats, cream walls, amber cabin lights, purple-orange sunset skies in the windows.
- Alarm worlds (5–7): red alarm light washes.
- **Reserved for Yaniv only:** navy polo, brown tool belt, red plunger. Never reuse these three on enemies.

## Character bible (match the title reference `art/reference/title.webp`)
- **Yaniv**: short dark hair, short beard, no hat, navy work polo with a white wrench logo, brown tool belt, blue jeans, brown boots, red plunger.
- **Assaf**: broad shoulders, white shirt with rolled sleeves, dark trousers.
- **Zvika**: glasses, navy waistcoat, red tie, white shirt, coil of white headphone cables.
- **Shota**: green polo, jeans, white first-aid kit with red cross.
- **Jacuzzam Al-Jacuzzi**: cartoon clown villain. Navy uniform with gold stripes, oversized cap with gold rubber-duck badge, mirrored black aviator goggles, white spa bathrobe cape. No ethnic or national markers, no weapons.

## Guardrails
- No blood, no knives, slapstick only. Heroes are celebrated, the Captain is treated with respect.
- AI-rendered text is unreliable: all HUD/menu text is drawn in-engine. Prompts should ask for **no text** unless the text *is* the asset (logo), and those get a vision check.
