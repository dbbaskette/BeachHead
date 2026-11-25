import * as THREE from 'three';
import { BillboardPool } from '../vfx';
import type { AirEvent, Vec3 } from './types';

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
  kind: number;
  spin: number;
  rot: number;
  seed: number;
};

const MAX_SMOKE = 384;
const MAX_FIRE = 192;

export class AirEffects {
  private particles: Particle[] = [];
  readonly smokePool: BillboardPool;
  readonly firePool: BillboardPool;
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

  emit(p: Vec3, kind: number, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 512) this.particles.shift();
      const serial = ++this.serial;
      const angle = serial * 2.399;
      const seed = (serial * 0.6180339887) % 1;
      this.particles.push({
        x: p.x,
        y: p.y,
        z: p.z,
        vx: Math.sin(angle) * (kind === 2 ? 8 : 3),
        vy: kind === 1 ? 1 : 4 + (serial % 11),
        vz: Math.cos(angle) * (kind === 2 ? 8 : 3),
        age: 0,
        life:
          kind === 1
            ? 0.09
            : kind === 4
              ? 0.8
              : kind === 3
                ? 3
                : 4 + (serial % 3),
        size: kind === 1 ? 2.4 : kind === 4 ? 2.6 : kind === 2 ? 5.2 : 11,
        kind,
        spin: ((serial % 9) - 4) * 0.09,
        rot: seed * Math.PI * 2,
        seed,
      });
    }
  }

  event(e: AirEvent) {
    if (e.type === 'guns') e.points.forEach((p) => this.emit(p, 1, 1));
    if (e.type === 'impact' && !e.water)
      this.emit(e.position, e.bomb ? 2 : 3, e.bomb ? 38 : 3);
    if (e.type === 'impact' && e.water && !e.bomb) this.emit(e.position, 4, 3);
    if (e.type === 'destroyed') this.emit(e.position, 2, 24);
    if (e.type === 'flak') this.emit(e.position, 1, 3);
    if (e.type === 'flak-burst') this.emit(e.position, 3, 16);
  }

  update(dt: number, _height: number, _fov: number, _ratio: number) {
    const activeDt = Math.max(0, dt);
    this.visualTime += activeDt;

    let write = 0;
    let smokeCount = 0;
    let fireCount = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.age += activeDt;
      if (p.age >= p.life) continue;
      p.x += p.vx * activeDt;
      p.y += p.vy * activeDt;
      p.z += p.vz * activeDt;
      p.vx += activeDt * 0.4;
      p.vy += activeDt * (p.kind === 4 ? -9.81 : 0.2);
      p.rot += p.spin * activeDt;

      const f = p.age / p.life;
      const size = p.size + p.age * (p.kind === 2 ? 8 : 3);
      const fire = p.kind === 1 || (p.kind === 2 && p.age < 0.65);

      if (fire) {
        if (fireCount < MAX_FIRE) {
          const alpha = (1 - f) * (p.kind === 1 ? 0.95 : 0.85);
          this.firePool.set(
            fireCount++,
            p.x,
            p.y,
            p.z,
            size,
            size,
            2.5,
            1.25,
            0.35,
            alpha,
            p.rot,
            p.seed,
          );
        }
      } else if (smokeCount < MAX_SMOKE) {
        const alpha = (1 - f) * (p.kind === 4 ? 0.68 : 0.48);
        const r = p.kind === 4 ? 0.85 : p.kind === 3 ? 0.19 : 0.27;
        const g = p.kind === 4 ? 0.94 : p.kind === 3 ? 0.2 : 0.26;
        const b = p.kind === 4 ? 0.95 : p.kind === 3 ? 0.19 : 0.23;
        this.smokePool.set(
          smokeCount++,
          p.x,
          p.y,
          p.z,
          size,
          size,
          r,
          g,
          b,
          alpha,
          p.rot,
          p.seed,
        );
      }
      this.particles[write++] = p;
    }
    this.particles.length = write;
    this.smokePool.commit(smokeCount, this.visualTime);
    this.firePool.commit(fireCount, this.visualTime);
  }

  get count() {
    return this.particles.length;
  }

  reset() {
    this.particles.length = 0;
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
