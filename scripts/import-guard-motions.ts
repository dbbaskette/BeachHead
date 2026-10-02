/** Import locally downloaded Mixamo FBX motions onto the game's CC0 WWII mesh.
 * Original downloads stay outside the repository. Output is game-specific data.
 * Usage: node --import tsx scripts/import-guard-motions.ts <FBX directory>
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as T from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
const input = process.argv[2];
if (!input)
  throw new Error('Supply the folder containing the downloaded FBX clips.');
const buffer = (b: Buffer) =>
  b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
const target = (
  await new GLTFLoader().parseAsync(
    buffer(await readFile('public/models/bunker/ww2-soldier.glb')),
    '',
  )
).scene;
const selected = new Set([
  'idle',
  'idle aiming',
  'walk forward',
  'walk left',
  'walk right',
  'walk backward',
  'turn 90 left',
  'turn 90 right',
  'death from the front',
  'death from right',
  'death from the back',
  'death from front headshot',
]);
const files = (await readdir(input)).filter((n) =>
  selected.has(n.replace(/\.fbx$/i, '').toLowerCase()),
);
const result: { name: string; duration: number; tracks: unknown[] }[] = [];
for (const file of files) {
  // Mixamo's pack ZIP adds a trailing LF after the FBX footer; trim only that sentinel.
  let bytes = await readFile(join(input, file));
  if (bytes.length % 16 === 1 && bytes.at(-1) === 10)
    bytes = bytes.subarray(0, -1);
  const source = new FBXLoader().parse(buffer(bytes), '');
  const clip = source.animations[0];
  if (!clip) continue;
  const model = clone(target);
  model.updateMatrixWorld(true);
  source.updateMatrixWorld(true);
  const bones: T.Bone[] = [];
  model.traverse((o) => {
    if (o instanceof T.Bone && source.getObjectByName('mixamorig' + o.name))
      bones.push(o);
  });
  const sourceRest = new Map(
    bones.map((b) => [
      b.name,
      source
        .getObjectByName('mixamorig' + b.name)!
        .getWorldQuaternion(new T.Quaternion())
        .invert(),
    ]),
  );
  const targetRest = new Map(
    bones.map((b) => [b.name, b.getWorldQuaternion(new T.Quaternion())]),
  );
  const sourceHip = source.getObjectByName('mixamorigHips')!,
    targetHip = model.getObjectByName('Hips')!;
  const sourceHipRest = sourceHip.getWorldPosition(new T.Vector3()),
    targetHipRest = targetHip.getWorldPosition(new T.Vector3());
  const scale = targetHipRest.y / sourceHipRest.y;
  const mixer = new T.AnimationMixer(source),
    action = mixer.clipAction(clip);
  action.setLoop(T.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  mixer.setTime(0);
  const startHip = sourceHip.getWorldPosition(new T.Vector3());
  const initialHipQ = sourceHip
    .getWorldQuaternion(new T.Quaternion())
    .multiply(sourceRest.get('Hips')!)
    .multiply(targetRest.get('Hips')!);
  const initialYaw = new T.Euler().setFromQuaternion(initialHipQ, 'YXZ').y;
  // A rifle stance deliberately turns the hips away from the line of aim.
  // Align the weapon, not the pelvis, with the gameplay firing direction.
  const rifleAxis = source
    .getObjectByName('mixamorigLeftHand')!
    .getWorldPosition(new T.Vector3())
    .sub(
      source
        .getObjectByName('mixamorigRightHand')!
        .getWorldPosition(new T.Vector3()),
    );
  const weaponYaw = Math.atan2(rifleAxis.x, rifleAxis.z);
  const times: number[] = [],
    positions: number[] = [];
  const rotations = new Map(bones.map((b) => [b.name, [] as number[]]));
  const frames = Math.ceil(clip.duration * 30);
  const death = /death|dying/i.test(file);
  for (let frame = 0; frame <= frames; frame++) {
    const time = Math.min(clip.duration, frame / 30);
    mixer.setTime(time);
    source.updateMatrixWorld(true);
    times.push(time);
    const rootQ = sourceHip
      .getWorldQuaternion(new T.Quaternion())
      .multiply(sourceRest.get('Hips')!)
      .multiply(targetRest.get('Hips')!);
    const yaw = /turn/i.test(file)
      ? weaponYaw + new T.Euler().setFromQuaternion(rootQ, 'YXZ').y - initialYaw
      : weaponYaw;
    const facing = new T.Quaternion().setFromAxisAngle(
      new T.Vector3(0, 1, 0),
      -yaw,
    );
    for (const bone of bones) {
      const sourceBone = source.getObjectByName('mixamorig' + bone.name)!;
      const desired = sourceBone
        .getWorldQuaternion(new T.Quaternion())
        .multiply(sourceRest.get(bone.name)!)
        .multiply(targetRest.get(bone.name)!)
        .premultiply(facing);
      const parent = bone
        .parent!.getWorldQuaternion(new T.Quaternion())
        .invert();
      bone.quaternion.copy(parent.multiply(desired)).normalize();
      if (bone.name === 'Hips') {
        const p = sourceBone
          .getWorldPosition(new T.Vector3())
          .sub(sourceHipRest)
          .multiplyScalar(scale)
          .add(targetHipRest);
        if (death) {
          p.x -= (startHip.x - sourceHipRest.x) * scale;
          p.z -= (startHip.z - sourceHipRest.z) * scale;
          p.applyQuaternion(facing);
        } else {
          p.x = targetHipRest.x;
          p.z = targetHipRest.z;
        }
        bone.position.copy(bone.parent!.worldToLocal(p));
        positions.push(...bone.position.toArray());
      }
      bone.updateMatrixWorld(true);
      rotations.get(bone.name)!.push(...bone.quaternion.toArray());
    }
  }
  const tracks: T.KeyframeTrack[] = [
    new T.VectorKeyframeTrack('Hips.position', times, positions),
  ];
  for (const [name, values] of rotations)
    tracks.push(
      new T.QuaternionKeyframeTrack(name + '.quaternion', times, values),
    );
  const converted = new T.AnimationClip(
    file.replace(/\.fbx$/i, ''),
    clip.duration,
    tracks,
  ).optimize();
  result.push(T.AnimationClip.toJSON(converted));
  mixer.stopAllAction();
}
if (!result.length) throw new Error('No animation clips found.');
await writeFile(
  'public/models/bunker/guard-motions.json',
  JSON.stringify(
    {
      source:
        'Adobe Mixamo; game-specific retargeting, see docs/guard-motions.md',
      clips: result,
    },
    (_key, value) =>
      typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value,
  ),
);
console.log(
  result.map((c) => `${c.name}: ${c.duration.toFixed(2)}s`).join('\n'),
);
