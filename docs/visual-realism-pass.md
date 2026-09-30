# Coastal realism pass

Improve both existing stages without changing aiming, damage, enemy routes or progression. Use the installed Three.js analytical daylight sky, a consistent sun direction, lower ambient fill, wind-driven patchy coastal mist, and occasional three-aircraft WWII-style formations. Upgrade beach water with dispersion-based swell and slope-derived normals; break up repetitive sand and distant island colouring.

Implementation order: shared daylight and atmospheric dressing; integrate scene clocks and cleanup; refine coastal water and terrain; browser verification and regression suite. No new external assets or packages. Real-time approximations remain: mist is layered rather than volumetric ray tracing, flyovers are decorative, and the ocean is not a fluid simulation.

Acceptance: both stages render without shader errors; fog varies smoothly and does not blanket close combat; aircraft travel continuously and periodically; pause freezes effects; restart does not allocate additional formations; scene exit disposes owned GPU resources; existing combat tests pass. Verify the final source tree once with tests, typecheck, scoped lint and production build, plus browser checks of both stages.

## Verification

The final implementation has 37 passing Node tests, clean TypeScript and scoped lint checks. Browser checks covered both stages, confirmed the formation is visible above the beach, and returned no runtime/shader errors. Production compilation and the Pages pipeline remain release gates. The existing large client-chunk warning is unchanged. No claim of measured frame-rate improvement or full photorealism is made.

Atmosphere owns ten mist planes and three reusable aircraft (shared geometry/materials), with deterministic seeded motion for tests. Fog is randomized on scene entry and varies smoothly over the battle clock; retry resets its position without creating more objects. Aircraft are decorative and do not participate in combat. Water uses deep-water dispersion for offshore swell, analytic slope normals, Schlick reflectance, simplified wavelength absorption, and distance-filtered ripples. Sky lighting uses the installed Three.js analytical daylight model, with radiance calibrated to the game's exposure.
