import * as T from 'three';

type LocalLight = T.PointLight | T.SpotLight;
/** Fixed shader light counts: moving through rooms changes uniforms, not programs. */
export class BunkerMobileLights {
  private sets: { sources: LocalLight[]; slots: LocalLight[] }[] = [];
  constructor(scene: T.Scene, excluded: T.Object3D[]) {
    const skip = new Set<T.Object3D>();
    excluded.forEach((root) => root.traverse((o) => skip.add(o)));
    scene.updateMatrixWorld(true);
    const spots: T.SpotLight[] = [],
      points: T.PointLight[] = [];
    scene.traverse((o) => {
      if (skip.has(o)) return;
      if (o instanceof T.SpotLight) spots.push(o);
      else if (o instanceof T.PointLight) points.push(o);
    });
    for (const [sources, limit] of [
      [spots, 5],
      [points, 3],
    ] as [LocalLight[], number][]) {
      const slots = sources.slice(0, limit).map((source) => {
        const slot =
          source instanceof T.SpotLight
            ? new T.SpotLight()
            : new T.PointLight();
        scene.add(slot);
        if (slot instanceof T.SpotLight) scene.add(slot.target);
        return slot;
      });
      sources.forEach((source) => {
        source.visible = false;
      });
      this.sets.push({ sources, slots });
    }
  }
  update(position: T.Vector3) {
    for (const { sources, slots } of this.sets) {
      // Static source positions are world-space scene children. Light fixtures stay visible.
      sources.sort(
        (a, b) =>
          a.position.distanceToSquared(position) -
          b.position.distanceToSquared(position),
      );
      slots.forEach((slot, i) => {
        const source = sources[i];
        slot.position.copy(source.position);
        slot.color.copy(source.color);
        slot.intensity = source.intensity;
        slot.distance = source.distance;
        slot.decay = source.decay;
        if (slot instanceof T.SpotLight && source instanceof T.SpotLight) {
          slot.angle = source.angle;
          slot.penumbra = source.penumbra;
          slot.target.position.copy(source.target.position);
        }
      });
    }
  }
}
