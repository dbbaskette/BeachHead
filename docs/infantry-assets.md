# Infantry model asset

The pillbox infantry renderer vendors `public/models/Soldier.glb` so gameplay never depends on a runtime network request.

## Soldier.glb

- Source: [Three.js official repository](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/Soldier.glb)
- Upstream example: [Skeletal Animation Blending](https://threejs.org/examples/webgl_animation_skinning_blending.html)
- Original model credit: Mixamo, as stated by the upstream Three.js example
- Three.js repository contributor/import: Mugen87; first committed November 22, 2018
- License distributed with the vendored asset: MIT; see `public/models/THREE-LICENSE.txt`
- Local SHA-256: `dfb230fc1f942f259dd00281a1186953ad602fc5d69067ce63e24b2aa439736b`
- Embedded animation clips used by the game: `Idle`, `Run`, and `Walk`

The binary contains its textures, skeleton, skin weights, and clips. The renderer loads only this local file, shares immutable geometry and materials across instances, and uses Three.js `SkeletonUtils.clone()` to give every visible soldier an independent skeleton.

## WWII style adaptation

The existing rig is retained, with a field-grey cloth shader preserving surface detail, dark leather boot treatment, hidden modern visor, smaller steel helmet, canvas shoulder webbing, belt pouches and a field pack. This is a stylized period-inspired adaptation, not a historically exact replacement model. Four deterministic death poses provide forward, backward, sideways and staged collapse reactions; these are procedural reactions rather than physics ragdolls.
