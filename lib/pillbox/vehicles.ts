import { beachHeight } from './terrain';
import * as THREE from 'three';
import { GRENADE_FLIGHT, type PillboxBattle } from './types';

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
  private box = this.geo(new THREE.BoxGeometry(1, 1, 1));
  private wheel = this.geo(new THREE.CylinderGeometry(0.48, 0.48, 0.3, 16));
  private helmet = this.geo(
    new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  );
  private grenadeGeo = this.geo(new THREE.SphereGeometry(0.18, 8, 6));
  constructor(private scene: THREE.Scene) {}
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
  private part(
    parent: THREE.Object3D,
    size: number[],
    p: number[],
    mat: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(this.box, mat);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(p[0], p[1], p[2]);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private create(id: number, x: number, z: number) {
    const root = new THREE.Group();
    root.name = `reinforcement-jeep-${id}`;
    this.part(root, [1.8, 0.3, 3.7], [0, 0.65, 0], this.body);
    this.part(root, [1.7, 0.6, 1.2], [0, 1.05, 1.1], this.body); // flat hood
    for (const side of [-1, 1]) {
      this.part(root, [0.12, 0.6, 1.9], [side * 0.85, 1.05, -0.65], this.body);
      this.part(root, [0.45, 0.12, 3], [side * 0.85, 0.98, 0], this.body);
      this.part(root, [0.055, 0.95, 0.06], [side * 0.76, 1.9, 0.4], this.metal);
    }
    this.part(root, [1.5, 0.85, 0.035], [0, 1.9, 0.4], this.glass);
    this.part(root, [1.65, 0.07, 0.08], [0, 2.35, 0.4], this.metal);
    this.part(root, [1.7, 0.65, 0.12], [0, 1, -1.7], this.body);
    for (const z of [-0.95, -0.15]) {
      this.part(root, [1.35, 0.18, 0.55], [0, 1, z], this.canvas);
      this.part(root, [1.35, 0.5, 0.12], [0, 1.3, z - 0.25], this.canvas);
    }
    this.part(root, [2, 0.15, 0.17], [0, 0.65, 1.94], this.metal);
    for (let i = 0; i < 7; i++)
      this.part(
        root,
        [0.075, 0.4, 0.03],
        [-0.5 + i * 0.165, 1, 1.73],
        this.tire,
      );
    for (const side of [-1, 1])
      this.part(root, [0.22, 0.22, 0.06], [side * 0.7, 1.1, 1.75], this.canvas);
    const wheels: THREE.Mesh[] = [];
    for (const x of [-1, 1])
      for (const z of [-1.2, 1.1]) {
        const wheel = new THREE.Mesh(this.wheel, this.tire);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.5, z);
        wheel.castShadow = true;
        root.add(wheel);
        wheels.push(wheel);
        this.part(root, [0.32, 0.2, 0.2], [x, 0.5, z], this.metal);
      }
    const spare = new THREE.Mesh(this.wheel, this.tire);
    spare.rotation.x = Math.PI / 2;
    spare.position.set(0, 1.25, -1.95);
    root.add(spare);
    const crew = new THREE.Group();
    root.add(crew);
    for (const x of [-0.4, 0.4])
      for (const z of [-0.2, -1]) {
        this.part(crew, [0.32, 0.55, 0.25], [x, 1.55, z], this.canvas);
        const head = new THREE.Mesh(this.helmet, this.body);
        head.position.set(x, 1.97, z);
        crew.add(head);
      }
    root.traverse((o) => {
      o.userData.jeepId = id;
    });
    root.position.set(x, 0, z);
    this.scene.add(root);
    const value = { root, wheels, crew, x, z };
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
      if (jeep.phase === 'wreck')
        v.root.traverse((o) => {
          if (o instanceof THREE.Mesh) o.material = this.tire;
        });
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
      const t = Math.min(1, g.age / GRENADE_FLIGHT);
      m.position.set(
        g.x * (1 - t),
        1.7 * (1 - t) + Math.sin(Math.PI * t) * 9,
        g.z * (1 - t) + 2 * t,
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
