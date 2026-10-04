import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { addBunkerDetail, addWeaponDetail, worldUV } from './detail';
import { PELVIS_HEIGHT } from './reactions';
import { GuardMotion, loadGuardMotions } from './guard-motion';
import {
  animateGuard,
  resetGuardActor,
  type GuardActor,
} from './guard-animation';
import { uniformMaterial, guardClips, smoothGuardNormals } from './uniform';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { assetUrl } from '../asset-url';
import { addExpansion } from './expansion';
import { addBunkerArchitecture } from './architecture';
import { addBunkerBanners } from './banners';
import { addMissionProps } from './mission-props';
import { BunkerEquipment } from './equipment';
import { batchBunkerScenery } from './static-batches';
import { BunkerMobileLights } from './mobile-lights';
import {
  rooms,
  solids,
  guardSpawns,
  doorLayouts,
  worldSolids,
  rayBox,
  type BunkerState,
  type Effect,
} from './simulation';

type Particle = {
  mesh: T.Mesh;
  velocity: T.Vector3;
  life: number;
  duration: number;
  blood?: boolean;
  dust?: boolean;
};
export class BunkerScene {
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(68, 1, 0.05, 180);
  private renderer: T.WebGLRenderer;
  private composer?: EffectComposer;
  private ao?: SSAOPass;
  private output?: OutputPass;
  private observer: ResizeObserver;
  private weapon = new T.Group();
  private muzzle: T.Mesh;
  private muzzleLight = new T.PointLight('#ffc57a', 0, 4);
  private guards: GuardActor[] = [];
  private particles: Particle[] = [];
  private doors: T.Group[] = [];
  private missionProps: ReturnType<typeof addMissionProps>;
  private grenades = new Map<number, T.Group>();
  private blastLight = new T.PointLight('#ffba70', 0, 12, 2);
  private blastAge = 0;
  private dustTexture?: T.CanvasTexture;
  private stains: { mesh: T.Mesh; life: number }[] = [];
  private medkit = new T.Group();
  private exitLight = new T.MeshStandardMaterial({
    color: '#745b34',
    emissive: '#cf7e2c',
    emissiveIntensity: 0.7,
  });
  private sea: T.Mesh;
  private disposed = false;
  private environment: T.WebGLRenderTarget;
  private resources = new Set<T.Texture>();
  private detailShadows = false;
  private mobileLights?: BunkerMobileLights;
  private guardFrustum = new T.Frustum();
  private viewProjection = new T.Matrix4();
  private guardBounds = new T.Sphere();
  private metal = new T.MeshStandardMaterial({
    color: '#434b49',
    roughness: 0.58,
    metalness: 0.8,
  });
  private dark = new T.MeshStandardMaterial({
    color: '#1b2020',
    roughness: 0.6,
    metalness: 0.72,
  });
  private wood = new T.MeshStandardMaterial({
    color: '#b9a184',
    roughness: 0.92,
  });
  private brass = new T.MeshStandardMaterial({
    color: '#ac8550',
    metalness: 0.8,
    roughness: 0.37,
  });
  readonly ready: Promise<void>;
  constructor(host: HTMLElement, touch: boolean) {
    this.detailShadows = !touch;
    this.renderer = new T.WebGLRenderer({
      antialias: !touch,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, touch ? 1 : 1.75),
    );
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = !touch;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    const environment = new RoomEnvironment();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(environment, 0.05);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.22;
    environment.dispose();
    pmrem.dispose();
    this.scene.background = new T.Color('#6f8991');
    this.scene.fog = new T.FogExp2('#33332f', 0.012);
    this.scene.add(new T.HemisphereLight('#c5d5d4', '#484035', 0.42));
    const sun = new T.DirectionalLight('#d9e9ed', touch ? 0.65 : 3.3);
    sun.position.set(-20, 12, 10);
    sun.castShadow = !touch;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    sun.shadow.normalBias = 0.035;
    this.scene.add(sun);
    const sky = new Sky();
    sky.scale.setScalar(150);
    sky.material.uniforms.turbidity.value = 8;
    sky.material.uniforms.rayleigh.value = 0.6;
    sky.material.uniforms.sunPosition.value.set(-1, 0.35, 0.4);
    this.scene.add(sky);
    const steel = new T.TextureLoader().load(
      assetUrl('/textures/bunker-worn-steel.jpg'),
    );
    steel.colorSpace = T.SRGBColorSpace;
    steel.wrapS = steel.wrapT = T.RepeatWrapping;
    steel.anisotropy = 8;
    this.resources.add(steel);
    this.metal.map = steel;
    this.metal.bumpMap = steel;
    this.metal.bumpScale = 0.008;
    this.metal.color.set('#efeee8');
    this.metal.metalness = 0.28;
    this.metal.roughness = 0.53;
    this.dark.map = steel;
    this.dark.color.set('#b0b3ac');
    this.dark.metalness = 0.5;
    this.dark.roughness = 0.43;
    const timber = new T.TextureLoader().load(
      assetUrl('/textures/bunker-timber.jpg'),
    );
    timber.colorSpace = T.SRGBColorSpace;
    timber.wrapS = timber.wrapT = T.RepeatWrapping;
    timber.repeat.set(1.5, 1.5);
    this.resources.add(timber);
    this.wood.map = timber;
    this.wood.bumpMap = timber;
    this.wood.bumpScale = 0.012;
    const concrete = this.surface('pillbox-concrete', '#aaa79c', 0.6);
    const floor = this.surface('pillbox-concrete', '#77786e', 0.7);
    for (const r of rooms) {
      this.box(r.x, -0.15, r.z, r.w, 0.3, r.d, floor);
      this.box(r.x, r.h + 0.18, r.z, r.w, 0.36, r.d, concrete);
    }
    const equipment = new BunkerEquipment(
      this.metal,
      this.dark,
      this.wood,
      this.brass,
    );
    for (const s of solids) {
      if (s.kind === 'gun') continue;
      if (s.kind === 'crate') {
        const crate = equipment.crate(s.w, s.h, s.d);
        crate.position.set(s.x, s.y - s.h / 2, s.z);
        this.scene.add(crate);
        continue;
      }
      this.box(s.x, s.y, s.z, s.w, s.h, s.d, concrete);
    }
    // Steel lintels, ribs, pipes and cable runs give the corridor readable depth.
    addBunkerArchitecture(
      this.scene,
      concrete,
      this.metal,
      this.dark,
      this.brass,
    );
    for (const r of rooms) {
      for (const x of [r.w / 2 - 0.4, r.w / 2 - 0.65])
        this.cylinder(r.x + x, r.h - 0.48, r.z, 0.065, r.d, this.metal, 'z');
      for (let z = r.z - r.d / 2 + 1; z < r.z + r.d / 2; z += 2.5) {
        this.box(
          r.x + r.w / 2 - 0.52,
          r.h - 0.48,
          z,
          0.43,
          0.055,
          0.08,
          this.dark,
        );
        this.box(
          r.x - r.w / 2 + 0.025,
          0.35,
          z,
          0.025,
          0.5,
          1.6,
          new T.MeshStandardMaterial({
            color: '#555e51',
            roughness: 1,
            transparent: true,
            opacity: 0.28,
          }),
        );
      }
    }
    for (const [x, z, h] of [
      [-5, 4, 3.4],
      [5, 12, 3.4],
      [0, -1, 2.85],
      [0, -7, 2.85],
      [-4, -12, 3.1],
      [4, -20, 3.1],
    ])
      this.lamp(x, z, h);
    const gunFill = new T.SpotLight('#c9dbdf', 36, 13, 0.75, 0.65, 2);
    gunFill.position.set(-6, 3.2, 11);
    gunFill.target.position.set(-4.4, 1.2, 8.5);
    gunFill.castShadow = !touch;
    gunFill.shadow.mapSize.set(512, 512);
    gunFill.shadow.bias = -0.001;
    this.scene.add(gunFill, gunFill.target);
    const archLight = new T.SpotLight('#ffe0ac', 95, 13, 0.9, 0.7, 2);
    archLight.position.set(3.7, 2.35, 5.5);
    archLight.target.position.set(-1.3, 2.9, 2.05);
    archLight.castShadow = !touch;
    archLight.shadow.mapSize.set(512, 512);
    archLight.shadow.normalBias = 0.025;
    this.scene.add(archLight, archLight.target);
    // Embrasure: sea, distant shoreline, and a heavy gun pointing out of the slit.
    const seaMat = new T.MeshStandardMaterial({
      color: '#607d84',
      roughness: 0.25,
      metalness: 0.35,
    });
    const waterNormal = new T.TextureLoader().load(
      assetUrl('/textures/water-normal.jpg'),
    );
    waterNormal.wrapS = waterNormal.wrapT = T.RepeatWrapping;
    waterNormal.repeat.set(45, 45);
    this.resources.add(waterNormal);
    seaMat.normalMap = waterNormal;
    seaMat.normalScale.set(0.6, 0.6);
    this.sea = new T.Mesh(new T.PlaneGeometry(170, 170, 40, 40), seaMat);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.set(-65, -3, 0);
    this.scene.add(this.sea);
    for (let i = 0; i < 8; i++) {
      const rock = new T.Mesh(new T.DodecahedronGeometry(1, 1), concrete);
      rock.scale.set(7 + (i % 3), 4 + (i % 4), 8);
      rock.position.set(-50 - i * 5, -2, 20 - i * 9);
      this.scene.add(rock);
    }
    floor.roughness = 0.78;
    floor.metalness = 0.18;
    this.gun(equipment);
    this.doors = addExpansion(
      this.scene,
      this.metal,
      this.dark,
      this.brass,
      equipment,
    );
    this.missionProps = addMissionProps(
      this.scene,
      this.metal,
      this.dark,
      this.wood,
      equipment,
    );
    this.camera.add(this.missionProps.held);
    for (const r of rooms.slice(5)) this.lamp(r.x, r.z, r.h - 0.6);
    this.sign('FUNKRAUM / RADIO', 0, 3.2, -45.7, 2.5);
    this.sign('TRANSMITTER', -2, 2.5, -54.1, 1.7);
    this.sign('RADIO CONTROL', 2, 2.5, -54.1, 1.8);
    this.sign('RADIO  ↑', 0, 3.15, -41.7, 1.8);
    this.sign('QUARTERS  →', 2.8, 2.8, -23.7, 2.4);
    this.sign('INFIRMARY', 19, 3.2, -21.7, 2);
    this.sign('RECORDS', 19, 3.2, -35.7, 1.8);
    this.sign('RADIO  ←', 19, 3.15, -35.65, 1.7);
    this.sign('STORES / RETURN', 10, 2.7, -21.7, 2.3);
    this.scene.add(this.blastLight);
    this.lamp(0, -27, 3.25);
    this.lamp(-1, -36, 3.3);
    this.lamp(1, -40, 3.3);
    this.sign('VERMITTLUNG', 0, 3.32, -23.7, 1.8);
    this.sign('MASCHINENRAUM', 0, 3.32, -31.7, 2.1);
    addBunkerDetail(this.scene, concrete, this.metal, this.dark, this.brass);
    addBunkerBanners(this.scene, this.dark);
    for (let i = 0; i < 7; i++) {
      const z = 4.2 + i * 0.34;
      this.cylinder(-5.8, 0.55, z, 0.1, 1.1, this.brass);
      const tip = new T.Mesh(new T.ConeGeometry(0.1, 0.3, 12), this.dark);
      tip.position.set(-5.8, 1.24, z);
      this.scene.add(tip);
    }
    this.box(-5.8, 0.12, 5.2, 0.65, 0.18, 2.8, this.wood);
    // Small rubble, drainage gratings and ceiling beams break up broad surfaces.
    for (const r of rooms.filter((r) => r.w > 4)) {
      for (let z = r.z - r.d / 2 + 2; z < r.z + r.d / 2; z += 4)
        this.box(r.x, r.h - 0.18, z, r.w, 0.25, 0.32, concrete);
      for (let i = 0; i < 20; i++) {
        const x =
            r.x +
            (i % 2 ? 1 : -1) *
              (r.w / 2 - 0.55 - Math.abs(Math.sin(i * 4)) * 0.4),
          z = r.z - r.d / 2 + 1 + ((i * 0.63) % (r.d - 2));
        const chip = this.part(
          this.scene,
          new T.DodecahedronGeometry(0.035 + (i % 3) * 0.02, 0),
          concrete,
          [x, 0.04, z],
        );
        chip.scale.y = 0.5;
        chip.rotation.set(i, i * 0.3, i * 0.8);
      }
    }
    for (let z = 10; z > -41; z -= 3) {
      this.box(-0.8, 0.009, z, 0.32, 0.012, 1.2, this.dark);
      for (let i = 0; i < 8; i++)
        this.box(
          -0.8,
          0.025,
          z - 0.52 + i * 0.15,
          0.3,
          0.018,
          0.025,
          this.metal,
        );
    }
    // A radio bench and period stores in the final room.
    this.box(-5, 0.85, -20, 1.35, 0.15, 4, this.wood);
    for (const z of [-18.6, -21.3])
      this.box(-5, 0.43, z, 0.1, 0.85, 0.1, this.metal);
    for (let i = 0; i < 3; i++) {
      const receiver = equipment.radio(0.65, 0.5, 0.72);
      receiver.rotation.y = Math.PI / 2;
      receiver.position.set(-5, 0.95, -19 - i * 0.85);
      this.scene.add(receiver);
    }
    const exit = new T.Group();
    exit.rotation.y = Math.PI;
    exit.position.set(0, 0, 15.68);
    this.scene.add(exit);
    this.part(
      exit,
      new T.BoxGeometry(2.5, 2.65, 0.18),
      this.metal,
      [0, 1.325, 0],
    );
    this.part(
      exit,
      new T.BoxGeometry(1.8, 1.8, 0.08),
      this.dark,
      [0, 1.4, 0.15],
    );
    this.part(
      exit,
      new T.BoxGeometry(1.5, 0.18, 0.08),
      this.exitLight,
      [0, 2.82, 0.16],
    );
    const exitSign = this.sign('EXIT / BEACH', 0, 3.2, 15.5, 2);
    exitSign.rotation.y = Math.PI;
    for (const [x, z] of [
      [0, -45.7],
      [0, -31.7],
      [0, -9.65],
      [19, -21.7],
    ]) {
      const arrow = this.sign('EXIT  ↑', x, 2.7, z - 0.62, 1.5);
      arrow.rotation.y = Math.PI;
    }
    this.sign('MUNITIONS', 0, 2.75, -9.66, 1.7);
    this.sign('04  /  KASEMATTE', 2.8, 2.9, 2.28, 2.4);
    this.box(0, 0, 0, 0.01, 0.01, 0.01, this.dark); // shared origin marker stays under the floor
    const kitMat = new T.MeshStandardMaterial({
      color: '#ddd2ac',
      roughness: 0.85,
    });
    const kit = new T.Mesh(
      new RoundedBoxGeometry(0.6, 0.28, 0.45, 3, 0.07),
      kitMat,
    );
    this.medkit.add(kit);
    const stripe = new T.Mesh(
      new T.BoxGeometry(0.32, 0.012, 0.08),
      new T.MeshStandardMaterial({ color: '#46704a' }),
    );
    stripe.position.y = 0.15;
    this.medkit.add(stripe);
    const cross = stripe.clone();
    cross.rotation.y = Math.PI / 2;
    this.medkit.add(cross);
    this.medkit.position.set(-4.8, 0.2, -12);
    this.scene.add(this.medkit);
    // Foreground MP40-inspired silhouette, with actual sights and a substantial receiver.
    this.camera.add(this.weapon);
    this.scene.add(this.camera);
    const weaponFill = new T.PointLight('#d6d3bd', 0.9, 1.6);
    weaponFill.position.set(-0.25, 0.1, -0.2);
    this.camera.add(weaponFill);
    this.weapon.position.set(0.25, -0.27, -0.48);
    this.part(
      this.weapon,
      new T.CylinderGeometry(0.037, 0.047, 0.38, 16),
      this.metal,
      [0, 0, -0.2],
      [Math.PI / 2, 0, 0],
    );
    this.part(
      this.weapon,
      new T.CylinderGeometry(0.016, 0.016, 0.31, 16),
      this.dark,
      [0, 0.009, -0.51],
      [Math.PI / 2, 0, 0],
    );
    this.part(
      this.weapon,
      new T.BoxGeometry(0.075, 0.06, 0.24),
      this.dark,
      [0, -0.025, -0.12],
    );
    this.part(
      this.weapon,
      new T.BoxGeometry(0.042, 0.23, 0.065),
      this.metal,
      [0, -0.16, -0.21],
      [0.15, 0, 0],
    );
    this.part(
      this.weapon,
      new T.BoxGeometry(0.045, 0.12, 0.06),
      this.wood,
      [0, -0.09, 0.06],
      [-0.2, 0, 0],
    );
    for (const z of [-0.58, -0.06]) {
      this.part(
        this.weapon,
        new T.TorusGeometry(0.027, 0.006, 6, 16),
        this.dark,
        [0, 0.051, z],
      );
      this.part(
        this.weapon,
        new T.BoxGeometry(0.007, 0.028, 0.008),
        this.metal,
        [0, 0.045, z],
      );
    }
    const sleeve = new T.MeshStandardMaterial({
        color: '#4a5141',
        roughness: 1,
      }),
      glove = new T.MeshStandardMaterial({ color: '#493d2e', roughness: 0.95 });
    this.part(
      this.weapon,
      new T.CapsuleGeometry(0.054, 0.22, 4, 10),
      sleeve,
      [0.12, -0.22, 0.17],
      [0.9, 0, -0.35],
    );
    this.part(
      this.weapon,
      new T.SphereGeometry(0.06, 12, 8),
      glove,
      [0.02, -0.08, 0.05],
    );
    this.part(
      this.weapon,
      new T.CapsuleGeometry(0.05, 0.19, 4, 10),
      sleeve,
      [-0.13, -0.19, -0.14],
      [0.4, 0, 0.8],
    );
    this.part(
      this.weapon,
      new T.SphereGeometry(0.053, 12, 8),
      glove,
      [-0.025, -0.085, -0.23],
    );
    addWeaponDetail(this.weapon, this.metal, this.dark, this.wood);
    this.muzzle = this.part(
      this.weapon,
      new T.ConeGeometry(0.06, 0.23, 7),
      new T.MeshBasicMaterial({
        color: '#ffe0a0',
        transparent: true,
        opacity: 0.9,
      }),
      [0, 0.009, -0.72],
      [-Math.PI / 2, 0, 0],
    );
    this.muzzle.visible = false;
    this.muzzleLight.position.set(0.1, -0.1, -0.7);
    this.camera.add(this.muzzleLight);
    if (touch) {
      batchBunkerScenery(this.scene, [
        this.camera,
        this.sea,
        this.medkit,
        ...this.doors,
        ...this.missionProps.charges,
        ...this.missionProps.supplies,
      ]);
      for (const door of this.doors) batchBunkerScenery(door, []);
      batchBunkerScenery(this.weapon, [this.muzzle]);
      this.mobileLights = new BunkerMobileLights(this.scene, [
        this.camera,
        this.blastLight,
      ]);
    }
    if (!touch) {
      this.composer = new EffectComposer(this.renderer);
      this.ao = new SSAOPass(this.scene, this.camera, 1, 1, 16);
      this.ao.kernelRadius = 0.65;
      this.ao.minDistance = 0.001;
      this.ao.maxDistance = 0.08;
      this.output = new OutputPass();
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.composer.addPass(this.ao);
      this.composer.addPass(this.output);
    }
    const resize = () => {
      if (this.disposed) return;
      this.camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(host.clientWidth, host.clientHeight);
      this.composer?.setSize(host.clientWidth, host.clientHeight);
    };
    this.observer = new ResizeObserver(resize);
    this.observer.observe(host);
    resize();
    this.ready = this.loadGuards();
  }
  private surface(prefix: string, color: string, repeat: number) {
    const loader = new T.TextureLoader();
    const load = (suffix: string) => {
      const map = loader.load(assetUrl(`/textures/${prefix}-${suffix}.jpg`));
      map.wrapS = map.wrapT = T.RepeatWrapping;
      map.repeat.set(repeat, repeat);
      map.anisotropy = 4;
      this.resources.add(map);
      return map;
    };
    const map = loader.load(
      assetUrl('/textures/bunker-weathered-concrete.jpg'),
    );
    map.wrapS = map.wrapT = T.RepeatWrapping;
    map.repeat.set(repeat, repeat);
    map.anisotropy = 8;
    this.resources.add(map);
    map.colorSpace = T.SRGBColorSpace;
    return new T.MeshStandardMaterial({
      map,
      bumpMap: map,
      bumpScale: 0.018,
      normalMap: load('normal'),
      roughnessMap: load('roughness'),
      normalScale: new T.Vector2(0.45, 0.45),
      color,
      roughness: 0.92,
    });
  }
  private part(
    parent: T.Object3D,
    geo: T.BufferGeometry,
    mat: T.Material,
    p: number[],
    r = [0, 0, 0],
  ) {
    const mesh = new T.Mesh(geo, mat);
    mesh.position.set(p[0], p[1], p[2]);
    mesh.rotation.set(r[0], r[1], r[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  private box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: T.Material,
  ) {
    return this.part(
      this.scene,
      worldUV(
        new RoundedBoxGeometry(
          w,
          h,
          d,
          2,
          Math.min(0.035, w / 8, h / 8, d / 8),
        ),
      ),
      mat,
      [x, y, z],
    );
  }
  private cylinder(
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    mat: T.Material,
    axis = 'y',
  ) {
    return this.part(
      this.scene,
      new T.CylinderGeometry(r, r, h, 16),
      mat,
      [x, y, z],
      axis === 'x'
        ? [0, 0, Math.PI / 2]
        : axis === 'z'
          ? [Math.PI / 2, 0, 0]
          : [0, 0, 0],
    );
  }
  private lamp(x: number, z: number, y: number) {
    this.cylinder(x, y + 0.22, z, 0.018, 0.45, this.dark);
    this.part(
      this.scene,
      new T.ConeGeometry(0.28, 0.15, 16, 1, true),
      this.dark,
      [x, y, z],
    );
    this.part(
      this.scene,
      new T.SphereGeometry(0.09, 10, 8),
      new T.MeshBasicMaterial({ color: '#ffda8c' }),
      [x, y - 0.09, z],
    );
    const light = new T.SpotLight('#ffd7a1', 75, 12, 1.15, 0.7, 2);
    light.target.position.set(x, 0, z);
    light.castShadow = this.detailShadows && (z === 4 || z === -1);
    light.shadow.mapSize.set(512, 512);
    light.shadow.bias = -0.0005;
    this.scene.add(light.target);
    const bounce = new T.PointLight('#ffcf93', 4, 6, 2);
    bounce.position.set(x, y - 0.4, z);
    this.scene.add(bounce);
    light.position.set(x, y - 0.25, z);
    this.scene.add(light);
    this.cylinder(
      x,
      y - 0.1,
      z,
      0.16,
      0.24,
      new T.MeshStandardMaterial({
        color: '#b78c58',
        transparent: true,
        opacity: 0.22,
      }),
    );
  }
  private gun(equipment: BunkerEquipment) {
    this.cylinder(-4.7, 0.15, 8.5, 1.75, 0.3, this.dark);
    const machinery = new T.Group();
    const profile = [
      [0, 0],
      [0.92, 0],
      [0.94, 0.08],
      [0.79, 0.15],
      [0.55, 0.7],
      [0.59, 0.8],
      [0, 0.8],
    ].map(([x, y]) => new T.Vector2(x, y));
    equipment.mesh(
      machinery,
      new T.LatheGeometry(profile, 48),
      this.metal,
      [-4.7, 0.3, 8.5],
    );
    equipment.box(
      machinery,
      [-4.8, 1.1, 8.5],
      [2.4, 0.5, 0.95],
      this.metal,
      0.16,
    );
    equipment.rod(
      machinery,
      [-4.2, 1.7, 8.5],
      [-9.65, 1.7, 8.5],
      0.24,
      this.metal,
      0.115,
      40,
    );
    equipment.rod(
      machinery,
      [-9.64, 1.7, 8.5],
      [-9.69, 1.7, 8.5],
      0.082,
      this.dark,
      0.082,
      32,
    );
    for (const x of [-4.5, -5.15, -6.4])
      equipment.rod(
        machinery,
        [x, 1.7, 8.5],
        [x - 0.1, 1.7, 8.5],
        0.255 - (-4.5 - x) * 0.02,
        this.dark,
        0.25 - (-4.5 - x) * 0.02,
        32,
      );
    this.cylinder(-4.3, 1.9, 8.5, 0.13, 1.8, this.metal, 'x');
    equipment.box(
      machinery,
      [-3.65, 1.76, 8.5],
      [0.8, 0.72, 0.75],
      this.dark,
      0.13,
    );
    for (const z of [7.98, 9.02]) {
      const cheek = new T.Shape();
      cheek.moveTo(-5.65, 0.85);
      cheek.lineTo(-3.75, 0.85);
      cheek.lineTo(-3.85, 1.25);
      cheek.quadraticCurveTo(-4.25, 1.45, -4.38, 1.87);
      cheek.quadraticCurveTo(-4.65, 2.24, -5.02, 1.98);
      cheek.lineTo(-5.55, 1.48);
      cheek.closePath();
      equipment.mesh(
        machinery,
        new T.ExtrudeGeometry(cheek, {
          depth: 0.19,
          bevelEnabled: true,
          bevelSize: 0.035,
          bevelThickness: 0.025,
          bevelSegments: 3,
          steps: 1,
          curveSegments: 16,
        }),
        this.metal,
        [0, 0, z - 0.095],
      );
      const wheel = this.part(
        this.scene,
        new T.TorusGeometry(0.32, 0.032, 8, 24),
        this.dark,
        [-3.9, 1.28, z + (z < 8.5 ? -0.12 : 0.12)],
      );
      for (let i = 0; i < 4; i++) {
        const spoke = this.part(
          wheel,
          new T.BoxGeometry(0.6, 0.025, 0.025),
          this.metal,
          [0, 0, 0],
        );
        spoke.rotation.z = (i * Math.PI) / 4;
      }
    }
    this.scene.add(equipment.finish(machinery));
    for (let i = 0; i < 14; i++) {
      const a = (i * Math.PI * 2) / 14;
      this.cylinder(
        -4.7 + Math.cos(a) * 1.55,
        0.33,
        8.5 + Math.sin(a) * 1.55,
        0.045,
        0.07,
        this.brass,
      );
    }
  }
  private sign(text: string, x: number, y: number, z: number, w: number) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#242b27';
    ctx.fillRect(0, 0, 512, 100);
    ctx.strokeStyle = '#b4b09a';
    ctx.lineWidth = 3;
    ctx.strokeRect(5, 5, 502, 90);
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#d4ccac';
    ctx.fillText(text, 256, 63);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    this.resources.add(texture);
    return this.part(
      this.scene,
      new T.PlaneGeometry(w, w / 5.12),
      new T.MeshStandardMaterial({ map: texture, roughness: 1 }),
      [x, y, z],
    );
  }
  private async loadGuards() {
    const gltf = await new GLTFLoader().loadAsync(
      assetUrl('/models/bunker/ww2-soldier.glb'),
    );
    if (this.disposed) {
      this.release(gltf.scene);
      return;
    }
    const [material, motions] = await Promise.all([
      uniformMaterial(),
      loadGuardMotions(),
    ]);
    if (this.disposed) {
      material.map?.dispose();
      material.dispose();
      this.release(gltf.scene);
      return;
    }
    const bounds = new T.Box3().setFromObject(gltf.scene),
      scale = 1.8 / (bounds.max.y - bounds.min.y);
    gltf.scene.traverse((o) => {
      if (o instanceof T.Mesh) {
        (o.material as T.Material).dispose();
        o.material = material;
        smoothGuardNormals(o.geometry);
      }
    });
    const [idleClip, walkClip] = guardClips(gltf.scene);
    for (let i = 0; i < guardSpawns.length; i++) {
      const root = new T.Group(),
        model = clone(gltf.scene),
        body = new T.Group();
      root.add(body);
      body.position.y = -PELVIS_HEIGHT;
      model.scale.setScalar(scale);
      model.rotation.y = Math.PI;
      model.position.y = -bounds.min.y * scale;
      body.add(model);
      this.scene.add(root);
      let head: T.Object3D | undefined;
      model.traverse((o) => {
        if (o.name.endsWith('Head')) head = o;
        if (o instanceof T.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false;
        }
      });
      const helmet = model.getObjectByName('Helmet');
      const flash = this.part(
        body,
        new T.SphereGeometry(0.09, 8, 6),
        new T.MeshBasicMaterial({ color: '#ffd087' }),
        [0.2, 1.28, -0.65],
      );
      flash.visible = false;
      const mixer = new T.AnimationMixer(model),
        idle = mixer.clipAction(idleClip),
        walk = mixer.clipAction(walkClip);
      idle.play();
      walk.play();
      walk.setEffectiveWeight(0);
      const arms = ['RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm'].map(
        (name) => {
          let result: T.Object3D | undefined;
          model.traverse((o) => {
            if (o.name.endsWith(name)) result = o;
          });
          return result;
        },
      );
      const rifle = new T.Group();
      body.add(rifle);
      this.part(
        rifle,
        new T.BoxGeometry(0.085, 0.095, 0.48),
        this.wood,
        [0, 1.25, -0.25],
      );
      this.part(
        rifle,
        new T.CylinderGeometry(0.023, 0.023, 0.55, 12),
        this.dark,
        [0, 1.29, -0.59],
        [Math.PI / 2, 0, 0],
      );
      this.part(
        rifle,
        new T.BoxGeometry(0.045, 0.18, 0.075),
        this.metal,
        [0, 1.12, -0.23],
      );
      for (const child of rifle.children)
        child.position.sub(new T.Vector3(0, 1.25, -0.35));
      rifle.position.set(0, 1.25, -0.35);
      rifle.add(flash);
      flash.position.set(0, 0.04, -0.55);
      this.guards.push({
        root,
        body,
        model,
        mixer,
        idle,
        walk,
        helmet,
        head,
        flash,
        arms,
        rifle,
        walkWeight: 0,
        joints: [
          'Spine',
          'Spine1',
          'Spine2',
          'Neck',
          'Head',
          'LeftUpLeg',
          'RightUpLeg',
          'LeftLeg',
          'RightLeg',
          'LeftArm',
          'RightArm',
          'LeftForeArm',
          'RightForeArm',
        ].flatMap((name) => {
          const bone = model.getObjectByName(name);
          return bone ? [{ bone, rest: bone.quaternion.clone(), name }] : [];
        }),
      });
    }
    for (const actor of this.guards)
      actor.motion = new GuardMotion(actor, motions);
    // Instances share the source meshes; dispose its unused skeleton separately.
    gltf.scene.traverse((o) => {
      if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
    });
  }
  reset() {
    for (const grenade of this.grenades.values()) {
      grenade.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.geometry.dispose();
          (o.material as T.Material).dispose();
        }
      });
      grenade.removeFromParent();
    }
    this.grenades.clear();
    this.blastAge = 0;
    this.blastLight.intensity = 0;
    this.doors.forEach((d, i) => (d.position.x = doorLayouts[i].x));
    for (const p of this.particles) {
      p.mesh.removeFromParent();
      p.mesh.geometry.dispose();
      (p.mesh.material as T.Material).dispose();
    }
    this.particles = [];
    for (const stain of this.stains) {
      stain.mesh.removeFromParent();
      stain.mesh.geometry.dispose();
      (stain.mesh.material as T.Material).dispose();
    }
    this.stains = [];
    this.guards.forEach(resetGuardActor);
  }
  private stain(
    x: number,
    z: number,
    seed: number,
    y = 0.016,
    normal?: T.Vector3,
  ) {
    if (this.stains.length >= 32) {
      const old = this.stains.shift()!;
      old.mesh.removeFromParent();
      old.mesh.geometry.dispose();
      (old.mesh.material as T.Material).dispose();
    }
    const shape = new T.Shape();
    for (let i = 0; i <= 16; i++) {
      const angle = (i / 16) * Math.PI * 2,
        r = 0.035 + (1 + Math.sin(i * 19 + seed)) * 0.025;
      const px = Math.cos(angle) * r,
        pz = Math.sin(angle) * r;
      if (i === 0) shape.moveTo(px, pz);
      else shape.lineTo(px, pz);
    }
    const mesh = new T.Mesh(
      new T.ShapeGeometry(shape),
      new T.MeshStandardMaterial({
        color: '#4e100b',
        roughness: 0.7,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    if (normal) {
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 0, 1), normal);
      mesh.position.addScaledVector(normal, 0.012);
    }
    this.scene.add(mesh);
    this.stains.push({ mesh, life: 18 });
  }
  private impactDust(x: number, y: number, z: number, ground: boolean) {
    if (!this.dustTexture) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
      gradient.addColorStop(0, 'rgba(190,178,153,0.28)');
      gradient.addColorStop(0.35, 'rgba(159,147,124,0.15)');
      gradient.addColorStop(1, 'rgba(130,119,103,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 64, 64);
      this.dustTexture = new T.CanvasTexture(canvas);
      this.resources.add(this.dustTexture);
    }
    for (let i = 0; i < (ground ? 7 : 3); i++) {
      if (this.particles.length >= 160) break;
      const mesh = new T.Mesh(
        new T.PlaneGeometry(1, 1),
        new T.MeshBasicMaterial({
          color: '#756952',
          map: this.dustTexture,
          transparent: true,
          depthWrite: false,
          opacity: 0.7,
        }),
      );
      const angle = i * 2.4;
      mesh.position.set(
        x + Math.sin(angle) * 0.1,
        y,
        z + Math.cos(angle) * 0.1,
      );
      mesh.scale.setScalar(ground ? 0.28 : 0.12);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new T.Vector3(
          Math.sin(angle) * (ground ? 0.4 : 0.12),
          ground ? 0.12 : 0.05,
          Math.cos(angle) * 0.28,
        ),
        life: ground ? 0.85 : 0.35,
        duration: ground ? 0.85 : 0.35,
        dust: true,
      });
    }
  }
  private effects(events: Effect[]) {
    for (const e of events) {
      if (e.kind === 'blast') {
        this.blastLight.position.set(e.x, e.y + 0.3, e.z);
        this.blastAge = 0.24;
        for (let j = 0; j < 4; j++)
          this.impactDust(
            e.x + Math.sin(j * 2.4) * 0.5,
            e.y + 0.2,
            e.z + Math.cos(j * 2.4) * 0.5,
            true,
          );
        for (const p of this.particles.slice(-28))
          if (p.dust) {
            p.life = p.duration = 2.8;
            p.velocity.multiplyScalar(2.2);
            p.velocity.y = 0.3;
            p.mesh.scale.setScalar(0.65);
          }
      }
      if (!['stone', 'hit', 'blast'].includes(e.kind)) continue;
      const blood = e.kind === 'hit',
        count = blood ? (e.fatal ? 32 : 18) : e.kind === 'blast' ? 28 : 6,
        direction = e.direction ?? [0, 0, 1];
      if (!blood) this.impactDust(e.x, e.y, e.z, false);
      for (let i = 0; i < count; i++) {
        if (this.particles.length >= 160) {
          const old = this.particles.shift()!;
          old.mesh.removeFromParent();
          old.mesh.geometry.dispose();
          (old.mesh.material as T.Material).dispose();
        }
        const mat = new T.MeshStandardMaterial({
          color: blood
            ? i % 3
              ? '#792116'
              : '#38251f'
            : i % 2
              ? '#9d9584'
              : '#c1ac86',
          roughness: 0.9,
          transparent: true,
        });
        const mesh = new T.Mesh(
          new T.SphereGeometry(blood ? 0.013 : 0.015, 5, 4),
          mat,
        );
        mesh.position.set(e.x, e.y, e.z);
        mesh.scale.set(blood ? 0.6 : 1, blood ? 1.65 : 1, blood ? 0.6 : 1);
        this.scene.add(mesh);
        const speed =
          (e.kind === 'blast' ? 4 : e.fatal ? 2.1 : 1.1) + (i % 7) * 0.27;
        this.particles.push({
          mesh,
          velocity: new T.Vector3(
            (e.kind === 'blast' ? Math.sin(i * 2.4) : direction[0]) * speed +
              Math.sin(i * 7.2) * 0.9,
            0.15 + direction[1] * speed + Math.sin(i * 2.3) * 0.55,
            (e.kind === 'blast' ? Math.cos(i * 2.4) : direction[2]) * speed +
              Math.cos(i * 4.1) * 0.9,
          ),
          life: blood ? 1.1 : 0.45,
          duration: blood ? 1.1 : 0.45,
          blood: blood && i % 3 !== 0,
        });
      }
    }
  }
  render(b: BunkerState, dt: number, events: Effect[], steady: boolean) {
    if (this.disposed) return;
    const active = b.status === 'playing',
      frame = active ? dt : 0;
    this.effects(events);
    const obstacles = worldSolids(b);
    this.doors.forEach(
      (door, i) => (door.position.x = b.doors[i].x + b.doors[i].progress * 3),
    );
    this.blastAge = Math.max(0, this.blastAge - frame);
    this.blastLight.intensity = 85 * Math.pow(this.blastAge / 0.24, 2);
    for (const p of b.activeGrenades) {
      let group = this.grenades.get(p.id);
      if (!group) {
        group = new T.Group();
        const body = new T.Mesh(
          new T.SphereGeometry(0.085, 12, 8),
          new T.MeshStandardMaterial({
            color: '#485043',
            metalness: 0.65,
            roughness: 0.55,
          }),
        );
        body.scale.y = 1.25;
        group.add(body);
        const cap = new T.Mesh(
          new T.CylinderGeometry(0.035, 0.035, 0.05, 8),
          new T.MeshStandardMaterial({
            color: '#696d60',
            metalness: 0.8,
            roughness: 0.4,
          }),
        );
        cap.position.y = 0.115;
        group.add(cap);
        this.scene.add(group);
        this.grenades.set(p.id, group);
      }
      group.position.set(p.x, p.y, p.z);
      group.rotation.set(b.time * 7, p.id, b.time * 4);
    }
    for (const [id, group] of this.grenades)
      if (!b.activeGrenades.some((p) => p.id === id)) {
        group.traverse((o) => {
          if (o instanceof T.Mesh) {
            o.geometry.dispose();
            (o.material as T.Material).dispose();
          }
        });
        group.removeFromParent();
        this.grenades.delete(id);
      }
    this.camera.position.set(
      b.x,
      1.65 + (steady ? 0 : Math.sin(b.steps * 8) * 0.018),
      b.z,
    );
    this.camera.rotation.order = 'YXZ';
    this.mobileLights?.update(this.camera.position);
    this.camera.rotation.set(
      b.pitch + (steady ? 0 : Math.sin(b.time * 71) * b.blastShake * 0.024),
      b.yaw,
      steady ? 0 : Math.sin(b.time * 53) * b.blastShake * 0.018,
    );
    this.weapon.position.set(
      0.25 * Math.min(1, this.camera.aspect) +
        (steady ? 0 : Math.sin(b.steps * 4) * 0.01),
      -0.27 - Math.sin((b.reload / 1.65) * Math.PI) * 0.22,
      -0.48 + b.recoil * 0.035,
    );
    this.weapon.rotation.set(
      b.recoil * 0.055,
      -b.reload * 0.07,
      b.reload > 0 ? -0.3 : 0,
    );
    this.weapon.visible = b.weapon === 'mp40';
    this.missionProps.held.visible = b.weapon === 'charge';
    this.missionProps.held.position.x = 0.23 * Math.min(1, this.camera.aspect);
    this.missionProps.held.position.y =
      -0.32 + (b.planting !== null ? Math.sin(b.plantTime * 5) * 0.025 : 0);
    this.missionProps.charges.forEach(
      (charge, i) => (charge.visible = b.charges[i]),
    );
    this.missionProps.supplies.forEach(
      (supply, i) => (supply.visible = b.supplies[i]),
    );
    this.muzzle.visible = active && b.weapon === 'mp40' && b.recoil > 0.7;
    this.muzzle.rotation.y = b.time * 37;
    this.muzzleLight.intensity = this.muzzle.visible ? 9 : 0;
    this.medkit.visible = b.medkit;
    const cleared = b.mission === 'escape';
    this.exitLight.emissive.set(cleared ? '#5cce97' : '#cf7e2c');
    this.camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(
      this.camera.projectionMatrix,
      this.camera.matrixWorldInverse,
    );
    this.guardFrustum.setFromProjectionMatrix(this.viewProjection);
    b.guards.forEach((g, i) => {
      const a = this.guards[i];
      if (!a) return;
      animateGuard(a, g, frame, this.scene, active, obstacles);
      // Skinned submeshes have frustumCulled=false because bind-pose bounds
      // cannot follow animated limbs. Cull their whole actor conservatively.
      this.guardBounds.center.copy(a.root.position);
      this.guardBounds.radius = g.health > 0 ? 3 : 6;
      a.root.visible = this.guardFrustum.intersectsSphere(this.guardBounds);
      if (active && a.ragdoll?.wallImpact) {
        const p = a.ragdoll.wallImpact;
        this.impactDust(p.x, p.y, p.z, true);
        a.ragdoll.wallImpact = undefined;
      }
      if (
        active &&
        g.health <= 0 &&
        !a.contactEmitted &&
        (a.ragdoll?.floorImpact || a.motion?.floorImpact)
      ) {
        a.contactEmitted = true;
        const torso = a.ragdoll?.nodes.find((n) => n.name === 'Spine2');
        this.impactDust(torso?.p.x ?? g.x, 0.09, torso?.p.z ?? g.z, true);
      }
    });
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= frame;
      if (!p.dust) p.velocity.y -= frame * 7.5;
      else {
        p.mesh.quaternion.copy(this.camera.quaternion);
        p.mesh.scale.addScalar(frame * 0.6);
      }
      const previous = p.mesh.position.clone();
      p.mesh.position.addScaledVector(p.velocity, frame);
      if (p.blood && frame > 0) {
        const travel = p.mesh.position.clone().sub(previous),
          distance = travel.length();
        if (distance > 0) {
          travel.divideScalar(distance);
          for (const wall of obstacles) {
            const hit = rayBox(previous.toArray(), travel.toArray(), wall);
            if (hit > distance) continue;
            const point = previous.clone().addScaledVector(travel, hit);
            const faces = [
              Math.abs(Math.abs(point.x - wall.x) - wall.w / 2),
              Math.abs(Math.abs(point.y - wall.y) - wall.h / 2),
              Math.abs(Math.abs(point.z - wall.z) - wall.d / 2),
            ];
            const axis = faces.indexOf(Math.min(...faces));
            const normal = new T.Vector3(
              axis === 0 ? Math.sign(point.x - wall.x) : 0,
              axis === 1 ? Math.sign(point.y - wall.y) : 0,
              axis === 2 ? Math.sign(point.z - wall.z) : 0,
            );
            this.stain(point.x, point.z, i, point.y, normal);
            p.life = 0;
            break;
          }
        }
        p.mesh.quaternion.setFromUnitVectors(
          new T.Vector3(0, 1, 0),
          p.velocity.clone().normalize(),
        );
      }
      (p.mesh.material as T.MeshBasicMaterial).opacity = p.life / p.duration;
      if (p.blood && p.mesh.position.y <= 0.022) {
        this.stain(p.mesh.position.x, p.mesh.position.z, i);
        p.life = 0;
      }
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as T.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
    for (let i = this.stains.length - 1; i >= 0; i--) {
      const s = this.stains[i];
      s.life -= frame;
      (s.mesh.material as T.MeshStandardMaterial).opacity =
        0.7 * Math.min(1, s.life / 3);
      if (s.life <= 0) {
        s.mesh.removeFromParent();
        s.mesh.geometry.dispose();
        (s.mesh.material as T.Material).dispose();
        this.stains.splice(i, 1);
      }
    }
    this.sea.position.y = -3 + Math.sin(b.time * 0.45) * 0.07;
    const seaNormal = (this.sea.material as T.MeshStandardMaterial).normalMap;
    if (seaNormal) seaNormal.offset.set(b.time * 0.009, b.time * 0.004);
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
  private release(root: T.Object3D) {
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>(),
      textures = new Set<T.Texture>(this.resources);
    root.traverse((o) => {
      if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
      if (o instanceof T.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          materials.add(m);
          for (const v of Object.values(m))
            if (v instanceof T.Texture) textures.add(v);
        }
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.guards.forEach((g) => {
      g.mixer.stopAllAction();
      g.mixer.uncacheRoot(g.model);
    });
    this.release(this.scene);
    this.ao?.dispose();
    this.output?.dispose();
    this.composer?.dispose();
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
