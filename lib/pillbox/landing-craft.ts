import { RAMP_LENGTH, RAMP_ANGLE } from './landings';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Infantry, PillboxBattle } from './types';

/** Render-only seated passengers reuse the detailed infantry rig and leave no combat targets. */
export function embarkedInfantry(battle: PillboxBattle): Infantry[] {
  return battle.landingCraft.flatMap((craft) =>
    Array.from({ length: craft.passengers }, (_, i) => {
      const slot = craft.capacity - craft.passengers + i;
      return {
        id: 5000 + craft.id * 10 + slot,
        x: craft.x + (slot % 2 ? 0.85 : -0.85),
        z: craft.z + 1 - Math.floor(slot / 2) * 1.35,
        lane: craft.lane,
        landingCraftId: craft.id,
        health: 2,
        phase: 'cover' as const,
        timer: 0,
        coverIndex: 0,
        waypoint: 0,
        offset: 0,
        speed: 0,
        grenadeState: 'ready' as const,
        grenadeTimer: 0,
      };
    }),
  );
}
export class LandingCraftRenderer {
  private craft = new Map<
    number,
    { root: THREE.Group; ramp: THREE.Group; wake: THREE.Mesh }
  >();
  private template: THREE.Group;
  private paint: THREE.MeshStandardMaterial;
  private rampTemplate: THREE.Group;
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private disposed = false;
  constructor(
    private scene: THREE.Scene,
    map?: THREE.Texture,
  ) {
    const material = (m: THREE.Material) => {
      this.materials.add(m);
      return m;
    };
    this.paint = new THREE.MeshStandardMaterial({
      color: '#78817a',
      map: map ?? null,
      roughness: 0.64,
      metalness: 0.38,
    });
    material(this.paint);
    const dark = material(
      new THREE.MeshStandardMaterial({
        color: '#272d2c',
        roughness: 0.74,
        metalness: 0.28,
      }),
    );
    const wood = material(
      new THREE.MeshStandardMaterial({
        color: '#625744',
        map: map ?? null,
        roughness: 0.88,
      }),
    );
    const rope = material(
      new THREE.MeshStandardMaterial({ color: '#92846b', roughness: 1 }),
    );
    const body = new THREE.Group(),
      ramp = new THREE.Group();
    const add = (
      group: THREE.Group,
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      p: [number, number, number],
      rotation?: [number, number, number],
    ) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...p);
      if (rotation) mesh.rotation.set(...rotation);
      group.add(mesh);
      return mesh;
    };
    const box = (
      g: THREE.Group,
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
    ) => add(g, new RoundedBoxGeometry(w, h, d, 2, 0.06), mat, [x, y, z]);
    box(body, 4.8, 0.5, 12, this.paint, 0, 0.1, 0);
    box(body, 4.2, 0.18, 10.8, dark, 0, 0.63, 0.1);
    for (const x of [-2.25, 2.25]) {
      box(body, 0.32, 1.65, 12, this.paint, x, 1.08, 0);
      box(body, 0.45, 0.12, 12.1, dark, x, 1.94, 0);
      box(body, 0.62, 0.16, 6.8, wood, x * 0.66, 1, -0.3);
      for (const z of [-5, -2, 1, 4])
        box(body, 0.16, 1.25, 0.12, dark, x * 0.92, 1.05, z);
      for (const z of [-4.7, 3.8]) {
        add(body, new Cylinder(0.065, 0.065, 0.4, 8), dark, [x, 2.12, z]);
        box(body, 0.5, 0.08, 0.09, dark, x, 2.31, z);
      }
      add(
        body,
        new THREE.TorusGeometry(0.38, 0.05, 6, 20),
        rope,
        [x * 0.72, 0.79, -3.3],
        [Math.PI / 2, 0, 0],
      );
    }
    box(body, 4.8, 1.65, 0.32, this.paint, 0, 1.08, -5.9);
    box(body, 2.65, 0.65, 2.5, this.paint, 0, 1.05, -4.4);
    box(body, 1.2, 1.1, 1.6, this.paint, 1.35, 1.7, -4.6);
    box(body, 1.07, 0.35, 0.05, dark, 1.35, 2.01, -3.77);
    add(body, new Cylinder(0.11, 0.11, 1.8, 10), dark, [-1.7, 1.8, -5.15]);
    add(body, new Cylinder(0.035, 0.035, 3.2, 6), dark, [1.4, 3.4, -5.2]);
    // The hinged bow ramp connects the cargo deck to the shoreline, with traction slats.
    box(ramp, 4.25, RAMP_LENGTH, 0.15, this.paint, 0, RAMP_LENGTH / 2, 0);
    for (let y = 0.3; y < RAMP_LENGTH; y += 0.45)
      box(ramp, 4.02, 0.06, 0.07, dark, 0, y, -0.11);
    for (const x of [-2, 2])
      box(
        ramp,
        0.09,
        RAMP_LENGTH - 0.15,
        0.11,
        dark,
        x,
        RAMP_LENGTH / 2,
        -0.14,
      );
    this.template = this.merge(body);
    this.rampTemplate = this.merge(ramp);
  }
  private merge(group: THREE.Group) {
    const merged = new THREE.Group();
    for (const material of this.materials) {
      const parts = group.children.filter(
        (o) => o instanceof THREE.Mesh && o.material === material,
      ) as THREE.Mesh[];
      if (!parts.length) continue;
      const geometries = parts.map((p) => {
        p.updateMatrix();
        const g = p.geometry.index ? p.geometry.toNonIndexed() : p.geometry;
        g.applyMatrix4(p.matrix);
        if (g !== p.geometry) p.geometry.dispose();
        return g;
      });
      const geometry = mergeGeometries(geometries, false)!;
      geometries.forEach((g) => g.dispose());
      this.geometries.add(geometry);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = mesh.receiveShadow = true;
      merged.add(mesh);
    }
    return merged;
  }
  private create(id: number) {
    const root = this.template.clone();
    root.name = `landing-craft-${id}`;
    const ramp = this.rampTemplate.clone();
    ramp.position.set(0, 0.72, 6);
    root.add(ramp);
    const geometry = new THREE.PlaneGeometry(6.5, 24);
    this.geometries.add(geometry);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { time: { value: 0 }, strength: { value: 0 } },
      vertexShader:
        'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: `varying vec2 vUv;uniform float time;uniform float strength;
      void main(){float side=abs(vUv.x-.5)*2.;float tail=1.-vUv.y;
      float crest=.5+.5*sin(vUv.y*75.-time*8.+sin(vUv.x*29.)*2.);
      float edge=exp(-pow((side-(.2+tail*.65))/.16,2.));
      float alpha=edge*pow(1.-tail,1.7)*smoothstep(0.,.15,tail)*crest*strength;
      gl_FragColor=vec4(.73,.82,.79,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
    });
    this.materials.add(material);
    const wake = new THREE.Mesh(geometry, material);
    wake.rotation.x = -Math.PI / 2;
    this.scene.add(wake, root);
    const instance = { root, ramp, wake };
    this.craft.set(id, instance);
    return instance;
  }
  render(battle: PillboxBattle) {
    const ids = new Set(
      battle.landingCraft.filter((c) => c.phase !== 'gone').map((c) => c.id),
    );
    for (const [id, value] of this.craft)
      if (!ids.has(id)) {
        value.root.removeFromParent();
        value.wake.removeFromParent();
        this.geometries.delete(value.wake.geometry);
        value.wake.geometry.dispose();
        const m = value.wake.material as THREE.Material;
        this.materials.delete(m);
        m.dispose();
        this.craft.delete(id);
      }
    for (const c of battle.landingCraft) {
      if (c.phase === 'gone') continue;
      const v = this.craft.get(c.id) ?? this.create(c.id);
      const afloat = c.phase === 'approach' || c.phase === 'withdrawing';
      v.root.position.set(
        c.x,
        afloat ? Math.sin(battle.time * 1.2 + c.id) * 0.08 : 0,
        c.z,
      );
      v.root.rotation.z = afloat
        ? Math.sin(battle.time * 0.8 + c.id) * 0.012
        : 0;
      v.ramp.rotation.x = c.ramp * RAMP_ANGLE;
      v.wake.position.set(c.x, 0.1, c.z - 17);
      const material = v.wake.material as THREE.ShaderMaterial;
      material.uniforms.time.value = battle.time;
      material.uniforms.strength.value = afloat ? 0.26 : 0;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const v of this.craft.values()) {
      v.root.removeFromParent();
      v.wake.removeFromParent();
    }
    this.craft.clear();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
const Cylinder = THREE.CylinderGeometry;
