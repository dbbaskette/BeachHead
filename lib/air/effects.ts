import * as THREE from 'three';
import type { AirEvent, Vec3 } from './types';
type Particle = {
  p: THREE.Vector3;
  v: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  kind: number;
};
export class AirEffects {
  private particles: Particle[] = [];
  private geometry = new THREE.BufferGeometry();
  private position = new Float32Array(512 * 3);
  private color = new Float32Array(512 * 3);
  private size = new Float32Array(512);
  private alpha = new Float32Array(512);
  private material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { focal: { value: 500 } },
    vertexShader: `attribute float size;attribute float alpha;attribute vec3 tint;uniform float focal;varying float a;varying vec3 c;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(size*focal/max(1.,-p.z),1.,150.);a=alpha;c=tint;}`,
    fragmentShader: `varying float a;varying vec3 c;void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);float cloud=(1.-smoothstep(.1,1.,r))*(.88+.12*sin(p.x*18.)*sin(p.y*15.));if(cloud*a<.01)discard;gl_FragColor=vec4(c,cloud*a);}`,
  });
  readonly mesh = new THREE.Points(this.geometry, this.material);
  private serial = 0;
  private disposed = false;
  constructor(scene: THREE.Scene) {
    for (const [name, array, item] of [
      ['position', this.position, 3],
      ['tint', this.color, 3],
      ['size', this.size, 1],
      ['alpha', this.alpha, 1],
    ] as const)
      this.geometry.setAttribute(
        name,
        new THREE.BufferAttribute(array, item).setUsage(THREE.DynamicDrawUsage),
      );
    this.geometry.setDrawRange(0, 0);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  emit(p: Vec3, kind: number, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 512) this.particles.shift();
      const seed = ++this.serial,
        angle = seed * 2.399;
      this.particles.push({
        p: new THREE.Vector3(p.x, p.y, p.z),
        v: new THREE.Vector3(
          Math.sin(angle) * (kind === 2 ? 8 : 3),
          kind === 1 ? 1 : 4 + (seed % 11),
          Math.cos(angle) * (kind === 2 ? 8 : 3),
        ),
        age: 0,
        life:
          kind === 1
            ? 0.09
            : kind === 4
              ? 0.8
              : kind === 3
                ? 3
                : 4 + (seed % 3),
        size: kind === 1 ? 1.8 : kind === 4 ? 2.2 : kind === 2 ? 4 : 9,
        kind,
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
  update(dt: number, height: number, fov: number, ratio: number) {
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.age += dt;
      p.p.addScaledVector(p.v, dt);
      p.v.x += dt * 0.4;
      p.v.y += dt * (p.kind === 4 ? -9.81 : 0.2);
      const f = p.age / p.life;
      this.position.set(p.p.toArray(), i * 3);
      this.size[i] = p.size + p.age * (p.kind === 2 ? 8 : 3);
      this.alpha[i] =
        (1 - f) * (p.kind === 1 ? 0.95 : p.kind === 2 ? 0.7 : 0.42);
      const fire = p.kind === 1 || (p.kind === 2 && p.age < 0.6);
      this.color.set(
        p.kind === 4
          ? [0.85, 0.94, 0.95]
          : fire
            ? [1, 0.5, 0.12]
            : p.kind === 3
              ? [0.19, 0.2, 0.19]
              : [0.27, 0.26, 0.23],
        i * 3,
      );
    }
    this.geometry.setDrawRange(0, this.particles.length);
    for (const attr of Object.values(this.geometry.attributes))
      attr.needsUpdate = true;
    this.material.uniforms.focal.value =
      (height / (2 * Math.tan((fov * Math.PI) / 360))) * ratio;
  }
  get count() {
    return this.particles.length;
  }
  reset() {
    this.particles = [];
    this.geometry.setDrawRange(0, 0);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
