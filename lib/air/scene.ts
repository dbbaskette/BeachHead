import * as THREE from 'three';
import { AirArt, makeAirframe, makeCoast, makeTargetModel } from './art';
import { makeOcean, makeSky } from '../naval/ocean';
import {
  bakeCoastalEnvironment,
  snapDirectionalShadow,
} from '../naval/daylight';
import { ShellSplashVisuals } from '../naval/shell-splashes';
import { AirEffects } from './effects';
import { makeCoastalAtmosphere } from './coastal-atmosphere';
import { placePilotCamera } from './pilot-view';
import { createBloomComposer } from '../post-processing';
import { TracerPool, createBombGeometry } from '../vfx';
import {
  bombSolution,
  gunSolutions,
  predictImpact,
  projectilePoint,
} from './weapons';
import { TOUCH_LAYOUT_QUERY } from '../touch-input';
import type { AirBattle, AirEvent, AirTarget, Vec3 } from './types';

const WATER_KINDS = new Set(['craft', 'carrier', 'command']);
const FRAME_RING_CAPACITY = 10000;

export class AirScene {
  static live = 0;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(64, 1, 0.12, 14000);
  private art = new AirArt();
  private aircraft = makeAirframe(this.art);
  private coast = makeCoast(this.art);
  private atmosphere = makeCoastalAtmosphere(this.art);
  private sun = new THREE.DirectionalLight('#ffe5bd', 2.8);
  private ocean = makeOcean({ reflection: 'environment' });
  private sky = makeSky();
  private environment: THREE.WebGLRenderTarget;
  private effects = new AirEffects(this.scene);
  private splashes = new ShellSplashVisuals(this.scene);
  private targets = new Map<string, ReturnType<typeof makeTargetModel>>();
  private tracers = new TracerPool(this.scene, 192);
  private bombs = new THREE.InstancedMesh(
    this.art.geo(createBombGeometry(1)),
    this.art.olive,
    6,
  );
  private post?: ReturnType<typeof createBloomComposer>;
  private object = new THREE.Object3D();
  private observer: ResizeObserver;
  private width = 1;
  private height = 1;
  onResize?: () => void;
  private touch = window.matchMedia(TOUCH_LAYOUT_QUERY);
  private disposed = false;
  private smokeTime = 0;
  private shake = 0;
  private predictTime = -1;
  gun: Vec3 | null = null;
  bomb: Vec3 | null = null;
  private frames = new Float64Array(FRAME_RING_CAPACITY);
  private frameWrite = 0;
  private frameCount = 0;
  private boats: AirTarget[] = [];
  private liveTargetIds = new Set<string>();
  private oceanShips: Array<{
    x: number;
    z: number;
    heading: number;
    length: number;
    health: number;
  }> = [];
  private lastCalls = 0;
  private maxCalls = 0;
  private maxEffects = 0;
  private onLost = (e: Event) => {
    e.preventDefault();
    this.onError(
      'Graphics interrupted. Return to the menu and try the mission again.',
    );
  };
  constructor(
    private host: HTMLElement,
    private onError: (message: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, this.touch.matches ? 1.15 : 1.5),
    );
    this.renderer.info.autoReset = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = !this.touch.matches;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onLost);
    this.scene.add(
      this.sky,
      this.ocean.mesh,
      this.coast,
      this.atmosphere.root,
      this.aircraft.root,
      this.bombs,
    );
    this.scene.fog = new THREE.FogExp2('#b0c4c6', 0.00017);
    this.scene.add(new THREE.HemisphereLight('#d4e4e4', '#5d6652', 0.85));
    const sun = this.sun;
    sun.castShadow = !this.touch.matches;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -350,
      right: 350,
      top: 350,
      bottom: -350,
      near: 1,
      far: 1700,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0002;
    sun.shadow.normalBias = 0.35;
    sun.shadow.radius = 2;
    this.scene.add(sun, sun.target);
    this.environment = bakeCoastalEnvironment(
      this.renderer,
      this.sky,
      '#2e4648',
      14000,
    );
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.45;
    this.bombs.count = 0;
    this.bombs.frustumCulled = false;
    if (!this.touch.matches) {
      this.post = createBloomComposer(this.renderer, this.scene, this.camera, {
        strength: 0.26,
        radius: 0.4,
        threshold: 1.15,
      });
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    AirScene.live++;
  }
  private resize() {
    this.width = this.host.clientWidth;
    this.height = this.host.clientHeight;
    this.camera.aspect = this.width / Math.max(1, this.height);
    this.camera.fov = this.camera.aspect < 1 ? 70 : 64;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
    this.post?.setSize(this.width, this.height);
    this.predictTime = -1;
    this.onResize?.();
  }
  event(e: AirEvent) {
    this.effects.event(e);
    if (e.type === 'impact' && e.water && e.bomb)
      this.splashes.impact(e.position.x, e.position.z);
    if (e.type === 'damage') this.shake = 0.7;
    if (e.type === 'phase') this.predictTime = -1;
  }
  project(p: Vec3) {
    const v = new THREE.Vector3(p.x, p.y, p.z).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * this.width,
      y: (-0.5 * v.y + 0.5) * this.height,
      visible:
        v.z > -1 && v.z < 1 && Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.94,
    };
  }
  render(b: AirBattle, dt: number, reduced: boolean, frameMs?: number) {
    const active = b.status === 'playing' ? dt : 0,
      f = b.aircraft;
    if (active && frameMs) {
      this.frames[this.frameWrite] = frameMs;
      this.frameWrite = (this.frameWrite + 1) % FRAME_RING_CAPACITY;
      if (this.frameCount < FRAME_RING_CAPACITY) this.frameCount++;
    }
    this.shake = Math.max(0, this.shake - active * 2);
    this.smokeTime += active;
    this.aircraft.root.position.copy(f.position);
    this.aircraft.root.rotation.set(f.pitch, -f.heading, f.bank, 'YXZ');
    this.aircraft.prop.rotation.z = b.time * 68;
    this.aircraft.prop.visible = !reduced;
    this.aircraft.altitudeNeedle.rotation.z =
      -(0.68 + (f.position.y / 700) * 1.65) * Math.PI - Math.PI / 2;
    this.aircraft.attitude.uniforms.bank.value = f.bank;
    this.aircraft.attitude.uniforms.pitch.value = f.pitch;
    this.aircraft.ailerons.forEach((aileron, i) => {
      aileron.rotation.x = f.bank * (i === 0 ? -0.5 : 0.5);
    });
    this.aircraft.bombs.forEach((rack, i) => {
      rack.visible = b.bombs > 1 || (b.bombs === 1 && i === b.released % 2);
    });
    placePilotCamera(this.camera, f, reduced);
    this.camera.rotateZ(
      reduced ? 0 : Math.sin(b.time * 61) * this.shake * 0.014,
    );
    this.boats.length = 0;
    for (let i = 0; i < b.targets.length; i++) {
      const t = b.targets[i];
      if (t.active && WATER_KINDS.has(t.kind)) this.boats.push(t);
    }
    this.boats.sort(
      (a, c) =>
        Math.hypot(a.position.x - f.position.x, a.position.z - f.position.z) -
        Math.hypot(c.position.x - f.position.x, c.position.z - f.position.z),
    );
    const boatCount = Math.min(3, this.boats.length);
    this.oceanShips.length = boatCount;
    for (let i = 0; i < boatCount; i++) {
      const t = this.boats[i];
      const len = t.kind === 'command' ? 124 : t.half.x * 2;
      let ship = this.oceanShips[i];
      if (!ship) {
        ship = {
          x: t.position.x,
          z: t.position.z,
          heading: t.heading,
          length: len,
          health: t.health,
        };
        this.oceanShips[i] = ship;
      } else {
        ship.x = t.position.x;
        ship.z = t.position.z;
        ship.heading = t.heading;
        ship.length = len;
        ship.health = t.health;
      }
    }
    this.ocean.update(b.time, {
      ships: this.oceanShips,
    });
    this.sky.material.uniforms.time.value = b.time;
    this.atmosphere.update(b.time);
    // Shift shadow coverage ahead along heading and snap to light-space texels.
    const aheadX = f.position.x + Math.sin(f.heading) * 220;
    const aheadZ = f.position.z - Math.cos(f.heading) * 220;
    snapDirectionalShadow(this.sun, aheadX, 0, aheadZ, 800);
    this.liveTargetIds.clear();
    for (let i = 0; i < b.targets.length; i++) {
      const t = b.targets[i];
      if (t.active) this.liveTargetIds.add(t.id);
    }
    for (const [id, m] of this.targets)
      if (!this.liveTargetIds.has(id)) m.root.visible = false;
    for (const t of b.targets) {
      if (!t.active) continue;
      let model = this.targets.get(t.id);
      if (!model) {
        model = makeTargetModel(this.art, t);
        this.targets.set(t.id, model);
        this.scene.add(model.root);
      }
      const range = Math.hypot(
          t.position.x - f.position.x,
          t.position.z - f.position.z,
        ),
        dead = t.health <= 0,
        age = t.destroyedAt === null ? 0 : b.time - t.destroyedAt;
      const water = WATER_KINDS.has(t.kind);
      model.root.visible = range < 2200 && (!dead || !water || age < 24);
      model.detail.visible = range < 800;
      model.root.position.copy(t.position);
      model.root.rotation.set(0, -t.heading, 0);
      if (water) {
        model.root.position.y += Math.sin(b.time * 1.2 + t.position.z) * 0.15;
        if (dead) {
          model.root.position.y -= age * 0.8;
          model.root.rotation.z = Math.min(0.32, age * 0.025);
        }
      }
      model.hull.color.set(
        dead
          ? '#282c29'
          : t.health < t.maxHealth * 0.6
            ? '#494b3e'
            : t.kind === 'command'
              ? '#677980'
              : t.kind === 'truck'
                ? '#657047'
                : '#687263',
      );
      if (model.ramp)
        model.ramp.rotation.x = t.velocity.x === 0 ? -0.75 : -0.15;
      if (
        active &&
        this.smokeTime >= 0.32 &&
        t.health < t.maxHealth &&
        range < 1700 &&
        (!dead || age < 22)
      )
        this.effects.emit(
          {
            x: t.position.x + (t.damageOffset?.x ?? 0),
            y: t.position.y + (t.damageOffset?.y ?? (water ? 8 : 4)),
            z: t.position.z + (t.damageOffset?.z ?? 0),
          },
          dead ? 2 : 3,
          1,
        );
    }
    if (this.smokeTime >= 0.32) this.smokeTime = 0;
    let tracerCount = 0,
      bombs = 0;
    for (const p of b.projectiles)
      if (p.kind === 'gun' && tracerCount < 160) {
        this.tracers.set(
          tracerCount++,
          p.position.x - p.velocity.x * 0.019,
          p.position.y - p.velocity.y * 0.019,
          p.position.z - p.velocity.z * 0.019,
          p.position.x,
          p.position.y,
          p.position.z,
          0.1,
          1.85,
          1.45,
          0.75,
          0.9,
        );
      } else if (p.kind === 'bomb' && bombs < 6) {
        this.object.position.copy(p.position);
        this.object.scale.setScalar(1.1);
        this.object.lookAt(
          p.position.x + p.velocity.x,
          p.position.y + p.velocity.y - 9.81 * p.age,
          p.position.z + p.velocity.z,
        );
        this.object.updateMatrix();
        this.bombs.setMatrixAt(bombs++, this.object.matrix);
      }
    this.bombs.count = bombs;
    if (bombs > 0) this.bombs.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < b.flak.length && i < 32; i++) {
      const p = b.flak[i];
      this.tracers.set(
        tracerCount++,
        p.position.x - (p.end.x - p.origin.x) * 0.035,
        p.position.y - (p.end.y - p.origin.y) * 0.035,
        p.position.z - (p.end.z - p.origin.z) * 0.035,
        p.position.x,
        p.position.y,
        p.position.z,
        0.13,
        1.9,
        0.75,
        0.35,
        0.92,
      );
    }
    this.tracers.commit(tracerCount);
    this.effects.update(
      active,
      this.height,
      this.camera.fov,
      this.renderer.getPixelRatio(),
    );
    this.splashes.update(
      active,
      this.camera,
      this.height,
      this.touch.matches,
      this.renderer.getPixelRatio(),
    );
    if (this.predictTime < 0 || b.time - this.predictTime > 0.1) {
      this.predictTime = b.time;
      this.bomb =
        b.bombs && b.phase === 'attack'
          ? (predictImpact(bombSolution(f, b.released % 2), b.targets)
              ?.position ?? null)
          : null;
      const guns = gunSolutions(f);
      const avg = {
        origin: {
          x: (guns[0].origin.x + guns[1].origin.x) / 2,
          y: (guns[0].origin.y + guns[1].origin.y) / 2,
          z: (guns[0].origin.z + guns[1].origin.z) / 2,
        },
        velocity: {
          x: (guns[0].velocity.x + guns[1].velocity.x) / 2,
          y: (guns[0].velocity.y + guns[1].velocity.y) / 2,
          z: (guns[0].velocity.z + guns[1].velocity.z) / 2,
        },
      };
      this.gun =
        predictImpact(avg, [], 2)?.position ?? projectilePoint(avg, 0.7);
    }
    this.renderer.info.reset();
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
    this.lastCalls = this.renderer.info.render.calls;
    this.maxCalls = Math.max(this.maxCalls, this.lastCalls);
    this.maxEffects = Math.max(this.maxEffects, this.effects.count);
  }
  diagnostics() {
    const sorted = Array.from(
      this.frameCount === FRAME_RING_CAPACITY
        ? this.frames
        : this.frames.subarray(0, this.frameCount),
    ).sort((a, b) => a - b);
    return {
      frames: sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)] ?? 0,
      p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
      drawCalls: this.lastCalls,
      maxCalls: this.maxCalls,
      effects: this.effects.count,
      maxEffects: this.maxEffects,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
      scenes: AirScene.live,
    };
  }
  reset() {
    this.effects.reset();
    this.splashes.reset();
    this.tracers.clear();
    this.bombs.count = 0;
    this.predictTime = -1;
    this.smokeTime = this.shake = 0;
    this.frameWrite = 0;
    this.frameCount = 0;
    this.maxCalls = this.maxEffects = 0;
    this.targets.forEach((t) => (t.root.visible = false));
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.onLost,
    );
    this.post?.dispose();
    this.tracers.dispose();
    this.bombs.dispose();
    this.effects.dispose();
    this.splashes.dispose();
    this.ocean.dispose();
    this.environment.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.atmosphere.dispose();
    this.sun.shadow.dispose();
    this.art.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    AirScene.live--;
  }
}
