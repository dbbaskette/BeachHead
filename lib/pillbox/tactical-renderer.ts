import * as THREE from 'three';
import { makeAircraft } from '../naval/atmosphere';
import { beachHeight } from './terrain';
import {
  PLAYER_GRENADE_FLIGHT,
  type PillboxBattle,
  type Infantry,
} from './types';

export function supportCrew(b: PillboxBattle): Infantry[] {
  return b.soldiers
    .filter(
      (s) => s.emplacement && s.phase !== 'down' && s.phase !== 'breached',
    )
    .map((s) => ({
      ...s,
      id: 9000 + s.id,
      x: s.x + 1.4,
      z: s.z - 0.8,
      phase: 'cover',
      role: 'rifle',
      emplacement: undefined,
      usesFoxhole: false,
      crawling: false,
    }));
}

export class TacticalRenderer {
  private root = new THREE.Group();
  private plane = makeAircraft();
  private teams = new Map<number, THREE.Group>();
  private grenades = new Map<number, THREE.Mesh>();
  private box = new THREE.BoxGeometry(1, 1, 1);
  private tube = new THREE.CylinderGeometry(1, 1, 1, 12);
  private shell = new THREE.SphereGeometry(0.16, 10, 8);
  private steel = new THREE.MeshStandardMaterial({
    color: '#414b3d',
    roughness: 0.73,
    metalness: 0.4,
  });
  private wood = new THREE.MeshStandardMaterial({
    color: '#776547',
    roughness: 1,
  });
  private lineGeometry = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array(6), 3),
  );
  private tracer = new THREE.Line(
    this.lineGeometry,
    new THREE.LineBasicMaterial({
      color: '#ffda8b',
      transparent: true,
      opacity: 0.8,
    }),
  );
  constructor(scene: THREE.Scene) {
    this.root.name = 'tactical-support';
    this.root.add(this.plane, this.tracer);
    scene.add(this.root);
  }
  private part(
    g: THREE.Group,
    geo: THREE.BufferGeometry,
    scale: number[],
    pos: number[],
    mat = this.steel,
  ) {
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(scale[0], scale[1], scale[2]);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  }
  render(b: PillboxBattle) {
    const desired = new Set(
      b.soldiers
        .filter(
          (s) => s.emplacement && s.phase !== 'down' && s.phase !== 'breached',
        )
        .map((s) => s.id),
    );
    for (const [id, g] of this.teams)
      if (!desired.has(id)) {
        g.removeFromParent();
        this.teams.delete(id);
      }
    for (const s of b.soldiers)
      if (desired.has(s.id)) {
        let g = this.teams.get(s.id);
        if (!g) {
          g = new THREE.Group();
          g.name = `${s.role}-position-${s.id}`;
          if (s.role === 'mortar') {
            this.part(g, this.tube, [0.7, 0.1, 0.6], [0, 0.08, 1.2]);
            this.part(
              g,
              this.tube,
              [0.12, 1.65, 0.12],
              [0, 0.85, 1.25],
            ).rotation.x = 0.45;
            for (const side of [-1, 1])
              this.part(
                g,
                this.tube,
                [0.035, 1, 0.035],
                [side * 0.35, 0.45, 1.55],
              ).rotation.z = side * 0.35;
          } else {
            this.part(g, this.box, [0.32, 0.32, 1.5], [0, 0.8, 1.3]);
            this.part(
              g,
              this.tube,
              [0.07, 1.1, 0.07],
              [0, 0.8, 2.4],
            ).rotation.x = Math.PI / 2;
            for (const side of [-1, 1])
              this.part(
                g,
                this.tube,
                [0.035, 1, 0.035],
                [side * 0.3, 0.4, 1.6],
              ).rotation.z = side * 0.5;
            this.part(g, this.box, [0.75, 0.13, 0.6], [0.65, 0.58, 1.2]);
          }
          this.part(g, this.box, [0.9, 0.45, 0.6], [-1, 0.23, 0.6], this.wood);
          this.root.add(g);
          this.teams.set(s.id, g);
        }
        g.position.set(s.x, beachHeight(s.x, s.z), s.z);
        const setup =
          s.emplacement === 'setting-up'
            ? Math.max(
                0.15,
                1 - (s.setupTimer ?? 0) / (s.role === 'mortar' ? 7 : 4.5),
              )
            : 1;
        g.scale.y = setup;
      }
    const live = new Set(b.playerGrenades.map((g) => g.id));
    for (const [id, g] of this.grenades)
      if (!live.has(id)) {
        g.removeFromParent();
        this.grenades.delete(id);
      }
    for (const g of b.playerGrenades) {
      let m = this.grenades.get(g.id);
      if (!m) {
        m = new THREE.Mesh(this.shell, this.steel);
        this.root.add(m);
        this.grenades.set(g.id, m);
      }
      const t = Math.min(1, g.age / PLAYER_GRENADE_FLIGHT);
      m.position.set(
        g.x * t,
        3.8 * (1 - t) +
          (beachHeight(g.x, g.z) + 0.15) * t +
          Math.sin(t * Math.PI) * 12,
        3.7 + (g.z - 3.7) * t,
      );
    }
    const strike = b.airStrike;
    this.plane.visible = Boolean(strike);
    this.tracer.visible = false;
    if (strike) {
      // Keep the aircraft just behind the advancing impact line.
      const x = strike.x - 28 + (strike.age - 2) * (4 / 0.13);
      this.plane.position.set(
        x,
        17 + Math.abs(strike.age - 2.7) * 7,
        strike.z - 5,
      );
      this.plane.rotation.set(0, -Math.PI / 2, Math.sin(strike.age) * 0.08);
      if (strike.age >= 2 && strike.age < 3.56) {
        this.tracer.visible = (strike.age * 25) % 1 < 0.65;
        const p = this.lineGeometry.getAttribute('position');
        p.setXYZ(0, x, this.plane.position.y, strike.z - 5);
        p.setXYZ(
          1,
          strike.x - 24 + Math.min(12, strike.passes) * 4,
          beachHeight(
            strike.x - 24 + Math.min(12, strike.passes) * 4,
            strike.z,
          ) + 0.2,
          strike.z,
        );
        p.needsUpdate = true;
        this.lineGeometry.computeBoundingSphere();
      }
    }
  }
  dispose() {
    this.root.removeFromParent();
    const geometry = new Set<THREE.BufferGeometry>([
      this.box,
      this.tube,
      this.shell,
      this.lineGeometry,
    ]);
    const materials = new Set<THREE.Material>([
      this.steel,
      this.wood,
      this.tracer.material,
    ]);
    this.plane.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometry.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(m);
      }
    });
    geometry.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.teams.clear();
    this.grenades.clear();
  }
}
