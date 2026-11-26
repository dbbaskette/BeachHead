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
  const roughPixels = ctx.createImageData(canvas.width, canvas.height);
  const rd = roughPixels.data;
  const metalPixels = ctx.createImageData(canvas.width, canvas.height);
  const md = metalPixels.data;
  const width = canvas.width;
  const setPbr = (i: number, r: number, m: number) => {
    rd[i] = rd[i + 1] = rd[i + 2] = r;
    rd[i + 3] = 255;
    md[i] = md[i + 1] = md[i + 2] = m;
    md[i + 3] = 255;
  };
  for (let i = 0; i < d.length; i += 4) {
    const px = (i / 4) % width;
    const py = Math.floor(i / 4 / width);
    const mr = mask[i],
      mg = mask[i + 1],
      mb = mask[i + 2];
    const hash = Math.sin(px * 127.1 + py * 311.7) * 43758.5453;
    const grain = (hash - Math.floor(hash) - 0.5) * 14;
    if (mr > 7 && mr < 40 && Math.abs(mr - mg) < 8) {
      // Field-grey wool cloth: matte fabric response with smooth 2D grain.
      const luminance = (d[i] + d[i + 1] + d[i + 2]) / 3;
      const shade = 0.65 + Math.min(100, luminance) / 150;
      d[i] = 69 * shade + grain;
      d[i + 1] = 77 * shade + grain;
      d[i + 2] = 64 * shade + grain;
      setPbr(i, 236, 0);
    } else if (mr <= 18 && mg <= 18 && mb <= 18) {
      // Leather boots, belt, and chin strap.
      setPbr(i, 108, 22);
    } else if (mr > mb + 18 && mr > 80) {
      // Face and hands skin.
      setPbr(i, 174, 0);
    } else {
      // Painted steel helmet, buckle, and hardware.
      setPbr(i, 118, 108);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  detailed.dispose();
  original.dispose();
  const makeTex = (data: ImageData | HTMLCanvasElement, srgb: boolean) => {
    let source = canvas;
    if (data instanceof ImageData) {
      const c = document.createElement('canvas');
      c.width = data.width;
      c.height = data.height;
      c.getContext('2d')!.putImageData(data, 0, 0);
      source = c;
    }
    const t = new T.CanvasTexture(source);
    t.flipY = true;
    if (srgb) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = srgb ? 8 : 4;
    return t;
  };
  const map = makeTex(canvas, true);
  const roughnessMap = makeTex(roughPixels, false);
  const metalnessMap = makeTex(metalPixels, false);
  return new T.MeshStandardMaterial({
    map,
    roughnessMap,
    metalnessMap,
    roughness: 1,
    metalness: 1,
  });
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
