# Stage 3 — Break the Landing

## Proposed experience

A WWII-inspired fighter-bomber makes low passes against an enemy amphibious landing. This continues the campaign: clear the naval blockade, hold the captured pillbox, then take off to stop the next landing force. The player attacks enemy landing craft, vehicles unloading on the sand, and beach supply positions.

Recommended first version: a guided flight corridor with direct mouse aiming and limited banking. The aircraft advances automatically, leaving attention on lining up shots, choosing bomb releases, and avoiding flak. A full flight simulator would make this less approachable, especially while we are refining mouse controls.

## Controls and feedback

- Mouse: aim and bank within a forgiving flight corridor; small movements make small corrections.
- Hold left button: wing-mounted machine guns, with visible converging tracers and separate gun sounds.
- Right click or Space: release one bomb, with a short debounce to prevent accidental double releases.
- Shift: precision aiming. Escape: pause. Keyboard and touch alternatives mirror the first two stages.
- A projected bomb impact marker accounts for aircraft speed, altitude and bomb fall time. It changes shape when a bomb is ready; no guessing at an invisible trajectory.

Use a restrained cockpit frame and a clear view of the beach. Avoid excessive camera shake and large effects obscuring targets. Reduced-motion mode removes banking of the horizon and impact shake while preserving aiming.

## Three passes

1. Approach over water: strafe landing craft and practice one bomb drop on a transport cluster.
2. Along the shoreline: attack unloading vehicles and supply dumps while light flak becomes active.
3. Final pass: destroy the command transport before it unloads; remaining craft increase pressure on the beach defense.

Start with a 2–3 minute encounter, six bombs, unlimited gun ammunition with short reload pauses, and three damage stages. Tune those values through playtesting. Large transports reward bombing; exposed vehicles and small boats remain vulnerable to guns. Targets need readable damage states and a clear destroyed state.

## Implementation slices

1. Build deterministic flight, gun convergence, ballistic bombs, target damage and scoring in a separate air-combat simulation. Test pause/retry, release debouncing, trajectories, hit resolution and victory/loss.
2. Add the aircraft view, coastal route, landing craft and a single playable pass. Reuse beach materials and naval hull details at appropriate levels of detail.
3. Add bounded smoke, water columns, sand impacts, flak and spatial audio; verify frame rate on a full pass before increasing enemy density.
4. Add three-pass progression and Stage 2 victory transition. Keep a practice entry available from the campaign briefing.

## Decisions for the next planning discussion

- Recommended camera: cockpit/gunsight. Alternative: chase camera showing the aircraft.
- Recommended flight: guided passes with limited banking. Alternative: free flight and manual return passes.
- Choose a fictional WWII-inspired aircraft or a specific period aircraft for the art direction.

This is a plan only. Stage 3 is not implemented by this pass.
