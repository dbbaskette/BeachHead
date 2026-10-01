# Tunnel guard awareness and physical reactions

The Stage 5 bunker sample now uses a short recognition phase, independent head/body turning and a visible weapon-ready transition. Unaware guards have a limited field of view. Nearby gunfire attracts attention to the location of the shot, with a shorter hearing radius through walls. Once a player breaks sight, guards stop their shot and search the last known location for several seconds. They cannot follow the player's new position through walls. Reacquisition still requires vision, alignment and a raised weapon before the firing wind-up.

Live hits feed a damped angular response through the shoulders, spine, head and arms. A new round adds momentum without resetting the current pose, so a burst produces successive overlapping reactions.

Fatal motion uses a small fixed-step position-based ragdoll built from the actual soldier skeleton. Twenty-two body points retain segment lengths; braced torso/pelvis constraints preserve body volume, limb chord limits allow extension, and knee constraints prevent reverse bending. Gravity, localized bullet impulses, floor/wall/prop collision and selected body self-collisions drive the result. Initial reflexes vary, but the animation no longer rotates the entire model through a preset fall or holds its arms at authored targets. The body keeps its current animated pose when physics takes over. Rifles release immediately and settle separately.

The moving body supplies hit volumes back to the shooting simulation. Subsequent rounds strike its current physical position, kick the nearest part and wake a settled body without restarting its death. The obsolete upright hitbox is ignored. Body motion stops once settled to bound ongoing CPU work; pause freezes it and retry restores bone positions and rotations. Directional droplets leave irregular marks on floors, walls and props. Stronger occasional backward falls and blast impulses produce airborne motion, wall contacts and wider landings; impacts raise dust. Particle and stain counts remain bounded. This is a lightweight joint-particle solver with approximate collision volumes, not scanned motion capture or a general-purpose physics engine.

Keyboard-only play uses **WASD** for movement/strafe, **arrows** for horizontal and vertical aiming, **Space** to fire, **Shift** for fine aiming, **R** to reload and **Esc** to pause. Arrow aim starts slowly and accelerates while held; release stops it immediately. Looking up no longer moves forward. Instructions appear in the briefing and desktop HUD. Mouse and touch controls remain available.

Existing touch movement/turning and release fixes are preserved. Pause freezes reactions and dropped equipment; retry restores bones, animation weights and rifle ownership.

## Verification
- All 149 game tests, typecheck, scoped lint and the production build with the GitHub Pages base path pass.
- Actual WWII GLB tests cover multiple initial impulses/facings, floor support, detached equipment and retry restoration.
- Regression checks prove the model root remains fixed while the individual knees/arms rotate, sleep/wake behavior, repeated bullet hits, and equivalent results at 30/60/120 fps next to a wall.
- A temporary local study (removed before build) checks a burst and frame-by-frame collapse from player and side views, including the torso landing before the limbs settle.
- Keyboard/mobile control tests remain in the suite. No physical iPhone test is claimed.

## Expanded sample and grenades

Two additional rooms add a radio rack and a diesel generator with switchgear, pipes and warm practical lamps. Six guards now defend five spaces. Two steel sliding doors open with E or the nearby touch button. Their moving collision boxes block player/guard motion, sight, bullets, grenade trajectories and ragdolls. Doors open once and stay open; the exit is at the far end of the generator room.

Three grenades per attempt are thrown with G or a separate touch button. One press releases one grenade, with a short cooldown. Gravity, floor/ceiling/wall bounces and a 2.3-second fuse run in the gameplay simulation. Blast damage falls off over 5.5 metres and solid cover blocks it. Nearby blasts can injure the player. Blasts add a stronger outward/lifting impulse to guards and fallen bodies, a brief warm flash, debris, residual dust and reduced-motion-aware camera shake. Pause freezes fuses and door travel; retry resets inventory, doors and effects.

Verification adds full five-space progression, closed/open door obstruction, grenade bounce and single detonation, blast cover and self-damage, and an actual-model blast against a closed door. Desktop and narrow touch layouts are checked in the browser; no physical iPhone hardware verification is claimed.
