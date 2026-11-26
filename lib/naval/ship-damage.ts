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

const MAX_DEBRIS = 30;

type DebrisPiece = {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
  velocity: THREE.Vector3;
  age: number;
  seed: number;
};

/** Owns deck scars, flooding presentation and a bounded field of floating debris. */
export class ShipDamageVisuals {
  private states = new Map<string, DamageState>();
  private scars = new THREE.PlaneGeometry(7.6, 7.6);
  private scarMaterial = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
    vertexShader: `varying vec2 vUv;
      #include <common>
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;#include <fog_vertex>}`,
    fragmentShader: `varying vec2 vUv;
      #include <common>
      #include <fog_pars_fragment>
      void main(){
        vec2 p=vUv*2.-1.;
        float a=atan(p.y,p.x),r=length(p);
        float edge=.64+.15*sin(a*6.)+.09*cos(a*11.+1.2);
        float mask=1.-smoothstep(edge-.22,edge,r);
        if(mask<.01)discard;
        float core=smoothstep(edge,0.12,r);
        vec3 color=mix(vec3(.13,.11,.09),vec3(.04,.04,.035),core);
        gl_FragColor=vec4(color,mask*.86);
        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    fog: true,
  });
  private debrisGeometry = new THREE.BoxGeometry(1, 1, 1);
  private debrisMaterial = new THREE.MeshStandardMaterial({
    color: '#514a3d',
    roughness: 0.88,
    metalness: 0.25,
  });
  private debrisMesh: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private debris: DebrisPiece[] = [];
  constructor(
    private scene: THREE.Scene,
    private effects: DamageEffects,
  ) {
    this.debrisMesh = new THREE.InstancedMesh(
      this.debrisGeometry,
      this.debrisMaterial,
      MAX_DEBRIS,
    );
    this.debrisMesh.name = 'floating-wreckage';
    this.debrisMesh.count = 0;
    this.debrisMesh.frustumCulled = false;
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

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

  private syncDebrisMesh() {
    this.debrisMesh.count = this.debris.length;
    if (this.debris.length === 0) {
      this.debrisMesh.removeFromParent();
      return;
    }
    if (!this.debrisMesh.parent) this.scene.add(this.debrisMesh);
    for (let i = 0; i < this.debris.length; i++) {
      const p = this.debris[i];
      this.dummy.position.copy(p.position);
      this.dummy.rotation.copy(p.rotation);
      this.dummy.scale.copy(p.scale);
      this.dummy.updateMatrix();
      this.debrisMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.debrisMesh.instanceMatrix.needsUpdate = true;
  }

  private scatter(point: THREE.Vector3) {
    for (let i = 0; i < 10 && this.debris.length < MAX_DEBRIS; i++) {
      const angle = i * 2.399;
      this.debris.push({
        position: point.clone(),
        rotation: new THREE.Euler(i, angle, 0),
        scale: new THREE.Vector3(
          1.3 + (i % 3),
          0.35 + (i % 2) * 0.3,
          2 + (i % 4),
        ),
        velocity: new THREE.Vector3(
          Math.cos(angle) * (4 + i),
          8 + (i % 5),
          Math.sin(angle) * (4 + i),
        ),
        age: 0,
        seed: i,
      });
    }
    this.syncDebrisMesh();
  }
  update(dt: number) {
    if (dt <= 0 || this.debris.length === 0) return;
    let write = 0;
    for (let i = 0; i < this.debris.length; i++) {
      const p = this.debris[i];
      p.age += dt;
      if (p.age >= 24) continue;
      if (p.position.y > 0.5) {
        p.velocity.y -= dt * 9.81;
        p.position.addScaledVector(p.velocity, dt);
        p.position.y = Math.max(0.45, p.position.y);
        p.rotation.x += dt * 2;
      } else {
        p.position.x += dt * 0.8;
        p.position.z += dt * 0.3;
        p.position.y = 0.32 + Math.sin(p.age * 1.8 + p.seed) * 0.08;
        p.rotation.z = Math.sin(p.age + p.seed) * 0.14;
      }
      if (p.age > 20) p.scale.multiplyScalar(Math.exp(-dt * 0.8));
      this.debris[write++] = p;
    }
    this.debris.length = write;
    this.syncDebrisMesh();
  }
  reset() {
    for (const state of this.states.values())
      for (const scar of state.scars) scar.removeFromParent();
    this.states.clear();
    this.debris.length = 0;
    this.debrisMesh.count = 0;
    this.debrisMesh.removeFromParent();
  }
  dispose() {
    this.reset();
    this.debrisMesh.dispose();
    this.scars.dispose();
    this.scarMaterial.dispose();
    this.debrisGeometry.dispose();
    this.debrisMaterial.dispose();
  }
}
