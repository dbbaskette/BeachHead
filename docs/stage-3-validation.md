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
