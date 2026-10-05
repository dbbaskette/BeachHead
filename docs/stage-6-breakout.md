# Stage 6 — Breakout

The bunker victory unlocks a direct continuation button to a standalone Sherman mission. Stage 6 is also selectable from the main menu. The existing four-stage campaign is unchanged.

## Mission and controls

Two routes lead north through a compact village: the high street and the western orchard lane. Fences and low walls can be crushed; houses require cannon fire and leave rubble. Rocket teams and antitank guns have a visible aiming delay. An enemy tank defends the square. The demolition countdown starts after advancing 100 metres inland; destroy the demolition post, move within 23 metres of the bridge square, hold for 40 seconds and clear nearby defenders. Leaving the square stops hold progress. The orchard supply point restores armor once when stopped nearby.

WASD drives and steers; mouse/arrow keys independently aim the turret. Click/Space fires, Q changes cannon/MG, Z zooms, C centers the turret, M toggles the map, Esc pauses. R or the repair button fixes track/turret damage over 4.5 stationary seconds; driving or shooting cancels it. Mobile uses independent drive, aim and fire contacts. Dragging Fire also aims while firing. Capture-phase releases and touch reconciliation reuse the bunker input fix; a visible mobile page losing focus does not pause combat.

## Rendering and assets

Procedural rounded hull/turret, glacis, wheels, moving instanced tread links, hatches, gun barrel, bolts, tow eyes, stowage and markings. Rounded masonry, dimensional roofs/shutters/sills/beams, destroyed wall stubs and debris, alpha-tested foliage, river and stone bridge. Existing repository surface and weapon-audio assets are reused; no external asset license or dependency was added. Engine audio is synthesized locally. Cannon recoil, dust, sparks, muzzle flash and wreck smoke are pooled. Enemy hit/health labels stay out of the viewport.

Mobile starts at pixel ratio ≤1 with shadows/MSAA off. Desktop caps pixel ratio at 1.5 with a single shadowed sun. Static geometry batches normalize indexed and non-indexed geometry and preserve transforms. GPU resources are released on menu return. This is a stylized real-time battlefield, not photographic imagery or a physically exact armor simulator.

## Verification — 2026-10-04 work session

Host: macOS, Node 25.9.0, source based on `e956bf3a8a8a0a85080738d4bacb988d5ec471b7` plus the Stage 6 working tree. Full run: **193 tests passed**; TypeScript, scoped lint, diff whitespace check, shell syntax and production build with `NEXT_PUBLIC_BASE_PATH=/BeachHead` passed. Logs: `/tmp/beach-head-breakout-ci/host-tests.log`, `host-build.log`. A source SHA-256 manifest is retained alongside them.

Final visual/input refinements added flat track ground-contact runs and reset mouse hover origin at battlefield entry. The affected geometry/input tests (11), typecheck/lint and Pages build were rerun successfully.

New checks cover independent hull/turret control, braking, pause/retry, swept collision/cover occlusion, cannon/MG differentiation, armor angles, component damage and interrupted repair, enemy warnings, both village lanes, river boundaries, one-time supply use, bridge victory/loss sequencing, independent mobile contacts, mixed geometry batching, and a full high-street victory driven through normal input (no damage/health cheats).

Browser checks: Stage 6 direct selection, briefing, cannon tap/reload, repair start, desktop and 844×390 landscape/390×844 portrait layouts, drive/aim/fire pad release, retry and explicit pause. No new console errors after fixing the initial mixed-index geometry issue. These checks are desktop Chrome and responsive layouts, not physical iPhone FPS or Safari touch certification. The planned five-to-eight-minute first-play pacing remains a playtest target; the automated ideal-input route is faster.

Local CI: added minimal `scripts/ci/tart-macos.sh` wrapper and read-only-source `guest-test.sh` for the existing macos-test-suite runner. Dry run passed. Actual runner was blocked by an unrelated locked Blog Studio image during inventory. A scoped clone of the verified stopped base (`beach-head-breakout-20261005-0200`) was created with automatic pruning disabled; boot failed because the host was already at its VM limit. Clone remains stopped; other VMs were untouched. Guest tests did **not** run. Details: `/tmp/beach-head-breakout-ci/runner.log`, `tart-run.log`, `limitations.txt`. Remote CI/deployment will be verified during the authorized PR merge.

## Terrain realism pass

Replaced the flat sand plane and rectangular road overlays with a continuous terrain mesh. Rolling hills begin beyond the playable village; the river sits in a recessed bed with sloping banks. The village floor stays aligned with the existing vehicle and building collision geometry. World-space cobblestones have recessed mortar, small cracks and surface relief; procedural soil/grass variation and irregular muddy shoulders blend the routes into their surroundings. Orchard wheel ruts include reflective puddles. Grass uses bent, tapered blades with instanced color variation; scattered stones, blast staining, curb stones and sagging telegraph wires add ground-scale detail. Driving leaves a bounded pool of 900 tread impressions.

Mobile uses 3,200 grass instances and a reduced terrain grid; desktop uses 6,400 grass instances. Puddles batch into one draw, stones and grass are instanced, and no additional shadow lights or external assets were added. Physical-phone frame rate remains unmeasured.

After this pass: **195 tests passed**, TypeScript, scoped lint, whitespace checks and the Pages-path production build passed. Terrain tests verify collision-aligned foundations, continuous banks, recessed river water space, and connected road placement. Desktop and 844×390 responsive browser playtests rendered without console errors; drive/aim pad release did not pause the mission. Logs: `/tmp/beach-head-breakout-ci/terrain-*.log`. The previously documented Tart infrastructure limitation still applies.
