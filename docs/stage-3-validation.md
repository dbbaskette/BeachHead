# Stage 3 validation — 2026-09-30

Implementation: guided attack passes, six ballistic bombs, twin guns, flak, persistent targets, a final command transport, standalone menu entry and campaign continuation. This report distinguishes automated/browser evidence from checks requiring additional hardware or listening.

## Simulation and lifecycle evidence

The new air suite covers modeled muzzle/rack transforms under bank/pitch/heading, first collision on water/terrain/moving decks, swept collisions, immutable releases, deliberate bomb presses, independent firing owners, input cancellation, fixed-step frame-delivery parity, unloading interruption, single destruction awards, flak evasion/suppression, pause/terminal freeze, delayed final bombs and bounded projectile expiry. Effects and audio have resource/cleanup tests, including pause during a pending audio resume.

An input-only benchmark starts an unmodified mission, deliberately wastes its first two bombs offshore, evades flak, lines up the transport and uses the remaining bombs and guns. It wins at 146.12 seconds with approximately 15% aircraft integrity and 1,500 points. No health/ammo/clock/target edits are used. Four of its six bombs ultimately do no target damage; two hit the transport. Separate scenarios prove unattended loss, survival without the objective is a loss, and that killing flak suppresses new attacks while already-launched shells still resolve.

## Browser evidence

Environment: Codex embedded Chromium on macOS 27.0.1, desktop viewport 1280 × 720; landscape phone-sized viewport 844 × 390 and portrait 390 × 844. These are viewport tests on the same host, **not physical-phone measurements**. CPU/GPU model was unavailable through the sandbox's hardware query.

- Completed a mouse-driven run through all three passes and the exit. Banked, changed altitude, strafed, released bombs, paused/resumed in pass 2 and reached the correct command-escaped debrief. A separate deterministic test proves victory.
- Fixed a nose/reticle obstruction found in the first visual pass. Reticles now remain ahead of the cockpit; portrait mode removes the decorative instrument panel. Checked direct Stage 3 briefing/start, retry, pause/menu, muted/reduced-motion controls and all three menu entries.
- Checked phone-layout flight-pad drag, separate gun button, one-bomb button, pause and portrait resize. Real simultaneous touch and native orientation events still require a device.
- Ten menu-exit → Stage 3 → start → pause cycles produced the same live counts each time: **one air scene, one audio context, 11 rendered geometries, six textures and zero active transient voices when paused**. These are renderer-owned counts, not a claim about immediate OS/GPU memory reclamation. A full run loads additional target/effect geometry as needed; retries reuse stable target IDs and bounded pools.
- Keyboard key delivery and bomb release were checked; held keyboard flight is covered by input/simulation tests. A complete human keyboard-only mission and a full earned campaign playthrough remain follow-up checks. Campaign/standalone result routing was inspected in the shared owner and result components.

## Performance

The complete mouse run recorded 4,383 rendered frames: **33.3 ms median, 34.2 ms p95**, peak **556 draw calls** (including the water reflection pass), peak **100 particles**, 24 rendered geometries and six textures. The later cockpit/command-hull detailing adds a few shared geometries; restart counts above were measured afterward. The particle hard cap is 512; audio has 12 transient voices plus its engine bed. Geometry and texture counts plateau instead of increasing with restart count.

The embedded viewport delivered approximately 30 fps. This does **not** establish the desktop target of 60 fps/p95 <25 ms. The phone-sized sample had p95 35 ms, but it ran on desktop hardware and cannot certify the mobile performance target. Physical-device performance, a full final-art stress pass on reference hardware and subjective audio mixing remain open in [AIR-09](https://github.com/dbbaskette/BeachHead/issues/12).

## Release checks

All **98 tests passed**, along with TypeScript, authored-source lint (`app`, `lib/naval`, `lib/pillbox`, `lib/air`), whitespace checks and the `/BeachHead/` production export. The build retains the existing large-chunk advisory. The first sandboxed export could not open its temporary local listener; the approved export completed successfully. These local gates cover the implementation delivered with this report. The repository workflow badge records the subsequent Pages deployment. Audio assets decoded during browser play and lifecycle tests pass; a listening tool was unavailable, so no subjective sound-quality claim is made.

## Coastal realism update — 2026-09-30

- All **100 tests pass**, including new terrain/graphics resource ownership and atmosphere time/reset checks. TypeScript, scoped authored-source lint, whitespace checks and the GitHub Pages export pass. No simulation or control changes.
- Embedded-browser gameplay checked the new terrain shader, surf, mist, canopy, hull fittings, steering and bomb release without WebGL/program errors. A removed Three.js shadow constant discovered during the initial check was replaced by the supported PCF mode.
- A desktop combat sample recorded 1,101 frames at **33.3 ms median / 34.9 ms p95**, peak **565 draw calls** including reflections and shadows. This is a shorter sample, not a directly equivalent full-mission benchmark. Before batching static fittings, a comparable approach sample reached 947 calls; the final batching substantially reduces that overhead.
- Landscape **844 × 390** and portrait **390 × 844** checks confirmed clear reticles, visible targets and separate flight/bomb controls. Landscape pad steering and bomb release worked. Three portrait exit/start/pause cycles each returned **one scene, one audio context, 34 rendered geometries, seven textures and zero transient voices** when paused. Desktop shadows and visible instruments use additional resources.
- These remain desktop-host viewport checks, not physical-phone certification. The previous reference-hardware, full keyboard/campaign and audio-listening follow-ups remain open. The new build retains the existing large-chunk advisory.

## Aircraft refinement — 2026-09-30

All **101 tests**, TypeScript, authored-source lint and the Pages export pass. The new mirrored-airfoil test checks outward upper/lower normals and tapered tips; existing gun/rack alignment, resource-disposal and mission tests also pass. Desktop browser checks exercised banking, altitude changes, firing and bomb release with clear aiming space and no renderer errors. Portrait and landscape viewport checks cover visibility, but do not replace physical-phone testing. The README screenshot now shows the refined cockpit with separated desktop status panels.

## Pilot-seat correction — 2026-09-30

All **103 tests**, TypeScript, scoped authored-source lint and the production export pass. New camera tests verify a stable cockpit-relative view through bank/pitch/heading changes and a level reduced-motion view. Ray tests across 27 altitude/pitch/bank combinations find no opaque cockpit geometry obstructing the gun aiming line. A first browser pass found incompatible indexed/non-indexed meshes dropping part of the shell; normalized batching fixes this and assembly now fails visibly instead of silently omitting a material group.

Browser checks show a solid instrument bulkhead, connected quarter windows, side consoles, a working artificial horizon and anchored banking. Mouse steering, firing and bomb release were exercised, and the README capture shows the banked view. Portrait and landscape visibility checks use desktop-host viewports; physical-phone validation remains outstanding. Previous camera descriptions are superseded by this correction.

## Forward nose visibility — 2026-09-30

All **104 tests**, TypeScript, scoped authored-source lint, whitespace checks and the `/BeachHead/` production export pass. A new ray test verifies that both upper cowling shoulders remain visible from the pilot seat, alongside the existing 27 aiming-clearance checks. Browser inspection confirmed the exposed nose, seams and propeller blur in desktop, 844 × 390 landscape and 390 × 844 portrait views. Banking remains anchored; mobile-layout firing raised gun heat and bomb release reduced inventory from six to five. The fresh browser tab reported no console errors. The README capture was refreshed. These viewport checks run on desktop hardware and do not replace physical-phone testing.

## German aircraft and cowling revision — 2026-09-30

All **104 tests**, TypeScript, scoped lint and the production Pages export pass. The cowling visibility samples follow the revised engine housing; all 27 gun-aim clearance poses and modeled weapon-hardpoint alignment checks pass. Browser checks verified the German/Allied mission briefing, broad engine cowling, closer sight, banking and firing. Mobile landscape bomb release changed inventory from six to five; portrait and landscape retained visible reticles and nose geometry. No console errors were reported. The README image was refreshed. These are desktop-host viewport checks, not physical-device performance measurements.
