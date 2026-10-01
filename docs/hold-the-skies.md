# Hold the Skies

Playable Stage 2: German coastal antiaircraft defense between the Allied naval approach and German air assault. The beach moves to Stage 4 and the independent bunker sample to Stage 5. Existing file names for previous stage assets remain stable.

## Mission
Seventeen aircraft in three overlapping raids: twin-engine bombers and transports. Bombers carry gravity-driven bombs that inherit their aircraft's velocity; transports release four parachutists unless destroyed first. Parachutes open after a short free fall, sway, and drift inland. Landings and escaping aircraft reduce battery integrity. Survive the last raid with integrity remaining to advance. Pause, restart and direct menu selection are available throughout.

Four-barrel 20 mm cannon, 80-round aggregate magazine capacity, automatic 3.2-second reload. Ballistic shells travel at 820 m/s, fall under gravity, and use swept collisions against moving fuselage and wing volumes. The sight converges the four barrels at 600 m. No target hit counters or health bars float in the view. A simplified magazine cycle, compressed encounter distances, aircraft durability and immediate sound timing favor playable action over simulator accuracy.

## Visuals and references
All new aircraft, gun, parachute, panel-wear, seam and insignia graphics are authored in code. No external model download or new commercial asset.

- C-47-inspired transport: 29.1 m span, 19.5 m fuselage, rounded nose, single fin, cabin windows and separate radial nacelles. Reference: [USAF museum C-47](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196271/douglas-c-47d-skytrain/).
- B-25-inspired bomber: 20.6 m span, 16.1 m fuselage, twin fins, glazed nose and dorsal turret. Reference: [USAF museum B-25](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196310/north-american-b-25b-mitchell/).
- Flakvierling-inspired quad cannon: trunnions, magazine boxes, vented barrel jackets, bored muzzle brakes, hand wheels, bolts, breeches, traverse pedestal and spent brass. Visual approximation, not an exact engineering replica.
- Reuses credited sand/concrete/metal/water PBR textures from [visual assets](visual-assets.md) and [pillbox assets](pillbox-visual-assets.md). Procedural cloud layers, atmospheric fog, reflective sea, textured dunes, grass, bunker structures, floor joints and layered fabric sandbags.
- Smoke originates at the damaged aircraft part and follows its falling attitude. Burning wrecks descend and roll. Burst smoke expands and drifts. Parachute hits collapse the canopy. Muzzle flash, brass and restrained camera recoil/shake communicate firing and damage.

The art is a detailed procedural reconstruction; it does not claim scan-quality aircraft or full photorealism. Hardware antialiasing, physically based lighting, environment reflections, tone mapping and desktop shadows support realism. Mobile lowers pixel density and disables shadows. Static parts merge by material, six aircraft / twenty parachutist render slots and 180 smoke sprites bound the scene. Retry reuses resources; leaving disposes them.

## Controls and verification
The new stage reuses bunker contact ownership and capture-phase releases (pointerup/cancel/lost capture, touch identifier reconciliation, blur/page hide/orientation). Aim and fire have independent owners. Brief fire taps are buffered for one simulation tick; pause clears buffered and held inputs. Desktop mouse movement and WASD/arrows aim; Z toggles precision sight, Shift slows keyboard aim. Mobile thumb pad turns continuously, viewport swipes make direct corrections, and the separate Fire button supports concurrent use.

Automated verification covers swept collision, ballistic lead through a full winning mission, unattended loss, bombs and transport drops, magazine reload, pause/reset, bounded entities, quick taps and independent aim/fire cancellation. Existing control regression tests cover Safari touch-identifier reconciliation and interruptions. Browser checks cover rendering, console errors, landscape/portrait layouts, aiming, tap release, pause/retry/menu and direct selection. Physical iPhone multi-touch verification remains a hardware check.

### Completed checks
- 135 tests passing; typecheck and scoped lint passing.
- GitHub Pages production build passed with `/BeachHead` base path.
- Local browser: no console errors; desktop 1280×720, landscape 844×390 and portrait 390×844 inspected. Native phone-layout Fire tap consumed one round, released correctly, and aim-pad movement changed the view. True simultaneous touch contacts are covered by event/control regression tests, not claimed as a physical-device test.
