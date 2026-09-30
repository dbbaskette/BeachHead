# Stage 3 — Break the Landing

Status: proposed design, prepared 2026-09-30. This updates the earlier aircraft-stage sketch. Planning and GitHub issue creation are authorized; Stage 3 implementation has not started. The player selected guided attack passes with automatic forward flight, banking, altitude control, strafing and bombs.

## The experience

Fly a fictional WWII-inspired fighter-bomber over the enemy landing force. Skim the water, bank into a strafing pass, release a bomb ahead of a moving transport, then pull clear as the blast throws water across the hull. Smoke, damaged engines, burning vehicles and sinking craft tell the story without floating enemy labels or hit counters.

The campaign moves from naval gunnery, to holding the pillbox, to breaking the next amphibious assault from the air. The aircraft starts airborne near the same coastline. No takeoff, landing or travel sequence separates the player from the action.

Selected format: three guided attack passes with automatic forward flight and player-controlled lateral movement and altitude inside a generous corridor. The player chooses targets, lines up gunfire and bomb releases, and evades anti-aircraft fire. The initial target is a 2–3 minute mission, excluding briefing, pause and results.

## Why this format

| Format | Strength | Cost | Recommendation |
| --- | --- | --- | --- |
| Guided fighter-bomber passes | Immediate action, readable target choices, approachable mouse controls | Less route freedom | First release |
| Free-flight fighter-bomber | Players choose their own approaches and repeat attacks | Adds navigation, camera, stall/turn behavior and off-course recovery problems | Later expansion |
| Fixed bomber sight | Precise timing puzzle and dramatic bomb impacts | Less strafing, movement and evasion | Do not use as the main Stage 3 experience |

Use a cockpit/gunsight view with a restrained frame, a visible nose and enough wing detail to show gun flashes and bomb release when naturally in view. A fictional aircraft allows a coherent period appearance without claiming the behavior or loadout of a particular historical model. Start with a minimal cockpit prototype; detailed art follows the control and weapon checks.

## Mission flow

| Pass | Situation | Player decision | Consequence |
| --- | --- | --- | --- |
| 1 — Across the bay | A readable formation of landing craft approaches through open water. The first few seconds are safe. | Practice a gun burst, lead a moving boat, or bomb a clustered group. | Surviving craft continue toward shore; destroyed craft remain wrecks. |
| 2 — Along the beach | Carriers unload vehicles near supply positions. Visible flak crews begin firing. | Spend bombs on clustered cargo, strafe exposed vehicles, or silence flak. | Destroyed flak stays silent. Missed threats make the final run more dangerous. |
| 3 — Break the landing | A visually distinctive command transport reaches the bay, protected by surviving defenses. | Commit remaining bombs and gunfire, then evade on the way out. | Destroying the command transport and surviving the exit wins the mission. |

Allow approximately 35–45 seconds of attack time per pass, short approach/exit sections and two 6–8 second guided turnarounds. These are tuning targets, not measured durations. Keep the turns active visually, settle input on re-entry, and prevent firing into an unseen target area during the repositioning portion. Resolve bombs already in flight before finishing the relevant encounter segment. The coast and surviving enemies persist between passes; there are no per-pass respawns or repairs.

The command transport appears only on the last pass and is identified by its silhouette, markings and briefing image. It must remain visible and reachable for a generous attack window. The briefing gives the primary objective; mission status and any essential warning stay at the screen edge. No names, health bars, armor numbers or countdowns float over targets.

### Victory, failure and replay

- Win: destroy the command transport and survive the final exit. Confirm destruction through a clear wreck/sinking state and a brief edge-of-screen objective update.
- Lose: aircraft integrity reaches zero, or the final attack window closes with the command transport still operational after committed projectiles resolve. Never leave the mission waiting indefinitely for a missed target.
- Secondary goals: reduce the landing force, stop unloading carriers, destroy supplies and silence flak. These improve the debrief score/medal and change surviving threats; they are not additional hidden win conditions.
- All mission deadlines and damage use simulation time. Pause, hidden-tab suspension and results freeze them.
- Retry restarts Stage 3 directly with its original targets, ammunition and weather seed. Returning to the menu always works.
- Begin Stage 3 with a standard aircraft and loadout whether reached through the campaign or selected directly. Do not punish a player for barely surviving Stage 2.

## Flying and aiming

Forward speed is automatic. Mouse movement requests a flight direction within the corridor; the plane banks and pitches with bounded, predictable response. Small corrections must remain usable near the water and near distant targets. A/ D or left/right provides the same lateral control; W/S or up/down controls climb and descent. Shift reduces steering sensitivity for a precise pass. Right click is reserved as an optional bomb-release alias, not a conflicting precision control.

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Bank / climb / descend | Mouse steering; WASD or arrows as an alternative | Drag within the flight control area |
| Strafe | Hold left mouse or F | Hold the fire button |
| Release one bomb | Space; optional right click | Tap the bomb button |
| Fine control | Hold Shift | Reduced sensitivity near the center of the control area |
| Pause / resume | Escape or pause button | Pause button |
| Main menu | Visible menu control, also available while paused | Same |

The mouse and keyboard must be equally viable. Hide the operating-system pointer only over active flight; retain ordinary pointer behavior in menus. Display one gun aiming reticle derived from the actual bore/convergence point. Do not claim that the bullets hit the pointer instantly while the aircraft is still turning. Reset held input on pause, blur, hidden tab, pointer cancellation, menu entry and retry. Consume one bomb per deliberate press; key repeat and holding a button must not empty the racks. Do not require pointer lock, fullscreen or a particular browser extension.

Touch flight and firing require independent pointer ownership so releasing one finger cannot leave the gun firing or steal another control. Menus remain keyboard accessible. Reduced-motion mode stabilizes the horizon and removes camera recoil/shake while the underlying flight and collision behavior stays identical.

## Weapons and physical consistency

### Wing guns

Use twin wing-mounted gun groups with a shared, documented convergence distance. Tracers originate at the modeled muzzles and travel along the same launch directions used for collision. A moving aircraft contributes its velocity to newly fired rounds. Guns have unlimited ammunition with a short heat/cooling cycle; this is an arcade provision, presented in the aircraft's own instruments. Make useful strafing bursts longer than the briefest target exposure, so overheating does not dominate this stage.

### Bombs

Start with six light bombs for the entire mission, alternating racks when released. There is no automatic resupply between passes. Use a deterministic ballistic model: release at the actual rack position with the aircraft's world velocity, then apply gravity. First release uses a no-drag, no-wind ballistic approximation; visual wind moves mist and smoke but does not secretly steer weapons. Do not call this a complete flight simulator.

A small, unlabeled predicted-impact ring is recommended as an arcade bombing aid. It is separate in shape from the gun reticle and does not snap to enemies. It predicts a bomb released now, not the future position of the boat: the player must lead moving targets. Terrain height, water level, release position, velocity and gravity must be shared with the real bomb trajectory so the ring agrees with the resulting impact. Hide or dim it while bombs are unavailable or the impact lies outside the valid attack area. No floating range or damage text.

Bombs must hit the first intersected surface: a hull/deck, beach terrain or water. Use swept collision to avoid tunneling at flight speed. Water and terrain blasts use separate visual responses; an explosion applies damage once, with a bounded falloff. Avoid accidental multiple damage awards when one target has several collision shapes. Destroyed targets cannot continue firing or unloading, while projectiles they already released remain active.

### Targets and threat cues

- Landing craft: moving hulls, passenger/cargo silhouettes, wakes and readable burning or sinking states. Guns can disable them; clustered craft reward a well-led bomb.
- Vehicle carriers and trucks/jeeps: unloading is visible; stopping a carrier denies its unspawned cargo without duplicating rewards.
- Supply positions: optional compact clusters that reward careful bombing. Cosmetic secondary explosions do not cause an unbounded chain of new damage events.
- Flak: a small number of identifiable shoreline positions. Muzzle flashes, tracers, smoke puffs and spatial reports provide warning. Fire at a predicted aircraft position, then commit; no homing shells or unavoidable instant damage. Destroyed emplacements do not resume fire on the next pass.
- Command transport: unique silhouette and markings, substantial damage response and a clear destroyed state. Bombs are the efficient weapon; an already damaged transport can be finished by guns. The final pass must remain recoverable after ordinary mistakes, including at least two missed bombs in a benchmark playthrough.

The exact durability, blast radii, ammunition heat and threat density are tuning values to establish during the playable prototype. Health exists inside the simulation but is not exposed as enemy bars, hit counts or required-shots text.

## Visual and sound direction

Prioritize convincing motion and readable scale: low coastal haze, textured wet and dry sand, irregular dunes, wake trails, moving ramps, propeller blur, canopy reflections and restrained instrument wear. Improve assets for close aircraft views; the current decorative flyover model is a starting reference, not a finished cockpit asset.

Keep the primary transport and immediate flight path visible. Seeded patchy fog may conceal optional routes or drift across distant formations, but must not create an opaque unavoidable failure. Damage smoke should trail with motion and wind, persist between passes within a budget, and thin enough to preserve another attack opportunity.

Use a looped piston-engine/propeller bed, airflow that changes with speed/altitude, separate wing-gun bursts, rack-release clicks, passing flak and distinct water/land explosions. Limit concurrent voices and blend them so the engine does not bury warnings. Pause, mute, exit and retry clean up loops. Use licensed local assets with recorded provenance; new asset purchases require separate authorization. Listening and subjective visual quality remain human playtest outcomes, not claims from unit tests.

## Boundaries for the first release

Included: one aircraft, one coast, three passes, guns, bombs, moving and unloading targets, flak, persistent target damage, mission results, direct Stage 3 selection, campaign continuation, mouse/keyboard/touch controls and reduced motion.

Deferred: free-flight navigation, dogfights, takeoff/landing, aircraft selection, upgrades, missions with friendly/civilian targets, multiplayer, dynamic campaign carryover and a second camera mode. Do not silently add those while implementing the issues.

## Release acceptance

1. A complete three-pass mission is playable directly and after Stage 2; victory, final-window failure, aircraft loss, retry, pause and menu return all work.
2. Mouse precision is at least as usable as keyboard control. Holding fire, releasing bombs, changing input method and leaving the tab produce no stuck controls or duplicate releases.
3. Bullets and bombs start at the actual gun/rack transforms. Bomb prediction agrees with simulation impact within the documented tolerance, including banked releases, terrain, water and moving hulls.
4. Targets and flak have readable visual states without floating text, enemy health or hit counts. Damage and survival meaningfully affect later passes.
5. The standard mission can be won with at least two missed bombs in an agreed benchmark run. An unattended run loses; evasion and target selection materially change survival. Record remaining balance uncertainty honestly.
6. Proposed desktop budget: at 1920×1080, target 60 fps with 95th-percentile frame time below 25 ms on a recorded reference machine. Proposed reduced-quality target: 30 fps with 95th-percentile below 40 ms on a recorded mobile device. These are goals, not verified results; document hardware, browser, quality setting and actual measurements.
7. Bound projectiles, debris, smoke, lights and audio voices. Repeated retry/stage switching does not leave growing live GPU/audio resources; scene ownership and disposal are explicit.
8. Tests include the new air-combat files, authored lint covers them, the existing two stages retain their checks, and the final GitHub Pages build resolves all assets under `/BeachHead/`.

## Planning artifacts

- [Implementation plan](superpowers/plans/2026-09-30-stage-3-air-assault.md)
- [GitHub issue index](stage-3-issues.md)

The design remains a proposal until implementation is requested. The issue tracker records work to do, not a claim that Stage 3 is present in the game.
