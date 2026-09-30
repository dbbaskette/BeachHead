# Stage 2 positional combat

Approved scope: implement all eight ideas from the conversation. Preserve Stage 1 controls and the existing public Pages release workflow.

## Slices and acceptance

1. **Battlefield and squads.** Enlarge and move foxholes into visible gaps, add raised rims and entrance gaps, sculpt ridges/gullies, and respect terrain sight lines. Occupants stay 9–15 seconds, duck under incoming fire, expose themselves to shoot/throw, and rally nearby troops into rushes. Squads alternate covering fire and movement, and gather for smoke-screened pushes. Verify routes, dwell, exposure, suppression bounds and terrain visibility.
2. **Player choices and priority targets.** Three player grenades per wave, G/button, visible arcs and area damage that reaches cover. Machine-gun and mortar teams have visible setup, warnings, distinct models and attack cues. Craft gunners and ramps are separate targets: gunner kills stop covering fire, ramp damage delays unloading without deadlocking wave spawns. Verify resource limits, damage, telegraphs, range, pause and reset.
3. **Rewards and air support.** Wave-clear choice of bunker repair, improved barrel or extra grenades. Earn one stored strafing run through combat, call with V/button at the reticle, show a plane and impact line. Freeze combat during the choice and only advance once a benefit is selected. Verify reward uniqueness, campaign completion, aircraft strike timing and cleanup.
4. **Integration and release.** Explain controls in the briefing and compact HUD. Browser-check actual combat plus isolated visual snapshots; run the complete test suite, typecheck, lint and production build once on the final tree. Commit, sync and wait for Pages deployment.

Verification owner: main agent. No external assets or services are required. Balance changes should create tactical choices while retaining a winnable three-wave encounter. Review focus: no hidden permanent invulnerability, no ammunition duplication on pause/retry, no stuck unloading waves, bounded effects and full cleanup on stage exit.

## Completion record

- Implemented all eight features: readable occupied foxholes, terrain relief and occlusion, player grenades, squad tactics, MG/mortar crews, craft gunner/ramp targets, supply choices and earned strafing runs.
- Full local suite: 61 passing tests, including a three-wave victory and a regression preventing newly arrived foxhole occupants from being pulled straight out. Typecheck and authored-source lint pass.
- Browser verification: grenade keyboard input consumed one round; HUD, foxhole occupants, MG setup warnings, and separate previews of deployed support teams and aircraft rendered correctly. No errors in the inspected live game or final preview console. Battlefield screenshot saved outside the repository.
- Production Pages build succeeded locally. The main-branch Pages workflow remains the final build/test/deployment gate after synchronization.
- Simulation tests cover resupply benefits and freezing; a complete human browser playthrough of all three waves was not performed. Balance remains open to play feedback.
