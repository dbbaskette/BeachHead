import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Bake only immutable opaque scenery, keeping local cells independently cullable. */
export function batchBunkerScenery(scene: T.Object3D, movable: T.Object3D[]) {
  const excluded = new Set<T.Object3D>();
  movable.forEach((root) => root.traverse((o) => excluded.add(o)));
  scene.updateMatrixWorld(true);
  const inverse = scene.matrixWorld.clone().invert();
  const batches = new Map<string, T.Mesh<T.BufferGeometry, T.Material>[]>();
  scene.traverse((o) => {
    if (
      !(o instanceof T.Mesh) ||
      o instanceof T.SkinnedMesh ||
      excluded.has(o) ||
      Array.isArray(o.material) ||
      o.material.transparent ||
      o.material instanceof T.ShaderMaterial ||
      Object.keys(o.geometry.morphAttributes).length ||
      !o.visible
    )
      return;
    // A hidden ancestor must not become visible when geometry is reparented.
    for (let p = o.parent; p; p = p.parent)
      if (!p.visible || excluded.has(p)) return;
    const position = new T.Vector3().setFromMatrixPosition(o.matrixWorld);
    const attributes = Object.keys(o.geometry.attributes)
      .sort()
      .map((name) => {
        const a = o.geometry.getAttribute(name);
        return `${name}:${a.itemSize}:${a.normalized}`;
      })
      .join(',');
    const key = `${Math.floor(position.x / 8)},${Math.floor(position.z / 8)}:${o.material.uuid}:${o.castShadow}:${o.receiveShadow}:${o.renderOrder}:${o.layers.mask}:${attributes}`;
    const batch = batches.get(key) ?? [];
    batch.push(o as T.Mesh<T.BufferGeometry, T.Material>);
    batches.set(key, batch);
  });
  const removed = new Set<T.BufferGeometry>();
  let saved = 0;
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const copies = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone();
      if (!geometry.index)
        geometry.setIndex(
          Array.from(
            { length: geometry.getAttribute('position').count },
            (_, i) => i,
          ),
        );
      geometry.applyMatrix4(mesh.matrixWorld);
      geometry.applyMatrix4(inverse);
      return geometry;
    });
    const geometry = mergeGeometries(copies, false);
    copies.forEach((g) => g.dispose());
    if (!geometry) continue;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const first = meshes[0],
      batch = new T.Mesh(geometry, first.material);
    batch.name = 'Static bunker scenery batch';
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder;
    batch.layers.mask = first.layers.mask;
    batch.matrixAutoUpdate = false;
    scene.add(batch);
    for (const mesh of meshes) {
      removed.add(mesh.geometry);
      mesh.removeFromParent();
    }
    saved += meshes.length - 1;
  }
  // Some original geometries may also belong to movable objects; never dispose those.
  scene.traverse((o) => {
    if (o instanceof T.Mesh) removed.delete(o.geometry);
  });
  removed.forEach((g) => g.dispose());
  return saved;
}
