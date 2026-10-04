# Super Yaniv Bros. — Game Spec

Oct 3, 2026 · @Tal · updated Oct 4, 2026 (World 6 The Dive dropped; World 7 is now The White House; Hava Nagila flight music)

## Pitch

**Super Yaniv Bros.** is a 16-bit side-scrolling platformer that plays like a love letter to the original plumber brothers, but the plumber is real. Yaniv Hayun, a plumber from Nes Ziona, runs down the aisle of a diving Boeing 737 on Flight 1073, wrestles the co-pilot off the controls and pulls the plane out of the dive, because he watches *Air Crash Investigation*.

**Logline:** A plumber, a 737, and a co-pilot named after a bathtub.

- **Feel:** Every beat of a classic plumber platformer is there (coins, blocks, power-ups, warp pipes, castles, “our princess is in another castle”), each remade with plumbing and airline logic.
- **The Bros.:** Four real passengers who rushed the cockpit: Yaniv (plumber), Assaf (insurance), Zvika (banker, tied him up with headphone cables) and Shota (dentist, treated the captain).
- **Twist on the genre:** The plane *is* the level. Pitch and bank tilt the whole world, and the timer is your altitude.
- **Tone:** Loud, silly and proud. The heroes are celebrated, the villain is a clown, and the wounded captain is treated with respect.

## The Mario contract

Every classic plumber-platformer beat gets a plumbing or airline twin, so players recognize the game instantly and laugh at the swap. All art, names and music are our own; the homage lives in the structure and the jokes.

| Classic beat | Super Yaniv Bros. | Why it works |
| --- | --- | --- |
| Two plumber brothers | **Yaniv + the Bros.** (Assaf, Zvika, Shota) | Four strangers who became brothers in 29 seconds |
| Coins (100 = 1-UP) | **Brass hex nuts** | What a plumber actually collects |
| ? Block | **Call-button block**: hit it from below, *ding*, item pops out | The flight-attendant chime is the coin sound |
| Breakable bricks | **Overhead-bin panels**: Big Yaniv smashes them, luggage rains out | Bins were already the scariest thing on a plane |
| Super Mushroom | **Hummus bowl**: Small Yaniv becomes Big Yaniv | Israeli fuel |
| Fire Flower | **Golden Plunger**: throw plungers that stick to enemies | His real tool, now a weapon |
| Super Star | **Bamba Rush**: invincible and fast for 8 seconds | Every Israeli kid's superpower |
| 1-UP Mushroom | **Sabich** | A whole extra life in a pita |
| Warp pipe | **Lav Warp**: step into a lavatory and flush to warp | The only pipe on a plane, and he's a plumber |
| Goomba | **Trolley Troll**: stomp it and it folds flat | The drink cart was always out to get you |
| Koopa shell | **Suitcase Shell**: kick a hard-shell suitcase down the sloped aisle | Tilt makes it ricochet |
| Piranha Plant | **Bin Biter**: an overhead bin that snaps open and shut | Mind your head |
| Bullet Bill | **Duty-Free Bill**: a giant perfume bottle fired from the galley | Nobody needed that much perfume |
| Lakitu | **Baby Bomber**: a crying baby on a parent's lap who lobs pacifiers | The true apex predator of economy class |
| Hammer Bros. | **Rubber Duckies**: the boss's minions, they waddle and squeak | He brought his bath toys |
| Time limit | **Altitude**: counts down in the dive; hit zero and it's game over | The clock you can see out the window |
| Flagpole | **Seatbelt-sign pole**: hit the sign as high as you can and it chimes off | Ding, you may now move about the cabin |
| Castle + fake Bowser | **x-4 fake bosses** (a hot-tub salesman, the duty-free mascot) | A preview of the real Jacuzzi man |
| “Our princess is in another castle” | “**Thank you Yaniv! But the cockpit is in another cabin!**” | Said after every fake boss |
| Bowser | **Jacuzzam Al-Jacuzzi**, King of the Hot Tub | Hammam (a bathhouse), upgraded to a jacuzzi |
| Princess | **The Captain** and **174 passengers** | You save everyone, not one person |

## Cast

Yaniv is player 1; the other three Bros. are player 2 in co-op (“Sit next to an Israeli”) and assist moves in single-player.

| Character | Look | Role | Ability |
| --- | --- | --- | --- |
| **Yaniv** (plumber, Nes Ziona) | Short dark hair, short beard, no hat, navy work polo with a wrench logo, tool belt, jeans, boots, red plunger | P1 hero | Plunger: stun, grab, and suction-climb walls and ceilings |
| **Assaf** (insurance) | Broad shoulders, white shirt, sleeves rolled | P2 / assist | **Full Coverage**: a shield that blocks one hit; in the boss fight he pins the arms |
| **Zvika** (banker) | Glasses, navy waistcoat, red tie, coil of white headphone cables | P2 / assist | **Cable Lasso**: ties up any enemy for 4 seconds; owns Phase C |
| **Shota** (dentist) | Green polo, dental mirror, white first-aid kit | P2 / assist | **First Aid**: refills hearts and the Captain's health bar |
| **The Captain** | Captain's uniform, head bandage, thumbs up | Escort NPC | Wounded, he still opens the cockpit door: World 5 ends when he does |
| **The off-duty pilots** | Two uniformed pilots | Finale NPCs | Take the seats in 6-3 and land the plane in Tabuk |
| **Jacuzzam Al-Jacuzzi** | Hulking first officer, navy uniform with gold stripes, oversized cap with a gold rubber-duck badge, mirrored black aviator goggles, white spa bathrobe as a cape, smug grin, soap bubbles | Final boss | Throws QRH binders (the pilots' emergency handbook), fires jacuzzi-jet bubble streams, leans on the yoke to tilt the arena |
| **Rubber Duckies** | Yellow bath ducks in tiny pilot caps | His minions | Waddle and squeak; stomp them or plunge them |
| **Algae Blobs** | Green slime blobs with googly eyes | World 7-1 enemies | Ooze out of the clogged Reflecting Pool drains; plunge the drain and they wash away |
| **Reporters** | Trench coat, notepad, boom mic | World 7 enemies | Swing boom mics and fire question bubbles (“Yaniv! One question!”); stomp the mic to duck under it |
| **Paparazzi** | Big lens camera, flash bulb | World 7 enemies | A camera flash whites out the screen for a moment; run between flashes |
| **The President** | Dark suit, red tie, American-flag pin | Finale NPC | The handshake and the photo in 7-4. No fight. Drawn as a respectful, stylized 16-bit figure |

**Villain rules:** Jacuzzam is a cartoon clown. He has no ethnic or national markers, the goggles keep his face generic, and there's no weapon or blood. The joke is the name: a *hammam* (bathhouse) upgraded to a jacuzzi, and every plumber has installed one.

## Core mechanics

Controls are the classic set (run, jump, action), with two airline systems layered on top: **tilt** and **altitude**.

**Movement.** Run (hold B), jump (A, higher when held), stomp enemies from above, crouch-slide on slopes. The plunger (B tap) stuns; held against a wall or ceiling it suctions on, so Yaniv can hang and swing.

**Power-up states**

1. **Small Yaniv**: one hit and you lose a life.
2. **Big Yaniv** (Hummus): survives a hit and smashes overhead-bin panels.
3. **Plunger Yaniv** (Golden Plunger): throws plungers that stick to enemies and walls; a stuck plunger becomes a one-shot platform.
4. **Bamba Rush** (timed, 8 s): invincible, faster, and cuts through queues.

**Tilt system (the signature).** In flight worlds the camera stays level while the cabin rotates with the plane's pitch and bank.

- Pitch (nose down) turns the aisle into a slope. Trolleys, suitcases and loose items slide toward the cockpit, so threats come *from behind*.
- Bank tilts the seat rows sideways, so jumps arc and gaps open on one side.
- Oxygen masks always hang straight down (true gravity), so they become swing-vines that line up differently at every angle.
- A HUD gauge shows pitch and bank, and a 2-second warning flashes before each tilt change.

**Altitude as the timer.** On the ground the HUD shows a normal TIME counter. In the air it shows ALT in feet. During the dive it counts down fast (14,000 ft in 29 s, as on the real flight), and at 0 it's game over.

**Level end.** Hit the seatbelt-sign pole: the higher you hit it, the bigger the bonus, and the sign chimes off. In the cabin worlds the exit is the next galley curtain.

**Lav Warps.** Any lavatory with a green “vacant” light is enterable. Flush to warp to a hidden bonus room (a pipe maze under the floor) or skip ahead a world.

**Co-op (“Sit next to an Israeli”).** P2 picks Assaf, Zvika or Shota. Both players share the screen. In boss Phase B one player flies while the other fights.

## World map

There are 7 worlds of 4 levels each (28 levels). The trip runs Nes Ziona → Dubai → the flight → Tabuk → Washington. Each x-4 in Worlds 1–4 is a “castle” with a fake boss, followed by “Thank you Yaniv! But the cockpit is in another cabin!”

*Update (Oct 4):* the former World 6 “The Dive” is dropped for now; a single freefall level may return as **5-5**, the last level of World 5. The former World 7 (the cockpit) is now **World 6**, and the final world is **World 7: The White House** instead of “Coming Home”.

| World | Setting | x-1 | x-2 | x-3 | x-4 (castle) |
| --- | --- | --- | --- | --- | --- |
| 1 | Nes Ziona | Morning Call (job site, pipe platforms) | Under the Sink (underground pipe maze) | Rooftop Boilers (solar-heater tanks as platforms) | The Boiler Room, vs. a giant Clog |
| 2 | Dubai | Souk Run | Tower Climb (vertical) | Dune Bash | Mall Spa, vs. the Hot-Tub Salesman (a jacuzzi teaser) |
| 3 | DXB Airport | Security Line (trays, belts) | Travelator Rush | Duty-Free (Duty-Free Bills) | Gate Closing, a race against the clock |
| 4 | Cruise, 37,000 ft | Boarding (bin wars) | Meal Service (Trolley Trolls) | Wing Dream (Yaniv naps, a sky level) | The Lav (a water level inside the plumbing) |
| 5 | The Attack | The Scream (a woman shouts and the plane shakes) | The Aisle (tilt 0° → 15°) | Bin Avalanche | Cockpit Door: the wounded Captain opens it |
| 5 (maybe) | — | *5-5 Freefall Cabin* (vertical, 14,000 ft in 29 s), the last level of World 5, if we add it | | | |
| 6 | The Cockpit | **Boss Phase A: Fight** | **Boss Phase B: Fight + Fly** | **Boss Phase C: Keep Him Tied** (the 50 minutes) | *(none for now: see below)* |
| 7 | The White House | The Reflecting Pool: it's clogged with algae; plunge the pumps and drains to clear it (Algae Blobs) | Press Gaggle (Reporters and their boom mics) | Paparazzi Row (camera flashes; run between them) | The Oval Office: a handshake and a photo with the President (no fight) |

*World 6 has three levels.* A 6-4 may come back later as a funny breather with no challenge: **Tabuk Terminal**, walking around the terminal while kind Saudis treat the passengers warmly and offer support and coffee.

**Ending (7-4):** the handshake, the camera flash, the photo framed on the screen, then: “Thank you Yaniv! But your next client is waiting in Nes Ziona!”

## Boss fight: Jacuzzam Al-Jacuzzi

The final fight is World 6, three phases in a row (6-1, 6-2, 6-3). Each phase adds one more thing to juggle: fight him; then fight him *and* fly the plane; then keep him tied while the plane gets to Tabuk.

|  | Phase A: Fight | Phase B: Fight + Fly | Phase C: Keep Him Tied |
| --- | --- | --- | --- |
| **Goal** | Get behind him and land the chokehold | Pull the plane level while he keeps breaking free | Hold him for the 50 minutes to Tabuk |
| **Arena** | Cockpit, pitch −8° and worsening, PULL UP alarms | Same cockpit, diving at −35° | Forward galley, calm, desert mountains outside |
| **His moves** | QRH binders thrown in arcs; jacuzzi-jet bubble streams; leans on the yoke to tilt the arena; Rubber Duckies waddle in | Breaks the hold every few seconds and slaps the yoke forward; Bath Bomb (a fizzing ball that bounces) | Wriggles to loosen knots; taunts in bubbles (“I just need to stretch my legs!”); one Houdini attempt per minute |
| **Your tools** | Stomp his cap; plunge his jet nozzles shut (the jet reverses onto him); 5 hits → he staggers → press GRAB from behind | Hold ▼ to pull the yoke (pitch rises); release to fight; Assaf assist pins his arms for 3 s | Mash to tighten the knot he's working on; Zvika throws fresh cables; tap to help Shota keep the Captain stable |
| **HUD** | Boss HP bar, ALT counting down, alarm vignette | Attitude indicator −35° → 0° with a green HOLD STEADY band, CONTROL % bar | Clock “TABUK IN 50:00” running at 30× (about 100 s real), KNOT STRENGTH meter, Captain heart |
| **Win** | Chokehold quick-time event lands | Pitch held in the green band for 5 s while his HP is at zero | Clock hits 0:00; the off-duty pilots touch down |
| **Fail** | ALT reaches 0 | ALT reaches 0 | A knot fully slips: he's back to Phase B at half HP |
| **Real detail** | A woman screamed and the plane shook; Yaniv ran in first | He pulled the yoke because he watches *Air Crash Investigation* | Headphone cables first, then **zip ties** dropped mid-phase as the upgrade |

&#91;embedded content: Boss flow · 3 phases, 2 ways to fail\]

Phases A and B fail on altitude. Phase C can only send you back to Phase B, so the 50 minutes always feel dangerous.

**Co-op twist:** in Phase B, P2 can hold the yoke while P1 fights, which is the clearest picture of why it took more than one passenger.

## HUD, audio and art

**HUD (top bar, always in the same order).** `YANIV` + hearts · score · brass-nut counter · `WORLD x-y` · `TIME` on the ground or `ALT 24,300 FT` in the air. Flight worlds add a small pitch/bank gauge at the top right. Boss fights add the boss name and HP bar centered, plus a phase label.

**Art direction.** 16-bit, SNES-era richness: painterly backgrounds, crisp square pixels, warm cinematic light (sunset in World 4, red alarm light in Worlds 5–6, bright morning in Washington in World 7).

- Cabin palette: teal seats, cream walls, amber cabin lights, purple-orange skies in the windows.
- Yaniv must read at a glance: navy polo, brown tool belt and red plunger are the three colors that are never reused on enemies.
- The whole world rotates with the plane, but HUD text never tilts.

**Audio.**

- The flight-attendant *ding* is the coin sound, and the seatbelt chime ends every level.
- Bubbles gurgle whenever Jacuzzam is on screen.
- An original chiptune score: a bouncy World 1 theme and a victory fanfare built on a public-domain Israeli folk melody.
- **World 5 music is based on *Hava Nagila*** (a traditional, public-domain melody), in our own fast, rhythmic chiptune hora arrangements: a bouncy cruise version and a faster alarm version with a siren in the fills (5-4).
- **World 6 has its own original music:** a driving boss theme (6-1, 6-2) and a tense, quieter theme while the boss is tied up (6-3).
- **The final win (6-3):** hand-clapping, and everyone sings “**Od Avinu Chai!**” (“Am Yisrael Chai, Od Avinu Chai”). That melody is Shlomo Carlebach's 1965 song and is still under copyright, so until we have permission the game plays the clapping and the chanted words over our own fanfare.
- **World 7 (Washington)** gets its own original, bright march.
- The Mayday VHS power-up plays a rewind squeal and a 3-second replay of the correct move.

## Example screens

Six concept screens, rendered as 16-bit pixel art in the style of your samples, using the World 5-1 screen as the style and character reference. Text inside AI art can come out garbled; final HUD text will be drawn in-engine.

| Screen | World | What it shows | Image |
| --- | --- | --- | --- |
| Title | — | Logo, the four Bros. standing on the jet, “Sit next to an Israeli” 2P mode, NES Ziona Entertainment System | [open](https://d8j0ntlcm91z4.cloudfront.net/user_3F2NgC52hLLJ1daxZcgIAVCrAOx/hf_20261003_200104_6da8d49a-4c87-4e72-ba01-283cf40612e7.png) |
| Morning Call | 1-1 | Nes Ziona job site: pipe platforms, call-button blocks, hummus power-up, Clog enemies, a WC lav warp | [open](https://d8j0ntlcm91z4.cloudfront.net/user_3F2NgC52hLLJ1daxZcgIAVCrAOx/hf_20261003_195735_bdf4215a-f90b-428f-a1d6-d00abac38579.png) |
| The Aisle | 5-2 | Tilted cabin, Trolley Troll from behind, Suitcase Shell, crying baby, mask vines, ALT + pitch HUD | [open](https://d8j0ntlcm91z4.cloudfront.net/user_3F2NgC52hLLJ1daxZcgIAVCrAOx/hf_20261003_195222_ecc4824a-eccf-4013-9a56-973351be1e73.png) |
| Boss Phase A: Fight | 6-1 | Jacuzzam throws QRH binders and bubble jets; Assaf and Zvika wait at the door | [open](https://d8j0ntlcm91z4.cloudfront.net/user_3F2NgC52hLLJ1daxZcgIAVCrAOx/hf_20261003_195827_f62b3bdb-5975-47fd-9e9d-a782b0a46363.png) |
| Boss Phase B: Fight + Fly | 6-2 | Yaniv pulls the yoke with one hand and plungers the boss's goggles with the other; pitch indicator HUD | [open](https://d8j0ntlcm91z4.cloudfront.net/user_3F2NgC52hLLJ1daxZcgIAVCrAOx/hf_20261003_195915_ebb384ed-e7b0-4bc2-91fa-d916a2fde682.png) |
| Boss Phase C: Keep Him Tied | 6-3 | Jacuzzam in headphone-cable spaghetti, Zvika tightening, Shota with the Captain, “Tabuk in 49:58”, zip-tie upgrade | [open](https://d8j0ntlcm91z4.cloudfront.net/user_3F2NgC52hLLJ1daxZcgIAVCrAOx/hf_20261003_200015_a5a16cfd-8eeb-4943-a123-5247a39d1654.png) |

**Next screens to render:** world map, “Thank you Yaniv!” castle screen, Tabuk landing, enemy bestiary, the Reflecting Pool (7-1), the Oval Office photo (7-4).

## Guardrails and open questions

**Guardrails**

- Original sprites, names, logo and music only: no Nintendo characters, logos, tunes or level art. The homage lives in the structure and the jokes.
- Heroes are celebrated, never mocked. The Captain is a hero too.
- No blood, no knife, no axe. Hits are slapstick (bubbles, binders, bonks).
- The villain gets a joke name and generic cartoon features, and no ethnic or national markers.
- The President (7-4) is a real public figure: shown respectfully and warmly (a handshake and a photo), never mocked, never fought.

**Open questions**

- [ ] Ask the four heroes for permission to use their names and likeness before any public release?
- [ ] The President's likeness: image models may refuse to draw a real person. Fallback: a stylized figure seen from the side or back, with the name only in in-engine text.
- [ ] Add 5-5 Freefall Cabin (the old World 6-1) as the last level of World 5?
- [ ] Add 6-4 Tabuk Terminal (a no-challenge breather with kind Saudi hosts and coffee)?
- [ ] Permission to use the “Od Avinu Chai” melody (Carlebach estate) for the 6-3 win?
- [ ] Platform: browser (HTML5) first, or mobile with touch controls?
- [x] Scope for a first playable: World 5 + World 6 (the aisle and the three boss phases). World 5 is live; World 6 is in progress.
