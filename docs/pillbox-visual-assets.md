# Pillbox battlefield visual assets

The Stage 2 battlefield dressing in `lib/pillbox/detail.ts` uses Three.js primitives and deterministic placement data. The base beach and bunker can use two scanned PBR texture sets loaded by `createSurfaceMaps()`:

- **Coast Sand 02** by Dimitrios Savva and Poly Haven: [asset page](https://polyhaven.com/a/coast_sand_02). Included at 1K as diffuse, OpenGL normal, and roughness JPG maps.
- **Concrete Wall 007** by Rob Tuytel and Poly Haven: [asset page](https://polyhaven.com/a/concrete_wall_007). Included at 1K as diffuse, OpenGL normal, and roughness JPG maps.

Both Poly Haven assets are published under [CC0](https://polyhaven.com/license), permitting use, modification, and redistribution without attribution. Credits are included here to preserve provenance. The files were obtained from the asset records returned by Poly Haven's public API on 2026-09-09 and renamed with a `pillbox-` prefix in `public/textures/`.

The detail module builds scorch marks, rock and concrete rubble fields, exposed rebar, driftwood, coastal grass, boot traffic, bunker repair slabs, signs, and airborne sand motes. Repeated objects use `THREE.InstancedMesh`; the full module adds approximately 13 static draw calls. Tall dressing is kept outside the five infantry routes at x = -36, -18, 0, 18, and 36, while route markings remain nearly flush with the beach.

Three.js is distributed under the MIT License. The project copy of its license is in `public/textures/THREE-LICENSE.txt`.

The shoreline pass in `lib/pillbox/terrain.ts` adds a sculpted beach with irregular shallow crater depressions, coastal dunes, and a submerged shore slope. Scanned sand maps receive broad colour variation, softened normal detail, and a darker, smoother wet strip. Infantry, jeeps, and instanced dressing sample the same ground height. The ocean uses animated wave geometry and procedural breaking foam, shallow-water colour, reflections, and distance haze. These effects add no downloaded assets.

Destroyed jeeps emit seven shared-texture smoke sprites per wreck via `lib/pillbox/smolder.ts`. Puffs rise and drift, fade over 42 seconds, freeze with the simulation, and are removed on retry or stage exit. The smoke texture is generated locally.
