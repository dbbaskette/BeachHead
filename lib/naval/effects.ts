import * as THREE from 'three';
import { BillboardPool } from '../vfx';

type Kind = 'smoke' | 'flame' | 'spray' | 'flash';

type Particle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  growth: number;
  spin: number;
  rot: number;
  seed: number;
  r: number;
  g: number;
  b: number;
  baseOpacity: number;
  aspectY: number;
};

const MAX_SMOKE = 180;
const MAX_FIRE = 120;

export class NavalEffects {
  private smokeParticles: Particle[] = [];
  private fireParticles: Particle[] = [];
  private smokePool: BillboardPool;
  private firePool: BillboardPool;
  private color = new THREE.Color();
  private serial = 0;
  private visualTime = 0;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.smokePool = new BillboardPool(scene, MAX_SMOKE, {
      blending: 'normal',
      kind: 'smoke',
    });
    this.firePool = new BillboardPool(scene, MAX_FIRE, {
      blending: 'additive',
      kind: 'fire',
    });
  }

  private add(
    kind: Kind,
    p: THREE.Vector3,
    v: THREE.Vector3,
    size: number,
    life: number,
    colorHex: string,
    growth: number,
  ) {
    const additive = kind === 'flame' || kind === 'flash';
    const list = additive ? this.fireParticles : this.smokeParticles;
    const cap = additive ? MAX_FIRE : MAX_SMOKE;
    if (list.length >= cap) list.shift();

    this.color.set(colorHex);
    const boost = kind === 'flash' ? 2.8 : kind === 'flame' ? 2.2 : 1;
    const seed = (++this.serial * 0.6180339887) % 1;
    list.push({
      x: p.x,
      y: p.y,
      z: p.z,
      vx: v.x,
      vy: v.y,
      vz: v.z,
      age: 0,
      life,
      size,
      growth,
      spin: ((this.serial % 11) - 5) * 0.08,
      rot: seed * Math.PI * 2,
      seed,
      r: this.color.r * boost,
      g: this.color.g * boost,
      b: this.color.b * boost,
      baseOpacity:
        kind === 'smoke'
          ? 0.42
          : kind === 'spray'
            ? 0.78
            : kind === 'flash'
              ? 0.95
              : 0.8,
      aspectY: kind === 'spray' ? 2.3 : 1,
    });
  }

  muzzle(p: THREE.Vector3, direction: THREE.Vector3) {
    this.add('flash', p, new THREE.Vector3(), 5, 0.11, '#ffefb2', 28);
    for (let i = 0; i < 6; i++) {
      this.add(
        'flame',
        p.clone().addScaledVector(direction, i * 0.7),
        direction.clone().multiplyScalar(15 + i * 3),
        2.7,
        0.18 + Math.random() * 0.12,
        '#ffa64a',
        9,
      );
    }
    for (let i = 0; i < 8; i++) {
      this.add(
        'smoke',
        p,
        direction
          .clone()
          .multiplyScalar(5 + Math.random() * 8)
          .add(new THREE.Vector3(Math.random() * 2, 3, 0)),
        3,
        2.5,
        '#b8b6a9',
        5,
      );
    }
  }

  smoke(p: THREE.Vector3, damaged = false) {
    this.add(
      'smoke',
      p,
      new THREE.Vector3(2, damaged ? 8 : 3, 1.5),
      damaged ? 7 : 2.4,
      damaged ? 5 : 3,
      damaged ? '#30332f' : '#727e7b',
      damaged ? 3 : 0.8,
    );
  }

  burn(p: THREE.Vector3) {
    this.smoke(p, true);
    for (let i = 0; i < 2; i++) {
      this.add(
        'flame',
        p.clone().add(new THREE.Vector3((i - 0.5) * 1.8, 0.5, 0)),
        new THREE.Vector3(0.6, 5 + i * 2, 0.4),
        4.5,
        0.6,
        '#ff9d39',
        4,
      );
    }
  }

  explosion(p: THREE.Vector3, large = false) {
    this.add(
      'flash',
      p,
      new THREE.Vector3(),
      large ? 25 : 12,
      0.2,
      '#ffe9ab',
      80,
    );
    for (let i = 0; i < (large ? 22 : 10); i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * (large ? 18 : 8);
      const q = p
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(a) * r,
            Math.random() * 9,
            Math.sin(a) * r,
          ),
        );
      this.add(
        'flame',
        q,
        new THREE.Vector3(
          Math.cos(a) * 5,
          5 + Math.random() * 9,
          Math.sin(a) * 5,
        ),
        large ? 16 : 9,
        0.5 + Math.random() * 0.8,
        '#ff7b24',
        8,
      );
      this.add(
        'smoke',
        q,
        new THREE.Vector3(
          Math.cos(a) * 4,
          5 + Math.random() * 12,
          Math.sin(a) * 4,
        ),
        large ? 14 : 9,
        4 + Math.random() * 4,
        '#34332f',
        5,
      );
    }
  }

  splash(x: number, z: number) {
    const p = new THREE.Vector3(x, 0.3, z);
    // Spray marks the impact without a large, artificial expanding ring.
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 5;
      const v = new THREE.Vector3(
        Math.cos(a) * r,
        14 + Math.random() * 23,
        Math.sin(a) * r,
      );
      this.add(
        'spray',
        p,
        v,
        1.4 + Math.random() * 1.6,
        1.2 + Math.random() * 0.5,
        '#c9e3e1',
        1.2,
      );
    }
    for (let i = 0; i < 6; i++) {
      this.add(
        'smoke',
        p,
        new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          3,
          (Math.random() - 0.5) * 6,
        ),
        6,
        3,
        '#d1e6e2',
        5,
      );
    }
  }

  private stepPool(
    list: Particle[],
    pool: BillboardPool,
    dt: number,
    smokeStyle: boolean,
  ) {
    let write = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.aspectY > 1.5) p.vy -= dt * 19;
      if (p.age >= p.life || (p.aspectY > 1.5 && p.y < 0)) continue;
      p.rot += p.spin * dt;
      const progress = p.age / p.life;
      let alpha = (1 - progress) * p.baseOpacity;
      if (smokeStyle && p.aspectY <= 1.5) {
        alpha *= Math.min(1, progress * 7);
      }
      const size = p.size + p.age * p.growth;
      pool.set(
        write,
        p.x,
        p.y,
        p.z,
        size,
        size * p.aspectY,
        p.r,
        p.g,
        p.b,
        alpha,
        p.rot,
        p.seed,
      );
      list[write++] = p;
    }
    list.length = write;
    pool.commit(write, this.visualTime);
  }

  update(dt: number) {
    const activeDt = Math.max(0, dt);
    this.visualTime += activeDt;
    this.stepPool(this.smokeParticles, this.smokePool, activeDt, true);
    this.stepPool(this.fireParticles, this.firePool, activeDt, false);
  }

  get count() {
    return this.smokeParticles.length + this.fireParticles.length;
  }

  reset() {
    this.smokeParticles.length = 0;
    this.fireParticles.length = 0;
    this.smokePool.clear();
    this.firePool.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    this.smokePool.dispose();
    this.firePool.dispose();
  }
}
