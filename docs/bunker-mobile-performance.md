# Bunker mobile rendering

October 4, 2026; baseline: main at 528b55d (PR #38).

The touch renderer batches immutable opaque scenery by material and 8-metre cells. Door and weapon hardware are batched inside their own movable roots. Transparent surfaces, pickups, charges, the sea, muzzle flash and animated guards remain separate. Shared geometries are retained when movable objects still use them.

A fixed pool of five spotlights and three point lights follows the nearest static fixtures. Weapon, grenade, sky and sun lights remain independent (13 visible lights total). Changing rooms updates uniforms without changing the shader light count. Desktop lighting is unchanged; desktop scenery uses the same batching (see below). Whole-actor frustum bounds are conservative to accommodate authored guard motion and deaths on either renderer.

Touch rendering caps pixel ratio at 1 instead of 1.25 (36% less pixel area on high-density screens) and disables MSAA. Detailed models, textures, gameplay and guard animations are retained.

## Comparable synthetic measurements

Chrome on the development Mac, 844 × 390 canvas, mobile rendering enabled, DPR 1, fixed initial camera, 12 animated guards, no combat or simulation advancement except animation time. 120 warmup frames, then 180 measured frames. The temporary harness was removed from app routes after measurement; a local copy is in ignored `work/mobile-performance/benchmark-page.tsx`.

| Metric | Before | After |
| --- | ---: | ---: |
| Draw calls/frame | 2,674 | 451 |
| Visible lights | 39 | 13 |
| Scene meshes | 2,891 | 495 |
| Submitted triangles/frame | 1,015,594 | 1,022,582 |
| Warm repeat CPU render median | 6.3 ms | 4.6 ms |
| Warm repeat CPU render p95 | 6.9 ms | 5.9 ms |
| Frame interval median | 33.3 ms | 33.3 ms |

Draw calls fell 83%; triangles increased 0.7% because local batches have coarser frustum bounds. Initial runs had noisier CPU results (13.8 ms before, 6.3 ms after); use the warmed repeat rather than claiming those as reliable gains. The desktop frame cadence did not improve. These are rendering-work reductions, not evidence of a measured FPS improvement on an iPhone or Android device. Native phone measurements, thermal behavior and Safari performance still require device testing.

Validation covers static world transforms, sliding door coordinates, transparent/hidden exclusions, shared geometry disposal, and a fixed light count as the player moves. Browser checks use the actual phone layout and compare the initial scene appearance.

## Desktop batching

October 9, 2026. Desktop previously skipped scenery batching, while its shadow maps and ambient-occlusion pass resubmit the scene several times per frame. It now batches the same immutable scenery as touch; lights, shadows and post-processing are unchanged.

Headless Chrome on the development Mac (Apple M5 Pro), 1280 × 800, DPR 1, standing at the spawn point with guards active. Draw calls counted by wrapping the WebGL2 draw functions, so every pass is included; 300 frames sampled.

| Metric | Before | After |
| --- | ---: | ---: |
| Draw calls/frame, all passes | 10,832 | 1,882 |
| Submitted triangles/frame | 7.53 M | 7.97 M |
| Frame interval p95 | 33.4 ms | 16.7 ms |
| JS heap | 209 MB | 153 MB |

Draw calls fell 83%; triangles rose 6% because batches have coarser frustum bounds. Screenshots at spawn before and after differ by a mean of about one level per channel, with the only larger differences on the animated guards. Only the spawn view was compared, and the frame times are from one fast GPU.
