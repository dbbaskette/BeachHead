import { beachHeight } from './terrain';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { grenadeFlight, grenadeImpactPoint, type PillboxBattle } from './types';

/** Small, bounded set of detailed utility vehicles and airborne grenades. */
export class VehicleRenderer {
  private jeeps = new Map<
    number,
    {
      root: THREE.Group;
      wheels: THREE.Mesh[];
      crew: THREE.Group;
      x: number;
      z: number;
      wrecked: boolean;
    }
  >();
  private grenades = new Map<number, THREE.Mesh>();
  private geometry: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private time = Infinity;
  private body = this.material('#586048');
  private tire = this.material('#242723');
  private canvas = this.material('#8c8261');
  private metal = this.material('#383e39');
  private glass = this.material('#9cb6b2', 0.4);
  private box = new THREE.BoxGeometry(1, 1, 1);
  private wheel = this.geo(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 16));
  private helmet = new THREE.SphereGeometry(
    0.22,
    10,
    6,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.55,
  );
  private grenadeGeo = this.geo(new THREE.SphereGeometry(0.18, 8, 6));
  private bodyTemplate: THREE.Group;
  private crewTemplate: THREE.Group;
  constructor(private scene: THREE.Scene) {
    this.bodyTemplate = this.buildBodyTemplate();
    this.crewTemplate = this.buildCrewTemplate();
    this.box.dispose();
    this.helmet.dispose();
  }
  private mergeGroup(source: THREE.Group) {
    const merged = new THREE.Group();
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of source.children) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material))
        continue;
      child.updateMatrix();
      const raw = child.geometry;
      const g = (raw.index ? raw.toNonIndexed() : raw.clone()).applyMatrix4(
        child.matrix,
      );
      const list = batches.get(child.material) ?? [];
      list.push(g);
      batches.set(child.material, list);
    }
    for (const [mat, geos] of batches) {
      const geo = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!geo) continue;
      const mesh = new THREE.Mesh(this.geo(geo), mat);
      const opaque = !mat.transparent;
      mesh.castShadow = opaque;
      mesh.receiveShadow = opaque;
      merged.add(mesh);
    }
    return merged;
  }
  private buildBodyTemplate() {
    const root = new THREE.Group();
    const addBox = (size: number[], p: number[], mat: THREE.Material) => {
      const mesh = new THREE.Mesh(this.box, mat);
      mesh.scale.set(size[0], size[1], size[2]);
      mesh.position.set(p[0], p[1], p[2]);
      root.add(mesh);
    };
    addBox([1.8, 0.3, 3.7], [0, 0.65, 0], this.body);
    addBox([1.7, 0.6, 1.2], [0, 1.05, 1.1], this.body);
    for (const side of [-1, 1]) {
      addBox([0.12, 0.6, 1.9], [side * 0.85, 1.05, -0.65], this.body);
      addBox([0.45, 0.12, 3], [side * 0.85, 0.98, 0], this.body);
      addBox([0.055, 0.95, 0.06], [side * 0.76, 1.9, 0.4], this.metal);
    }
    addBox([1.5, 0.85, 0.035], [0, 1.9, 0.4], this.glass);
    addBox([1.65, 0.07, 0.08], [0, 2.35, 0.4], this.metal);
    addBox([1.7, 0.65, 0.12], [0, 1, -1.7], this.body);
    for (const z of [-0.95, -0.15]) {
      addBox([1.35, 0.18, 0.55], [0, 1, z], this.canvas);
      addBox([1.35, 0.5, 0.12], [0, 1.3, z - 0.25], this.canvas);
    }
    addBox([2, 0.15, 0.17], [0, 0.65, 1.94], this.metal);
    for (let i = 0; i < 7; i++)
      addBox([0.075, 0.4, 0.03], [-0.5 + i * 0.165, 1, 1.73], this.tire);
    for (const side of [-1, 1])
      addBox([0.22, 0.22, 0.06], [side * 0.7, 1.1, 1.75], this.canvas);
    for (const x of [-1, 1])
      for (const z of [-1.2, 1.1])
        addBox([0.32, 0.2, 0.2], [x, 0.5, z], this.metal);
    const spare = new THREE.Mesh(this.wheel, this.tire);
    spare.rotation.x = Math.PI / 2;
    spare.position.set(0, 1.25, -1.95);
    root.add(spare);
    return this.mergeGroup(root);
  }
  private buildCrewTemplate() {
    const crew = new THREE.Group();
    for (const x of [-0.4, 0.4])
      for (const z of [-0.2, -1]) {
        const torso = new THREE.Mesh(this.box, this.canvas);
        torso.scale.set(0.32, 0.55, 0.25);
        torso.position.set(x, 1.55, z);
        crew.add(torso);
        const head = new THREE.Mesh(this.helmet, this.body);
        head.position.set(x, 1.97, z);
        crew.add(head);
      }
    return this.mergeGroup(crew);
  }
  private material(color: string, opacity = 1) {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      transparent: opacity < 1,
      opacity,
    });
    this.materials.push(m);
    return m;
  }
  private geo<T extends THREE.BufferGeometry>(g: T): T {
    this.geometry.push(g);
    return g;
  }
  private create(id: number, x: number, z: number) {
    const root = this.bodyTemplate.clone();
    root.name = `reinforcement-jeep-${id}`;
    const wheels: THREE.Mesh[] = [];
    for (const wx of [-1, 1])
      for (const wz of [-1.2, 1.1]) {
        const wheel = new THREE.Mesh(this.wheel, this.tire);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(wx, 0.5, wz);
        wheel.castShadow = true;
        root.add(wheel);
        wheels.push(wheel);
      }
    const crew = this.crewTemplate.clone();
    root.add(crew);
    root.traverse((o) => {
      o.userData.jeepId = id;
    });
    root.position.set(x, 0, z);
    this.scene.add(root);
    const value = { root, wheels, crew, x, z, wrecked: false };
    this.jeeps.set(id, value);
    return value;
  }
  render(battle: PillboxBattle, dt: number) {
    if (battle.time < this.time) this.clear();
    this.time = battle.time;
    const desired = new Set(
      battle.jeeps.filter((j) => j.phase !== 'gone').map((j) => j.id),
    );
    for (const [id, v] of this.jeeps)
      if (!desired.has(id)) {
        v.root.removeFromParent();
        this.jeeps.delete(id);
      }
    for (const jeep of battle.jeeps) {
      if (jeep.phase === 'gone') continue;
      const v = this.jeeps.get(jeep.id) ?? this.create(jeep.id, jeep.x, jeep.z);
      const dx = jeep.x - v.x,
        dz = jeep.z - v.z,
        distance = Math.hypot(dx, dz);
      if (distance > 0.001) {
        const direction = jeep.phase === 'leaving' ? -1 : 1;
        const target = Math.atan2(dx * direction, dz * direction),
          delta = Math.atan2(
            Math.sin(target - v.root.rotation.y),
            Math.cos(target - v.root.rotation.y),
          );
        v.root.rotation.y += delta * (1 - Math.exp(-dt * 9));
      }
      v.root.position.set(
        jeep.x,
        beachHeight(jeep.x, jeep.z) +
          (jeep.phase === 'wreck'
            ? -0.2
            : Math.sin(battle.time * 18 + jeep.id) * 0.025),
        jeep.z,
      );
      v.root.rotation.z = jeep.phase === 'wreck' ? 0.18 : 0;
      if (jeep.phase === 'wreck' && !v.wrecked) {
        v.wrecked = true;
        v.root.traverse((o) => {
          if (o instanceof THREE.Mesh) o.material = this.tire;
        });
      }
      v.crew.visible = jeep.passengers > 0 && jeep.phase !== 'wreck';
      v.root.userData.targetable =
        jeep.phase === 'driving' || jeep.phase === 'unloading';
      for (const w of v.wheels) w.rotation.x += distance / 0.48;
      v.x = jeep.x;
      v.z = jeep.z;
    }
    const live = new Set(battle.grenades.map((g) => g.id));
    for (const [id, m] of this.grenades)
      if (!live.has(id)) {
        m.removeFromParent();
        this.grenades.delete(id);
      }
    for (const g of battle.grenades) {
      let m = this.grenades.get(g.id);
      if (!m) {
        m = new THREE.Mesh(this.grenadeGeo, this.metal);
        this.scene.add(m);
        this.grenades.set(g.id, m);
      }
      const t = Math.min(1, g.age / grenadeFlight(g));
      const impact = grenadeImpactPoint(g.id);
      m.position.set(
        g.x * (1 - t) + impact.x * t,
        1.7 * (1 - t) + Math.sin(Math.PI * t) * (g.kind === 'mortar' ? 35 : 9),
        g.z * (1 - t) + impact.z * t,
      );
      m.rotation.set(t * 15, t * 8, 0);
    }
  }
  pick(raycaster: THREE.Raycaster) {
    const roots = [...this.jeeps.values()]
      .filter((v) => v.root.userData.targetable)
      .map((v) => v.root);
    roots.forEach((r) => r.updateWorldMatrix(true, true));
    const hit = raycaster.intersectObjects(roots, true)[0];
    const v = hit ? this.jeeps.get(hit.object.userData.jeepId) : undefined;
    return v ? { x: v.x, z: v.z } : null;
  }
  private clear() {
    for (const v of this.jeeps.values()) v.root.removeFromParent();
    this.jeeps.clear();
    for (const m of this.grenades.values()) m.removeFromParent();
    this.grenades.clear();
  }
  dispose() {
    this.clear();
    this.geometry.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
