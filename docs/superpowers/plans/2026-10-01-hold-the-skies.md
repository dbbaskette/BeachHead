# Hold the Skies — implementation plan

## Outcome and scope
Add a complete, directly selectable coastal antiaircraft mission as Stage 2, before the existing air assault and beach defense. The bunker remains a separate sample (now Stage 5). Carry forward independent touch ownership and reliable release handling. Existing bunker walk/turn and hit-reaction fixes are already on main.

The player operates a German four-barrel 20 mm coastal battery. Three escalating raids mix twin-engine bombers, transport aircraft and descending paratroopers. Aircraft follow visible routes; transports release troops; bombers release gravity-driven bombs toward the defended position. Destroying aircraft prevents their payloads. Survive all raids with the battery intact to continue the campaign. Aircraft escapes and landed troops cost defense integrity. No floating hit counts or enemy health bars.

## Realism and playability
Recognizable B-25/C-47-inspired airframes with tapered fuselages, airfoil wings, cockpit glazing, separate engines, propellers, tail configurations, panel seams and Allied markings. Detailed Flakvierling-inspired machinery, spent brass, barrel recoil, PBR wear, textured concrete/sand, reflective water, coastal vegetation, layered clouds/haze. Hits originate at impact locations; burning aircraft lose altitude and roll, canopies deform and sway, smoke expands and drifts. Historical silhouettes and plausible ballistics, not a training simulator or a claim of fully photorealistic assets.

Mouse motion aims; hold mouse/Space to fire; keyboard arrows/WASD turn; precision sight zoom. Mobile independent aim pad, viewport swipe and fire button, with capture-phase pointer/touch release and interruption reset. Compact edge HUD preserves sky visibility. Automatic magazine changes create a readable firing rhythm.

## Slices / ownership
1. Pure simulation: timed raids, aircraft paths, gravity projectiles, swept moving-target collision, bombs, paratroopers, victory/loss, bounded entities. Add meaningful deterministic tests.
2. Scene/art: owned shared resources, aircraft and gun geometry, PBR coastal scene, capped impact/smoke pools, camera and gun alignment, mobile quality budget.
3. React/input/audio: lazy-load stage, briefing/pause/retry/menu/continue, desktop and mobile controls, shared reliable release behavior.
4. Campaign/menu numbering, documentation, CI coverage.
5. Full relevant tests/typecheck/lint/build once final slice is coherent; actual browser render and desktop/mobile-layout playtest. Publish through existing authorized PR/merge/Pages workflow and verify live.

## Risks / verification
Procedural aircraft must read convincingly at combat distance without overwhelming phone GPUs. Merge static geometry and cap particles/projectiles/targets. Test lead aiming, damage at the actual impact, transport prevention, unattended loss, successful defense, pause and retry. Reuse existing multi-touch ownership/release regression tests and verify new stage bindings. Physical iPhone simultaneous-touch behavior cannot be claimed without hardware testing. Test root/base-path asset loading and inspect live console.

## Completion record
Implemented the simulation, aircraft/gun/coast scene, separate touch aim/fire, buffered quick taps, pause/retry/results, lazy loading, direct mission tile and campaign progression. Browser playtest found and resolved a missed quick-tap shot and the desktop menu clipping its final tile. All 135 tests, typecheck, lint and production build pass; local desktop and both phone layouts render without console errors. Gameplay capture is in `docs/images/stage-2-flak.jpg`. Physical iPhone multi-touch remains unverified. Publication follows the established PR/merge/Pages flow.
