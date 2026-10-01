# Tunnel guard awareness and physical reactions

The Stage 5 bunker sample now uses a short recognition phase, independent head/body turning and a visible weapon-ready transition. Unaware guards have a limited field of view. Nearby gunfire attracts attention to the location of the shot, with a shorter hearing radius through walls. Once a player breaks sight, guards stop their shot and search the last known location for several seconds. They cannot follow the player's new position through walls. Reacquisition still requires vision, alignment and a raised weapon before the firing wind-up.

Hits interrupt and stagger a guard with a directional shoulder/body flinch. Fatal reactions choose one of five choreographies at the moment of impact: an arms-up backward reel, a shoulder-led spin, a wide sprawl, a folded collapse or a knee-first drop. Each has distinct impact, balance-loss, accelerating descent and settling phases; arm targets, leg spread, hip/knee articulation and the final pose differ. Hit location, impact timing and guard identity vary the result. Leg wounds favor the knee-first reaction.

The fall direction still follows the impact and available space. Body travel and rotation are reduced near obstacles using sampled collision footprints. Skeleton contacts correct both penetration and unsupported hovering during the fall, including bent knees and outstretched hands. Rifles release at different points and fall independently. Clothing-impact puffs, directional blood/fabric particles and a small floor-dust burst accompany the reactions. Particle counts remain bounded. These are authored procedural animations, not a full ragdoll solver.

Keyboard-only play uses **WASD** for movement/strafe, **arrows** for horizontal and vertical aiming, **Space** to fire, **Shift** for fine aiming, **R** to reload and **Esc** to pause. Arrow aim starts slowly and accelerates while held; release stops it immediately. Looking up no longer moves forward. Instructions appear in the briefing and desktop HUD. Mouse and touch controls remain available.

Existing touch movement/turning and release fixes are preserved. Pause freezes reactions and dropped equipment; retry restores bones, animation weights and rifle ownership.

## Verification
- 144 tests pass, including directional vision, recognition delay, bounded turning, reaction to gunfire, lost-sight search, interrupted firing and completion of the entire sample through normal movement/shooting.
- Tests load the actual WWII soldier GLB and run all five choreographies across five fall directions and three facing angles, checking intermediate floor contact as well as final poses. They check skin bounds near the floor, horizontal settled bodies, detached/stationary rifles, paused equipment and a restored standing rig after retry.
- Typecheck and scoped lint pass. Production build uses the GitHub Pages base path.
- Browser checks inspected the reaction poses from player and side views in a temporary local animation study (removed before build), and confirmed keyboard firing/pause and the updated briefing in the actual game. Automated checks exercise simultaneous keyboard movement, aim, firing, fine aim, release, reset and pitch bounds. Device-specific touch behavior is unchanged; this is not a claim of a fresh physical iPhone test.
