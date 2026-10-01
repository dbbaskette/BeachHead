# Tunnel guard awareness and physical reactions

The Stage 5 bunker sample now uses a short recognition phase, independent head/body turning and a visible weapon-ready transition. Unaware guards have a limited field of view. Nearby gunfire attracts attention to the location of the shot, with a shorter hearing radius through walls. Once a player breaks sight, guards stop their shot and search the last known location for several seconds. They cannot follow the player's new position through walls. Reacquisition still requires vision, alignment and a raised weapon before the firing wind-up.

Hits briefly interrupt and stagger the guard. Wound location changes the reaction; leg wounds buckle the knees. A fatal hit chooses a backward, forward, left, right or knee-led collapse based on hit direction relative to the guard, wound location and available space. The body pivots around the pelvis rather than rotating like a board around the feet. Limbs relax asymmetrically, the head settles, and skeleton contact points keep the body near the floor. Rifles detach into world space, fall under gravity, roll onto their side and settle. Bodies and dropped equipment remain still afterwards. This is articulated procedural animation with floor contacts, not a full ragdoll physics simulation.

Existing touch movement/turning and release fixes are preserved. Pause freezes reactions and dropped equipment; retry restores bones, animation weights and rifle ownership.

## Verification
- 140 tests pass, including directional vision, recognition delay, bounded turning, reaction to gunfire, lost-sight search, interrupted firing and completion of the entire sample through normal movement/shooting.
- Tests load the actual WWII soldier GLB and run every fall style at three facing angles. They check skin bounds near the floor, horizontal settled bodies, detached/stationary rifles, paused equipment and a restored standing rig after retry.
- Typecheck and scoped lint pass. Production build uses the GitHub Pages base path.
- Browser playtest verified the first guard's recognition, aiming, hit and fatal collapse, with a visible settled body and no console errors. Device-specific touch behavior is unchanged; this is not a claim of a fresh physical iPhone test.
