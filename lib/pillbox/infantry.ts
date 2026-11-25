import { landingDeckHeight } from './landings';
import { beachHeight } from './terrain';
import { assetUrl } from '../asset-url';
import { deathPose } from './death-pose';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { Infantry, PillboxBattle } from './types';

const MODEL_URL = assetUrl('/models/Soldier.glb');
const SOLDIER_HEIGHT = 2.3;
const MAX_ACTIVE = 48;
const MAX_CORPSES = 18;
const MAX_VISIBLE = 66;
const DISTANT_SHADOW_Z = -85;

export type Pose = 'run' | 'cover' | 'crawl' | 'peek' | 'dugout' | 'down';

const _pickBox = new THREE.Box3();
const _pickOrigin = new THREE.Vector3();
const _pickDir = new THREE.Vector3();
const _pickHit = new THREE.Vector3();
const _pickLocalRay = new THREE.Ray();

/** Analytical ray-AABB test in soldier-local yaw space, eliminating CPU triangle skinning. */
export function intersectInfantryHitbox(
  ray: THREE.Ray,
  x: number,
  y: number,
  z: number,
  yaw: number,
  pose: Pose,
): number | null {
  if (pose === 'down') return null;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const ox = ray.origin.x - x;
  const oy = ray.origin.y - y;
  const oz = ray.origin.z - z;
  _pickOrigin.set(ox * c - oz * s, oy, ox * s + oz * c);
  _pickDir.set(
    ray.direction.x * c - ray.direction.z * s,
    ray.direction.y,
    ray.direction.x * s + ray.direction.z * c,
  );
  _pickLocalRay.set(_pickOrigin, _pickDir);
  if (pose === 'crawl') {
    _pickBox.min.set(-0.55, 0, -1.05);
    _pickBox.max.set(0.55, 0.9, 0.9);
  } else {
    const h = pose === 'dugout' ? 1.35 : pose === 'cover' ? 1.85 : 2.35;
    _pickBox.min.set(-0.58, 0, -0.52);
    _pickBox.max.set(0.58, h, 0.52);
  }
  const hit = _pickLocalRay.intersectBox(_pickBox, _pickHit);
  return hit ? _pickOrigin.distanceTo(hit) : null;
}

function createMergedWebbingGeometry(): THREE.BufferGeometry {
  const specs: Array<[number, number, number, number, number, number]> = [
    [-0.16, 0, 0.18, 0.055, 0.5, 0.035],
    [0.16, 0, 0.18, 0.055, 0.5, 0.035],
    [0, -0.22, 0.17, 0.49, 0.065, 0.07],
    [-0.18, -0.15, 0.24, 0.14, 0.15, 0.1],
    [0.18, -0.15, 0.24, 0.14, 0.15, 0.1],
    [0, 0, -0.2, 0.35, 0.4, 0.15],
  ];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const parts = specs.map(([x, y, z, w, h, d]) => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    pos.set(x, y, z);
    scl.set(w, h, d);
    m.compose(pos, q, scl);
    g.applyMatrix4(m);
    return g;
  });
  const merged = mergeGeometries(parts, false);
  parts.forEach((g) => g.dispose());
  if (!merged) throw new Error('Failed to merge soldier webbing geometry');
  return merged;
}

type RenderedSoldier = {
  id: number;
  root: THREE.Group;
  model: THREE.Object3D;
  skinnedMeshes: THREE.SkinnedMesh[];
  mixer: THREE.AnimationMixer;
  actions: Record<'idle' | 'run' | 'walk', THREE.AnimationAction>;
  activeClip: 'idle' | 'run' | 'walk' | 'none';
  pose: Pose;
  targetX: number;
  targetZ: number;
  lastGroundX: number;
  lastGroundZ: number;
  groundY: number;
  fallTime: number;
  fellProne: boolean;
  settled: boolean;
  shadowActive: boolean;
  helmet: THREE.Mesh;
  throwingArm: THREE.Object3D | undefined;
  webbing: THREE.Mesh;
};

function disposeModel(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();

  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const material of meshMaterials) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });

  for (const texture of textures) texture.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function disposeInstanceSkeletons(root: THREE.Object3D): void {
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((object) => {
    if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
}

function chooseClip(
  clips: THREE.AnimationClip[],
  name: 'idle' | 'run' | 'walk',
): THREE.AnimationClip {
  const clip = clips.find((candidate) => candidate.name.toLowerCase() === name);
  if (!clip) throw new Error(`Soldier model is missing its ${name} animation.`);
  return clip;
}

/** Renders the simulated infantry as independently animated, rigged soldiers. */
export class InfantryRenderer {
  readonly ready: Promise<void>;

  private template: THREE.Object3D | null = null;
  private clips: Record<'idle' | 'run' | 'walk', THREE.AnimationClip> | null =
    null;
  private modelScale = 1;
  private modelFloor = 0;
  private instances = new Map<number, RenderedSoldier>();
  private helmetGeometry = new THREE.SphereGeometry(
    0.245,
    14,
    8,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.57,
  ).scale(1, 0.8, 1);
  private helmetMaterial = new THREE.MeshStandardMaterial({
    color: '#505a45',
    roughness: 0.7,
    metalness: 0.45,
    side: THREE.DoubleSide,
  });
  private gearGeometry = createMergedWebbingGeometry();
  private gearMaterial = new THREE.MeshStandardMaterial({
    color: '#8b8160',
    roughness: 1,
  });
  private helmetLocalPos = new THREE.Vector3(0, 0.15, 0);
  private helmetLocalQuat = new THREE.Quaternion();
  private helmetLocalScale = new THREE.Vector3(1, 1, 1);
  private webbingLocalPos = new THREE.Vector3();
  private webbingLocalQuat = new THREE.Quaternion();
  private webbingLocalScale = new THREE.Vector3(1, 1, 1);
  private skinnedBounds = new Map<string, THREE.Sphere>();
  private disposed = false;
  private lastBattleTime = Number.POSITIVE_INFINITY;

  constructor(private scene: THREE.Scene) {
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    if (this.disposed) {
      disposeModel(gltf.scene);
      return;
    }

    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height <= 0) {
      disposeModel(gltf.scene);
      throw new Error('Soldier model has invalid dimensions.');
    }

    try {
      this.clips = {
        idle: chooseClip(gltf.animations, 'idle'),
        run: chooseClip(gltf.animations, 'run'),
        walk: chooseClip(gltf.animations, 'walk'),
      };
    } catch (error) {
      disposeModel(gltf.scene);
      throw error;
    }

    this.modelScale = SOLDIER_HEIGHT / height;
    this.modelFloor = bounds.min.y;
    // Keep the rig and cloth surface detail, replace modern camouflage with field-grey wool.
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.name.toLowerCase().includes('visor')) {
        object.visible = false;
        return;
      }
      object.geometry.computeBoundingBox();
      const box = object.geometry.boundingBox!;
      const low = box.min.z,
        span = Math.max(0.001, box.max.z - low);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.roughness = 1;
        material.metalness = 0;
        material.normalScale.setScalar(0.22);
        material.onBeforeCompile = (shader) => {
          shader.vertexShader =
            'varying float vUniformHeight;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>\nvUniformHeight = (position.z - ${low.toFixed(5)}) / ${span.toFixed(5)};`,
          );
          shader.fragmentShader =
            'varying float vUniformHeight;\n' + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            float fabricDetail = clamp(dot(diffuseColor.rgb, vec3(.299,.587,.114)) * .38 + .64, .58, .96);
            vec3 fieldWool = vec3(.19,.225,.16) * fabricDetail;
            vec3 bootLeather = vec3(.075,.056,.04) * fabricDetail;
            float cloth = 1. - smoothstep(.80,.87,vUniformHeight);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(bootLeather, fieldWool, smoothstep(.12,.20,vUniformHeight)), cloth);
          `,
          );
        };
        material.customProgramCacheKey = () => 'wwii-field-uniform-v2';
      }
    });
    // Precompute bind-pose bone-local transforms and padded culling spheres once.
    const prevPos = gltf.scene.position.clone();
    const prevQuat = gltf.scene.quaternion.clone();
    const prevScale = gltf.scene.scale.clone();
    const scratchRoot = new THREE.Group();
    gltf.scene.scale.setScalar(this.modelScale);
    gltf.scene.position.set(0, -this.modelFloor * this.modelScale, 0);
    gltf.scene.rotation.set(0, Math.PI, 0);
    scratchRoot.add(gltf.scene);
    scratchRoot.updateMatrixWorld(true);
    let headBone: THREE.Object3D | undefined;
    let chestBone: THREE.Object3D | undefined;
    const identityQuat = new THREE.Quaternion();
    const unitScale = new THREE.Vector3(1, 1, 1);
    const rootSphere = new THREE.Sphere(new THREE.Vector3(0, 1.15, 0), 2.8);
    gltf.scene.traverse((object) => {
      if (object.name.endsWith('Head')) headBone = object;
      if (object.name.endsWith('Spine1')) chestBone = object;
      if (object instanceof THREE.SkinnedMesh) {
        const localSphere = rootSphere
          .clone()
          .applyMatrix4(object.matrixWorld.clone().invert());
        this.skinnedBounds.set(object.name, localSphere);
      }
    });
    if (headBone) {
      const worldPos = new THREE.Vector3().setFromMatrixPosition(
        headBone.matrixWorld,
      );
      worldPos.y += 0.15;
      const localMat = headBone.matrixWorld
        .clone()
        .invert()
        .multiply(
          new THREE.Matrix4().compose(worldPos, identityQuat, unitScale),
        );
      localMat.decompose(
        this.helmetLocalPos,
        this.helmetLocalQuat,
        this.helmetLocalScale,
      );
    }
    if (chestBone) {
      const worldPos = new THREE.Vector3().setFromMatrixPosition(
        chestBone.matrixWorld,
      );
      const localMat = chestBone.matrixWorld
        .clone()
        .invert()
        .multiply(
          new THREE.Matrix4().compose(worldPos, identityQuat, unitScale),
        );
      localMat.decompose(
        this.webbingLocalPos,
        this.webbingLocalQuat,
        this.webbingLocalScale,
      );
    }
    scratchRoot.remove(gltf.scene);
    gltf.scene.position.copy(prevPos);
    gltf.scene.quaternion.copy(prevQuat);
    gltf.scene.scale.copy(prevScale);
    this.template = gltf.scene;
  }

  private create(soldier: Infantry): RenderedSoldier | null {
    if (!this.template || !this.clips || this.disposed) return null;

    const root = new THREE.Group();
    root.name = `infantry-${soldier.id}`;
    const model = clone(this.template);
    model.scale.setScalar(this.modelScale);
    model.position.y = -this.modelFloor * this.modelScale;
    // The source model faces -Z. Infantry advance toward the pillbox along +Z.
    model.rotation.y = Math.PI;
    const skinnedMeshes: THREE.SkinnedMesh[] = [];
    const castShadow = soldier.z > DISTANT_SHADOW_Z;
    let throwingArm: THREE.Object3D | undefined;
    let chest: THREE.Object3D | undefined;
    let head: THREE.Object3D | undefined;
    model.traverse((object) => {
      object.userData.infantryId = soldier.id;
      if (object.name.endsWith('Head')) head = object;
      if (object.name.endsWith('Spine1')) chest = object;
      if (object.name.endsWith('RightArm')) throwingArm = object;
      if (object instanceof THREE.Mesh) {
        object.castShadow = castShadow;
        object.receiveShadow = true;
        if (object instanceof THREE.SkinnedMesh) {
          const cachedSphere = this.skinnedBounds.get(object.name);
          if (cachedSphere) {
            object.boundingSphere = cachedSphere.clone();
            object.frustumCulled = true;
          } else {
            object.frustumCulled = false;
          }
          skinnedMeshes.push(object);
        }
      }
    });
    root.add(model);
    const helmet = new THREE.Mesh(this.helmetGeometry, this.helmetMaterial);
    helmet.castShadow = castShadow;
    helmet.userData.infantryId = soldier.id;
    if (head) {
      helmet.position.copy(this.helmetLocalPos);
      helmet.quaternion.copy(this.helmetLocalQuat);
      helmet.scale.copy(this.helmetLocalScale);
      head.add(helmet);
    } else {
      root.add(helmet);
    }
    const webbing = new THREE.Mesh(this.gearGeometry, this.gearMaterial);
    webbing.castShadow = false;
    webbing.userData.infantryId = soldier.id;
    if (chest) {
      webbing.position.copy(this.webbingLocalPos);
      webbing.quaternion.copy(this.webbingLocalQuat);
      webbing.scale.copy(this.webbingLocalScale);
      chest.add(webbing);
    } else {
      root.add(webbing);
    }
    const groundY =
      (soldier.landingCraftId !== undefined
        ? landingDeckHeight(soldier.z, soldier.x)
        : beachHeight(soldier.x, soldier.z)) + 0.02;
    root.position.set(soldier.x, groundY, soldier.z);
    this.scene.add(root);

    const mixer = new THREE.AnimationMixer(model);
    const actions = {
      idle: mixer.clipAction(this.clips.idle),
      run: mixer.clipAction(this.clips.run),
      walk: mixer.clipAction(this.clips.walk),
    };
    actions.idle.setEffectiveWeight(0);
    actions.walk.setEffectiveWeight(0);
    actions.run.setEffectiveWeight(1).play();
    actions.run.time = (soldier.id * 0.417) % this.clips.run.duration;

    const instance: RenderedSoldier = {
      id: soldier.id,
      root,
      model,
      skinnedMeshes,
      mixer,
      actions,
      activeClip: 'run',
      pose: 'run',
      targetX: soldier.x,
      targetZ: soldier.z,
      lastGroundX: soldier.x,
      lastGroundZ: soldier.z,
      groundY,
      fallTime: 0,
      fellProne: false,
      settled: false,
      shadowActive: castShadow,
      helmet,
      throwingArm,
      webbing,
    };
    this.instances.set(soldier.id, instance);
    return instance;
  }

  private remove(instance: RenderedSoldier): void {
    instance.mixer.stopAllAction();
    instance.mixer.uncacheRoot(instance.model);
    disposeInstanceSkeletons(instance.model);
    instance.root.removeFromParent();
    this.instances.delete(instance.id);
  }

  private clear(): void {
    for (const instance of this.instances.values()) this.remove(instance);
  }

  private setPose(instance: RenderedSoldier, pose: Pose): void {
    if (instance.pose === pose) return;
    if (pose === 'down') instance.fellProne = instance.pose === 'crawl';
    instance.pose = pose;
    const { idle, run, walk } = instance.actions;

    if (pose === 'run') {
      instance.activeClip = 'run';
      idle.fadeOut(0.16);
      walk.fadeOut(0.16);
      run.reset().setEffectiveWeight(1).fadeIn(0.16).play();
      return;
    }

    if (pose === 'crawl') {
      instance.activeClip = 'walk';
      run.fadeOut(0.25);
      idle.fadeOut(0.25);
      walk.reset().setEffectiveWeight(1).fadeIn(0.25).play();
      return;
    }

    if (pose === 'cover' || pose === 'dugout' || pose === 'peek') {
      instance.activeClip = 'idle';
      run.fadeOut(0.14);
      walk.fadeOut(0.14);
      idle.reset().setEffectiveWeight(1).fadeIn(0.14).play();
      return;
    }

    // Freeze the current stride and settle from it, without snapping to an idle pose.
    instance.activeClip = 'none';
    instance.fallTime = 0;
    instance.settled = false;
    instance.helmet.visible = false;
  }

  render(battle: PillboxBattle, dt: number, _reducedMotion: boolean): void {
    if (this.disposed || !this.template) return;
    if (battle.time + 1e-6 < this.lastBattleTime) this.clear();
    this.lastBattleTime = battle.time;

    const active = battle.soldiers
      .filter(
        (soldier) => soldier.phase === 'advance' || soldier.phase === 'cover',
      )
      .sort((a, b) => b.z - a.z)
      .slice(0, MAX_ACTIVE);
    const corpses = battle.soldiers
      .filter((soldier) => soldier.phase === 'down')
      .slice(-MAX_CORPSES);
    const visible = [...active, ...corpses].slice(0, MAX_VISIBLE);
    const desiredIds = new Set(visible.map((soldier) => soldier.id));

    for (const instance of this.instances.values()) {
      if (!desiredIds.has(instance.id)) this.remove(instance);
    }

    const frameDt = Number.isFinite(dt) ? THREE.MathUtils.clamp(dt, 0, 0.1) : 0;
    for (const soldier of visible) {
      const instance = this.instances.get(soldier.id) ?? this.create(soldier);
      if (!instance) continue;

      const pose: Pose =
        soldier.phase === 'down'
          ? 'down'
          : soldier.foxholeId !== undefined
            ? soldier.exposed
              ? 'peek'
              : 'dugout'
            : soldier.crawling
              ? 'crawl'
              : soldier.phase === 'cover' ||
                  soldier.supporting ||
                  soldier.emplacement ||
                  soldier.grenadeState === 'windup' ||
                  soldier.smokeState === 'windup'
                ? 'cover'
                : 'run';
      this.setPose(instance, pose);

      const wantShadow = soldier.z > DISTANT_SHADOW_Z && pose !== 'down';
      if (wantShadow !== instance.shadowActive) {
        instance.shadowActive = wantShadow;
        instance.helmet.castShadow = wantShadow;
        for (const m of instance.skinnedMeshes) m.castShadow = wantShadow;
      }

      if (pose === 'down' && instance.settled) continue;

      const dx = soldier.x - instance.targetX,
        dz = soldier.z - instance.targetZ;
      if (soldier.phase === 'advance' && Math.hypot(dx, dz) > 0.0001) {
        const heading = Math.atan2(dx, dz);
        const delta = Math.atan2(
          Math.sin(heading - instance.root.rotation.y),
          Math.cos(heading - instance.root.rotation.y),
        );
        instance.root.rotation.y += delta * (1 - Math.exp(-frameDt * 10));
      }
      instance.targetX = soldier.x;
      instance.targetZ = soldier.z;
      if (frameDt > 0) {
        const positionBlend = 1 - Math.exp(-frameDt * 20);
        instance.root.position.x = THREE.MathUtils.lerp(
          instance.root.position.x,
          soldier.x,
          positionBlend,
        );
        instance.root.position.z = THREE.MathUtils.lerp(
          instance.root.position.z,
          soldier.z,
          positionBlend,
        );
        if (
          Math.abs(instance.root.position.x - instance.lastGroundX) > 1e-4 ||
          Math.abs(instance.root.position.z - instance.lastGroundZ) > 1e-4
        ) {
          instance.lastGroundX = instance.root.position.x;
          instance.lastGroundZ = instance.root.position.z;
          instance.groundY =
            (soldier.landingCraftId !== undefined
              ? landingDeckHeight(
                  instance.root.position.z,
                  instance.root.position.x,
                )
              : beachHeight(
                  instance.root.position.x,
                  instance.root.position.z,
                )) + 0.02;
        }
        instance.root.position.y = instance.groundY;
      }

      const blend = 1 - Math.exp(-frameDt * 12);
      const base = -this.modelFloor * this.modelScale;
      if (pose === 'down') {
        instance.fallTime += frameDt;
        const reaction = deathPose(soldier.id, instance.fallTime);
        if (instance.fellProne) {
          // A soldier already on the ground settles in place instead of standing to fall.
          reaction.pitch = 1.45 + reaction.pitch * 0.06;
          reaction.roll *= 0.12;
          reaction.height = 0.18 + reaction.height * 0.2;
          reaction.shift = -0.9 + reaction.shift * 0.2;
          reaction.yaw *= 0.15;
        }
        instance.model.position.y = THREE.MathUtils.lerp(
          instance.model.position.y,
          base + reaction.height,
          blend,
        );
        instance.model.rotation.x = THREE.MathUtils.lerp(
          instance.model.rotation.x,
          reaction.pitch,
          blend,
        );
        instance.model.rotation.z = reaction.roll;
        instance.model.rotation.y = Math.PI + reaction.yaw;
        instance.model.position.z = THREE.MathUtils.lerp(
          instance.model.position.z,
          reaction.shift,
          blend,
        );
        if (
          instance.fallTime > 2.2 &&
          Math.hypot(
            instance.root.position.x - soldier.x,
            instance.root.position.z - soldier.z,
          ) < 0.005
        ) {
          instance.settled = true;
        }
        continue;
      }

      instance.model.position.y = THREE.MathUtils.lerp(
        instance.model.position.y,
        base +
          (pose === 'crawl'
            ? 0.18
            : pose === 'peek'
              ? 0.45
              : pose === 'dugout'
                ? -0.75
                : pose === 'cover'
                  ? -0.35
                  : 0),
        blend,
      );
      instance.model.rotation.x = THREE.MathUtils.lerp(
        instance.model.rotation.x,
        pose === 'crawl'
          ? 1.45
          : pose === 'dugout'
            ? 0.3
            : pose === 'cover'
              ? 0.18
              : 0,
        blend,
      );
      instance.model.rotation.z = 0;
      instance.model.rotation.y = Math.PI;
      instance.model.position.z = THREE.MathUtils.lerp(
        instance.model.position.z,
        pose === 'crawl' ? -0.9 : 0,
        blend,
      );
      instance.actions.run.setEffectiveTimeScale(
        (soldier.speed / 4.2) *
          ((soldier.rushUntil ?? 0) > battle.time ? 1.25 : 1),
      );
      instance.actions.walk.setEffectiveTimeScale(
        soldier.phase === 'cover' ? 0 : 0.65,
      );
      if (frameDt > 0) {
        instance.mixer.update(frameDt);
        for (const clipName of ['idle', 'run', 'walk'] as const) {
          if (clipName === instance.activeClip) continue;
          const action = instance.actions[clipName];
          if (action.isRunning() && action.getEffectiveWeight() <= 0.001) {
            action.stop();
          }
        }
      }
      if (
        soldier.phase === 'advance' &&
        (soldier.grenadeState === 'windup' ||
          soldier.smokeState === 'windup') &&
        instance.throwingArm
      ) {
        instance.throwingArm.rotation.z -=
          Math.sin(
            Math.min(
              1,
              soldier.smokeState === 'windup'
                ? (soldier.smokeTimer ?? 0) / 1.1
                : soldier.grenadeTimer / 1.4,
            ) *
              Math.PI *
              0.8,
          ) * 1.8;
      }
    }
  }

  pick(raycaster: THREE.Raycaster): { x: number; z: number } | null {
    if (this.disposed) return null;
    let nearest = Infinity;
    let picked: RenderedSoldier | null = null;
    for (const instance of this.instances.values()) {
      const distance = intersectInfantryHitbox(
        raycaster.ray,
        instance.root.position.x,
        instance.root.position.y,
        instance.root.position.z,
        instance.root.rotation.y,
        instance.pose,
      );
      if (distance !== null && distance < nearest) {
        nearest = distance;
        picked = instance;
      }
    }
    return picked ? { x: picked.targetX, z: picked.targetZ } : null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    if (this.template) disposeModel(this.template);
    this.template = null;
    this.clips = null;
    this.helmetGeometry.dispose();
    this.helmetMaterial.dispose();
    this.gearGeometry.dispose();
    this.gearMaterial.dispose();
  }
}
