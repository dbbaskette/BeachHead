import * as T from 'three';
import { assetUrl } from '../asset-url';

/** Period mesh by nisu (CC0); restore field-grey wool rather than black cloth. */
export async function uniformMaterial() {
  const loader = new T.TextureLoader();
  const [detailed, original] = await Promise.all([
    loader.loadAsync(assetUrl('/models/bunker/ww2-soldier-detailed.jpg')),
    loader.loadAsync(assetUrl('/models/bunker/ww2-soldier.png')),
  ]);
  const canvas = document.createElement('canvas');
  canvas.width = original.image.width;
  canvas.height = original.image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(original.image, 0, 0);
  const mask = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  ctx.drawImage(detailed.image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    if (mask[i] > 7 && mask[i] < 40 && Math.abs(mask[i] - mask[i + 1]) < 8) {
      const grain = (((i / 4) * 73) % 17) - 8;
      const luminance = (d[i] + d[i + 1] + d[i + 2]) / 3;
      const shade = 0.65 + Math.min(100, luminance) / 150;
      d[i] = 69 * shade + grain;
      d[i + 1] = 77 * shade + grain;
      d[i + 2] = 64 * shade + grain;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  detailed.dispose();
  original.dispose();
  const map = new T.CanvasTexture(canvas);
  map.flipY = true;
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  return new T.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0 });
}

/** Subtle breathing and a short, planted patrol stride on the authored skeleton. */
export function guardClips(model: T.Object3D) {
  const make = (moving: boolean) => {
    const tracks: T.KeyframeTrack[] = [];
    for (const name of [
      'Spine',
      'LeftUpLeg',
      'RightUpLeg',
      'LeftLeg',
      'RightLeg',
    ]) {
      const bone = model.getObjectByName(name);
      if (!bone) continue;
      const values: number[] = [],
        times: number[] = [];
      for (let i = 0; i <= 32; i++) {
        const phase =
          (i / 32) * Math.PI * 2 + (name.startsWith('Left') ? Math.PI : 0);
        const angle =
          name === 'Spine'
            ? Math.sin(phase) * 0.014
            : !moving
              ? 0
              : name.endsWith('UpLeg')
                ? Math.sin(phase) * 0.27
                : Math.max(0, -Math.sin(phase)) * 0.42;
        const q = bone.quaternion
          .clone()
          .multiply(
            new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), angle),
          );
        times.push((i / 32) * 1.2);
        q.toArray(values, values.length);
      }
      tracks.push(
        new T.QuaternionKeyframeTrack(`${name}.quaternion`, times, values),
      );
    }
    return new T.AnimationClip(moving ? 'Walk' : 'Idle', 1.2, tracks);
  };
  return [make(false), make(true)];
}

/** Smooth shared cloth/helmet vertices across UV seams without rounding hard edges.
 * The source uses unindexed triangles, so computeVertexNormals alone stays faceted.
 * Positions, UVs and skin weights are deliberately preserved.
 */
export function smoothGuardNormals(geometry: T.BufferGeometry) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  if (!positions || !normals) return;
  const original = Array.from(normals.array);
  const groups = new Map<string, number[]>();
  for (let i = 0; i < positions.count; i++) {
    const key = [positions.getX(i), positions.getY(i), positions.getZ(i)]
      .map((n) => Math.round(n * 10000))
      .join(',');
    const group = groups.get(key);
    if (group) group.push(i);
    else groups.set(key, [i]);
  }
  const normal = new T.Vector3(),
    other = new T.Vector3(),
    sum = new T.Vector3();
  for (const group of groups.values())
    for (const i of group) {
      normal.fromArray(original, i * 3);
      sum.set(0, 0, 0);
      for (const j of group) {
        other.fromArray(original, j * 3);
        if (normal.dot(other) > 0.45) sum.add(other);
      }
      sum.normalize();
      normals.setXYZ(i, sum.x, sum.y, sum.z);
    }
  normals.needsUpdate = true;
}
