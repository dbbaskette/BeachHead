# Jeeps and grenades

Stage 2 retains the 18/24/30 infantry waves and the current 40-round heat limit. Difficulty now comes from reinforcement deliveries and close-range attacks.

- One/two/three jeeps per wave, first arriving five seconds in and subsequent vehicles seven seconds apart. They drive at 9 m/s through the steel, concrete and wire gaps, unload four soldiers at 38 m, and reverse out along the same route.
- Each jeep requires 18 hits. Destroying a loaded vehicle denies its remaining passengers and awards 400 points. Jeep markers show remaining armor; vehicle hits produce sparks rather than blood.
- Infantry within 42 m stop and telegraph a grenade throw for 1.4 seconds. Killing the thrower before release cancels it. An airborne grenade continues even if the thrower dies and deals 12 bunker damage after 2.2 seconds. Each soldier carries one grenade.
- Grenade warnings appear over throwers and in the objective HUD. Grenades follow visible ballistic arcs, and impacts have sound and blast effects.
- Wave completion waits for scheduled jeeps, remaining infantry and airborne grenades. Pause freezes threat timers. Retry clears troops, vehicles, effects and projectiles.
- Rendering is bounded at 48 active infantry, 18 corpses and six vehicles across the encounter. Vehicle geometry/materials are shared and disposed on stage exit.

Validation includes 31 tests covering full three-wave victory, transport durability, reinforcement counts, obstacle clearance, interruptible throws, committed airborne damage, wave completion, pause, retry and graphics-resource cleanup.
