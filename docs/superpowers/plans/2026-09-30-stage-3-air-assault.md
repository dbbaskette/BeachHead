# Stage 3 — implementation plan

Prepared 2026-09-30. Design contract: [Break the Landing](../../stage-3-air-assault-plan.md). Status: planned; no implementation has begun. Issue links are maintained in [the issue index](../../stage-3-issues.md).

## Existing code and integration points

Inspected at commit `0f3e6168a0c9a0b2a57174e1144b34cbd9a71d48`:

- `app/campaign.tsx` owns a `1 | 2` stage switch, but campaign versus standalone intent currently lives inside `app/naval-game.tsx`. Move run intent into the campaign owner before routing Stage 2 onward.
- `app/naval-game.tsx` owns the main menu and the campaign/Stage 1/Stage 2 tiles. A Coming soon Stage 3 card is being added alongside this plan. When the mission is ready, activate that card; retain the full-width campaign tile and equally accessible stage choices.
- `app/pillbox-game.tsx` currently declares Stage 2 victory to be campaign completion. Add a campaign-only Stage 3 continuation while preserving standalone Stage 2 completion and retry.
- `lib/naval/gunnery.ts` and `gunnery.test.ts` demonstrate shared muzzle transforms and trajectory validation. Reuse the consistency pattern, not the naval range/elevation curve or compressed shell timing as aircraft physics.
- `lib/naval/atmosphere.ts` provides `makeAircraft` and coastal atmosphere. Its present aircraft are decorative; Stage 3 needs a player model, colliders and a cockpit of its own.
- `lib/naval/daylight.ts`, `ocean.ts`, `materials.ts`, `lib/pillbox/terrain.ts`, `landing-craft.ts`, `vehicles.ts` and `smolder.ts` provide potential art building blocks. The existing beach geometry is a finite defense arena, not yet a full flight corridor.
- `lib/pillbox/landing-craft.ts` and `tactical-renderer.ts` are tied to pillbox battle types. Extract only the geometry/material factories actually needed, or use explicit adapters. Do not pass fabricated Stage 2 state into Stage 3 or refactor both existing simulations merely for reuse.
- `lib/naval/audio.ts` and `lib/pillbox/audio.ts` provide gesture-started audio, bounded voices and cleanup patterns. `lib/asset-url.ts` handles deployment prefixes.
- `package.json` currently discovers tests only under `lib/naval` and `lib/pillbox`; `.github/workflows/pages.yml` limits authored lint to those paths plus `app`. Both must include `lib/air` when the first air module lands.

## Architecture and contracts

New paths below are proposed, not existing files.

- `lib/air/types.ts`, `simulation.ts`: deterministic flight/mission state, input intent and emitted events. No React, DOM, audio or Three.js dependency. Use a fixed simulation step and seeded randomness.
- `flight.ts`, `weapons.ts`, `targets.ts`, `flak.ts`, `mission.ts`: separate responsibilities as they become substantial; avoid a premature framework.
- `lib/air/scene.ts`, `aircraft.ts`, `coast.ts`, `effects.ts`, `audio.ts`: render and sound state/events without owning hit resolution. Real muzzle and rack transforms are defined in shared plain-data configuration and validated against the model.
- `app/air-game.tsx`: input, frame accumulator, scene/audio lifecycle and compact player instruments. High-frequency pointer data stays outside React state; publish status at a lower cadence.
- World axes follow the existing scenes: meters, +Y up, initial forward -Z. Routes turn in world space; flight attitude, velocity, terrain sampling and bomb prediction share that convention. Physics values are documented arcade approximations.
- Suggested lifecycle: briefing → approach → attack → turnaround → attack → turnaround → final attack → exit → won/lost. Pause preserves the prior active phase and freezes all simulation clocks. Inputs cannot fire during noninteractive segments. Resolution waits for committed projectiles within a bounded lifetime; no target-dependent deadlock.
- Stage exit has one owner for disposing the scene, unsubscribing input, cancelling frames and stopping audio. Shared assets are not disposed while another active owner uses them.

## Delivery sequence

Build the first usable pass before committing to final art. Dependencies refer to the task IDs in the issue index.

| Milestone | Tasks | Exit evidence |
| --- | --- | --- |
| M1 — One playable pass | AIR-01, AIR-02, first portion of AIR-03 | Steer, strafe and bomb a moving craft using provisional visuals; muzzle/rack paths agree; pause/retry work. |
| M2 — Complete mission | AIR-03, AIR-04, AIR-05 | Three passes, surviving targets/flak, all win/loss paths and deterministic mission coverage. |
| M3 — Presentation and integration | AIR-06, AIR-07, AIR-08 | Finished cockpit/coast, coherent effects/audio and campaign plus direct selection. |
| M4 — Playable release | AIR-09 | Measured performance, recorded balance/input playtests and one final integrated verification gate. |

This ordering describes dependencies, not permission for delegation. One implementer can complete the sequence; use additional agents only when separately authorized.

### AIR-01 — Guided flight and input prototype

Outcome: one controllable airborne pass with a minimal visible aircraft/gunsight, pause and clean retry.

Proposed files: `lib/air/types.ts`, `flight.ts`, `simulation.ts`, `input.ts`, initial `scene.ts`, `app/air-game.tsx`; integrate the new test glob and lint path in `package.json` and `.github/workflows/pages.yml`.

Dependencies: implementation requested for the proposed plan. The guided flight direction has been selected by the player.

Acceptance: automatic forward motion, bounded lateral/altitude control, predictable mouse precision and keyboard parity; touch pointer ownership; no required pointer lock; normalized finite input; input resets on blur/pause/exit. Establish documented flight speed, corridor and minimum altitude, and use a soft boundary so a small accidental mouse movement cannot immediately crash the plane. The prototype's access is a development entry, not an unfinished public menu tile.

Focused verification owner: implementer. Test equivalent input over different frame delivery patterns, corridor bounds, pause freeze, release/reset, duplicate initialization and restart. Browser-check small corrections and held input on mouse/keyboard/touch emulation; document that real-device touch remains for AIR-09.

### AIR-02 — Guns, ballistic bombs and honest aiming aids

Outcome: usable strafing and one-bomb-per-press release with physically consistent origins and prediction.

Proposed files: `lib/air/weapons.ts`, shared aircraft hardpoint data, simulation events, provisional reticles in `app/air-game.tsx` and render adapters.

Dependencies: AIR-01.

Acceptance: twin gun groups, finite projectile lifetimes and swept collision; bomb position/velocity captured at release; six bombs with rack alternation; gun heat/cooling; shared prediction and trajectory; distinct unlabeled gun/bomb reticles without enemy snapping. Prediction follows the current release solution, never the future location of a moving enemy. Flight is a no-drag ballistic approximation, with no invisible wind correction. Establish tolerances in world units, not screenshot pixels.

Focused verification owner: implementer. Compare actual muzzle/rack world transforms with launch snapshots across bank/pitch/altitude cases; predict first impact on water, uneven terrain and hulls; test held/repeated key input, mouse/touch cancellation, no ammo duplication, no trajectory change from later steering, and no through-hull tunneling. Use a render-only fixture for visual departure checks.

### AIR-03 — Landing-force targets and persistent destruction

Outcome: moving craft, unloading carriers, vehicles, supplies and a distinctive command transport whose damage survives turns.

Proposed files: `lib/air/targets.ts`, mission target definitions and provisional target renderers. Reuse narrow asset factories from the inspected naval/pillbox modules where useful.

Dependencies: AIR-01, AIR-02.

Acceptance: intact/damaged/burning/wrecked states; separate gun and blast response; one damage/score award per event; interrupted unloading denies only unspawned cargo; destroyed targets stop new actions; remaining targets persist across passes. Command transport supports the final mission objective and can be finished by guns after bomb damage. Enemy damage state is readable without numerical labels.

Focused verification owner: implementer. Test moving and overlapping colliders, area damage falloff, repeated destruction events, unloading interruption, target removal and stable target identity across turns. Verify damaged/wrecked visuals from the attack camera.

### AIR-04 — Evasive flak and aircraft damage

Outcome: telegraphed, avoidable anti-aircraft fire creates pressure and rewards early suppression.

Proposed files: `lib/air/flak.ts`, aircraft damage state/events, flak render/audio hooks.

Dependencies: AIR-01, AIR-03.

Acceptance: visible emplacements aim with bounded lead and commit each shot to a trajectory/fuse; no tracking after launch; no unavoidable spawn hit or firing during the safe initial approach. Destroyed flak remains silent in later passes. Aircraft damage provides instrument, sound and restrained visual cues. Reduced motion changes presentation only.

Focused verification owner: implementer. Verify kill-before-fire versus already-airborne shells, bounded rate/damage, a scripted evasion that avoids a shot, stationary/straight-flight vulnerability, pause and terminal-state freeze, and no attack through an intermission. Document the initial warning interval for playtesting.

### AIR-05 — Three-pass mission, objectives and debrief

Outcome: a complete 2–3 minute attack with meaningful target choices and explicit completion/failure.

Proposed files: `lib/air/mission.ts`, mission manifest, deterministic scenario tests and result-state UI in `app/air-game.tsx`.

Dependencies: AIR-01 through AIR-04.

Acceptance: safe opening, bay/shore/final command passes, short guided turnarounds, persistent survivors and smoke state, no resupply or repaired enemies. Mission victory requires command destruction plus surviving exit; failure resolves on aircraft loss or final attack timeout after airborne bombs resolve. Secondary destruction affects score and remaining threats, not hidden victory rules. Results explain the outcome and offer direct retry/menu return.

Focused verification owner: implementer. Script full victory, no-input loss, surviving-but-missing-objective loss, delayed final-bomb success, destruction during exit, final projectile expiry, and pause/retry in every phase. Validate tuning permits at least two missed bombs in a documented benchmark scenario; browser difficulty assessment belongs to AIR-09.

### AIR-06 — Cockpit, coastline and readable target art

Outcome: a convincing pilot view and continuous coast that hold up at flight speed.

Proposed files: `lib/air/aircraft.ts`, `coast.ts`, final scene/target models, new licensed local assets only if required, `docs/air-assets.md` provenance.

Dependencies: AIR-01 for camera scale and AIR-03 for target-state contracts; refine against AIR-05's route before completion.

Acceptance: clear cockpit framing, animated propeller and wing/rack detail, terrain covering the whole route without visible seams, wet/dry shoreline, wakes, ramps, vehicle/cargo silhouettes and an unmistakable command transport. Gun/rack art must preserve verified hardpoints. Restrained seeded mist cannot obscure the whole primary target window. Add appropriate distance detail levels and shared geometry; do not blindly render the full high-detail Stage 2 scene under an aircraft.

Focused verification owner: implementer. Inspect each attack direction and bank/altitude extremes, compare damage silhouettes, check visual reduced-motion mode, check geometry ownership/disposal and record candidate asset licenses. Screenshot review is visual evidence, not a claim of photorealism.

### AIR-07 — Impact effects and aircraft audio

Outcome: convincing and readable strafing, bombing and flight sound without obscuring targets.

Proposed files: `lib/air/effects.ts`, `audio.ts`, impact event adapters, local audio assets and provenance.

Dependencies: AIR-02 through AIR-04; coordinate with AIR-06's scale and materials.

Acceptance: water columns versus sand/deck blasts, bounded debris, sustained smoke, a short bomb-rack release cue, twin gun reports, engine/propeller/airflow loops and spatial flak. Visual impact timing follows the simulation. No floating kill/hit labels. Engine audio must leave warning cues audible; limits prevent clipping/voice explosion. No new paid asset purchases without approval.

Focused verification owner: implementer. Verify pause/resume, mute, failed asset fallback, user-gesture audio startup, bounded active voices/effects, retry/exit cleanup and single-event explosions. Listen to the final mix and record subjective gaps; do not mark audio quality verified solely from mocks.

### AIR-08 — Campaign, menu and complete controls

Outcome: Stage 3 is as easy to select as the other stages and completes the campaign naturally.

Existing files: `app/campaign.tsx`, `app/naval-game.tsx`, `app/pillbox-game.tsx`, `app/globals.css`, `README.md`; new `app/air-game.tsx`.

Dependencies: AIR-05; final acceptance includes AIR-06 and AIR-07.

Acceptance: campaign/standalone intent belongs to the campaign owner; Stage 2 only offers Stage 3 as the primary continuation in a campaign run. Standalone Stage 2 still ends at that mission. Replace the Stage 3 Coming soon placeholder with its playable entry. Keep one full-width Play campaign tile with three equally accessible mission tiles below, responsive for desktop and mobile. Visible pause/menu/mute/reduced-motion controls in air combat. Useful player instruments at the edges, no enemy numbers or floating labels. Briefing explains Space bombs versus F guns. Lazy-load the new stage and its assets so selecting Stage 1 does not preload the full air mission.

Focused verification owner: implementer. Browser-check all three direct entries, campaign continuation, standalone result routing, Stage 3 retry/menu, keyboard focus, touch controls, narrow layout, and stage switching while audio or bombs are active. Register optional WebMCP actions only if needed to match existing test/accessibility support; they must follow the same lifecycle and input rules.

### AIR-09 — Integrated playtest, performance, balance and release

Outcome: a verified playable release with measured limits and explicit remaining gaps.

Proposed artifact: `docs/stage-3-validation.md`; balance settings, asset/effect budgets and quality adjustments as evidence requires.

Dependencies: AIR-01 through AIR-08 complete.

Final verification owner: the integrating implementer. Run the full relevant suite once on the final changed tree, typecheck, authored-source lint including `lib/air`, and the Pages-prefixed production build. Reuse valid evidence for unchanged source; do not make every issue repeat the full release gate. Required GitHub Actions checks still run for an authorized release.

Browser evidence: one complete mouse run and one keyboard run; direct Stage 3 start and full campaign routing; final-bomb resolution; pause/blur/cancel; repeated stage switching; reduced motion; a real touch-device pass where available. State clearly if hardware for a claimed platform was unavailable.

Performance evidence: record reference hardware/browser/resolution/quality; measure a representative full pass with worst-case smoke/flak, frame-time percentiles and draw/effect counts. Target 60 fps / p95 below 25 ms on the agreed desktop and 30 fps / p95 below 40 ms on reduced-quality mobile. Show live resource counts reaching a stable plateau across ten retry/stage-exit cycles rather than asserting that JavaScript garbage collection must immediately return all memory.

Balance evidence: prove a benchmark win with at least two missed bombs, an unattended loss and improved survival from evasion/early flak suppression. Record subjective mouse precision, target visibility and sound clarity. Integrate through the authorized PR/merge workflow; only call the release live after the Pages deployment succeeds and the public route loads.

## Review focus and risks

- Flight response before art investment: a guided camera can still feel like fighting the mouse. M1 must resolve fine corrections before expanding density.
- Ballistic consistency: prediction, real projectile motion, hardpoints and collision must use the same transforms/time convention. Test moving targets and first surface, not just a flat ground point.
- Mission fairness: hidden health bars are intentional; hidden win conditions and opaque fog over the required target are not. Brief and visually identify the transport, then expose objective completion at the edge.
- Corridor scale: the present beach assets cover a small arena. The air route needs a separate continuous terrain plan and a measured detail budget.
- Cross-stage intent: do not accidentally send a standalone Stage 2 player into the campaign, or mark a campaign complete before Stage 3.
- Lifecycle: route turns, retry, pause and stage exit must not duplicate input handlers, restart destroyed defenses or leave orphaned audio/graphics resources.

## Completion record

- [x] Existing integration points inspected.
- [x] Proposed design and implementation sequence written.
- [x] GitHub epic #3 and implementation issues #4–#12 linked in the issue index.
- [ ] Implementation requested/approved.
- [ ] M1 playable pass complete.
- [ ] M2 complete mission complete.
- [ ] M3 presentation/integration complete.
- [ ] M4 verification and authorized release complete.
