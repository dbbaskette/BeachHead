import { beachHeight } from './terrain';
import { assetUrl } from '../asset-url';
import { deathPose } from './death-pose';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { Infantry, PillboxBattle } from './types';

const MODEL_URL = assetUrl('/models/Soldier.glb');
const SOLDIER_HEIGHT = 2.3;
const MAX_ACTIVE = 48;
const MAX_CORPSES = 18;
const MAX_VISIBLE = 66;

type Pose = 'run' | 'cover' | 'down';

type RenderedSoldier = {
  id: number;
  root: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<'idle' | 'run' | 'walk', THREE.AnimationAction>;
  pose: Pose;
  targetX: number;
  targetZ: number;
  fallTime: number;
  head: THREE.Object3D | undefined;
  helmet: THREE.Mesh;
  chest: THREE.Object3D | undefined;
  throwingArm: THREE.Object3D | undefined;
  webbing: THREE.Group;
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
  private pickBounds = new THREE.Box3();
  private pickCenter = new THREE.Vector3();
  private helmetGeometry = new THREE.SphereGeometry(
    0.245,
    14,
    8,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.57,
  );
  private helmetMaterial = new THREE.MeshStandardMaterial({
    color: '#505a45',
    roughness: 0.7,
    metalness: 0.45,
    side: THREE.DoubleSide,
  });
  private gearGeometry = new THREE.BoxGeometry(1, 1, 1);
  private gearMaterial = new THREE.MeshStandardMaterial({
    color: '#8b8160',
    roughness: 1,
  });
  private headPosition = new THREE.Vector3();
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
        material.normalScale.setScalar(0.55);
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
            float fabricDetail = clamp(dot(diffuseColor.rgb, vec3(.299,.587,.114)) * .55 + .55, .5, 1.);
            vec3 fieldWool = vec3(.19,.225,.16) * fabricDetail;
            vec3 bootLeather = vec3(.075,.056,.04) * fabricDetail;
            float cloth = 1. - smoothstep(.80,.87,vUniformHeight);
            diffuseColor.rgb = mix(diffuseColor.rgb, mix(bootLeather, fieldWool, smoothstep(.12,.20,vUniformHeight)), cloth);
          `,
          );
        };
        material.customProgramCacheKey = () => 'wwii-field-uniform-v1';
      }
    });
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
    model.traverse((object) => {
      object.userData.infantryId = soldier.id;
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        // Cached bind-pose bounds do not contain every animated limb position.
        // Picking refreshes SkinnedMesh bounds on demand below.
        if (object instanceof THREE.SkinnedMesh) object.frustumCulled = false;
      }
    });
    root.add(model);
    const helmet = new THREE.Mesh(this.helmetGeometry, this.helmetMaterial);
    helmet.scale.y = 0.8;
    helmet.castShadow = true;
    helmet.userData.infantryId = soldier.id;
    root.add(helmet);
    const webbing = new THREE.Group();
    for (const [x, y, z, w, h, d] of [
      [-0.16, 0, 0.18, 0.055, 0.5, 0.035],
      [0.16, 0, 0.18, 0.055, 0.5, 0.035],
      [0, -0.22, 0.17, 0.49, 0.065, 0.07],
      [-0.18, -0.15, 0.24, 0.14, 0.15, 0.1],
      [0.18, -0.15, 0.24, 0.14, 0.15, 0.1],
      [0, 0, -0.2, 0.35, 0.4, 0.15],
    ]) {
      const part = new THREE.Mesh(this.gearGeometry, this.gearMaterial);
      part.position.set(x, y, z);
      part.scale.set(w, h, d);
      part.castShadow = true;
      part.userData.infantryId = soldier.id;
      webbing.add(part);
    }
    root.add(webbing);
    let throwingArm: THREE.Object3D | undefined;
    let chest: THREE.Object3D | undefined;
    let head: THREE.Object3D | undefined;
    model.traverse((o) => {
      if (o.name.endsWith('Head')) head = o;
      if (o.name.endsWith('Spine1')) chest = o;
      if (o.name.endsWith('RightArm')) throwingArm = o;
    });
    root.position.set(
      soldier.x,
      beachHeight(soldier.x, soldier.z) + 0.02,
      soldier.z,
    );
    this.scene.add(root);

    const mixer = new THREE.AnimationMixer(model);
    const actions = {
      idle: mixer.clipAction(this.clips.idle),
      run: mixer.clipAction(this.clips.run),
      walk: mixer.clipAction(this.clips.walk),
    };
    for (const action of Object.values(actions)) action.play();
    actions.idle.setEffectiveWeight(0);
    actions.walk.setEffectiveWeight(0);
    actions.run.setEffectiveWeight(1);
    actions.run.time = (soldier.id * 0.417) % this.clips.run.duration;

    const instance: RenderedSoldier = {
      id: soldier.id,
      root,
      model,
      mixer,
      actions,
      pose: 'run',
      targetX: soldier.x,
      targetZ: soldier.z,
      fallTime: 0,
      head,
      helmet,
      chest,
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
    instance.pose = pose;
    const { idle, run, walk } = instance.actions;

    if (pose === 'run') {
      idle.fadeOut(0.16);
      walk.fadeOut(0.16);
      run.reset().setEffectiveWeight(1).fadeIn(0.16).play();
      return;
    }

    if (pose === 'cover') {
      run.fadeOut(0.14);
      walk.fadeOut(0.14);
      idle.reset().setEffectiveWeight(1).fadeIn(0.14).play();
      return;
    }

    // Freeze the current stride and settle from it, without snapping to an idle pose.
    instance.fallTime = 0;
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

      instance.root.position.y =
        beachHeight(instance.root.position.x, instance.root.position.z) + 0.02;
      const pose: Pose =
        soldier.phase === 'down'
          ? 'down'
          : soldier.phase === 'cover' || soldier.grenadeState === 'windup'
            ? 'cover'
            : 'run';
      this.setPose(instance, pose);
      if (pose === 'down') instance.fallTime += frameDt;
      const reaction = deathPose(soldier.id, instance.fallTime);
      const blend = 1 - Math.exp(-frameDt * 12);
      const base = -this.modelFloor * this.modelScale;
      instance.model.position.y = THREE.MathUtils.lerp(
        instance.model.position.y,
        base +
          (pose === 'cover' ? -0.35 : pose === 'down' ? reaction.height : 0),
        blend,
      );
      instance.model.rotation.x = THREE.MathUtils.lerp(
        instance.model.rotation.x,
        pose === 'cover' ? 0.18 : pose === 'down' ? reaction.pitch : 0,
        blend,
      );
      instance.model.rotation.z = pose === 'down' ? reaction.roll : 0;
      instance.model.rotation.y =
        Math.PI + (pose === 'down' ? reaction.yaw : 0);
      instance.model.position.z = pose === 'down' ? reaction.shift : 0;
      instance.actions.run.setEffectiveTimeScale(soldier.speed / 4.2);
      // Pausing freezes both locomotion and death reactions.
      if (pose !== 'down') instance.mixer.update(frameDt);
      if (
        soldier.phase === 'advance' &&
        soldier.grenadeState === 'windup' &&
        instance.throwingArm
      ) {
        instance.throwingArm.rotation.z -=
          Math.sin(Math.min(1, soldier.grenadeTimer / 1.4) * Math.PI * 0.8) *
          1.8;
      }
      if (instance.chest) {
        instance.root.updateWorldMatrix(true, true);
        instance.chest.getWorldPosition(this.headPosition);
        instance.root.worldToLocal(this.headPosition);
        instance.webbing.position.copy(this.headPosition);
        instance.webbing.rotation.set(
          instance.model.rotation.x,
          -reaction.yaw,
          instance.model.rotation.z,
        );
      }
      if (instance.head && instance.helmet.visible) {
        instance.root.updateWorldMatrix(true, true);
        instance.head.getWorldPosition(this.headPosition);
        instance.root.worldToLocal(this.headPosition);
        instance.helmet.position
          .copy(this.headPosition)
          .add(new THREE.Vector3(0, 0.15, 0));
      }
    }
  }

  pick(raycaster: THREE.Raycaster): { x: number; z: number } | null {
    if (this.disposed) return null;
    const roots = [...this.instances.values()]
      .filter((instance) => instance.pose !== 'down')
      .filter((instance) => {
        instance.root.getWorldPosition(this.pickCenter);
        const { x, y, z } = this.pickCenter;
        this.pickBounds.min.set(x - 3, y - 1, z - 3);
        this.pickBounds.max.set(x + 3, y + 5, z + 3);
        return raycaster.ray.intersectsBox(this.pickBounds);
      })
      .map((instance) => instance.root);
    for (const root of roots) {
      root.updateWorldMatrix(true, true);
      const updatedSkeletons = new Set<THREE.Skeleton>();
      root.traverse((object) => {
        if (!(object instanceof THREE.SkinnedMesh)) return;
        if (!updatedSkeletons.has(object.skeleton)) {
          object.skeleton.update();
          updatedSkeletons.add(object.skeleton);
        }
        object.computeBoundingBox();
        object.computeBoundingSphere();
      });
    }
    const hit = raycaster.intersectObjects(roots, true)[0];
    if (!hit) return null;
    const id = hit.object.userData.infantryId as number | undefined;
    const instance = id === undefined ? undefined : this.instances.get(id);
    return instance ? { x: instance.targetX, z: instance.targetZ } : null;
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
