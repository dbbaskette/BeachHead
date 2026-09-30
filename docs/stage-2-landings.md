# Stage 2 troop landings and menu navigation

Five landing craft now carry each wave's existing infantry allocation. Craft approach individual lanes, stop in the shallows, lower hinged bow ramps, and unload squads. Soldiers walk from the troop well down a ramp whose height matches the beach, then follow the existing obstacle-avoiding routes. Boats wait until everyone has cleared their ramps, raise them and reverse offshore. Jeep reinforcements retain their existing behaviour.

The craft have weathered hull panels, open troop wells, benches, cleats, ropes, exhausts, steering stations and antennas. Embarked passengers reuse the infantry model as visual-only occupants. Shared geometry is reused across all craft and released on stage exit. Infantry counts remain 18/24/30; the approach adds an opening setup period to each wave.

Beach water now uses a 512px planar reflection of the actual scene, softened by water normals and reflection filtering. The existing wave, shoreline and foam shader remains. Cover edges are rounded. The reflection framebuffer has explicit disposal and a regression check.

Stage 1 has a Main menu toolbar button plus a Return to main menu action in pause and result screens. Returning resets the encounter, clears held input, releases pointer lock, resets aiming and pauses audio. A new battle can then start normally.

Verification: 40 tests pass, including complete three-wave victory, all wave passenger counts, dock/ramp/withdrawal sequencing, paused state, ramp-height continuity and graphics cleanup. TypeScript, scoped lint and diff checks pass. Browser checks confirmed both Stage 1 menu exits and visible troops unloading from lowered ramps; no runtime or shader errors were reported. The release pipeline verifies the final production build.
