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
import { COVER_ROWS, type PillboxBattle, type PillboxEvent } from './types';

export type PillboxScreenPoint = { x: number; y: number; visible: boolean };

type Effect = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  life: number;
  grow: number;
  gravity?: number;
  spin?: THREE.Vector3;
  ground?: boolean;
};

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
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
  private camera = new THREE.PerspectiveCamera(55, 1, 0.25, 700);
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);
  private width = 1;
  private height = 1;
  private observer: ResizeObserver;
  private infantry: InfantryRenderer;
  private vehicles = new VehicleRenderer(this.scene);
  private detail: BeachDetail;
  private surfaceMaps: PillboxSurfaceMaps | null = null;
  readonly ready: Promise<void>;
  private gun = new THREE.Group();
  private gunCradle = new THREE.Group();
  private barrel = new THREE.Group();
  private muzzle = new THREE.Object3D();
  private muzzleLight = new THREE.PointLight('#ffb253', 0, 32, 2);
  private effects: Effect[] = [];
  private visualTime = 0;
  private lastBattleTime = Number.POSITIVE_INFINITY;
  private recoil = 0;
  private textures: THREE.Texture[] = [];
  private materials: THREE.Material[] = [];
  private geometries: THREE.BufferGeometry[] = [];
  private disposed = false;
  private environment: THREE.WebGLRenderTarget | null = null;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color('#abc0c1');
    this.scene.fog = new THREE.Fog('#b2bab6', 125, 320);
    this.camera.position.set(0, 7.1, 8.2);
    this.camera.lookAt(0, 0, -48);

    const random = seeded(1944);
    const sandMap = canvasTexture((ctx) => {
      ctx.fillStyle = '#bba77b';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 15000; i++) {
        const v = 105 + Math.floor(random() * 90);
        ctx.fillStyle = `rgba(${v + 20},${v + 9},${v - 12},${0.05 + random() * 0.15})`;
        ctx.fillRect(
          random() * 512,
          random() * 512,
          1 + random() * 3,
          1 + random() * 2,
        );
      }
      for (let y = 20; y < 512; y += 45) {
        ctx.strokeStyle = 'rgba(80,70,45,.13)';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(130, y - 12, 340, y + 15, 512, y - 2);
        ctx.stroke();
      }
    });
    sandMap.repeat.set(12, 32);
    const concreteMap = canvasTexture((ctx) => {
      ctx.fillStyle = '#77776b';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 9000; i++) {
        const v = 70 + random() * 90;
        ctx.fillStyle = `rgba(${v},${v},${v - 5},.18)`;
        ctx.fillRect(
          random() * 512,
          random() * 512,
          2 + random() * 7,
          1 + random() * 3,
        );
      }
      ctx.strokeStyle = 'rgba(42,44,39,.45)';
      ctx.lineWidth = 4;
      ctx.moveTo(330, 0);
      ctx.lineTo(315, 205);
      ctx.lineTo(354, 350);
      ctx.stroke();
    });
    concreteMap.repeat.set(3, 2);
    this.textures.push(sandMap, concreteMap);
    const material = (p: THREE.MeshStandardMaterialParameters) => {
      const m = new THREE.MeshStandardMaterial(p);
      this.materials.push(m);
      return m;
    };
    // Keep the map's authored hue: tinting it tan again produced a burnt orange beach.
    const sand = material({ color: '#eee9da', map: sandMap, roughness: 1 });
    const concrete = material({
      color: '#8b8a78',
      map: concreteMap,
      roughness: 0.95,
    });
    const concreteDark = material({
      color: '#3b3e37',
      map: concreteMap,
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
    const steel = material({
      color: '#58605a',
      roughness: 0.38,
      metalness: 0.62,
    });
    const brass = material({
      color: '#b68a3c',
      roughness: 0.35,
      metalness: 0.78,
    });
    const wood = material({ color: '#593c27', roughness: 0.78 });
    const water = material({
      color: '#456d73',
      roughness: 0.28,
      metalness: 0.08,
    });

    const geo = <T extends THREE.BufferGeometry>(g: T) => {
      this.geometries.push(g);
      return g;
    };
    this.scene.add(
      mesh(
        geo(new THREE.PlaneGeometry(240, 170)),
        sand,
        [0, 0, -67],
        [-Math.PI / 2, 0, 0],
      ),
    );
    this.scene.add(
      mesh(
        geo(new THREE.PlaneGeometry(260, 100)),
        water,
        [0, 0.12, -184],
        [-Math.PI / 2, 0, 0],
      ),
    );
    for (let i = 0; i < 7; i++) {
      const foam = mesh(
        geo(new THREE.PlaneGeometry(230, 0.22 + random() * 0.25)),
        material({
          color: '#d6d8c5',
          transparent: true,
          opacity: 0.42,
          roughness: 1,
        }),
        [0, 0.17, -139 - i * 4],
        [-Math.PI / 2, 0, 0],
      );
      this.scene.add(foam);
    }

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

    this.makeBeachDetails(geo, steel, wood, concrete, webbing, random);
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
          texture.repeat.set(60, 42.5);
        for (const texture of Object.values(maps.concrete))
          texture.repeat.set(1, 1);
        Object.assign(sand, maps.sand);
        sand.color.set('#ffffff');
        sand.normalScale.set(0.8, 0.8);
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

    this.makeSky(geo);
    this.scene.add(new THREE.HemisphereLight('#e7e2cf', '#756b4e', 2.15));
    const bunkerFill = new THREE.PointLight('#ffe0ae', 34, 42, 1.45);
    bunkerFill.position.set(-3, 9, 10);
    this.scene.add(bunkerFill);
    const sun = new THREE.DirectionalLight('#ffd8a2', 3.25);
    sun.position.set(-52, 70, 32);
    sun.target.position.set(0, 0, -72);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -65,
      right: 65,
      top: 35,
      bottom: -145,
      near: 5,
      far: 220,
    });
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.08;
    this.scene.add(sun, sun.target);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  private makeBeachDetails(
    geo: <T extends THREE.BufferGeometry>(g: T) => T,
    steel: THREE.Material,
    wood: THREE.Material,
    concrete: THREE.Material,
    canvas: THREE.Material,
    random: () => number,
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
    const coverGeo = geo(new THREE.BoxGeometry(8, 1.25, 1.5));
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
    let postIndex = 0;
    for (const o of wireObstacles)
      for (const z of [o.z - 3, o.z + 3]) {
        for (const x of [o.x - o.halfX, o.x + o.halfX]) {
          dummy.position.set(x, 1, z);
          dummy.rotation.set(0, 0, 0.08);
          dummy.updateMatrix();
          posts.setMatrixAt(postIndex++, dummy.matrix);
        }
        const points: THREE.Vector3[] = [];
        for (let x = o.x - o.halfX; x <= o.x + o.halfX; x += 0.5)
          points.push(new THREE.Vector3(x, 0.9 + Math.sin(x * 1.3) * 0.28, z));
        this.scene.add(
          new THREE.Line(
            geo(new THREE.BufferGeometry().setFromPoints(points)),
            wireMat,
          ),
        );
      }
    this.scene.add(posts);
    // Distant landing craft retain recognizable ramps and hull silhouettes.
    for (const x of [-42, -14, 18, 47]) {
      const craft = new THREE.Group();
      craft.add(
        mesh(geo(new THREE.BoxGeometry(8, 1.1, 12)), steel, [0, 0.4, 0]),
        mesh(
          geo(new THREE.BoxGeometry(7.2, 0.3, 5)),
          canvas,
          [0, 0.65, -7],
          [-0.38, 0, 0],
        ),
      );
      craft.position.set(x, 0.55, -153 - random() * 14);
      this.scene.add(craft);
    }
    // Interior ammunition boxes and a few loose brass cases.
    for (const x of [-8.3, 8.8])
      this.scene.add(
        mesh(geo(new THREE.BoxGeometry(3, 1.5, 2)), canvas, [x, 2.6, 1]),
      );
  }

  private makeSky(geo: <T extends THREE.BufferGeometry>(g: T) => T) {
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vWorld;void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `
        varying vec3 vWorld;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
        void main(){
          vec3 d=normalize(vWorld); float h=clamp(d.y*.78+.2,0.,1.);
          vec3 horizon=vec3(.69,.75,.73), zenith=vec3(.28,.43,.53);
          vec3 c=mix(horizon,zenith,pow(h,.62));
          vec2 p=d.xz/max(.10,d.y+.18)*1.2;
          float n=noise(p)+noise(p*2.1)*.52+noise(p*4.2)*.22;
          float cloud=smoothstep(.79,1.28,n)*smoothstep(-.02,.3,d.y);
          c=mix(c,vec3(.83,.82,.75),cloud*.74);
          float glow=pow(max(dot(d,normalize(vec3(-.52,.35,.78))),0.),24.);
          c+=vec3(.34,.23,.11)*glow;
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.materials.push(skyMaterial);
    const sky = mesh(
      geo(new THREE.SphereGeometry(500, 28, 16)),
      skyMaterial,
      [0, 0, 0],
    );
    sky.castShadow = sky.receiveShadow = false;
    this.scene.add(sky);
    const surroundings = new THREE.Scene();
    surroundings.add(sky.clone());
    const generator = new THREE.PMREMGenerator(this.renderer);
    this.environment = generator.fromScene(surroundings, 0.08, 0.1, 700);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.55;
    generator.dispose();
  }

  private makeGun(
    geo: <T extends THREE.BufferGeometry>(g: T) => T,
    steel: THREE.Material,
    wood: THREE.Material,
    brass: THREE.Material,
  ) {
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
        geo(new RoundedBoxGeometry(1.45, 1.1, 3.5, 3, 0.08)),
        steel,
        [0, 0.45, -1],
      ),
      mesh(geo(new THREE.BoxGeometry(0.75, 0.45, 2.1)), wood, [0, 0.15, 1.65]),
      mesh(
        geo(new THREE.CylinderGeometry(0.16, 0.2, 9.5, 32)),
        steel,
        [0, 0.5, -7],
        [Math.PI / 2, 0, 0],
      ),
    );
    const shroud = mesh(
      geo(new THREE.CylinderGeometry(0.34, 0.34, 4.8, 32)),
      steel,
      [0, 0.5, -4.35],
      [Math.PI / 2, 0, 0],
    );
    this.barrel.add(shroud);
    const inset = new THREE.MeshStandardMaterial({
      color: '#101613',
      roughness: 0.72,
      metalness: 0.4,
    });
    const hardware = new THREE.MeshStandardMaterial({
      color: '#8a9289',
      roughness: 0.38,
      metalness: 0.78,
    });
    this.materials.push(inset, hardware);
    this.barrel.add(
      mesh(
        geo(new RoundedBoxGeometry(1.31, 0.1, 2.95, 2, 0.035)),
        hardware,
        [0, 1.045, -0.9],
      ),
      mesh(
        geo(new THREE.BoxGeometry(0.035, 0.26, 1.2)),
        inset,
        [0.735, 0.5, -0.9],
      ),
      mesh(
        geo(new THREE.CylinderGeometry(0.075, 0.075, 0.65, 16)),
        hardware,
        [0.98, 0.47, 0.12],
        [0, 0, Math.PI / 2],
      ),
      mesh(
        geo(new THREE.CylinderGeometry(0.12, 0.12, 0.38, 16)),
        inset,
        [1.25, 0.42, 0.12],
      ),
      mesh(
        geo(new THREE.BoxGeometry(0.16, 0.52, 0.18)),
        steel,
        [0, 1.26, -2.35],
      ),
      mesh(
        geo(new THREE.TorusGeometry(0.19, 0.036, 8, 24)),
        hardware,
        [0, 1.56, -2.35],
      ),
      mesh(
        geo(new THREE.BoxGeometry(0.07, 0.55, 0.12)),
        hardware,
        [0, 0.92, -10.9],
      ),
      mesh(
        geo(new THREE.RingGeometry(0.095, 0.19, 24)),
        hardware,
        [0, 0.5, -11.77],
        [0, Math.PI, 0],
      ),
      mesh(
        geo(new THREE.CircleGeometry(0.094, 24)),
        inset,
        [0, 0.5, -11.78],
        [0, Math.PI, 0],
      ),
    );
    const screwGeometry = geo(
      new THREE.CylinderGeometry(0.046, 0.046, 0.025, 12),
    );
    const slotGeometry = geo(new THREE.BoxGeometry(0.052, 0.006, 0.008));
    for (const x of [-0.54, 0.54])
      for (const z of [-2.12, -1.4, -0.65, 0.32]) {
        this.barrel.add(mesh(screwGeometry, inset, [x, 1.11, z]));
        this.barrel.add(mesh(slotGeometry, hardware, [x, 1.126, z]));
      }
    const ventGeometry = geo(new THREE.CircleGeometry(0.105, 14));
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
        mesh(geo(new THREE.TorusGeometry(0.205, 0.025, 8, 24)), hardware, [
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
        geo(new THREE.PlaneGeometry(1.1, 1.1)),
        markingMaterial,
        [0, 1.106, -0.85],
        [-Math.PI / 2, 0, 0],
      ),
    );
    for (let i = 0; i < 6; i++)
      this.barrel.add(
        mesh(geo(new THREE.BoxGeometry(0.5, 0.06, 0.22)), steel, [
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
    for (const [mat, geometries] of batches) {
      const geometry = mergeGeometries(geometries);
      geometries.forEach((g) => g.dispose());
      if (geometry) this.barrel.add(mesh(geo(geometry), mat, [0, 0, 0]));
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
  }

  aim(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const vehicle = this.vehicles.pick(this.raycaster);
    if (vehicle) return vehicle;
    const soldier = this.infantry.pick(this.raycaster);
    if (soldier) return soldier;
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.aimPlane, hit)) return null;
    if (hit.z > -9 || hit.z < -145 || Math.abs(hit.x) > 70) return null;
    return { x: hit.x, z: hit.z };
  }

  project(x: number, z: number): PillboxScreenPoint {
    const p = new THREE.Vector3(x, 1, z).project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.width,
      y: (-p.y * 0.5 + 0.5) * this.height,
      visible:
        p.z > -1 && p.z < 1 && Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.98,
    };
  }

  event(event: PillboxEvent) {
    if (event.type === 'shot') {
      this.recoil = 1;
      this.muzzleLight.intensity = 45;
      this.spawnFlash(
        new THREE.Vector3().copy(
          this.muzzle.getWorldPosition(new THREE.Vector3()),
        ),
        '#ffd27a',
        1.8,
        0.09,
      );
      const origin = this.muzzle.getWorldPosition(new THREE.Vector3());
      const end = new THREE.Vector3(event.x, 1.1, event.z);
      const tracer = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 1, 5),
        new THREE.MeshBasicMaterial({ color: '#ffd66d', transparent: true }),
      );
      const delta = end.clone().sub(origin);
      tracer.position.copy(origin).addScaledVector(delta, 0.52);
      tracer.scale.y = delta.length();
      tracer.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        delta.normalize(),
      );
      this.scene.add(tracer);
      this.effects.push({
        mesh: tracer,
        velocity: new THREE.Vector3(),
        age: 0,
        life: 0.055,
        grow: 0,
      });
      if (event.vehicle)
        this.spawnFlash(
          new THREE.Vector3(event.x, 1.2, event.z),
          '#ffd295',
          0.8,
          0.12,
        );
      else if (event.hit) this.spawnBlood(event.x, event.z);
      else this.spawnDust(event.x, event.z, '#806a48');
    }
    if (event.type === 'jeep-destroyed' || event.type === 'grenade-impact') {
      this.spawnFlash(
        new THREE.Vector3(event.x, 1, event.z),
        '#ff9e42',
        event.type === 'jeep-destroyed' ? 5 : 3,
        0.3,
      );
      this.spawnDust(event.x, event.z, '#3d3933');
    }
    if (event.type === 'down') {
      this.spawnDust(event.x, event.z, '#756348');
      this.spawnHelmet(event.x, event.z, event.id);
    }
    if (event.type === 'breach') {
      this.spawnFlash(
        new THREE.Vector3(event.x, 1.5, event.z),
        '#f0a24b',
        3,
        0.22,
      );
      this.spawnDust(event.x, event.z, '#4d4638');
    }
    if (event.type === 'overheat') this.spawnDust(0, 2.7, '#c9c8bd');
  }

  private spawnFlash(
    position: THREE.Vector3,
    color: string,
    size: number,
    life: number,
  ) {
    if (this.effects.length > 80) return;
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5, 1),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    m.position.copy(position);
    m.scale.setScalar(size);
    this.scene.add(m);
    this.effects.push({
      mesh: m,
      velocity: new THREE.Vector3(),
      age: 0,
      life,
      grow: 12,
    });
  }
  private spawnDust(x: number, z: number, color: string) {
    for (let i = 0; i < 5 && this.effects.length < 80; i++) {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.4, 1),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        }),
      );
      m.position.set(
        x + (Math.random() - 0.5),
        0.35 + Math.random(),
        z + (Math.random() - 0.5),
      );
      this.scene.add(m);
      this.effects.push({
        mesh: m,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 2,
          1 + Math.random() * 2,
          (Math.random() - 0.5) * 2,
        ),
        age: 0,
        life: 0.8 + Math.random() * 0.5,
        grow: 1.2,
      });
    }
  }

  private spawnBlood(x: number, z: number) {
    for (let i = 0; i < 9 && this.effects.length < 140; i++) {
      const drop = new THREE.Mesh(
        new THREE.SphereGeometry(0.055 + Math.random() * 0.075, 5, 4),
        new THREE.MeshStandardMaterial({
          color: i % 2 ? '#6d1013' : '#a51c23',
          roughness: 0.5,
          transparent: true,
        }),
      );
      drop.position.set(x, 1.35 + Math.random() * 0.5, z);
      drop.scale.set(0.8, 1.5, 0.8);
      this.scene.add(drop);
      this.effects.push({
        mesh: drop,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 5,
          1.4 + Math.random() * 3,
          -2 - Math.random() * 4,
        ),
        age: 0,
        life: 1.2,
        grow: 0,
        gravity: 9.8,
        ground: true,
      });
    }
    if (this.effects.length >= 140) return;
    // An irregular, flat stain remains on the sand after the airborne spray.
    const shape = new THREE.Shape();
    for (let i = 0; i <= 18; i++) {
      const angle = (i / 18) * Math.PI * 2,
        radius = 0.35 + Math.random() * 0.4;
      const px = Math.cos(angle) * radius,
        py = Math.sin(angle) * radius;
      if (i === 0) shape.moveTo(px, py);
      else shape.lineTo(px, py);
    }
    shape.closePath();
    const stain = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color: '#641719',
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    stain.rotation.x = -Math.PI / 2;
    stain.position.set(x, 0.025 + Math.random() * 0.005, z - 0.5);
    this.scene.add(stain);
    this.effects.push({
      mesh: stain,
      velocity: new THREE.Vector3(),
      age: 0,
      life: 18,
      grow: 0,
      gravity: 0,
    });
  }

  private spawnHelmet(x: number, z: number, id: number) {
    if (this.effects.length >= 140) return;
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.245, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.57),
      new THREE.MeshStandardMaterial({
        color: '#505a45',
        roughness: 0.7,
        metalness: 0.45,
        side: THREE.DoubleSide,
        transparent: true,
      }),
    );
    helmet.scale.y = 0.8;
    helmet.position.set(x, 2.05, z);
    helmet.castShadow = true;
    this.scene.add(helmet);
    this.effects.push({
      mesh: helmet,
      velocity: new THREE.Vector3(id % 2 ? 2.5 : -2.5, 4.2, -2.8),
      age: 0,
      life: 10,
      grow: 0,
      gravity: 9.8,
      ground: true,
      spin: new THREE.Vector3(5, 3, 2),
    });
  }

  private clearEffects() {
    for (const effect of this.effects) {
      effect.mesh.removeFromParent();
      effect.mesh.geometry.dispose();
      (effect.mesh.material as THREE.Material).dispose();
    }
    this.effects = [];
    this.recoil = 0;
    this.muzzleLight.intensity = 0;
  }

  render(battle: PillboxBattle, dt: number, reducedMotion: boolean) {
    if (battle.time < this.lastBattleTime) {
      this.clearEffects();
      this.visualTime = battle.time;
    }
    this.lastBattleTime = battle.time;
    const activeDt = battle.status === 'paused' ? 0 : Math.min(dt, 0.1);
    this.visualTime += activeDt;
    this.recoil = Math.max(0, this.recoil - activeDt * 11);
    this.muzzleLight.intensity = Math.max(
      0,
      this.muzzleLight.intensity - activeDt * 420,
    );
    const target = new THREE.Vector3(battle.aimX, 1, battle.aimZ);
    this.gunCradle.rotation.y = Math.atan2(-target.x, -target.z);
    this.barrel.rotation.x = -Math.atan2(
      target.y - 3.6,
      Math.hypot(target.x, target.z - 3.7),
    );
    this.barrel.position.z = this.recoil * 0.38;
    this.camera.position.set(
      0,
      7.1 + (reducedMotion ? 0 : Math.sin(this.visualTime * 1.3) * 0.025),
      8.2,
    );
    this.camera.lookAt(0, reducedMotion ? 0 : this.recoil * 0.04, -48);
    this.infantry.render(battle, activeDt, reducedMotion);
    this.vehicles.render(battle, activeDt);
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += activeDt;
      if (e.age >= e.life) {
        e.mesh.removeFromParent();
        e.mesh.geometry.dispose();
        (e.mesh.material as THREE.Material).dispose();
        this.effects.splice(i, 1);
        continue;
      }
      e.mesh.position.addScaledVector(e.velocity, activeDt);
      e.velocity.y -= activeDt * (e.gravity ?? 0.8);
      if (e.spin) {
        e.mesh.rotation.x += e.spin.x * activeDt;
        e.mesh.rotation.y += e.spin.y * activeDt;
        e.mesh.rotation.z += e.spin.z * activeDt;
      }
      if (e.ground && e.mesh.position.y < 0.12) {
        e.mesh.position.y = 0.12;
        if (e.velocity.y < -1) {
          e.velocity.y *= -0.28;
          e.velocity.x *= 0.5;
          e.velocity.z *= 0.5;
          e.spin?.multiplyScalar(0.45);
        } else {
          e.velocity.set(0, 0, 0);
          e.spin?.set(0, 0, 0);
        }
      }
      e.mesh.scale.addScalar(e.grow * activeDt);
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - e.age / e.life;
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.infantry.dispose();
    this.vehicles.dispose();
    this.detail.dispose();
    this.surfaceMaps?.dispose();
    this.environment?.dispose();
    for (const e of this.effects) {
      e.mesh.geometry.dispose();
      (e.mesh.material as THREE.Material).dispose();
    }
    this.scene.traverse((o) => {
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
