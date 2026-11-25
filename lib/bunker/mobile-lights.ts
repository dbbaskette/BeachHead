import * as T from 'three';

type LocalLight = T.PointLight | T.SpotLight;

export type BunkerLightPoolOptions = {
  maxSpots?: number;
  maxPoints?: number;
  maxShadows?: number;
  shadowRange?: number;
};

type LightSet = {
  isSpot: boolean;
  sources: LocalLight[];
  slots: LocalLight[];
  assigned: (LocalLight | null)[];
};

/** Fixed shader light counts: moving through rooms changes uniforms, not programs. */
export class BunkerMobileLights {
  private sets: LightSet[] = [];
  private maxShadows: number;
  private shadowRangeSq: number;

  constructor(
    scene: T.Scene,
    excluded: T.Object3D[],
    options: BunkerLightPoolOptions = {},
  ) {
    const {
      maxSpots = 5,
      maxPoints = 3,
      maxShadows = 0,
      shadowRange = 22,
    } = options;
    this.maxShadows = maxShadows;
    this.shadowRangeSq = shadowRange * shadowRange;

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
    for (const [isSpot, sources, limit] of [
      [true, spots, maxSpots],
      [false, points, maxPoints],
    ] as [boolean, LocalLight[], number][]) {
      const slots = sources.slice(0, limit).map((_, i) => {
        const slot = isSpot ? new T.SpotLight() : new T.PointLight();
        scene.add(slot);
        if (slot instanceof T.SpotLight) {
          scene.add(slot.target);
          if (i < maxShadows) {
            slot.castShadow = true;
            slot.shadow.mapSize.set(512, 512);
            slot.shadow.bias = -0.0005;
            slot.shadow.normalBias = 0.025;
            slot.shadow.camera.near = 0.25;
          }
        }
        return slot;
      });
      sources.forEach((source) => {
        source.visible = false;
        source.castShadow = false;
      });
      this.sets.push({
        isSpot,
        sources,
        slots,
        assigned: Array.from({ length: slots.length }, () => null),
      });
    }
  }

  update(position: T.Vector3, dt = 0) {
    const smooth = dt > 0 ? Math.min(1, dt * 8) : 1;
    for (const { isSpot, sources, slots, assigned } of this.sets) {
      // Static source positions are world-space scene children. Light fixtures stay visible.
      sources.sort(
        (a, b) =>
          a.position.distanceToSquared(position) -
          b.position.distanceToSquared(position),
      );
      const desired = sources.slice(0, slots.length);
      const desiredSet = new Set(desired);
      const kept = new Set<LocalLight>();

      // Sticky slot retention prevents shadow-map thrashing as nearby distances reorder.
      for (let i = 0; i < slots.length; i++) {
        const prev = assigned[i];
        if (prev && desiredSet.has(prev)) {
          kept.add(prev);
        } else {
          assigned[i] = null;
        }
      }

      let slotCursor = 0;
      for (const source of desired) {
        if (kept.has(source)) continue;
        while (slotCursor < slots.length && assigned[slotCursor] !== null) {
          slotCursor++;
        }
        if (slotCursor >= slots.length) break;
        assigned[slotCursor] = source;
        if (dt > 0) slots[slotCursor].intensity = 0;
      }

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const source = assigned[i];
        if (!source) {
          slot.intensity = 0;
          if (slot instanceof T.SpotLight) slot.castShadow = false;
          continue;
        }
        slot.position.copy(source.position);
        slot.color.copy(source.color);
        slot.distance = source.distance;
        slot.decay = source.decay;

        let targetIntensity = source.intensity;
        if (dt > 0) {
          const dist = Math.sqrt(source.position.distanceToSquared(position));
          const fadeStart = Math.max(source.distance + 4, 14);
          const fadeEnd = fadeStart + 8;
          const u = T.MathUtils.clamp(
            (dist - fadeStart) / (fadeEnd - fadeStart),
            0,
            1,
          );
          const fade = 1 - u * u * (3 - 2 * u);
          targetIntensity *= fade;
        }
        slot.intensity =
          dt > 0
            ? slot.intensity + (targetIntensity - slot.intensity) * smooth
            : targetIntensity;

        if (
          isSpot &&
          slot instanceof T.SpotLight &&
          source instanceof T.SpotLight
        ) {
          slot.angle = source.angle;
          slot.penumbra = source.penumbra;
          slot.target.position.copy(source.target.position);
          slot.castShadow =
            i < this.maxShadows &&
            source.position.distanceToSquared(position) <= this.shadowRangeSq &&
            slot.intensity > 0.05;
        }
      }
    }
  }
}
