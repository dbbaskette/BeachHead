import * as T from 'three';
import { TankArt, makeTank, makeCover, makeEnemy, makeAlly } from './art';
import { consolidateTank as consolidate } from './art';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeSky } from '../naval/ocean';
import {
  bakeCoastalEnvironment,
  snapDirectionalShadow,
} from '../naval/daylight';
import { createBloomComposer } from '../post-processing';
import { BillboardPool } from '../vfx';
import { TOUCH_LAYOUT_QUERY } from '../touch-input';
import { type TankState, type TankEvent, tankMuzzle } from './simulation';
import { SUPPLY } from './map';
import { buildTerrain, terrainHeight } from './terrain';
import { collapsePose, stepFragment } from './impact';

type SmokeParticle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  tint: number;
  spin: number;
  seed: number;
};

type FireParticle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  spin: number;
  seed: number;
};

type SolidParticle = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  life: number;
  size: number;
  wood: boolean;
  tint: number;
  spin: number;
};

const MAX_SMOKE = 180;
const MAX_FIRE = 96;
const MAX_FRAGMENTS = 140;
const MAX_TRACK_MARKS = 900;
const TRACK_FADE_WINDOW = 120;

export class TankScene {
  private renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(58, 1, 0.12, 1800);
  private art = new TankArt();
  private sky = makeSky();
  private player = makeTank(this.art);
  private enemyTank = makeTank(this.art, true);
  private covers = new Map<number, ReturnType<typeof makeCover>>();
  private enemies = new Map<number, ReturnType<typeof makeEnemy>>();
  private smokeParticles: SmokeParticle[] = [];
  private fireParticles: FireParticle[] = [];
  private solidParticles: SolidParticle[] = [];
  private smokePool: BillboardPool;
  private firePool: BillboardPool;
  private post?: ReturnType<typeof createBloomComposer>;
  private fragments: T.InstancedMesh;
  private scars: T.InstancedMesh;
  private scarSerial = 0;
  private scarOwners = new Map<number, number>();
  private collapses = new Map<number, { start: number; pulse: number }>();
  private shells: T.InstancedMesh;
  private object = new T.Object3D();
  private color = new T.Color();
  private scratchZ = new T.Vector3(0, 0, 1);
  private scratchVec = new T.Vector3();
  private scratchEye = new T.Vector3();
  private last = 0;
  private visualTime = 0;
  private particleSerial = 0;
  private shake = 0;
  private trackPhase = 0;
  private trackMarks: T.InstancedMesh;
  private markSerials = new Int32Array(MAX_TRACK_MARKS);
  private markAlphaAttr: T.InstancedBufferAttribute;
  private markCount = 0;
  private markDistance = 0;
  private markX = 0;
  private markZ = 18;
  private cameraReady = false;
  private observer: ResizeObserver;
  private disposed = false;
  private smokeClock = 0;
  private river: T.Mesh;
  private riverUniforms = { uTime: { value: 0 } };
  private supply = new T.Group();
  private bridge = new T.Group();
  private allies: ReturnType<typeof makeAlly>[] = [];
  private sun = new T.DirectionalLight('#ffe2b7', 3);
  private flashLight = new T.PointLight('#ffbe66', 0, 32, 1.5);
  private env: T.WebGLRenderTarget;
  private lost = (e: Event) => {
    e.preventDefault();
    this.onError('Graphics interrupted. Return to missions and try again.');
  };
  constructor(
    private host: HTMLElement,
    s: TankState,
    private onError: (s: string) => void,
  ) {
    const touch = matchMedia(TOUCH_LAYOUT_QUERY).matches;
    this.renderer = new T.WebGLRenderer({
      antialias: !touch,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, touch ? 1 : 1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = !touch;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.lost);
    this.scene.background = new T.Color('#c4d1cd');
    this.scene.fog = new T.FogExp2('#b9c5bd', 0.0032);
    this.scene.add(this.sky, new T.HemisphereLight('#d5e4e0', '#77735b', 1.7));
    this.sun.castShadow = !touch;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -52,
      right: 52,
      top: 52,
      bottom: -52,
      near: 1,
      far: 420,
    });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(this.sun, this.sun.target, this.flashLight);
    snapDirectionalShadow(this.sun, s.x, 0, s.z - 14, 200);
    this.env = bakeCoastalEnvironment(this.renderer, this.sky, '#5c5947', 1800);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.36;
    buildTerrain(this.art, this.scene, s.cover, touch);
    const treadCanvas = document.createElement('canvas');
    treadCanvas.width = 64;
    treadCanvas.height = 128;
    const tread = treadCanvas.getContext('2d')!;
    for (let i = 0; i < 8; i++) {
      tread.fillStyle = i % 2 ? '#20190fb0' : '#20190f80';
      tread.fillRect(3, i * 16 + 2, 58, 10);
    }
    const treadMap = new T.CanvasTexture(treadCanvas);
    treadMap.colorSpace = T.SRGBColorSpace;
    this.art.textures.add(treadMap);
    this.markAlphaAttr = new T.InstancedBufferAttribute(
      new Float32Array(MAX_TRACK_MARKS),
      1,
    ).setUsage(T.DynamicDrawUsage);
    const treadGeo = this.art.geo(new T.PlaneGeometry(0.5, 0.72));
    treadGeo.rotateX(-Math.PI / 2);
    treadGeo.setAttribute('aAlpha', this.markAlphaAttr);
    const treadMat = new T.ShaderMaterial({
      uniforms: T.UniformsUtils.merge([
        T.UniformsLib.fog,
        { uMap: { value: treadMap } },
      ]),
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying vec2 vUv;
        varying float vAlpha;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          vUv = uv;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying float vAlpha;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          vec4 tex = texture2D( uMap, vUv );
          float alpha = tex.a * 0.34 * vAlpha;
          if ( alpha < 0.005 ) discard;
          gl_FragColor = vec4( tex.rgb, alpha );
          #include <fog_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      fog: true,
    });
    this.art.materials.add(treadMat);
    this.trackMarks = new T.InstancedMesh(treadGeo, treadMat, MAX_TRACK_MARKS);
    this.trackMarks.count = 0;
    this.trackMarks.frustumCulled = false;
    this.trackMarks.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.scene.add(this.trackMarks);
    const water = this.art.mat('#596d60', 0.22);
    water.normalMap = this.art.texture('water-normal.jpg');
    water.normalMap.repeat.set(18, 2);
    water.normalScale.set(0.35, 0.35);
    water.metalness = 0.08;
    water.transparent = true;
    water.depthWrite = false;
    water.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.riverUniforms.uTime;
      shader.vertexShader = 'varying vec2 vRiverXZ;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvRiverXZ = (modelMatrix * vec4(transformed, 1.0)).xz;',
      );
      shader.fragmentShader =
        'varying vec2 vRiverXZ;\nuniform float uTime;\n' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         float bankDist = abs(vRiverXZ.y + 322.0);
         float bankFactor = 1.0 - smoothstep(10.0, 17.0, bankDist);
         float waterDepth = max(0.0, bankFactor * 2.4 - 0.95);
         float shallow = smoothstep(0.0, 0.55, waterDepth);
         vec3 shallowCol = vec3(0.21, 0.23, 0.16);
         vec3 deepCol = vec3(0.08, 0.15, 0.13);
         float ripple = texture2D(normalMap, vRiverXZ * vec2(0.08, 0.14) + vec2(uTime * 0.045, uTime * 0.018)).r;
         float shoreFoam = (1.0 - smoothstep(0.03, 0.36, waterDepth)) * smoothstep(0.48, 0.78, ripple);
         diffuseColor.rgb = mix(shallowCol, deepCol, shallow) + vec3(0.32, 0.34, 0.29) * shoreFoam * 0.45;
         diffuseColor.a *= smoothstep(0.0, 0.22, waterDepth);`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
         roughnessFactor = mix(0.45, 0.14, shallow);`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `#ifdef USE_NORMALMAP_TANGENTSPACE
           vec2 flowUvA = vNormalMapUv + vec2(uTime * 0.035, uTime * 0.012);
           vec2 flowUvB = vNormalMapUv * 1.65 + vec2(-uTime * 0.022, uTime * 0.028);
           vec3 mapN1 = texture2D(normalMap, flowUvA).xyz * 2.0 - 1.0;
           vec3 mapN2 = texture2D(normalMap, flowUvB).xyz * 2.0 - 1.0;
           vec3 mapN = normalize(vec3((mapN1.xy + mapN2.xy) * 0.55 * normalScale, 1.0));
           normal = normalize(tbn * mapN);
         #endif`,
      );
    };
    water.customProgramCacheKey = () => 'normandy-river-v1';
    this.river = this.art.mesh(
      this.scene,
      this.art.geo(new T.PlaneGeometry(900, 28, 32, 8)),
      water,
      [0, -0.95, -322],
      [1, 1, 1],
    );
    this.river.rotation.x = -Math.PI / 2;
    this.river.receiveShadow = true;
    this.buildBridge();
    this.scene.add(this.bridge);
    for (const c of s.cover) {
      const model = makeCover(this.art, c);
      this.covers.set(c.id, model);
      this.scene.add(model.root);
    }
    const setDressing = new T.Group();
    for (let i = 0; i < 48; i++) {
      const x = i % 2 ? -85 - (i % 7) * 6 : 64 + (i % 6) * 9,
        z = 15 - i * 8;
      this.tree(setDressing, x, z, 1 + (i % 3) * 0.2);
    }
    for (let i = 0; i < 17; i++)
      this.tree(setDressing, -59, -18 - i * 15, 0.6 + (i % 3) * 0.1);
    // Telegraph poles, roadside rubble, drainage and a hedged horizon.
    for (let i = 0; i < 8; i++) {
      const z = -20 - i * 39;
      this.art.mesh(
        setDressing,
        this.art.cylinder,
        this.art.wood,
        [11, 5, z],
        [0.16, 10, 0.16],
      );
      this.art.soft(setDressing, this.art.wood, [11, 9, z], [2.3, 0.15, 0.18]);
    }
    for (let i = 0; i < 7; i++) {
      const z = -20 - i * 39;
      for (const x of [10.2, 11.8]) {
        const curve = new T.CatmullRomCurve3([
          new T.Vector3(x, 9, z),
          new T.Vector3(x, 7.5, z - 19.5),
          new T.Vector3(x, 9, z - 39),
        ]);
        this.art.mesh(
          setDressing,
          this.art.geo(new T.TubeGeometry(curve, 10, 0.018, 3, false)),
          this.art.dark,
          [0, 0, 0],
          [1, 1, 1],
        );
      }
    }
    for (const house of s.cover.filter(
      (c) => c.kind === 'house' && Math.abs(c.x) < 40,
    )) {
      const side = Math.sign(house.x);
      for (let j = 0; j < 14; j++) {
        const z = house.z + (j / 14 - 0.5) * house.d;
        this.art.soft(
          setDressing,
          this.art.stone,
          [side * 8.4, 0.01, z],
          [0.35, 0.15, house.d / 14 - 0.07],
        );
      }
    }
    for (let i = 0; i < 100; i++) {
      const x = (i % 2 ? 1 : -1) * (8 + (i % 7) * 0.65),
        z = -20 - ((i * 19) % 270);
      const b = this.art.soft(
        setDressing,
        this.art.stone,
        [x, 0.12, z],
        [0.25 + (i % 3) * 0.15, 0.24, 0.45],
      );
      b.rotation.y = i;
    }
    consolidate(setDressing, this.art);
    this.scene.add(setDressing);
    for (const e of s.enemies) {
      if (e.kind === 'tank') continue;
      const model = makeEnemy(this.art, e.kind);
      this.enemies.set(e.id, model);
      this.scene.add(model.root);
    }
    this.scene.add(this.player.root, this.enemyTank.root);
    for (let i = 0; i < 3; i++) {
      this.art.soft(
        this.supply,
        this.art.wood,
        [(i - 1) * 1.6, 0.55, 0],
        [1.3, 1.1, 1.3],
      );
      this.art.soft(
        this.supply,
        this.art.pale,
        [(i - 1) * 1.6, 0.65, -0.66],
        [0.8, 0.65, 0.02],
      );
    }
    consolidate(this.supply, this.art);
    this.supply.position.set(SUPPLY.x, 0, SUPPLY.z);
    this.scene.add(this.supply);
    for (let i = 0; i < 5; i++) {
      const ally = makeAlly(this.art);
      ally.root.position.set((i % 2 ? 1 : -1) * 2, 0, 35 + i * 2);
      this.allies.push(ally);
      this.scene.add(ally.root);
    }
    this.smokePool = new BillboardPool(this.scene, MAX_SMOKE, {
      blending: 'normal',
      kind: 'smoke',
      renderOrder: 4,
    });
    this.firePool = new BillboardPool(this.scene, MAX_FIRE, {
      blending: 'additive',
      kind: 'fire',
      renderOrder: 5,
    });
    const glow = new T.MeshBasicMaterial({
      color: new T.Color(2.4, 1.85, 0.75),
      toneMapped: false,
    });
    this.art.materials.add(glow);
    this.shells = new T.InstancedMesh(this.art.sphere, glow, 80);
    this.shells.frustumCulled = false;
    this.fragments = new T.InstancedMesh(
      this.art.geo(new T.IcosahedronGeometry(1, 0)),
      this.art.mat('#ffffff', 0.94),
      MAX_FRAGMENTS,
    );
    this.fragments.castShadow = true;
    this.fragments.receiveShadow = true;
    this.fragments.setColorAt(0, new T.Color(0xffffff));
    this.fragments.frustumCulled = false;
    this.fragments.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const scarCanvas = document.createElement('canvas');
    scarCanvas.width = scarCanvas.height = 128;
    const scarContext = scarCanvas.getContext('2d')!;
    const scorch = scarContext.createRadialGradient(64, 64, 7, 64, 64, 61);
    scorch.addColorStop(0, '#171511ed');
    scorch.addColorStop(0.25, '#2b251be0');
    scorch.addColorStop(0.55, '#473e2a80');
    scorch.addColorStop(1, '#473e2a00');
    scarContext.fillStyle = scorch;
    scarContext.fillRect(0, 0, 128, 128);
    scarContext.strokeStyle = '#171512a0';
    scarContext.lineWidth = 1;
    for (let i = 0; i < 13; i++) {
      const angle = i * 2.399;
      scarContext.beginPath();
      scarContext.moveTo(64 + Math.sin(angle) * 8, 64 + Math.cos(angle) * 8);
      scarContext.lineTo(
        64 + Math.sin(angle + 0.09) * 29,
        64 + Math.cos(angle + 0.09) * 29,
      );
      scarContext.lineTo(64 + Math.sin(angle) * 53, 64 + Math.cos(angle) * 53);
      scarContext.stroke();
    }
    const scarMap = new T.CanvasTexture(scarCanvas);
    this.art.textures.add(scarMap);
    const scarMaterial = new T.MeshBasicMaterial({
      map: scarMap,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.art.materials.add(scarMaterial);
    this.scars = new T.InstancedMesh(
      this.art.geo(new T.PlaneGeometry(1, 1)),
      scarMaterial,
      72,
    );
    this.scars.count = 0;
    this.scars.frustumCulled = false;
    this.scene.add(this.shells, this.fragments, this.scars);
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
    this.render(s, false, true);
  }
  private tree(root: T.Group, x: number, z: number, scale: number) {
    const a = this.art;
    const elevation = terrainHeight(x, z);
    const tree = new T.Group();
    tree.position.y = elevation;
    root.add(tree);
    root = tree;
    a.mesh(
      root,
      a.cylinder,
      a.wood,
      [x, 3 * scale, z],
      [0.27 * scale, 6 * scale, 0.27 * scale],
    );
    const leafCards: T.BufferGeometry[] = [];
    const cardMatrix = new T.Matrix4();
    const cardQuat = new T.Quaternion();
    const cardEuler = new T.Euler();
    const cardPos = new T.Vector3();
    const cardScale = new T.Vector3();
    for (let j = 0; j < 34; j++) {
      const angle = j * 2.399,
        radius = 1.6 + Math.sin(j * 4) * 0.9;
      cardPos.set(
        x + Math.sin(angle) * radius * scale,
        (5 + (j % 5) * 0.55) * scale,
        z + Math.cos(angle) * radius * scale,
      );
      cardEuler.set((j % 3) * 0.65, angle, (j % 2) * 0.5);
      cardQuat.setFromEuler(cardEuler);
      cardScale.set(3.5 * scale, 3.5 * scale, 1);
      cardMatrix.compose(cardPos, cardQuat, cardScale);
      const cardGeo = a.foliage.clone();
      cardGeo.applyMatrix4(cardMatrix);
      // Bend leaf card normals radially outward from crown center so sunlight shades smoothly.
      const pAttr = cardGeo.getAttribute('position');
      const nAttr = cardGeo.getAttribute('normal');
      const cy = 5.35 * scale;
      for (let v = 0; v < pAttr.count; v++) {
        const dx = pAttr.getX(v) - x;
        const dy = pAttr.getY(v) - cy;
        const dz = pAttr.getZ(v) - z;
        const len = Math.hypot(dx, dy, dz) || 1;
        nAttr.setXYZ(v, dx / len, dy / len, dz / len);
      }
      nAttr.needsUpdate = true;
      leafCards.push(cardGeo);
      if (j < 5) {
        const branch = a.mesh(
          root,
          a.cylinder,
          a.wood,
          [
            x + Math.sin(angle) * 0.7 * scale,
            4.5 * scale,
            z + Math.cos(angle) * 0.7 * scale,
          ],
          [0.09 * scale, 3 * scale, 0.09 * scale],
        );
        branch.rotation.set(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5);
      }
    }
    const mergedLeaves = mergeGeometries(leafCards, false);
    leafCards.forEach((g) => g.dispose());
    if (mergedLeaves) {
      a.mesh(root, a.geo(mergedLeaves), a.leaves, [0, 0, 0], [1, 1, 1]);
    }
  }
  private buildBridge() {
    const a = this.art;
    a.soft(this.bridge, a.stone, [0, 0.15, -322], [12, 0.55, 31]);
    for (const side of [-1, 1]) {
      for (let z = -335; z <= -309; z += 2)
        a.soft(this.bridge, a.stone, [side * 5.8, 1, z], [0.85, 1.7, 1.9]);
      const arch = a.mesh(
        this.bridge,
        a.geo(new T.TorusGeometry(8, 0.9, 8, 28, Math.PI)),
        a.stone,
        [side * 5.8, -7.5, -322],
        [1, 1, 1],
      );
      arch.rotation.y = Math.PI / 2;
    }
    const cable = new T.CatmullRomCurve3([
      new T.Vector3(17, 0.14, -297),
      new T.Vector3(9, 0.1, -305),
      new T.Vector3(5, 0.2, -314),
      new T.Vector3(5, 0.2, -330),
    ]);
    a.mesh(
      this.bridge,
      a.geo(new T.TubeGeometry(cable, 24, 0.04, 5, false)),
      a.dark,
      [0, 0, 0],
      [1, 1, 1],
    );
    consolidate(this.bridge, a);
  }
  private resize() {
    const { width, height } = this.host.getBoundingClientRect();
    if (width && height) {
      this.renderer.setSize(width, height, false);
      this.post?.setSize(width, height);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }
  private burst(e: TankEvent) {
    if (['repair', 'win', 'warning'].includes(e.kind)) return;
    const big = e.kind === 'destroy',
      material = e.surface ?? 'metal';
    const muzzle = e.kind === 'cannon' || e.kind === 'mg';
    const small = e.strength < 0.3;
    const metal = material === 'metal',
      wood = material === 'wood';
    const normal = e.normal ?? { x: 0, y: 1, z: 0 };
    const solidImpact = !muzzle && material !== 'soft';
    const tint = wood
      ? 0x786044
      : material === 'earth'
        ? 0x73664c
        : metal
          ? 0x5b605a
          : 0xa69b81;
    if (
      e.kind === 'cannon' ||
      big ||
      (!small && !muzzle && e.strength >= 0.7)
    ) {
      this.flashLight.position.set(
        e.at.x + normal.x * 0.5,
        e.at.y + Math.max(0.8, normal.y * 0.6),
        e.at.z + normal.z * 0.5,
      );
      this.flashLight.intensity = big ? 95 : e.kind === 'cannon' ? 60 : 40;
    }
    if (e.kind === 'destroy' && e.coverId !== undefined) {
      this.collapses.set(e.coverId, { start: this.last, pulse: -1 });
      for (const [slot, owner] of this.scarOwners)
        if (owner === e.coverId) {
          this.object.scale.setScalar(0);
          this.object.updateMatrix();
          this.scars.setMatrixAt(slot, this.object.matrix);
          this.scarOwners.delete(slot);
        }
      this.scars.instanceMatrix.needsUpdate = true;
    }
    if (
      e.kind === 'impact' &&
      (material === 'masonry' || material === 'wood' || material === 'earth')
    ) {
      const slot = this.scarSerial++ % 72;
      this.object.position.set(
        e.at.x + normal.x * 0.025,
        e.at.y + normal.y * 0.025,
        e.at.z + normal.z * 0.025,
      );
      this.scratchVec.set(normal.x, normal.y, normal.z).normalize();
      this.object.quaternion.setFromUnitVectors(this.scratchZ, this.scratchVec);
      this.object.rotateZ(this.scarSerial * 2.399);
      this.object.scale.setScalar(
        small ? 0.23 : material === 'earth' ? 2.4 : 1.6,
      );
      this.object.updateMatrix();
      this.scars.setMatrixAt(slot, this.object.matrix);
      this.scars.count = Math.min(72, this.scarSerial);
      this.scars.instanceMatrix.needsUpdate = true;
      this.scarOwners.delete(slot);
      if (e.coverId !== undefined) this.scarOwners.set(slot, e.coverId);
    }
    const count = muzzle
      ? e.kind === 'mg'
        ? 3
        : 12
      : small
        ? 5
        : big
          ? 38
          : 24;
    for (let i = 0; i < count; i++) {
      const n = e.at.x + e.at.z + i * 8.7 + this.last;
      const solid = solidImpact && i % 3 === 0;
      const spark = (metal || muzzle || (big && i % 5 === 0)) && i % 2 === 0;
      const speed = small ? 1.5 : big ? 7 : 4;
      const px = e.at.x + normal.x * 0.06;
      const py = e.at.y + normal.y * 0.06;
      const pz = e.at.z + normal.z * 0.06;
      const vx = normal.x * speed + Math.sin(n * 3) * speed * 0.75;
      const vy =
        Math.max(0.5, normal.y * speed) + Math.abs(Math.cos(n)) * speed * 0.7;
      const vz = normal.z * speed + Math.cos(n * 7) * speed * 0.75;
      if (solid) {
        if (this.solidParticles.length >= MAX_FRAGMENTS)
          this.solidParticles.shift();
        this.solidParticles.push({
          x: px,
          y: py,
          z: pz,
          vx,
          vy,
          vz,
          age: 0,
          life: 4 + Math.abs(Math.sin(n)) * 2,
          size: small ? 0.045 : 0.12 + (i % 4) * 0.075,
          wood,
          tint,
          spin: 0,
        });
      } else if (spark) {
        if (this.fireParticles.length >= MAX_FIRE) this.fireParticles.shift();
        const serial = ++this.particleSerial;
        this.fireParticles.push({
          x: px,
          y: py,
          z: pz,
          vx,
          vy,
          vz,
          age: 0,
          life: big ? 0.28 + (i % 3) * 0.08 : 0.15 + (i % 4) * 0.055,
          size: muzzle && e.kind === 'cannon' ? 0.95 : big ? 1.45 : 0.28,
          spin: (serial * 1.7) % (Math.PI * 2),
          seed: (serial * 0.6180339887) % 1,
        });
      } else {
        if (this.smokeParticles.length >= MAX_SMOKE)
          this.smokeParticles.shift();
        const serial = ++this.particleSerial;
        this.smokeParticles.push({
          x: px,
          y: py,
          z: pz,
          vx,
          vy,
          vz,
          age: 0,
          life: big ? 3.8 : small ? 0.8 : 2.2,
          size: small ? 0.45 : 1.05 + (i % 4) * 0.35,
          tint:
            material === 'masonry'
              ? 0xb5ab96
              : material === 'earth'
                ? 0x998770
                : 0x74766b,
          spin: (serial * 1.3) % (Math.PI * 2),
          seed: (serial * 0.6180339887) % 1,
        });
      }
    }
    if (e.kind === 'damage') this.shake = 1;
    if (e.kind === 'cannon' && e.strength === 1) this.shake = 0.3;
    const distance = Math.hypot(
      e.at.x - this.player.root.position.x,
      e.at.z - this.player.root.position.z,
    );
    if (!small && !muzzle)
      this.shake = Math.max(
        this.shake,
        (big ? 0.75 : 0.25) * Math.max(0, 1 - distance / 90),
      );
  }
  private animateTank(
    model: ReturnType<typeof makeTank>,
    distance: number,
    yaw: number,
    turret: number,
    pitch: number,
    recoil: number,
  ) {
    model.root.rotation.y = -yaw;
    model.turret.rotation.y = -(turret - yaw);
    model.barrel.rotation.x = pitch;
    model.barrel.position.z = -1.03 + recoil * 0.3;
    for (const wheel of model.wheels) wheel.rotation.x = distance * 1.5;
    for (const sprocket of model.sprockets)
      sprocket.rotation.x = distance * 1.5;
    let i = 0;
    for (const side of [-1, 1])
      for (let j = 0; j < 44; j++) {
        // Flat ground-contact runs joined by rounded sprocket ends.
        const straight = 4.3,
          arc = Math.PI * 0.56,
          length = straight * 2 + arc * 2;
        const travel =
          ((((j / 44) * length + distance) % length) + length) % length;
        let y = 0.06,
          z = 0,
          rotation = 0;
        if (travel < straight) {
          y = 1.18;
          z = -2.15 + travel;
        } else if (travel < straight + arc) {
          const a = (travel - straight) / 0.56;
          y = 0.62 + 0.56 * Math.cos(a);
          z = 2.15 + 0.56 * Math.sin(a);
          rotation = a;
        } else if (travel < straight * 2 + arc) {
          z = 2.15 - (travel - straight - arc);
          rotation = Math.PI;
        } else {
          const a = Math.PI + (travel - straight * 2 - arc) / 0.56;
          y = 0.62 + 0.56 * Math.cos(a);
          z = -2.15 + 0.56 * Math.sin(a);
          rotation = a;
        }
        this.object.position.set(side * 1.43, y, z);
        this.object.rotation.set(rotation, 0, 0);
        this.object.scale.set(0.52, 0.13, 0.31);
        this.object.updateMatrix();
        model.tracks.setMatrixAt(i++, this.object.matrix);
      }
    model.tracks.instanceMatrix.needsUpdate = true;
  }
  render(s: TankState, zoom: boolean, reduced: boolean) {
    if (this.disposed) return;
    const dt = Math.max(0, Math.min(0.15, s.time - this.last));
    this.last = s.time;
    this.visualTime += dt;
    for (const e of s.events) this.burst(e);
    s.events = [];
    this.flashLight.intensity = Math.max(
      0,
      this.flashLight.intensity - dt * 260,
    );
    this.shake = Math.max(0, this.shake - dt * 2);
    this.trackPhase += s.speed * dt;
    this.markDistance += Math.hypot(s.x - this.markX, s.z - this.markZ);
    this.markX = s.x;
    this.markZ = s.z;
    if (this.markDistance > 0.6 && Math.abs(s.z + 322) > 17) {
      this.markDistance = 0;
      for (const side of [-1, 1]) {
        this.object.position.set(
          s.x + Math.cos(s.yaw) * side * 1.43,
          0.015,
          s.z + Math.sin(s.yaw) * side * 1.43,
        );
        this.object.rotation.set(0, -s.yaw, 0);
        this.object.scale.setScalar(1);
        this.object.updateMatrix();
        const serial = this.markCount++;
        const slot = serial % MAX_TRACK_MARKS;
        this.markSerials[slot] = serial;
        this.trackMarks.setMatrixAt(slot, this.object.matrix);
      }
      const activeCount = Math.min(MAX_TRACK_MARKS, this.markCount);
      for (let k = 0; k < activeCount; k++) {
        const age = this.markCount - 1 - this.markSerials[k];
        const remaining = MAX_TRACK_MARKS - 1 - age;
        this.markAlphaAttr.setX(
          k,
          Math.max(0, Math.min(1, remaining / TRACK_FADE_WINDOW)),
        );
      }
      this.trackMarks.count = activeCount;
      this.trackMarks.instanceMatrix.needsUpdate = true;
      this.markAlphaAttr.needsUpdate = true;
    }

    this.player.root.position.set(
      s.x,
      0.005 +
        (reduced
          ? 0
          : Math.sin(s.distance * 3) *
            Math.min(0.05, Math.abs(s.speed) * 0.009)),
      s.z,
    );
    snapDirectionalShadow(
      this.sun,
      s.x + Math.sin(s.turret) * 14,
      0,
      s.z - Math.cos(s.turret) * 14,
      200,
    );
    this.animateTank(
      this.player,
      this.trackPhase,
      s.yaw,
      s.turret,
      s.pitch,
      s.recoil,
    );
    this.player.root.rotation.x = reduced
      ? 0
      : Math.sin(s.distance * 1.4) *
          Math.min(0.013, Math.abs(s.speed) * 0.002) +
        s.recoil * 0.025;
    for (const c of s.cover) {
      const m = this.covers.get(c.id)!;
      const collapse = this.collapses.get(c.id);
      const age = collapse ? s.time - collapse.start : 99;
      m.intact.visible = c.health > 0;
      m.fractured.visible = c.health <= 0 && c.kind === 'house' && age < 2.1;
      m.ruin.visible = c.health <= 0;
      if (c.kind === 'house' && c.health <= 0 && collapse) {
        m.collapseParts.forEach((part, index) => {
          const pose = collapsePose(age, index, c.h, c.id);
          part.position.y = (index >= 4 ? c.h : 0) + pose.y;
          part.rotation.set(pose.x, 0, pose.z);
        });
        const pulse = Math.floor(age / 0.4);
        if (pulse !== collapse.pulse && age < 2.1) {
          collapse.pulse = pulse;
          for (let i = 0; i < 14; i++) {
            const angle = (i / 14) * Math.PI * 2;
            if (this.smokeParticles.length >= MAX_SMOKE)
              this.smokeParticles.shift();
            const serial = ++this.particleSerial;
            this.smokeParticles.push({
              x: c.x + Math.sin(angle) * c.w * 0.43,
              y: 0.3 + (pulse === 0 ? c.h * 0.55 : 0),
              z: c.z + Math.cos(angle) * c.d * 0.43,
              vx: Math.sin(angle) * (2 + pulse),
              vy: 1.1 + pulse * 0.2,
              vz: Math.cos(angle) * (2 + pulse),
              age: 0,
              life: 3.4,
              size: 2.2 + pulse * 0.5,
              tint: 0xb2a48b,
              spin: (serial * 1.3) % (Math.PI * 2),
              seed: (serial * 0.6180339887) % 1,
            });
          }
        }
      } else if (c.health > 0) {
        m.collapseParts.forEach((part, index) => {
          part.position.y = index >= 4 ? c.h : 0;
          part.rotation.set(0, 0, 0);
        });
      }
    }
    for (const e of s.enemies) {
      if (e.kind === 'tank') {
        this.enemyTank.root.visible = e.active;
        this.enemyTank.root.position.set(e.x, 0.005, e.z);
        this.animateTank(
          this.enemyTank,
          s.time * (e.alerted && e.health > 0 ? 1.6 : 0),
          e.yaw,
          e.yaw,
          0,
          0,
        );
        this.enemyTank.root.rotation.z = e.health <= 0 ? 0.1 : 0;
      } else {
        const m = this.enemies.get(e.id)!;
        m.root.visible = e.active;
        m.root.position.set(e.x, e.kind === 'rocket' ? e.y - 0.8 : 0, e.z);
        m.root.rotation.y = -Math.atan2(s.x - e.x, -(s.z - e.z));
        m.soldier.rotation.x = e.health <= 0 ? 1.5 : 0;
        m.soldier.position.y = e.health <= 0 ? -0.5 : 0;
        m.weapon.visible = e.health > 0;
        m.root.scale.setScalar(
          e.kind === 'demolition' && e.health <= 0 ? 0.35 : 1,
        );
        if (e.kind === 'rocket' && e.warning <= 0) m.weapon.rotation.x = -0.6;
        if (e.warning > 0) {
          m.soldier.position.y = Math.sin(e.warning * 8) * 0.06;
          m.weapon.rotation.x =
            e.kind === 'rocket' ? -Math.max(0, e.warning - 1.1) * 0.6 : -0.06;
        }
      }
    }
    this.supply.visible = !s.supplied;
    this.bridge.visible = !(s.status === 'lost' && s.demolition === 0);
    this.smokeClock += dt;
    if (this.smokeClock > 0.12) {
      this.smokeClock = 0;
      for (const e of s.enemies)
        if (
          e.active &&
          e.health <= 0 &&
          (e.kind === 'tank' || e.kind === 'gun' || e.kind === 'demolition')
        ) {
          if (this.smokeParticles.length >= MAX_SMOKE)
            this.smokeParticles.shift();
          const serial = ++this.particleSerial;
          this.smokeParticles.push({
            x: e.x,
            y: 1,
            z: e.z,
            vx: 0.7,
            vy: 1.6,
            vz: 0.1,
            age: 0,
            life: 5,
            size: 2,
            tint: 0x3b3832,
            spin: (serial * 1.3) % (Math.PI * 2),
            seed: (serial * 0.6180339887) % 1,
          });
        }
      if (Math.abs(s.speed) > 0.5) {
        if (this.smokeParticles.length >= MAX_SMOKE)
          this.smokeParticles.shift();
        const serial = ++this.particleSerial;
        this.smokeParticles.push({
          x: s.x - Math.sin(s.yaw) * 2,
          y: 0.3,
          z: s.z + Math.cos(s.yaw) * 2,
          vx: 0.6,
          vy: 0.4,
          vz: 0,
          age: 0,
          life: 2,
          size: 1,
          tint: 0x858071,
          spin: (serial * 1.3) % (Math.PI * 2),
          seed: (serial * 0.6180339887) % 1,
        });
      }
    }
    const follow = zoom ? 7.2 : 15;
    this.scratchEye.set(
      s.x - Math.sin(s.turret) * follow,
      zoom ? 5.1 : 6.2,
      s.z + Math.cos(s.turret) * follow,
    );
    if (!this.cameraReady || s.status !== 'playing') {
      this.camera.position.copy(this.scratchEye);
      this.cameraReady = true;
    } else this.camera.position.lerp(this.scratchEye, Math.min(1, dt * 9));
    const muzzle = tankMuzzle(s);
    this.camera.lookAt(
      muzzle.x + Math.sin(s.turret) * 100,
      muzzle.y +
        Math.sin(s.pitch) * 100 +
        (reduced ? 0 : Math.sin(s.time * 53) * this.shake * 0.35),
      muzzle.z - Math.cos(s.turret) * 100,
    );
    this.camera.fov = zoom ? 35 : 58;
    this.camera.updateProjectionMatrix();

    let solidWrite = 0;
    const prevSolid = this.fragments.count;
    for (let i = 0; i < this.solidParticles.length; i++) {
      const p = this.solidParticles[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      stepFragment(p, dt);
      if (p.y > 0.09 || Math.hypot(p.vx, p.vy, p.vz) > 0.3) p.spin += dt;
      const fade = Math.max(0, Math.min(1, (p.life - p.age) / 0.6));
      const size = p.size * fade;
      this.object.position.set(p.x, Math.max(0.05, p.y), p.z);
      this.object.rotation.set(p.spin * 3.1, p.spin * 2.3, p.spin * 1.7);
      this.object.scale.set(
        size * (p.wood ? 0.45 : 1),
        size * (p.wood ? 2.6 : 1),
        size,
      );
      this.object.updateMatrix();
      this.fragments.setMatrixAt(solidWrite, this.object.matrix);
      this.fragments.setColorAt(solidWrite, this.color.setHex(p.tint));
      this.solidParticles[solidWrite++] = p;
    }
    this.solidParticles.length = solidWrite;
    this.fragments.count = solidWrite;
    if (solidWrite > 0 || prevSolid > 0) {
      this.fragments.instanceMatrix.needsUpdate = true;
      if (this.fragments.instanceColor)
        this.fragments.instanceColor.needsUpdate = true;
    }

    let fireWrite = 0;
    for (let i = 0; i < this.fireParticles.length; i++) {
      const p = this.fireParticles[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= Math.exp(-dt * 1.1);
      p.vz *= Math.exp(-dt * 1.1);
      p.vy -= dt * 9;
      const u = p.age / p.life;
      const size = p.size * (1 + p.age * 1.4);
      this.firePool.set(
        fireWrite,
        p.x,
        Math.max(0.05, p.y),
        p.z,
        size,
        size,
        2.6,
        1.45,
        0.45,
        1 - u,
        p.spin + p.age * 2.2,
        p.seed,
      );
      this.fireParticles[fireWrite++] = p;
    }
    this.fireParticles.length = fireWrite;
    this.firePool.commit(fireWrite, this.visualTime);

    let smokeWrite = 0;
    for (let i = 0; i < this.smokeParticles.length; i++) {
      const p = this.smokeParticles[i];
      p.age += dt;
      if (p.age >= p.life) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= Math.exp(-dt * 1.1);
      p.vz *= Math.exp(-dt * 1.1);
      const fade = Math.max(0, Math.min(1, (p.life - p.age) / 0.6));
      const size = p.size * (1 + p.age * 0.85);
      this.color.setHex(p.tint).multiplyScalar(1 - (p.age / p.life) * 0.2);
      this.smokePool.set(
        smokeWrite,
        p.x,
        Math.max(0.05, p.y),
        p.z,
        size,
        size,
        this.color.r,
        this.color.g,
        this.color.b,
        0.65 * fade,
        p.spin + p.age * 0.35,
        p.seed,
      );
      this.smokeParticles[smokeWrite++] = p;
    }
    this.smokeParticles.length = smokeWrite;
    this.smokePool.commit(smokeWrite, this.visualTime);

    this.shells.count = Math.min(80, s.shells.length);
    for (let i = 0; i < this.shells.count; i++) {
      const r = s.shells[i];
      this.object.position.set(r.x, r.y, r.z);
      this.scratchVec.set(r.vx, r.vy, r.vz).normalize();
      this.object.quaternion.setFromUnitVectors(this.scratchZ, this.scratchVec);
      this.object.scale.set(
        r.mg ? 0.035 : 0.09,
        r.mg ? 0.035 : 0.09,
        r.mg ? 1 : 2,
      );
      this.object.updateMatrix();
      this.shells.setMatrixAt(i, this.object.matrix);
    }
    this.shells.instanceMatrix.needsUpdate = true;
    this.riverUniforms.uTime.value = s.time;
    this.allies.forEach((ally, i) => {
      ally.root.visible = s.phase === 'hold' || s.status === 'won';
      const walking = s.phase === 'hold' && s.status !== 'won';
      const stride = walking ? Math.sin(s.time * 6.5 + i * 1.3) * 0.42 : 0;
      const bob = walking
        ? Math.abs(Math.sin(s.time * 6.5 + i * 1.3)) * 0.045
        : 0;
      ally.root.position.set(
        (i % 2 ? 1 : -1) * (2 + i * 0.3),
        bob,
        s.z + Math.max(8, 65 - s.hold * 1.3) + i * 2,
      );
      ally.root.rotation.y = Math.PI;
      ally.leftLeg.rotation.x = stride;
      ally.rightLeg.rotation.x = -stride;
      ally.leftArm.rotation.x = -stride * 0.55;
      ally.rightArm.rotation.x = stride * 0.35;
    });
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }
  /** Read-only renderer counters for the inspection route; no gameplay UI polling. */
  metrics() {
    return {
      draws: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      particles:
        this.smokeParticles.length +
        this.fireParticles.length +
        this.solidParticles.length,
      marks: this.scars.count,
      geometries: this.renderer.info.memory.geometries,
      textures: this.renderer.info.memory.textures,
    };
  }
  reset() {
    this.smokeParticles.length = 0;
    this.fireParticles.length = 0;
    this.solidParticles.length = 0;
    this.smokePool.clear();
    this.firePool.clear();
    this.fragments.count = 0;
    this.flashLight.intensity = 0;
    this.collapses.clear();
    this.scarOwners.clear();
    this.scarSerial = 0;
    this.scars.count = 0;
    this.last = 0;
    this.trackPhase = 0;
    this.markSerials.fill(0);
    this.markCount = 0;
    this.markDistance = 0;
    this.markX = 0;
    this.markZ = 18;
    this.trackMarks.count = 0;
    this.markAlphaAttr.needsUpdate = true;
    this.shake = 0;
    this.cameraReady = false;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.lost);
    this.renderer.domElement.remove();
    this.smokePool.dispose();
    this.firePool.dispose();
    this.post?.dispose();
    this.scene.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
      if (o instanceof T.DirectionalLight) o.shadow.dispose();
    });
    this.sky.geometry.dispose();
    (this.sky.material as T.Material).dispose();
    this.env.dispose();
    this.art.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
