# Infantry and battlefield detail pass

User feedback: approaching soldiers and surrounding detail still looked like placeholders.

Replaced the six-batch capsule/box characters with a locally bundled textured Soldier GLB, independently cloned skeletons, real Run/Idle clips, staggered animation timing, cover/down presentation, and per-character picking. Geometry/materials are shared; skeletons, mixers and bone textures are released on removal/retry. Camera-motion reduction no longer freezes enemy animation.

Added scanned Poly Haven sand/concrete diffuse, normal and roughness maps, meter-scaled concrete UVs, woven sandbag surfaces and soft box-shaped bags, environment lighting for metal, and receiver screws, charging handle, sights, barrel fittings and markings. Static gun fittings merge by material. Instanced dressing adds craters, scorch marks, rubble/rebar, rocks, driftwood, tapered grass and boot traffic while keeping firing routes clear.

Readiness waits for local graphics assets. Partial failed surface loads dispose successful peers, and late loads after unmount dispose their resources.

Browser inspection confirmed textured soldiers and dressed terrain rendered in combat with no console warnings/errors. Existing three-wave simulation rules are unchanged. Separate asset documents record sources, attribution and license files. This pass is available locally; the hosted build is not republished automatically.
