import * as THREE from 'three';
import type { EnemyShip } from './simulation';

import { sinkingPose } from './ship-impact';

interface DamageEffects {
  burn(point: THREE.Vector3): void;
  explosion(point: THREE.Vector3, large?: boolean): void;
  splash(x: number, z: number): void;
}
type DamageState = {
  scars: THREE.Mesh[];
  age: number;
  sinking: boolean;
  emit: number;
  churn: number;
  secondary: boolean;
};

/** Owns deck scars, flooding presentation and a bounded field of floating debris. */
export class ShipDamageVisuals {
  private states = new Map<string, DamageState>();
  private scars = new THREE.CircleGeometry(3.4, 9);
  private scarMaterial = new THREE.MeshBasicMaterial({
    color: '#141611',
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  private debrisGeometry = new THREE.BoxGeometry(1, 1, 1);
  private debrisMaterial = new THREE.MeshStandardMaterial({
    color: '#514a3d',
    roughness: 0.88,
    metalness: 0.25,
  });
  private debris: Array<{
    mesh: THREE.Mesh;
    velocity: THREE.Vector3;
    age: number;
    seed: number;
  }> = [];
  constructor(
    private scene: THREE.Scene,
    private effects: DamageEffects,
  ) {}

  updateShip(ship: EnemyShip, mesh: THREE.Group, dt: number) {
    let state = this.states.get(ship.id);
    if (!state) {
      state = {
        scars: [],
        age: 0,
        sinking: false,
        emit: 0,
        churn: 0,
        secondary: false,
      };
      this.states.set(ship.id, state);
    }
    for (let i = state.scars.length; i < ship.damageSites.length; i++) {
      const site = ship.damageSites[i];
      const scar = new THREE.Mesh(this.scars, this.scarMaterial);
      scar.name = 'shell-impact-scar';
      scar.position.set(site.x, site.y, site.z);
      scar.rotation.x = -Math.PI / 2;
      scar.rotation.z = i * 1.7;
      mesh.add(scar);
      state.scars.push(scar);
    }
    const hit = ship.damageSites.at(-1) ?? {
      x: 1,
      y: 6.5,
      z: -ship.length * 0.25,
    };
    if (ship.health <= 0) {
      if (!state.sinking) {
        state.sinking = true;
        mesh.updateWorldMatrix(true, false);
        this.scatter(mesh.localToWorld(new THREE.Vector3(hit.x, hit.y, hit.z)));
      }
      state.age += Math.max(0, dt);
      const pose = sinkingPose(state.age, ship.length, hit);
      mesh.position.y = pose.y;
      mesh.rotation.x = pose.pitch;
      mesh.rotation.z = pose.roll;
      mesh.visible = pose.visible;
    }
    mesh.updateWorldMatrix(true, false);
    if (dt <= 0 || !mesh.visible) return;
    state.emit += dt;
    if (state.emit >= 0.22) {
      state.emit %= 0.22;
      for (const site of ship.damageSites) {
        const p = mesh.localToWorld(new THREE.Vector3(site.x, site.y, site.z));
        // Fire sources follow the hull and extinguish when the damage site floods.
        if (p.y > 0.6) this.effects.burn(p);
      }
    }
    if (!state.sinking) return;
    if (!state.secondary && state.age >= 1.25) {
      state.secondary = true;
      const p = mesh.localToWorld(new THREE.Vector3(hit.x, hit.y, hit.z));
      if (p.y > 0.6) this.effects.explosion(p, false);
    }
    state.churn += dt;
    if (state.age > 1 && state.age < 14 && state.churn >= 1.1) {
      state.churn = 0;
      const p = mesh.localToWorld(
        new THREE.Vector3(
          hit.x,
          0,
          ship.length * (state.age % 2 > 1 ? 0.34 : -0.34),
        ),
      );
      this.effects.splash(p.x, p.z);
    }
  }

  private scatter(point: THREE.Vector3) {
    for (let i = 0; i < 10 && this.debris.length < 30; i++) {
      const mesh = new THREE.Mesh(this.debrisGeometry, this.debrisMaterial);
      mesh.name = 'floating-wreckage';
      mesh.position.copy(point);
      mesh.scale.set(1.3 + (i % 3), 0.35 + (i % 2) * 0.3, 2 + (i % 4));
      mesh.rotation.set(i, i * 2.399, 0);
      this.scene.add(mesh);
      const angle = i * 2.399;
      this.debris.push({
        mesh,
        velocity: new THREE.Vector3(
          Math.cos(angle) * (4 + i),
          8 + (i % 5),
          Math.sin(angle) * (4 + i),
        ),
        age: 0,
        seed: i,
      });
    }
  }
  update(dt: number) {
    if (dt <= 0) return;
    for (const p of this.debris) {
      p.age += dt;
      if (p.mesh.position.y > 0.5) {
        p.velocity.y -= dt * 9.81;
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.position.y = Math.max(0.45, p.mesh.position.y);
        p.mesh.rotation.x += dt * 2;
      } else {
        p.mesh.position.x += dt * 0.8;
        p.mesh.position.z += dt * 0.3;
        p.mesh.position.y = 0.32 + Math.sin(p.age * 1.8 + p.seed) * 0.08;
        p.mesh.rotation.z = Math.sin(p.age + p.seed) * 0.14;
      }
      if (p.age > 20) p.mesh.scale.multiplyScalar(Math.exp(-dt * 0.8));
    }
    this.debris = this.debris.filter((p) => {
      if (p.age < 24) return true;
      p.mesh.removeFromParent();
      return false;
    });
  }
  reset() {
    for (const state of this.states.values())
      for (const scar of state.scars) scar.removeFromParent();
    this.states.clear();
    for (const p of this.debris) p.mesh.removeFromParent();
    this.debris = [];
  }
  dispose() {
    this.reset();
    this.scars.dispose();
    this.scarMaterial.dispose();
    this.debrisGeometry.dispose();
    this.debrisMaterial.dispose();
  }
}
