# Pillbox battlefield visual assets

The Stage 2 battlefield dressing in `lib/pillbox/detail.ts` uses Three.js primitives and deterministic placement data. The base beach and bunker can use two scanned PBR texture sets loaded by `createSurfaceMaps()`:

- **Coast Sand 02** by Dimitrios Savva and Poly Haven: [asset page](https://polyhaven.com/a/coast_sand_02). Included at 1K as diffuse, OpenGL normal, and roughness JPG maps.
- **Concrete Wall 007** by Rob Tuytel and Poly Haven: [asset page](https://polyhaven.com/a/concrete_wall_007). Included at 1K as diffuse, OpenGL normal, and roughness JPG maps.

Both Poly Haven assets are published under [CC0](https://polyhaven.com/license), permitting use, modification, and redistribution without attribution. Credits are included here to preserve provenance. The files were obtained from the asset records returned by Poly Haven's public API on 2026-09-09 and renamed with a `pillbox-` prefix in `public/textures/`.

The module builds shallow shell craters and scorch marks, rock and concrete rubble fields, exposed rebar, driftwood, coastal grass, boot traffic, bunker repair slabs, signs, and airborne sand motes. Repeated objects use `THREE.InstancedMesh`; the full module adds approximately 15 static draw calls. Tall dressing is kept outside the five infantry routes at x = -36, -18, 0, 18, and 36, while route markings remain nearly flush with the beach.

Three.js is distributed under the MIT License. The project copy of its license is in `public/textures/THREE-LICENSE.txt`.
