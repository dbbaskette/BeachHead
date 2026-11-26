import { mobilePixelRatio, TOUCH_LAYOUT_QUERY } from '../touch-input';
import { LandingCraftRenderer } from './landing-craft';
import { CoastalAtmosphere } from '../naval/atmosphere';
import {
  makeDaylightSky,
  COASTAL_SUN,
  bakeCoastalEnvironment,
} from '../naval/daylight';
import { createBloomComposer } from '../post-processing';
import { BillboardPool, TracerPool, createBloodSplatMaterial } from '../vfx';
import {
  beachHeight,
  createBeachGeometry,
  naturalSand,
  CoastalWater,
} from './terrain';
import { WreckSmoke } from './smolder';
import { AssaultSmoke } from './assault-smoke';
import { FoxholeDetail } from './foxhole-detail';
import { GrenadeBlast } from './grenade-blast';
import { TacticalRenderer, supportCrew } from './tactical-renderer';
import { VehicleRenderer } from './vehicles';
import { BEACH_OBSTACLES } from './navigation';
import * as THREE from 'three';
import { InfantryRenderer } from './infantry';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BeachDetail,
  createSurfaceMaps,
  type PillboxSurfaceMaps,
} from './detail';
import {
  AIM_BOUNDS,
  COVER_ROWS,
  type PillboxBattle,
  type PillboxEvent,
} from './types';

export type PillboxScreenPoint = { x: number; y: number; visible: boolean };

type FlashEffect = {
  x: number;
  y: number;
  z: number;
  size: number;
  grow: number;
  age: number;
  life: number;
  r: number;
  g: number;
  b: number;
  spin: number;
  seed: number;
};

type DustEffect = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  grow: number;
  age: number;
  life: number;
  r: number;
  g: number;
  b: number;
  spin: number;
  seed: number;
};

type TracerEffect = {
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ey: number;
  ez: number;
  width: number;
  r: number;
  g: number;
  b: number;
  age: number;
  life: number;
};

type BloodDrop = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  scale: number;
  age: number;
  life: number;
  r: number;
  g: number;
  b: number;
  settled?: boolean;
};

type BloodStain = {
  x: number;
  y: number;
  z: number;
  scale: number;
  rotY: number;
  seed: number;
  age: number;
  life: number;
};

type HelmetPiece = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  svx: number;
  svy: number;
  svz: number;
  age: number;
  life: number;
  settled?: boolean;
};

const MAX_FLASHES = 48;
const MAX_DUSTS = 96;
const MAX_TRACERS = 48;
const MAX_BLOOD_DROPS = 96;
const MAX_BLOOD_STAINS = 40;
const MAX_HELMETS = 24;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function proceduralSteelPbr() {
  const size = 256;
  const diffuse = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  for (let y = 0; y < size; y++) {
    const seamY = y < 3 || Math.abs(y - 128) < 2;
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const seamX = x < 3 || Math.abs(x - 128) < 2;
      const brush =
        Math.sin(x * 0.28 + hash(Math.floor(x / 6), y) * 1.4) * 0.14 +
        (hash(x, Math.floor(y / 2)) - 0.5) * 0.2;
      const grain = (hash(x, y) - 0.5) * 0.14;
      const seam = seamX || seamY ? -0.35 : 0;
      heights[idx] = brush + grain + seam;
      const v = Math.max(
        92,
        Math.min(230, Math.round(172 + heights[idx] * 48)),
      );
      const r = Math.max(
        85,
        Math.min(235, Math.round(145 - brush * 38 + (seam ? 42 : 0))),
      );
      const o = idx * 4;
      diffuse[o] = v;
      diffuse[o + 1] = v + 2;
      diffuse[o + 2] = v + 2;
      diffuse[o + 3] = 255;
      rough[o] = rough[o + 1] = rough[o + 2] = r;
      rough[o + 3] = 255;
    }
  }
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * 2.2;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * 2.2;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      normal[o] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  }
  const make = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return {
    map: make(diffuse, true),
    normalMap: make(normal, false),
    roughnessMap: make(rough, false),
  };
}

function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  rotation?: [number, number, number],
) {
  const value = new THREE.Mesh(geometry, material);
  value.position.set(...position);
  if (rotation) value.rotation.set(...rotation);
  value.castShadow = value.receiveShadow = true;
  return value;
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export class PillboxScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(55, 1, 0.25, 2800);
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
  private width = 1;
  private height = 1;
  private observer: ResizeObserver;
  private infantry: InfantryRenderer;
  private atmosphere = new CoastalAtmosphere(this.scene, 'beach');
  private sky = makeDaylightSky();
  private landingCraft: LandingCraftRenderer;
  private coast = new CoastalWater(this.scene);
  private wreckSmoke = new WreckSmoke(this.scene);
  private assaultSmoke = new AssaultSmoke(this.scene);
  private foxholes = new FoxholeDetail(this.scene);
  private grenadeBlast = new GrenadeBlast(this.scene);
  private tactical = new TacticalRenderer(this.scene);
  private vehicles = new VehicleRenderer(this.scene);
  private detail: BeachDetail;
  private surfaceMaps: PillboxSurfaceMaps | null = null;
  readonly ready: Promise<void>;
  private gun = new THREE.Group();
  private gunCradle = new THREE.Group();
  private barrel = new THREE.Group();
  private muzzle = new THREE.Object3D();
  private muzzleLight = new THREE.PointLight('#ffb253', 0, 32, 2);
  private post?: ReturnType<typeof createBloomComposer>;
  private flashPool: BillboardPool;
  private dustPool: BillboardPool;
  private tracerPool: TracerPool;
  private flashes: FlashEffect[] = [];
  private dusts: DustEffect[] = [];
  private tracers: TracerEffect[] = [];
  private bloodDrops: BloodDrop[] = [];
  private bloodStains: BloodStain[] = [];
  private helmets: HelmetPiece[] = [];
  private bloodDropMesh: THREE.InstancedMesh;
  private bloodStainMesh: THREE.InstancedMesh;
  private bloodStainAlpha: THREE.InstancedBufferAttribute;
  private bloodStainSeed: THREE.InstancedBufferAttribute;
  private helmetMesh: THREE.InstancedMesh;
  private stainOrder = 0;
  private scratchColor = new THREE.Color();
  private scratchVec = new THREE.Vector3();
  private scratchDummy = new THREE.Object3D();
  private visualTime = 0;
  private lastBattleTime = Number.POSITIVE_INFINITY;
  private recoil = 0;
  private textures: THREE.Texture[] = [];
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private disposed = false;
  private environment: THREE.WebGLRenderTarget | null = null;
  private cachedRect = { left: 0, top: 0, width: 1, height: 1 };
  private aimNdc = new THREE.Vector2();
  private aimWorld = new THREE.Vector3();
  private projectVec = new THREE.Vector3();
  private handleScroll = () => this.updateRect();
  onResize?: () => void;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    const touch = window.matchMedia(TOUCH_LAYOUT_QUERY).matches;
    this.renderer.setPixelRatio(
      mobilePixelRatio(window.devicePixelRatio, touch),
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);

    this.flashPool = new BillboardPool(this.scene, MAX_FLASHES, {
      blending: 'additive',
      kind: 'fire',
      renderOrder: 6,
    });
    this.dustPool = new BillboardPool(this.scene, MAX_DUSTS, {
      blending: 'normal',
      kind: 'smoke',
      renderOrder: 4,
    });
    this.tracerPool = new TracerPool(this.scene, MAX_TRACERS);

    const dropGeo = new THREE.SphereGeometry(0.08, 6, 4);
    const dropMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      roughness: 0.45,
      metalness: 0.05,
    });
    this.geometries.push(dropGeo);
    this.materials.push(dropMat);
    this.bloodDropMesh = new THREE.InstancedMesh(
      dropGeo,
      dropMat,
      MAX_BLOOD_DROPS,
    );
    this.bloodDropMesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.bloodDropMesh.count = 0;
    this.bloodDropMesh.frustumCulled = false;

    const stainGeo = new THREE.PlaneGeometry(1, 1);
    stainGeo.rotateX(-Math.PI / 2);
    this.bloodStainAlpha = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_BLOOD_STAINS),
      1,
    );
    this.bloodStainAlpha.setUsage(THREE.DynamicDrawUsage);
    this.bloodStainSeed = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_BLOOD_STAINS),
      1,
    );
    this.bloodStainSeed.setUsage(THREE.DynamicDrawUsage);
    stainGeo.setAttribute('aAlpha', this.bloodStainAlpha);
    stainGeo.setAttribute('aSeed', this.bloodStainSeed);
    const stainMat = createBloodSplatMaterial();
    this.geometries.push(stainGeo);
    this.materials.push(stainMat);
    this.bloodStainMesh = new THREE.InstancedMesh(
      stainGeo,
      stainMat,
      MAX_BLOOD_STAINS,
    );
    this.bloodStainMesh.count = 0;
    this.bloodStainMesh.frustumCulled = false;
    this.bloodStainMesh.renderOrder = 2;

    const helmetGeo = new THREE.SphereGeometry(
      0.245,
      14,
      8,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.57,
    );
    helmetGeo.scale(1, 0.8, 1);
    const helmetMat = new THREE.MeshStandardMaterial({
      color: '#505a45',
      roughness: 0.7,
      metalness: 0.45,
      side: THREE.DoubleSide,
    });
    this.geometries.push(helmetGeo);
    this.materials.push(helmetMat);
    this.helmetMesh = new THREE.InstancedMesh(
      helmetGeo,
      helmetMat,
      MAX_HELMETS,
    );
    this.helmetMesh.count = 0;
    this.helmetMesh.castShadow = true;
    this.helmetMesh.frustumCulled = false;
    this.scene.add(this.bloodDropMesh, this.bloodStainMesh, this.helmetMesh);

    this.scene.background = new THREE.Color('#abc0c1');
    this.scene.fog = new THREE.Fog('#a7b7b5', 180, 1100);
    this.camera.position.set(0, 9.2, 8.2);
    this.camera.lookAt(0, 0, -48);

    const random = seeded(1944);
    const material = (p: THREE.MeshStandardMaterialParameters) => {
      const m = new THREE.MeshStandardMaterial(p);
      this.materials.push(m);
      return m;
    };
    const sand = material({ color: '#eee9da', roughness: 1 });
    naturalSand(sand);
    const concrete = material({
      color: '#8b8a78',
      roughness: 0.95,
    });
    const concreteDark = material({
      color: '#3b3e37',
      roughness: 1,
    });
    const fabricMap = canvasTexture((ctx) => {
      ctx.fillStyle = '#958869';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 512; i += 3) {
        ctx.strokeStyle = i % 2 ? '#514b3628' : '#e4dab72a';
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
        ctx.stroke();
      }
      for (let i = 0; i < 1800; i++) {
        ctx.fillStyle = '#302d1d15';
        ctx.fillRect(
          random() * 512,
          random() * 512,
          random() * 8,
          random() * 8,
        );
      }
      ctx.strokeStyle = '#393925';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.strokeRect(16, 18, 480, 476);
    });
    this.textures.push(fabricMap);
    const webbing = material({
      color: '#cec9ae',
      map: fabricMap,
      bumpMap: fabricMap,
      bumpScale: 0.04,
      roughness: 1,
    });
    const steelMaps = proceduralSteelPbr();
    const woodGrainMap = canvasTexture((ctx) => {
      const img = ctx.createImageData(512, 512);
      const data = img.data;
      for (let y = 0; y < 512; y++) {
        const g = Math.sin(y * 0.14 + Math.sin(y * 0.03) * 3) * 14;
        const r = Math.round(115 + g);
        const cg = Math.round(80 + g * 0.7);
        const b = Math.round(52 + g * 0.45);
        for (let x = 0; x < 512; x++) {
          const o = (y * 512 + x) * 4;
          data[o] = r;
          data[o + 1] = cg;
          data[o + 2] = b;
          data[o + 3] = 255;
        }
      }
      for (let i = 0; i < 4500; i++) {
        const x0 = Math.max(0, Math.floor(random() * 512));
        const py = Math.min(511, Math.floor(random() * 512));
        const x1 = Math.min(512, Math.ceil(x0 + 12 + random() * 48));
        const dark = i % 2 !== 0;
        const alpha = dark ? 0.12 : 0.08;
        const inv = 1 - alpha;
        const sr = dark ? 30 : 180;
        const sg = dark ? 18 : 140;
        const sb = dark ? 10 : 100;
        for (let px = x0; px < x1; px++) {
          const o = (py * 512 + px) * 4;
          data[o] = Math.round(data[o] * inv + sr * alpha);
          data[o + 1] = Math.round(data[o + 1] * inv + sg * alpha);
          data[o + 2] = Math.round(data[o + 2] * inv + sb * alpha);
        }
      }
      ctx.putImageData(img, 0, 0);
    });
    this.textures.push(
      steelMaps.map,
      steelMaps.normalMap,
      steelMaps.roughnessMap,
      woodGrainMap,
    );
    const steel = material({
      color: '#88928a',
      map: steelMaps.map,
      normalMap: steelMaps.normalMap,
      roughnessMap: steelMaps.roughnessMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.48,
      metalness: 0.62,
    });
    const brass = material({
      color: '#c49848',
      map: steelMaps.map,
      roughnessMap: steelMaps.roughnessMap,
      roughness: 0.36,
      metalness: 0.8,
    });
    const wood = material({
      color: '#876348',
      map: woodGrainMap,
      bumpMap: woodGrainMap,
      bumpScale: 0.025,
      roughness: 0.76,
    });
    const geo = <T extends THREE.BufferGeometry>(g: T) => {
      this.geometries.push(g);
      return g;
    };
    this.scene.add(mesh(geo(createBeachGeometry()), sand, [0, 0, 0]));

    // Heavy embrasure: the darkness and close framing make the player visibly occupy a bunker.
    this.scene.add(
      mesh(geo(new THREE.BoxGeometry(8, 10, 7)), concrete, [-10.8, 7, 3]),
      mesh(geo(new THREE.BoxGeometry(8, 10, 7)), concrete, [10.8, 7, 3]),
      mesh(geo(new THREE.BoxGeometry(24, 4.5, 9)), concreteDark, [0, 13.2, 2]),
      mesh(geo(new THREE.BoxGeometry(24, 2.5, 8)), concrete, [0, 1.05, 2]),
    );
    const sandbagGeo = geo(new RoundedBoxGeometry(0.85, 1.98, 0.96, 3, 0.21));
    const sandbags = new THREE.InstancedMesh(sandbagGeo, webbing, 42);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 42; i++) {
      const row = Math.floor(i / 14),
        col = i % 14;
      dummy.position.set(
        (col - 6.5) * 1.45 + (row % 2) * 0.55,
        1.85 + row * 0.62,
        -1.7,
      );
      dummy.rotation.set(0, 0, Math.PI / 2);
      dummy.scale.set(
        0.95 + random() * 0.12,
        0.82 + random() * 0.12,
        0.92 + random() * 0.16,
      );
      dummy.updateMatrix();
      sandbags.setMatrixAt(i, dummy.matrix);
    }
    sandbags.castShadow = sandbags.receiveShadow = true;
    this.scene.add(sandbags);

    const hullMap = canvasTexture((ctx) => {
      const img = ctx.createImageData(512, 512);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0xab;
        data[i + 1] = 0xb1;
        data[i + 2] = 0xa8;
        data[i + 3] = 255;
      }
      for (let i = 0; i < 7000; i++) {
        const x = random() * 512;
        const y = random() * 512;
        const w = 1 + random() * 3;
        const h = 2 + random() * 16;
        const alpha = 0.04 + random() * 0.16;
        const inv = 1 - alpha;
        const x0 = Math.max(0, Math.floor(x));
        const y0 = Math.max(0, Math.floor(y));
        const x1 = Math.min(512, Math.ceil(x + w));
        const y1 = Math.min(512, Math.ceil(y + h));
        for (let py = y0; py < y1; py++) {
          for (let px = x0; px < x1; px++) {
            const o = (py * 512 + px) * 4;
            data[o] = Math.round(data[o] * inv + 59 * alpha);
            data[o + 1] = Math.round(data[o + 1] * inv + 48 * alpha);
            data[o + 2] = Math.round(data[o + 2] * inv + 35 * alpha);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      for (let y = 0; y < 512; y += 128) {
        ctx.fillStyle = 'rgba(24,31,29,.35)';
        ctx.fillRect(0, y, 512, 2);
        for (let x = 12; x < 512; x += 32) {
          ctx.fillStyle = '#515b54';
          ctx.fillRect(x, y + 6, 2, 2);
        }
      }
    });
    this.textures.push(hullMap);
    this.landingCraft = new LandingCraftRenderer(this.scene, hullMap);
    this.makeBeachDetails(geo, steel, wood, concrete, webbing);
    this.makeGun(geo, steel, wood, brass);
    this.scene.add(this.gun, this.muzzleLight);

    this.infantry = new InfantryRenderer(this.scene);
    this.detail = new BeachDetail(this.scene);
    this.ready = Promise.all([
      this.infantry.ready,
      createSurfaceMaps().then((maps) => {
        if (this.disposed) {
          maps.dispose();
          return;
        }
        this.surfaceMaps = maps;
        for (const texture of Object.values(maps.sand))
          texture.repeat.set(40, 31.67);
        for (const texture of Object.values(maps.concrete))
          texture.repeat.set(1, 1);
        Object.assign(sand, maps.sand);
        sand.color.set('#ffffff');
        sand.normalScale.set(0.4, 0.4);
        sand.needsUpdate = true;
        for (const mat of [concrete, concreteDark]) {
          Object.assign(mat, maps.concrete);
          mat.normalScale.set(0.75, 0.75);
          mat.needsUpdate = true;
        }
        concrete.color.set('#c5c9c1');
        concreteDark.color.set('#929b91');
        // Meter-scaled concrete UVs keep cracks and aggregate consistent across wall sizes.
        const mapped = new Set<THREE.BufferGeometry>();
        this.scene.traverse((object) => {
          if (
            !(object instanceof THREE.Mesh) ||
            ![concrete, concreteDark].includes(
              object.material as THREE.MeshStandardMaterial,
            ) ||
            mapped.has(object.geometry)
          )
            return;
          mapped.add(object.geometry);
          const positions = object.geometry.getAttribute('position'),
            normals = object.geometry.getAttribute('normal');
          const uv = object.geometry.getAttribute('uv');
          for (let i = 0; i < uv.count; i++) {
            const nx = Math.abs(normals.getX(i)),
              ny = Math.abs(normals.getY(i));
            uv.setXY(
              i,
              (nx > 0.5 ? positions.getZ(i) : positions.getX(i)) / 2,
              (ny > 0.5 ? positions.getZ(i) : positions.getY(i)) / 2,
            );
          }
          uv.needsUpdate = true;
        });
      }),
    ]).then(() => undefined);

    this.makeSky();
    this.scene.add(new THREE.HemisphereLight('#c4d9e4', '#726149', 0.75));
    const bunkerFill = new THREE.PointLight('#ffe0ae', 34, 42, 1.45);
    bunkerFill.position.set(-3, 9, 10);
    this.scene.add(bunkerFill);
    const sun = new THREE.DirectionalLight('#fff0d8', 3.1);
    sun.position
      .copy(COASTAL_SUN)
      .multiplyScalar(115)
      .add(new THREE.Vector3(0, 0, -72));
    sun.target.position.set(0, 0, -72);
    sun.castShadow = true;
    const shadowSize = touch ? 1024 : 2048;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, {
      left: -102,
      right: 90,
      top: 76,
      bottom: -64,
      near: 40,
      far: 205,
    });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 2;
    this.scene.add(sun, sun.target);

    if (!touch) {
      this.post = createBloomComposer(this.renderer, this.scene, this.camera, {
        strength: 0.28,
        radius: 0.4,
        threshold: 1.15,
      });
    }

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    window.addEventListener('scroll', this.handleScroll, { passive: true });
    this.resize();
  }

  private updateRect() {
    if (this.disposed) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      this.cachedRect = {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
    }
  }

  getRect() {
    if (this.cachedRect.width <= 1) this.updateRect();
    return this.cachedRect;
  }

  private makeBeachDetails(
    geo: <T extends THREE.BufferGeometry>(g: T) => T,
    steel: THREE.Material,
    wood: THREE.Material,
    concrete: THREE.Material,
    canvas: THREE.Material,
  ) {
    const dummy = new THREE.Object3D();
    const obstacleGeo = geo(new THREE.BoxGeometry(0.3, 0.32, 4.3));
    const obstacles = new THREE.InstancedMesh(obstacleGeo, steel, 60);
    const steelObstacles = BEACH_OBSTACLES.filter((o) => o.kind === 'steel');
    for (let i = 0; i < steelObstacles.length; i++)
      for (let arm = 0; arm < 3; arm++) {
        const o = steelObstacles[i];
        dummy.position.set(o.x, 1.2, o.z);
        dummy.rotation.set((arm * Math.PI) / 3, i * 0.71, Math.PI / 4);
        dummy.updateMatrix();
        obstacles.setMatrixAt(i * 3 + arm, dummy.matrix);
      }
    obstacles.castShadow = true;
    this.scene.add(obstacles);
    const coverGeo = geo(new RoundedBoxGeometry(8, 1.25, 1.5, 3, 0.12));
    const covers = new THREE.InstancedMesh(coverGeo, concrete, 10);
    let n = 0;
    for (const z of COVER_ROWS)
      for (let x = -36; x <= 36; x += 18) {
        dummy.position.set(x, 0.62, z);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        covers.setMatrixAt(n++, dummy.matrix);
      }
    covers.castShadow = covers.receiveShadow = true;
    this.scene.add(covers);
    const postGeo = geo(new THREE.CylinderGeometry(0.06, 0.09, 2.2, 6));
    const wireObstacles = BEACH_OBSTACLES.filter((o) => o.kind === 'wire');
    const posts = new THREE.InstancedMesh(
      postGeo,
      steel,
      wireObstacles.length * 4,
    );
    const wireMat = new THREE.LineBasicMaterial({
      color: '#343632',
      transparent: true,
      opacity: 0.72,
    });
    this.materials.push(wireMat);
    const wirePositions: number[] = [];
    let postIndex = 0;
    for (const o of wireObstacles)
      for (const z of [o.z - 3, o.z + 3]) {
        for (const x of [o.x - o.halfX, o.x + o.halfX]) {
          dummy.position.set(x, 1, z);
          dummy.rotation.set(0, 0, 0.08);
          dummy.updateMatrix();
          posts.setMatrixAt(postIndex++, dummy.matrix);
        }
        let prevX = o.x - o.halfX;
        let prevY = 0.9 + Math.sin(prevX * 1.3) * 0.28;
        for (let x = o.x - o.halfX + 0.5; x <= o.x + o.halfX; x += 0.5) {
          const y = 0.9 + Math.sin(x * 1.3) * 0.28;
          wirePositions.push(prevX, prevY, z, x, y, z);
          prevX = x;
          prevY = y;
        }
      }
    const wireGeo = geo(new THREE.BufferGeometry());
    wireGeo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(wirePositions, 3),
    );
    this.scene.add(new THREE.LineSegments(wireGeo, wireMat), posts);
    // Interior ammunition boxes and a few loose brass cases.
    for (const x of [-8.3, 8.8])
      this.scene.add(
        mesh(geo(new THREE.BoxGeometry(3, 1.5, 2)), canvas, [x, 2.6, 1]),
      );
  }

  private makeSky() {
    const sky = this.sky;
    this.materials.push(sky.material);
    this.geometries.push(sky.geometry);
    this.scene.add(sky);
    this.environment = bakeCoastalEnvironment(
      this.renderer,
      sky,
      '#695d47',
      18000,
    );
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.36;
  }

  private makeGun(
    geo: <T extends THREE.BufferGeometry>(g: T) => T,
    steel: THREE.Material,
    wood: THREE.Material,
    brass: THREE.Material,
  ) {
    const temps: THREE.BufferGeometry[] = [];
    const temp = <T extends THREE.BufferGeometry>(g: T) => {
      temps.push(g);
      return g;
    };
    this.gun.position.set(0, 3.1, 3.7);
    this.gun.add(this.gunCradle);
    this.gunCradle.add(
      mesh(
        geo(new THREE.CylinderGeometry(0.95, 1.1, 0.7, 18)),
        steel,
        [0, 0, 0],
      ),
      this.barrel,
    );
    this.barrel.add(
      mesh(
        temp(new RoundedBoxGeometry(1.45, 1.1, 3.5, 3, 0.08)),
        steel,
        [0, 0.45, -1],
      ),
      mesh(temp(new THREE.BoxGeometry(0.75, 0.45, 2.1)), wood, [0, 0.15, 1.65]),
      mesh(
        temp(new THREE.CylinderGeometry(0.16, 0.2, 9.5, 32)),
        steel,
        [0, 0.5, -7],
        [Math.PI / 2, 0, 0],
      ),
    );
    const shroud = mesh(
      temp(new THREE.CylinderGeometry(0.34, 0.34, 4.8, 32)),
      steel,
      [0, 0.5, -4.35],
      [Math.PI / 2, 0, 0],
    );
    this.barrel.add(shroud);
    const steelMaps = {
      map: (steel as THREE.MeshStandardMaterial).map,
      normalMap: (steel as THREE.MeshStandardMaterial).normalMap,
      roughnessMap: (steel as THREE.MeshStandardMaterial).roughnessMap,
    };
    const inset = new THREE.MeshStandardMaterial({
      color: '#202824',
      roughnessMap: steelMaps.roughnessMap,
      normalMap: steelMaps.normalMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.72,
      metalness: 0.45,
    });
    const hardware = new THREE.MeshStandardMaterial({
      color: '#b4bdb4',
      map: steelMaps.map,
      normalMap: steelMaps.normalMap,
      roughnessMap: steelMaps.roughnessMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.42,
      metalness: 0.8,
    });
    this.materials.push(inset, hardware);
    this.barrel.add(
      mesh(
        temp(new RoundedBoxGeometry(1.31, 0.1, 2.95, 2, 0.035)),
        hardware,
        [0, 1.045, -0.9],
      ),
      mesh(
        temp(new THREE.BoxGeometry(0.035, 0.26, 1.2)),
        inset,
        [0.735, 0.5, -0.9],
      ),
      mesh(
        temp(new THREE.CylinderGeometry(0.075, 0.075, 0.65, 16)),
        hardware,
        [0.98, 0.47, 0.12],
        [0, 0, Math.PI / 2],
      ),
      mesh(
        temp(new THREE.CylinderGeometry(0.12, 0.12, 0.38, 16)),
        inset,
        [1.25, 0.42, 0.12],
      ),
      mesh(
        temp(new THREE.BoxGeometry(0.16, 0.52, 0.18)),
        steel,
        [0, 1.26, -2.35],
      ),
      mesh(
        temp(new THREE.TorusGeometry(0.19, 0.036, 8, 24)),
        hardware,
        [0, 1.56, -2.35],
      ),
      mesh(
        temp(new THREE.BoxGeometry(0.07, 0.55, 0.12)),
        hardware,
        [0, 0.92, -10.9],
      ),
      mesh(
        temp(new THREE.RingGeometry(0.095, 0.19, 24)),
        hardware,
        [0, 0.5, -11.77],
        [0, Math.PI, 0],
      ),
      mesh(
        temp(new THREE.CircleGeometry(0.094, 24)),
        inset,
        [0, 0.5, -11.78],
        [0, Math.PI, 0],
      ),
    );
    const screwGeometry = temp(
      new THREE.CylinderGeometry(0.046, 0.046, 0.025, 12),
    );
    const slotGeometry = temp(new THREE.BoxGeometry(0.052, 0.006, 0.008));
    for (const x of [-0.54, 0.54])
      for (const z of [-2.12, -1.4, -0.65, 0.32]) {
        this.barrel.add(mesh(screwGeometry, inset, [x, 1.11, z]));
        this.barrel.add(mesh(slotGeometry, hardware, [x, 1.126, z]));
      }
    const ventGeometry = temp(new THREE.CircleGeometry(0.105, 14));
    for (let i = 0; i < 11; i++)
      for (const side of [-1, 1])
        this.barrel.add(
          mesh(
            ventGeometry,
            inset,
            [side * 0.31, 0.64, -2.6 - i * 0.35],
            [0, (side * Math.PI) / 2, 0],
          ),
        );
    for (const z of [-6.8, -9.8])
      this.barrel.add(
        mesh(temp(new THREE.TorusGeometry(0.205, 0.025, 8, 24)), hardware, [
          0,
          0.5,
          z,
        ]),
      );
    const marking = canvasTexture((ctx) => {
      ctx.clearRect(0, 0, 512, 512);
      ctx.fillStyle = '#b7bea7';
      ctx.font = 'bold 36px monospace';
      ctx.fillText('CAL .30  /  M1919', 38, 225);
      ctx.font = '22px monospace';
      ctx.fillText('NO. 04286  •  INSPECTED', 40, 276);
    });
    const markingMaterial = new THREE.MeshStandardMaterial({
      map: marking,
      transparent: true,
      roughness: 0.8,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.textures.push(marking);
    this.materials.push(markingMaterial);
    this.barrel.add(
      mesh(
        temp(new THREE.PlaneGeometry(1.1, 1.1)),
        markingMaterial,
        [0, 1.106, -0.85],
        [-Math.PI / 2, 0, 0],
      ),
    );
    for (let i = 0; i < 6; i++)
      this.barrel.add(
        mesh(temp(new THREE.BoxGeometry(0.5, 0.06, 0.22)), steel, [
          0,
          0.82,
          -2.7 - i * 0.62,
        ]),
      );
    const belt = new THREE.InstancedMesh(
      geo(new THREE.CylinderGeometry(0.065, 0.065, 0.55, 7)),
      brass,
      18,
    );
    const d = new THREE.Object3D();
    for (let i = 0; i < 18; i++) {
      d.position.set(
        0.9 + i * 0.13,
        0.35 - i * 0.08,
        -0.95 + Math.sin(i * 0.35) * 0.15,
      );
      d.rotation.z = Math.PI / 2;
      d.updateMatrix();
      belt.setMatrixAt(i, d.matrix);
    }
    this.barrel.add(belt);
    this.muzzle.position.set(0, 0.5, -11.8);
    this.barrel.add(this.muzzle);
    // Static fittings share batches; the barrel assembly remains articulated.
    this.barrel.updateMatrixWorld(true);
    const inverse = this.barrel.matrixWorld.clone().invert();
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const originals: THREE.Mesh[] = [];
    this.barrel.traverse((object) => {
      if (
        !(object instanceof THREE.Mesh) ||
        object instanceof THREE.InstancedMesh ||
        Array.isArray(object.material)
      )
        return;
      let geometry = object.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      if (geometry.index) {
        const indexed = geometry;
        geometry = geometry.toNonIndexed();
        indexed.dispose();
      }
      const batch = batches.get(object.material) ?? [];
      batch.push(geometry);
      batches.set(object.material, batch);
      originals.push(object);
    });
    originals.forEach((object) => object.removeFromParent());
    temps.forEach((g) => g.dispose());
    for (const [mat, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      if (!geometry) continue;
      if (!mat.transparent) {
        const p = geometry.getAttribute('position');
        const n = geometry.getAttribute('normal');
        const uv = geometry.getAttribute('uv');
        if (p && n && uv) {
          for (let i = 0; i < p.count; i++) {
            const nx = Math.abs(n.getX(i)),
              ny = Math.abs(n.getY(i));
            uv.setXY(
              i,
              (nx > 0.5 ? p.getZ(i) : p.getX(i)) * 0.4,
              (ny > 0.5 ? p.getZ(i) : p.getY(i)) * 0.4,
            );
          }
          uv.needsUpdate = true;
        }
      }
      this.barrel.add(mesh(geo(geometry), mat, [0, 0, 0]));
    }
    this.gun.add(
      mesh(
        geo(new THREE.CylinderGeometry(0.11, 0.17, 4.8, 8)),
        steel,
        [-1, -1.5, 0.3],
        [0, 0, -0.38],
      ),
      mesh(
        geo(new THREE.CylinderGeometry(0.11, 0.17, 4.8, 8)),
        steel,
        [1, -1.5, 0.3],
        [0, 0, 0.38],
      ),
    );
  }

  private resize() {
    this.width = Math.max(1, this.host.clientWidth);
    this.height = Math.max(1, this.host.clientHeight);
    this.camera.aspect = this.width / this.height;
    this.camera.fov =
      this.camera.aspect < 0.8
        ? Math.min(
            120,
            THREE.MathUtils.radToDeg(
              2 *
                Math.atan(
                  Math.tan(THREE.MathUtils.degToRad(35)) / this.camera.aspect,
                ),
            ),
          )
        : THREE.MathUtils.clamp(55 / Math.sqrt(this.camera.aspect), 48, 75);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height, false);
    this.post?.setSize(this.width, this.height);
    this.updateRect();
    this.onResize?.();
  }

  aim(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.getRect();
    this.aimNdc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.aimNdc, this.camera);
    const craft = this.landingCraft.pick(this.raycaster);
    if (craft) return craft;
    const vehicle = this.vehicles.pick(this.raycaster);
    if (vehicle) return vehicle;
    const soldier = this.infantry.pick(this.raycaster);
    if (soldier) return soldier;
    if (!this.raycaster.ray.intersectPlane(this.aimPlane, this.aimWorld))
      return null;
    if (
      this.aimWorld.z > -9 ||
      this.aimWorld.z < -215 ||
      Math.abs(this.aimWorld.x) > 70
    )
      return null;
    return { x: this.aimWorld.x, z: this.aimWorld.z };
  }

  project(x: number, z: number): PillboxScreenPoint {
    const p = this.projectVec
      .set(x, beachHeight(x, z) + 1, z)
      .project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.width,
      y: (-p.y * 0.5 + 0.5) * this.height,
      visible:
        p.z > -1 && p.z < 1 && Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.98,
    };
  }

  aimTouch(clientX: number, clientY: number) {
    const point = this.aim(clientX, clientY);
    return point &&
      point.x >= AIM_BOUNDS.minX &&
      point.x <= AIM_BOUNDS.maxX &&
      point.z >= AIM_BOUNDS.minZ &&
      point.z <= AIM_BOUNDS.maxZ
      ? point
      : null;
  }

  event(event: PillboxEvent) {
    if (event.type === 'player-blast')
      this.grenadeBlast.trigger(
        event.x,
        event.z,
        Math.hypot(event.x, event.z) < 25 ? 0.25 : 0,
      );
    if (event.type === 'enemy-fire') {
      const sy = beachHeight(event.x, event.z) + 1.5;
      this.spawnTracer(
        event.x,
        sy,
        event.z,
        event.x * 0.1,
        4,
        -6,
        event.heavy ? 0.14 : 0.1,
        event.heavy ? '#ffa85a' : '#f4ca83',
        0.095,
        2.0,
      );
      this.spawnFlash(event.x, sy, event.z, '#ffd280', 0.65, 0.1);
    }
    if (event.type === 'mortar-launch')
      this.spawnDust(event.x, event.z, '#b4a890');
    if (event.type === 'shot') {
      this.recoil = 1;
      this.muzzleLight.intensity = 45;
      this.muzzle.getWorldPosition(this.scratchVec);
      const ox = this.scratchVec.x;
      const oy = this.scratchVec.y;
      const oz = this.scratchVec.z;
      this.spawnFlash(ox, oy, oz, '#ffd27a', 1.8, 0.09);
      this.spawnTracer(
        ox,
        oy,
        oz,
        event.x,
        1.1,
        event.z,
        0.11,
        '#ffd66d',
        0.065,
        2.2,
      );
      if (event.vehicle)
        this.spawnFlash(event.x, 1.2, event.z, '#ffd295', 0.8, 0.12);
      else if (event.hit) this.spawnBlood(event.x, event.z);
      else this.spawnDust(event.x, event.z, '#806a48');
    }
    if (event.type === 'grenade-impact')
      this.grenadeBlast.trigger(event.x, event.z);
    if (event.type === 'jeep-destroyed') {
      this.spawnFlash(event.x, 1, event.z, '#ff9e42', 5, 0.3);
      this.spawnDust(event.x, event.z, '#3d3933');
    }
    if (event.type === 'down') {
      this.spawnDust(event.x, event.z, '#756348');
      this.spawnHelmet(event.x, event.z, event.id);
    }
    if (event.type === 'breach') {
      this.spawnFlash(event.x, 1.5, event.z, '#f0a24b', 3, 0.22);
      this.spawnDust(event.x, event.z, '#4d4638');
    }
    if (event.type === 'overheat') this.spawnDust(0, 2.7, '#c9c8bd', 3.1);
  }

  private spawnFlash(
    x: number,
    y: number,
    z: number,
    color: string,
    size: number,
    life: number,
  ) {
    if (this.flashes.length >= MAX_FLASHES) this.flashes.shift();
    this.scratchColor.set(color);
    this.flashes.push({
      x,
      y,
      z,
      size,
      grow: 12,
      age: 0,
      life,
      r: this.scratchColor.r * 2.4,
      g: this.scratchColor.g * 2.4,
      b: this.scratchColor.b * 2.4,
      spin: Math.random() * Math.PI * 2,
      seed: Math.random(),
    });
  }

  private spawnTracer(
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    width: number,
    color: string,
    life: number,
    boost: number,
  ) {
    if (this.tracers.length >= MAX_TRACERS) this.tracers.shift();
    this.scratchColor.set(color);
    this.tracers.push({
      sx,
      sy,
      sz,
      ex,
      ey,
      ez,
      width,
      r: this.scratchColor.r * boost,
      g: this.scratchColor.g * boost,
      b: this.scratchColor.b * boost,
      age: 0,
      life,
    });
  }

  private spawnDust(x: number, z: number, color: string, baseY = 0.35) {
    this.scratchColor.set(color);
    for (let i = 0; i < 5; i++) {
      if (this.dusts.length >= MAX_DUSTS) this.dusts.shift();
      this.dusts.push({
        x: x + (Math.random() - 0.5),
        y: baseY + Math.random(),
        z: z + (Math.random() - 0.5),
        vx: (Math.random() - 0.5) * 2,
        vy: 1 + Math.random() * 2,
        vz: (Math.random() - 0.5) * 2,
        size: 0.9 + Math.random() * 0.5,
        grow: 2.0,
        age: 0,
        life: 0.8 + Math.random() * 0.5,
        r: this.scratchColor.r,
        g: this.scratchColor.g,
        b: this.scratchColor.b,
        spin: Math.random() * Math.PI * 2,
        seed: Math.random(),
      });
    }
  }

  private spawnBlood(x: number, z: number) {
    for (let i = 0; i < 9; i++) {
      if (this.bloodDrops.length >= MAX_BLOOD_DROPS) this.bloodDrops.shift();
      this.scratchColor.set(i % 2 ? '#6d1013' : '#a51c23');
      this.bloodDrops.push({
        x,
        y: 1.35 + Math.random() * 0.5,
        z,
        vx: (Math.random() - 0.5) * 5,
        vy: 1.4 + Math.random() * 3,
        vz: -2 - Math.random() * 4,
        scale: 0.75 + Math.random() * 0.8,
        age: 0,
        life: 1.2,
        r: this.scratchColor.r,
        g: this.scratchColor.g,
        b: this.scratchColor.b,
      });
    }
    if (this.bloodStains.length >= MAX_BLOOD_STAINS) this.bloodStains.shift();
    this.bloodStains.push({
      x,
      y: beachHeight(x, z - 0.5) + 0.03 + (this.stainOrder++ % 8) * 0.002,
      z: z - 0.5,
      scale: 0.95 + Math.random() * 0.65,
      rotY: Math.random() * Math.PI * 2,
      seed: Math.random(),
      age: 0,
      life: 18,
    });
  }

  private spawnHelmet(x: number, z: number, id: number) {
    if (this.helmets.length >= MAX_HELMETS) this.helmets.shift();
    this.helmets.push({
      x,
      y: 2.05,
      z,
      vx: id % 2 ? 2.5 : -2.5,
      vy: 4.2,
      vz: -2.8,
      rx: 0,
      ry: 0,
      rz: 0,
      svx: 5,
      svy: 3,
      svz: 2,
      age: 0,
      life: 10,
    });
  }

  private clearEffects() {
    this.flashes.length = 0;
    this.dusts.length = 0;
    this.tracers.length = 0;
    this.bloodDrops.length = 0;
    this.bloodStains.length = 0;
    this.helmets.length = 0;
    this.flashPool.clear();
    this.dustPool.clear();
    this.tracerPool.clear();
    this.bloodDropMesh.count = 0;
    this.bloodStainMesh.count = 0;
    this.helmetMesh.count = 0;
    this.recoil = 0;
    this.muzzleLight.intensity = 0;
    this.grenadeBlast.clear();
  }

  render(battle: PillboxBattle, dt: number, reducedMotion: boolean) {
    if (battle.time < this.lastBattleTime) {
      this.clearEffects();
      this.visualTime = battle.time;
    }
    this.lastBattleTime = battle.time;
    const activeDt =
      battle.status === 'paused' || battle.status === 'resupply'
        ? 0
        : Math.min(dt, 0.1);
    this.visualTime += activeDt;
    this.coast.update(this.visualTime);
    this.detail.update(this.visualTime, this.renderer.getPixelRatio());
    this.sky.material.uniforms.time.value = this.visualTime;
    this.atmosphere.update(battle.time);
    this.wreckSmoke.update(battle);
    this.assaultSmoke.update(battle);
    this.grenadeBlast.update(activeDt, reducedMotion);
    this.recoil = Math.max(0, this.recoil - activeDt * 11);
    this.muzzleLight.intensity = Math.max(
      0,
      this.muzzleLight.intensity - activeDt * 420,
    );
    const target = this.scratchVec.set(battle.aimX, 1, battle.aimZ);
    this.gunCradle.rotation.y = Math.atan2(-target.x, -target.z);
    this.barrel.rotation.x = -Math.atan2(
      target.y - 3.6,
      Math.hypot(target.x, target.z - 3.7),
    );
    this.barrel.position.z = this.recoil * 0.38;
    // Move up to the embrasure in portrait so the ceiling cannot fill the phone screen.
    const portrait = this.camera.aspect < 0.8;
    this.camera.position.set(
      this.grenadeBlast.shake.x,
      (portrait ? 7 : 9.2) +
        (reducedMotion ? 0 : Math.sin(this.visualTime * 1.3) * 0.025) +
        this.grenadeBlast.shake.y,
      (portrait ? -3.2 : 8.2) + this.grenadeBlast.shake.z,
    );
    this.camera.lookAt(
      this.grenadeBlast.shake.x * 3,
      (portrait ? -12 : 0) +
        (reducedMotion ? 0 : this.recoil * 0.04) +
        this.grenadeBlast.shake.y * 2,
      -48,
    );
    this.camera.rotateZ(this.grenadeBlast.roll);
    this.landingCraft.render(battle);
    this.infantry.render(
      {
        ...battle,
        soldiers: [...battle.soldiers, ...supportCrew(battle)],
      },
      activeDt,
      reducedMotion,
    );
    this.vehicles.render(battle, activeDt);
    this.tactical.render(battle);
    this.updateEffects(activeDt);
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private updateEffects(activeDt: number) {
    let flashWrite = 0;
    for (let i = 0; i < this.flashes.length; i++) {
      const f = this.flashes[i];
      f.age += activeDt;
      if (f.age >= f.life) continue;
      const u = f.age / f.life;
      const s = f.size + f.grow * f.age;
      this.flashPool.set(
        flashWrite,
        f.x,
        f.y,
        f.z,
        s,
        s,
        f.r,
        f.g,
        f.b,
        1 - u,
        f.spin + f.age * 3,
        f.seed,
      );
      this.flashes[flashWrite++] = f;
    }
    this.flashes.length = flashWrite;
    this.flashPool.commit(flashWrite, this.visualTime);

    let tracerWrite = 0;
    for (let i = 0; i < this.tracers.length; i++) {
      const tr = this.tracers[i];
      tr.age += activeDt;
      if (tr.age >= tr.life) continue;
      this.tracerPool.set(
        tracerWrite,
        tr.sx,
        tr.sy,
        tr.sz,
        tr.ex,
        tr.ey,
        tr.ez,
        tr.width,
        tr.r,
        tr.g,
        tr.b,
        1 - tr.age / tr.life,
      );
      this.tracers[tracerWrite++] = tr;
    }
    this.tracers.length = tracerWrite;
    this.tracerPool.commit(tracerWrite);

    let dustWrite = 0;
    for (let i = 0; i < this.dusts.length; i++) {
      const d = this.dusts[i];
      d.age += activeDt;
      if (d.age >= d.life) continue;
      d.x += d.vx * activeDt;
      d.y += d.vy * activeDt;
      d.z += d.vz * activeDt;
      d.vy -= activeDt * 0.45;
      const u = d.age / d.life;
      const s = d.size + d.grow * d.age;
      this.dustPool.set(
        dustWrite,
        d.x,
        d.y,
        d.z,
        s,
        s,
        d.r,
        d.g,
        d.b,
        0.42 * (1 - u),
        d.spin + d.age * 0.3,
        d.seed,
      );
      this.dusts[dustWrite++] = d;
    }
    this.dusts.length = dustWrite;
    this.dustPool.commit(dustWrite, this.visualTime);

    let dropWrite = 0;
    const prevDrops = this.bloodDropMesh.count;
    for (let i = 0; i < this.bloodDrops.length; i++) {
      const drop = this.bloodDrops[i];
      drop.age += activeDt;
      if (drop.age >= drop.life) continue;
      if (!drop.settled) {
        drop.x += drop.vx * activeDt;
        drop.y += drop.vy * activeDt;
        drop.z += drop.vz * activeDt;
        drop.vy -= activeDt * 9.8;
        const ground = beachHeight(drop.x, drop.z) + 0.08;
        if (drop.y < ground) {
          drop.y = ground;
          if (drop.vy < -1) {
            drop.vy *= -0.25;
            drop.vx *= 0.45;
            drop.vz *= 0.45;
          } else {
            drop.vx = 0;
            drop.vy = 0;
            drop.vz = 0;
            drop.settled = true;
          }
        }
      }
      const u = drop.age / drop.life;
      const s = drop.scale * Math.max(0.01, 1 - u * u);
      this.scratchDummy.position.set(drop.x, drop.y, drop.z);
      this.scratchDummy.rotation.set(0, 0, 0);
      this.scratchDummy.scale.set(0.8 * s, 1.5 * s, 0.8 * s);
      this.scratchDummy.updateMatrix();
      this.bloodDropMesh.setMatrixAt(dropWrite, this.scratchDummy.matrix);
      this.scratchColor.setRGB(drop.r, drop.g, drop.b);
      this.bloodDropMesh.setColorAt(dropWrite, this.scratchColor);
      this.bloodDrops[dropWrite++] = drop;
    }
    this.bloodDrops.length = dropWrite;
    this.bloodDropMesh.count = dropWrite;
    if (dropWrite > 0 || prevDrops > 0) {
      this.bloodDropMesh.instanceMatrix.needsUpdate = true;
      if (this.bloodDropMesh.instanceColor)
        this.bloodDropMesh.instanceColor.needsUpdate = true;
    }

    let stainWrite = 0;
    const prevStains = this.bloodStainMesh.count;
    for (let i = 0; i < this.bloodStains.length; i++) {
      const stain = this.bloodStains[i];
      stain.age += activeDt;
      if (stain.age >= stain.life) continue;
      const s = stain.scale * (0.9 + Math.min(1, stain.age * 4) * 0.15);
      this.scratchDummy.position.set(stain.x, stain.y, stain.z);
      this.scratchDummy.rotation.set(0, stain.rotY, 0);
      this.scratchDummy.scale.setScalar(s);
      this.scratchDummy.updateMatrix();
      this.bloodStainMesh.setMatrixAt(stainWrite, this.scratchDummy.matrix);
      this.bloodStainAlpha.setX(
        stainWrite,
        0.85 * Math.min(1, (stain.life - stain.age) / 2.5),
      );
      this.bloodStainSeed.setX(stainWrite, stain.seed);
      this.bloodStains[stainWrite++] = stain;
    }
    this.bloodStains.length = stainWrite;
    this.bloodStainMesh.count = stainWrite;
    if (stainWrite > 0 || prevStains > 0) {
      this.bloodStainMesh.instanceMatrix.needsUpdate = true;
      this.bloodStainAlpha.needsUpdate = true;
      this.bloodStainSeed.needsUpdate = true;
    }

    let helmetWrite = 0;
    const prevHelmets = this.helmetMesh.count;
    for (let i = 0; i < this.helmets.length; i++) {
      const h = this.helmets[i];
      h.age += activeDt;
      if (h.age >= h.life) continue;
      if (!h.settled) {
        h.x += h.vx * activeDt;
        h.y += h.vy * activeDt;
        h.z += h.vz * activeDt;
        h.vy -= activeDt * 9.8;
        h.rx += h.svx * activeDt;
        h.ry += h.svy * activeDt;
        h.rz += h.svz * activeDt;
        const ground = beachHeight(h.x, h.z) + 0.12;
        if (h.y < ground) {
          h.y = ground;
          if (h.vy < -1) {
            h.vy *= -0.28;
            h.vx *= 0.5;
            h.vz *= 0.5;
            h.svx *= 0.45;
            h.svy *= 0.45;
            h.svz *= 0.45;
          } else {
            h.vx = 0;
            h.vy = 0;
            h.vz = 0;
            h.svx = 0;
            h.svy = 0;
            h.svz = 0;
            h.settled = true;
          }
        }
      }
      const s = Math.min(1, (h.life - h.age) / 0.8);
      this.scratchDummy.position.set(h.x, h.y, h.z);
      this.scratchDummy.rotation.set(h.rx, h.ry, h.rz);
      this.scratchDummy.scale.setScalar(s);
      this.scratchDummy.updateMatrix();
      this.helmetMesh.setMatrixAt(helmetWrite, this.scratchDummy.matrix);
      this.helmets[helmetWrite++] = h;
    }
    this.helmets.length = helmetWrite;
    this.helmetMesh.count = helmetWrite;
    if (helmetWrite > 0 || prevHelmets > 0) {
      this.helmetMesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    window.removeEventListener('scroll', this.handleScroll);
    this.infantry.dispose();
    this.vehicles.dispose();
    this.landingCraft.dispose();
    this.coast.dispose();
    this.atmosphere.dispose();
    this.wreckSmoke.dispose();
    this.assaultSmoke.dispose();
    this.foxholes.dispose();
    this.grenadeBlast.dispose();
    this.tactical.dispose();
    this.detail.dispose();
    this.surfaceMaps?.dispose();
    this.environment?.dispose();
    this.post?.dispose();
    this.flashPool.dispose();
    this.dustPool.dispose();
    this.tracerPool.dispose();
    this.bloodDropMesh.dispose();
    this.bloodStainMesh.dispose();
    this.helmetMesh.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      if (o instanceof THREE.DirectionalLight) o.shadow.dispose();
    });
    new Set(this.geometries).forEach((g) => g.dispose());
    new Set(this.materials).forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
