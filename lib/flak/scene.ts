import * as T from 'three';
import { FlakArt, aircraft, gun, paratrooper, consolidate } from './art';
import { coastalMaterial } from '../air/surfaces';
import { makeOcean, makeSky } from '../naval/ocean';
import { bakeCoastalEnvironment, COASTAL_SUN } from '../naval/daylight';
import { TOUCH_LAYOUT_QUERY } from '../touch-input';
import { createBloomComposer } from '../post-processing';
import { BillboardPool, TracerPool, createBombGeometry } from '../vfx';
import {
  aimDirection,
  eyePosition,
  type FlakState,
  type FlakEvent,
  type Vec,
} from './simulation';

/** Coastal dune profile that keeps the battery level and slopes smoothly below sea level. */
export function flakCoastHeight(x: number, z: number): number {
  const dune =
    2.3 +
    Math.sin(x * 0.008) *
      Math.sin(z * 0.013) *
      Math.min(17, Math.max(0, z) * 0.08) +
    Math.sin(x * 0.021 + z * 0.019) * 1.3;
  const shoreZ = -82 + Math.sin(x * 0.015) * 6;
  const t = T.MathUtils.smoothstep(z, shoreZ - 38, shoreZ + 52);
  return T.MathUtils.lerp(-2.4, dune, t);
}
type Puff = {
  at: Vec;
  age: number;
  life: number;
  size: number;
  shade: number;
  glow: boolean;
  spin: number;
  rot: number;
  seed: number;
};
export class FlakScene {
  private renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(59, 1, 0.3, 12000);
  private art = new FlakArt();
  private weapon = gun(this.art);
  private sky = makeSky();
  private ocean = makeOcean({ reflection: 'environment', shorelineZ: -82 });
  private environment: T.WebGLRenderTarget;
  private smoke: BillboardPool;
  private flashes: BillboardPool;
  private clouds: BillboardPool;
  private puffs: Puff[] = [];
  private serial = 0;
  private object = new T.Object3D();
  private planes = (['bomber', 'transport', 'fighter'] as const).flatMap(
    (kind) => {
      const proto = aircraft(this.art, kind);
      return Array.from({ length: 3 }, (_, idx) => {
        if (idx === 0) return { id: -1, ...proto, kind };
        const root = proto.root.clone();
        const props = proto.props.map(
          (_, pIdx) => root.getObjectByName(`prop-${pIdx}`) as T.Group,
        );
        return { id: -1, root, props, kind };
      });
    },
  );
  private troops = (() => {
    const proto = paratrooper(this.art);
    return Array.from({ length: 20 }, (_, idx) => {
      if (idx === 0) return { id: -1, ...proto };
      const root = proto.root.clone();
      const canopy = root.getObjectByName('canopy') as T.Group;
      return { id: -1, root, canopy };
    });
  })();
  private tracers: TracerPool;
  private bombs: T.InstancedMesh;
  private shells: T.InstancedMesh;
  private observer: ResizeObserver;
  private light = new T.PointLight('#ffd89e', 0, 8);
  private post?: ReturnType<typeof createBloomComposer>;
  private flash = 0;
  private shake = 0;
  private previous = 0;
  private smokeClock = 0;
  private ambientClock = 0;
  private disposed = false;
  private onLost = (e: Event) => {
    e.preventDefault();
    this.onError('Graphics interrupted. Return to the menu and try again.');
  };
  constructor(
    private host: HTMLElement,
    private onError: (message: string) => void,
  ) {
    const touch = window.matchMedia(TOUCH_LAYOUT_QUERY).matches;
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1.15 : 1.6));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onLost);
    this.scene.add(this.sky, this.ocean.mesh, this.weapon.root, this.light);
    this.scene.fog = new T.FogExp2('#afc1c1', 0.00038);
    this.scene.add(new T.HemisphereLight('#c4d3d3', '#797159', 1.15));
    const sun = new T.DirectionalLight('#ffdfb0', 3.1);
    sun.target.position.set(0, 4.5, 4);
    sun.position.copy(COASTAL_SUN).multiplyScalar(80).add(sun.target.position);
    sun.castShadow = true;
    const shadowSize = touch ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, {
      left: -14,
      right: 14,
      top: 14,
      bottom: -12,
      near: 50,
      far: 120,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 2;
    this.scene.add(sun, sun.target);
    this.environment = bakeCoastalEnvironment(
      this.renderer,
      this.sky,
      '#5e5a49',
      12000,
    );
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.55;
    this.smoke = new BillboardPool(this.scene, 180, {
      blending: 'normal',
      kind: 'smoke',
    });
    this.flashes = new BillboardPool(this.scene, 64, {
      blending: 'additive',
      kind: 'fire',
    });
    this.clouds = new BillboardPool(this.scene, 48, {
      blending: 'normal',
      kind: 'smoke',
    });
    this.tracers = new TracerPool(this.scene, 64);
    this.buildCoast();
    for (const p of this.planes) {
      p.root.visible = false;
      this.scene.add(p.root);
    }
    for (const p of this.troops) {
      p.root.visible = false;
      this.scene.add(p.root);
    }
    this.bombs = new T.InstancedMesh(
      this.art.geo(createBombGeometry(-1)),
      this.art.dark,
      8,
    );
    this.bombs.count = 0;
    this.bombs.frustumCulled = false;
    this.scene.add(this.bombs);
    this.shells = new T.InstancedMesh(this.art.cylinder, this.art.brass, 48);
    this.shells.frustumCulled = false;
    this.scene.add(this.shells);
    for (let i = 0; i < 48; i++) {
      const angle = i * 2.399;
      this.object.position.set(
        Math.cos(angle) * (1.5 + i * 0.036),
        4.56,
        4 + Math.sin(angle) * (1.6 + i * 0.04),
      );
      this.object.rotation.set(Math.PI / 2, 0, angle);
      this.object.scale.set(0.022, 0.14, 0.022);
      this.object.updateMatrix();
      this.shells.setMatrixAt(i, this.object.matrix);
    }
    this.shells.count = 0;
    const cloudPaletteA = new T.Color('#d9dfd8');
    const cloudPaletteB = new T.Color('#a8b6b5');
    for (let i = 0; i < 48; i++) {
      const angle = i * 2.399;
      const distance = 1100 + (i % 5) * 430;
      const c = i % 3 ? cloudPaletteA : cloudPaletteB;
      this.clouds.set(
        i,
        Math.sin(angle) * distance,
        450 + (i % 7) * 90,
        Math.cos(angle) * distance,
        420 + (i % 4) * 110,
        110 + (i % 3) * 50,
        c.r,
        c.g,
        c.b,
        0.78,
        ((i % 7) - 3) * 0.07,
        (i * 0.6180339887) % 1,
      );
    }
    this.clouds.commit(48, 0);
    if (!touch) {
      this.post = createBloomComposer(this.renderer, this.scene, this.camera, {
        strength: 0.26,
        radius: 0.4,
        threshold: 1.15,
      });
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }
  private buildCoast() {
    const a = this.art,
      root = new T.Group();
    const sandMap = a.texture('pillbox-sand-diffuse.jpg', true);
    const sandNormal = a.texture('pillbox-sand-normal.jpg');
    const sand = coastalMaterial(sandMap, sandNormal, {
      shoreAxis: 'z',
      shoreOffset: -82,
      grassStart: 36,
      grassEnd: 135,
      roadOffset: 9999,
    });
    a.materials.add(sand);
    const g = a.geo(new T.PlaneGeometry(3500, 2000, 100, 80));
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i) + 860,
        h = flakCoastHeight(x, z);
      pos.setXYZ(i, x, h, z);
    }
    g.computeVertexNormals();
    const terrain = a.mesh(this.scene, g, sand, [0, 0, 0], [1, 1, 1]);
    terrain.castShadow = false;
    terrain.receiveShadow = true;
    const concrete = a.mat('#939383', 0.98);
    concrete.map = a.texture('pillbox-concrete-diffuse.jpg', true);
    concrete.normalMap = a.texture('pillbox-concrete-normal.jpg');
    concrete.roughnessMap = a.texture('pillbox-concrete-roughness.jpg');
    for (const t of [concrete.map, concrete.normalMap, concrete.roughnessMap])
      t.repeat.set(3, 3);
    a.mesh(
      root,
      a.geo(new T.CylinderGeometry(8, 8.5, 1.6, 48)),
      concrete,
      [0, 3.7, 4],
      [1, 1, 1],
    );
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * Math.PI * 2;
      const block = a.block(
        root,
        concrete,
        [Math.sin(angle) * 7.5, 4.95, 4 + Math.cos(angle) * 7.5],
        [1.64, 1.2, 0.8],
      );
      block.rotation.y = angle;
    }
    for (let i = 0; i < 16; i++) {
      const x = ((i % 4) - 1.5) * 0.8,
        z = 7 + Math.floor(i / 4) * 0.5;
      a.block(root, a.wood, [x, 4.65, z], [0.68, 0.3, 0.43]);
      a.block(root, a.dark, [x, 4.81, z], [0.68, 0.02, 0.025]);
    }
    for (let i = 0; i < 5; i++) {
      const x = -11 - i * 2.6;
      a.block(root, concrete, [x, 3.5, 20], [2.5, 3.4, 3]);
      a.block(root, a.dark, [x, 4, 18.45], [1.2, 0.65, 0.02]);
    }
    // Layered canvas sandbags, with woven burlap bump and flattened seams.
    const burlapSize = 128;
    const burlapColor = new Uint8Array(burlapSize * burlapSize * 4);
    const burlapBump = new Uint8Array(burlapSize * burlapSize * 4);
    let bagSeed = 7717;
    for (let y = 0; y < burlapSize; y++) {
      for (let x = 0; x < burlapSize; x++) {
        bagSeed = (Math.imul(bagSeed, 1664525) + 1013904223) >>> 0;
        const weave =
          ((x + (y & 1)) & 1 ? 14 : -14) + ((y + (x & 1)) & 1 ? 10 : -10);
        const grain = ((bagSeed >>> 24) - 128) * 0.18;
        const v = Math.max(120, Math.min(250, Math.round(196 + weave + grain)));
        const idx = (y * burlapSize + x) * 4;
        burlapColor[idx] = v;
        burlapColor[idx + 1] = Math.round(v * 0.94);
        burlapColor[idx + 2] = Math.round(v * 0.78);
        burlapColor[idx + 3] = 255;
        burlapBump[idx] =
          burlapBump[idx + 1] =
          burlapBump[idx + 2] =
            Math.max(0, Math.min(255, Math.round(128 + weave * 3 + grain)));
        burlapBump[idx + 3] = 255;
      }
    }
    const bagColorTex = new T.DataTexture(
      burlapColor,
      burlapSize,
      burlapSize,
      T.RGBAFormat,
    );
    bagColorTex.wrapS = bagColorTex.wrapT = T.RepeatWrapping;
    bagColorTex.repeat.set(3, 2);
    bagColorTex.colorSpace = T.SRGBColorSpace;
    bagColorTex.needsUpdate = true;
    const bagBumpTex = new T.DataTexture(
      burlapBump,
      burlapSize,
      burlapSize,
      T.RGBAFormat,
    );
    bagBumpTex.wrapS = bagBumpTex.wrapT = T.RepeatWrapping;
    bagBumpTex.repeat.set(3, 2);
    bagBumpTex.needsUpdate = true;
    a.textures.add(bagColorTex);
    a.textures.add(bagBumpTex);
    const bagMaterial = a.mat('#a89b7c', 0.98);
    bagMaterial.map = bagColorTex;
    bagMaterial.bumpMap = bagBumpTex;
    bagMaterial.bumpScale = 0.04;
    const bagGeometry = a.geo(new T.SphereGeometry(1, 16, 10));
    const seamGeometry = a.geo(new T.TorusGeometry(1, 0.01, 4, 24));
    const bp = bagGeometry.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const x = bp.getX(i),
        y = bp.getY(i),
        z = bp.getZ(i);
      bp.setXYZ(
        i,
        Math.sign(x) * Math.abs(x) ** 0.7,
        Math.sign(y) *
          Math.abs(y) ** 0.65 *
          (1 + Math.sin(x * 24 + z * 17) * 0.035),
        Math.sign(z) * Math.abs(z) ** 0.7,
      );
    }
    bagGeometry.computeVertexNormals();
    for (let row = 0; row < 2; row++)
      for (let i = 0; i < 32; i++) {
        const angle = ((i + row * 0.5) / 32) * Math.PI * 2;
        const bag = a.mesh(
          root,
          bagGeometry,
          bagMaterial,
          [Math.sin(angle) * 7.3, 5.65 + row * 0.3, 4 + Math.cos(angle) * 7.3],
          [0.68, 0.19, 0.37],
        );
        bag.rotation.y = angle;
        const seam = a.mesh(
          root,
          seamGeometry,
          a.wood,
          [Math.sin(angle) * 7.3, 5.65 + row * 0.3, 4 + Math.cos(angle) * 7.3],
          [0.65, 0.18, 0.35],
        );
        seam.rotation.y = angle;
      }
    // Radial floor joints and drainage channels give the battery human scale.
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const seam = a.block(
        root,
        a.dark,
        [Math.sin(angle) * 4.7, 4.506, 4 + Math.cos(angle) * 4.7],
        [0.012, 0.008, 4.4],
      );
      seam.rotation.y = angle;
    }
    consolidate(root, a);
    this.scene.add(root);
    const tuftPositions: number[] = [];
    for (let b = 0; b < 3; b++) {
      const ang = (b * Math.PI) / 3;
      const dx = Math.cos(ang) * 0.28;
      const dz = Math.sin(ang) * 0.28;
      const nx = -Math.sin(ang) * 0.07;
      const nz = Math.cos(ang) * 0.07;
      tuftPositions.push(
        -dx,
        0,
        -dz,
        dx,
        0,
        dz,
        dx * 0.55 + nx,
        1,
        dz * 0.55 + nz,
        -dx,
        0,
        -dz,
        dx * 0.55 + nx,
        1,
        dz * 0.55 + nz,
        -dx * 0.55 + nx,
        1,
        -dz * 0.55 + nz,
      );
    }
    const tuftGeo = new T.BufferGeometry();
    tuftGeo.setAttribute(
      'position',
      new T.Float32BufferAttribute(tuftPositions, 3),
    );
    tuftGeo.computeVertexNormals();
    const grassMat = a.mat('#ffffff', 0.98);
    grassMat.side = T.DoubleSide;
    const grass = new T.InstancedMesh(a.geo(tuftGeo), grassMat, 900);
    const grassColor = new T.Color();
    let grassSeed = 42019;
    const grassRand = () => {
      grassSeed = (Math.imul(grassSeed, 1664525) + 1013904223) >>> 0;
      return grassSeed / 4294967296;
    };
    let placed = 0;
    for (let i = 0; i < 1600 && placed < 900; i++) {
      const x = (grassRand() - 0.5) * 260;
      const z = -70 + grassRand() * 205;
      const gy = flakCoastHeight(x, z);
      if (Math.hypot(x, z - 4) < 13.5 || gy < 0.75) continue;
      this.object.position.set(x, gy - 0.02, z);
      this.object.scale.set(
        0.75 + grassRand() * 0.75,
        0.45 + grassRand() * 0.85,
        0.75 + grassRand() * 0.75,
      );
      this.object.rotation.set(
        0,
        grassRand() * Math.PI * 2,
        (grassRand() - 0.5) * 0.25,
      );
      this.object.updateMatrix();
      grass.setMatrixAt(placed, this.object.matrix);
      grassColor.setHSL(
        0.19 + grassRand() * 0.06,
        0.24 + grassRand() * 0.16,
        0.24 + grassRand() * 0.14,
      );
      grass.setColorAt(placed, grassColor);
      placed++;
    }
    grass.count = placed;
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    this.scene.add(grass);
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post?.setSize(w, h);
  }
  reset() {
    this.puffs = [];
    this.previous = 0;
    this.smokeClock = 0;
    this.ambientClock = 0;
    this.flash = 0;
    this.shake = 0;
    this.light.intensity = 0;
    this.bombs.count = 0;
    this.shells.count = 0;
    this.smoke.clear();
    this.flashes.clear();
    this.tracers.clear();
    for (const p of this.planes) {
      p.id = -1;
      p.root.visible = false;
    }
    for (const p of this.troops) {
      p.id = -1;
      p.root.visible = false;
    }
  }
  private puff(
    at: Vec,
    size: number,
    life: number,
    shade: number,
    glow = false,
  ) {
    if (this.puffs.length >= 240) this.puffs.shift();
    const seed = (++this.serial * 0.6180339887) % 1;
    this.puffs.push({
      at: { ...at },
      size,
      life,
      shade,
      glow,
      age: 0,
      spin: ((this.serial % 11) - 5) * 0.08,
      rot: seed * Math.PI * 2,
      seed,
    });
  }
  private effects(events: FlakEvent[]) {
    for (const e of events) {
      if (e.kind === 'shot') {
        this.flash = 1;
        this.light.position.set(e.at.x, e.at.y, e.at.z);
        this.puff(e.at, 0.65, 0.07, 1, true);
      } else if (e.kind === 'hit') {
        this.puff(e.at, 2, 0.16, 1, true);
        this.puff(e.at, 3, 3, 0.16);
      } else if (e.kind === 'strafe') {
        this.puff(e.at, 2.4, 0.09, 1, true);
      } else if (e.kind === 'strike') {
        this.puff(e.at, 1.2, 0.12, 1, true);
        this.puff({ ...e.at, y: 0.5 }, 2.8, 1.8, 0.4);
        if (Math.hypot(e.at.x, e.at.z - 4) < 10)
          this.shake = Math.max(this.shake, 0.35);
      } else if (e.kind === 'burst') {
        this.puff(e.at, 5, 4, 0.2);
      } else {
        this.shake = e.kind === 'damage' ? 1 : 0.2;
        this.puff(e.at, 16, 0.35, 1, true);
        for (let i = 0; i < 8; i++)
          this.puff(
            {
              x: e.at.x + Math.sin(i) * 4,
              y: e.at.y + i * 1.5,
              z: e.at.z + Math.cos(i) * 4,
            },
            8 + i,
            9,
            0.22,
          );
      }
    }
  }
  render(s: FlakState, zoom: boolean, reducedMotion = false) {
    if (this.disposed) return;
    const dt = Math.max(0, Math.min(0.15, s.time - this.previous));
    this.previous = s.time;
    this.effects(s.events);
    s.events = [];
    this.smokeClock += dt;
    this.ambientClock += dt;
    this.flash = Math.max(0, this.flash - dt * 18);
    this.shake = Math.max(0, this.shake - dt * 2);
    const d = aimDirection(s),
      eye = eyePosition(s);
    this.camera.position.set(
      eye.x,
      eye.y + (reducedMotion ? 0 : Math.sin(s.time * 51) * this.shake * 0.13),
      eye.z,
    );
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(eye.x + d.x * 500, eye.y + d.y * 500, eye.z + d.z * 500);
    const wantedFov = zoom ? 35 : this.camera.aspect < 0.85 ? 70 : 59;
    const nextFov = T.MathUtils.damp(
      this.camera.fov,
      wantedFov,
      14,
      Math.max(dt, 1 / 120),
    );
    if (Math.abs(nextFov - this.camera.fov) > 1e-4) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
    this.weapon.yaw.rotation.y = -s.yaw;
    this.weapon.cradle.rotation.x = s.pitch;
    this.weapon.cradle.position.z = this.flash * 0.035;
    this.light.intensity = this.flash * 9;
    this.shells.count = Math.min(48, s.fired);
    const active = new Set(s.planes.map((p) => p.id));
    for (const slot of this.planes)
      if (!active.has(slot.id)) {
        slot.id = -1;
        slot.root.visible = false;
      }
    for (const p of s.planes) {
      let slot = this.planes.find((v) => v.id === p.id);
      if (!slot) {
        slot = this.planes.find((v) => v.id === -1 && v.kind === p.kind);
        if (!slot) continue;
        slot.id = p.id;
      }
      slot.root.visible = true;
      slot.root.position.set(p.x, p.y, p.z);
      slot.root.rotation.set(
        p.falling
          ? -0.1 - p.falling * 0.09
          : Math.atan2(p.vy, Math.hypot(p.vx, p.vz)) +
              Math.sin(p.age * 0.3) * 0.01,
        Math.atan2(-p.vx, -p.vz),
        p.falling
          ? Math.sin(p.id) * p.falling * 0.3
          : Math.sin(p.age * 0.4) * 0.025,
        'YXZ',
      );
      for (const prop of slot.props)
        prop.rotation.z = s.time * (p.health > 0 ? 41 : 12);
      if (p.hit && this.smokeClock > 0.095) {
        const point = new T.Vector3(p.hit.x, p.hit.y, p.hit.z); // Impact offset starts at the damaged part and follows the wreck.
        point.applyAxisAngle(new T.Vector3(0, 1, 0), -slot.root.rotation.y);
        point.applyEuler(slot.root.rotation);
        point.add(slot.root.position);
        this.puff(
          point,
          p.health <= 0 ? 5 : 2.5,
          p.health <= 0 ? 8 : 4,
          p.health <= 0 ? 0.08 : 0.28,
        );
        if (p.health <= 0) this.puff(point, 2.2, 0.22, 1, true);
      }
    }
    if (this.smokeClock > 0.095) this.smokeClock = 0;
    const troopers = new Set(s.troops.map((t) => t.id));
    for (const slot of this.troops)
      if (!troopers.has(slot.id)) {
        slot.id = -1;
        slot.root.visible = false;
      }
    for (const t of s.troops) {
      let slot = this.troops.find((v) => v.id === t.id);
      if (!slot) {
        slot = this.troops.find((v) => v.id === -1);
        if (!slot) continue;
        slot.id = t.id;
      }
      slot.root.visible = true;
      slot.root.position.set(t.x, t.y, t.z);
      slot.root.rotation.z = Math.sin(t.age * 1.7 + t.id) * 0.1;
      slot.canopy.visible = t.age > 0.65;
      const opening = Math.min(1, (t.age - 0.65) * 2.5);
      slot.canopy.scale.set(
        t.health > 0 ? Math.max(0.08, opening) : 0.23,
        t.health > 0 ? 1 : 1.7,
        t.health > 0 ? Math.max(0.08, opening) : 0.2,
      );
    }
    let tracerCount = 0;
    for (let i = 0; i < s.rounds.length && tracerCount < 40; i++) {
      const r = s.rounds[i];
      const scale = 0.025;
      this.tracers.set(
        tracerCount++,
        r.x - r.vx * scale,
        r.y - r.vy * scale,
        r.z - r.vz * scale,
        r.x,
        r.y,
        r.z,
        0.09,
        1.85,
        1.45,
        0.75,
        0.95,
      );
    }
    for (let i = 0; i < s.enemyRounds.length && tracerCount < 64; i++) {
      const r = s.enemyRounds[i];
      this.tracers.set(
        tracerCount++,
        r.x - r.vx * 0.045,
        r.y - r.vy * 0.045,
        r.z - r.vz * 0.045,
        r.x,
        r.y,
        r.z,
        0.1,
        1.9,
        0.8,
        0.38,
        0.95,
      );
    }
    this.tracers.commit(tracerCount);
    this.bombs.count = Math.min(8, s.bombs.length);
    for (let i = 0; i < this.bombs.count; i++) {
      const b = s.bombs[i];
      this.object.position.set(b.x, b.y, b.z);
      this.object.rotation.set(
        Math.atan2(-b.vy, Math.hypot(b.vx, b.vz)),
        Math.atan2(-b.vx, -b.vz),
        0,
        'YXZ',
      );
      this.object.scale.setScalar(1.1);
      this.object.updateMatrix();
      this.bombs.setMatrixAt(i, this.object.matrix);
    }
    if (this.bombs.count > 0) this.bombs.instanceMatrix.needsUpdate = true;
    if (this.ambientClock > 2.3) {
      this.ambientClock = 0;
      const t = s.time;
      this.puff(
        {
          x: Math.sin(t * 3.17) * 620,
          y: 200 + Math.sin(t * 1.83) * 80,
          z: -700 - Math.cos(t) * 220,
        },
        14,
        11,
        0.12,
      );
    }
    let write = 0;
    let smokeCount = 0;
    let flashCount = 0;
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      if (!p.glow) {
        p.at.x += dt * 3;
        p.at.y += dt * 1.8;
        p.rot += p.spin * dt;
      }
      const size = p.size * (1 + p.age * 0.25);
      const alpha = 1 - p.age / p.life;
      if (p.glow) {
        if (flashCount < this.flashes.capacity) {
          this.flashes.set(
            flashCount++,
            p.at.x,
            p.at.y,
            p.at.z,
            size,
            size,
            2.8,
            1.35,
            0.35,
            alpha * 0.95,
            p.rot,
            p.seed,
          );
        }
      } else if (smokeCount < this.smoke.capacity) {
        this.smoke.set(
          smokeCount++,
          p.at.x,
          p.at.y,
          p.at.z,
          size,
          size,
          p.shade,
          p.shade,
          p.shade * 0.98,
          alpha * 0.72,
          p.rot,
          p.seed,
        );
      }
      this.puffs[write++] = p;
    }
    this.puffs.length = write;
    this.smoke.commit(smokeCount, s.time);
    this.flashes.commit(flashCount, s.time);
    this.clouds.material.uniforms.uTime.value = s.time;
    this.sky.material.uniforms.time.value = s.time;
    this.ocean.update(s.time, { ships: [] });
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.onLost,
    );
    this.renderer.domElement.remove();
    this.post?.dispose();
    this.smoke.dispose();
    this.flashes.dispose();
    this.clouds.dispose();
    this.tracers.dispose();
    this.scene.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
      if (o instanceof T.Light && 'shadow' in o)
        (o as T.DirectionalLight).shadow?.dispose();
    });
    this.ocean.dispose();
    (this.sky.material as T.Material).dispose();
    this.sky.geometry.dispose();
    this.environment.dispose();
    this.art.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.puffs = [];
  }
}
