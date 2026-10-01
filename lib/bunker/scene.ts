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
import { guardReaction } from './reactions';
import { uniformMaterial, guardClips } from './uniform';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { assetUrl } from '../asset-url';
import { rooms, solids, type BunkerState, type Effect } from './simulation';

type Actor = {
  root: T.Group;
  model: T.Object3D;
  mixer: T.AnimationMixer;
  idle: T.AnimationAction;
  walk: T.AnimationAction;
  helmet?: T.Object3D;
  head?: T.Object3D;
  flash: T.Mesh;
  arms: (T.Object3D | undefined)[];
  rifle: T.Group;
  joints: { bone: T.Object3D; rest: T.Quaternion; name: string }[];
  deathPose?: T.Quaternion[];
};
type Particle = {
  mesh: T.Mesh;
  velocity: T.Vector3;
  life: number;
  duration: number;
  blood?: boolean;
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
  private guards: Actor[] = [];
  private particles: Particle[] = [];
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
    color: '#594531',
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
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, touch ? 1.25 : 1.75),
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
      assetUrl('/textures/deck-color.jpg'),
    );
    timber.colorSpace = T.SRGBColorSpace;
    timber.wrapS = timber.wrapT = T.RepeatWrapping;
    timber.repeat.set(1.5, 1.5);
    this.resources.add(timber);
    this.wood.map = timber;
    const concrete = this.surface('pillbox-concrete', '#aaa79c', 0.6);
    const floor = this.surface('pillbox-concrete', '#77786e', 0.7);
    for (const r of rooms) {
      this.box(r.x, -0.15, r.z, r.w, 0.3, r.d, floor);
      this.box(r.x, r.h + 0.18, r.z, r.w, 0.36, r.d, concrete);
    }
    for (const s of solids) {
      if (s.kind === 'gun') continue;
      this.box(
        s.x,
        s.y,
        s.z,
        s.w,
        s.h,
        s.d,
        s.kind === 'crate' ? this.wood : concrete,
      );
      if (s.kind === 'crate') {
        for (const x of [-0.38, 0.38])
          this.box(
            s.x + x * s.w,
            s.y,
            s.z,
            0.07,
            s.h + 0.03,
            s.d + 0.04,
            this.dark,
          );
        for (let i = 0; i < 5; i++)
          this.box(
            s.x,
            s.y - s.h / 2 + (i * s.h) / 5,
            s.z + s.d / 2 + 0.006,
            s.w,
            0.015,
            0.01,
            this.dark,
          );
      }
    }
    // Steel lintels, ribs, pipes and cable runs give the corridor readable depth.
    for (const z of [1.7, -1, -4, -7, -9.7]) {
      this.box(0, 3.05, z, 3.6, 0.23, 0.25, this.metal);
      for (const x of [-1.7, 1.7]) this.box(x, 1.5, z, 0.18, 3, 0.25, concrete);
      for (let i = 0; i < 7; i++) {
        const angle = (i * Math.PI) / 6,
          x = Math.cos(angle) * 1.55,
          y = 2.45 + Math.sin(angle) * 0.55;
        const brick = this.box(x, y, z, 0.55, 0.22, 0.28, concrete);
        brick.rotation.z = angle - Math.PI / 2;
      }
    }
    for (const r of rooms) {
      for (const x of [r.w / 2 - 0.4, r.w / 2 - 0.65])
        this.cylinder(x, r.h - 0.48, r.z, 0.065, r.d, this.metal, 'z');
      for (let z = r.z - r.d / 2 + 1; z < r.z + r.d / 2; z += 2.5) {
        this.box(r.w / 2 - 0.52, r.h - 0.48, z, 0.43, 0.055, 0.08, this.dark);
        this.box(
          -r.w / 2 + 0.025,
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
    this.gun();
    addBunkerDetail(this.scene, concrete, this.metal, this.dark, this.brass);
    for (let i = 0; i < 7; i++) {
      const z = 4.2 + i * 0.34;
      this.cylinder(-5.8, 0.55, z, 0.1, 1.1, this.brass);
      const tip = new T.Mesh(new T.ConeGeometry(0.1, 0.3, 12), this.dark);
      tip.position.set(-5.8, 1.24, z);
      this.scene.add(tip);
    }
    this.box(-5.8, 0.12, 5.2, 0.65, 0.18, 2.8, this.wood);
    // Small rubble, drainage gratings and ceiling beams break up broad surfaces.
    for (const r of [rooms[0], rooms[2]]) {
      for (let z = r.z - r.d / 2 + 2; z < r.z + r.d / 2; z += 4)
        this.box(0, r.h - 0.18, z, r.w, 0.25, 0.32, concrete);
      for (let i = 0; i < 20; i++) {
        const x =
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
    for (let z = 10; z > -23; z -= 3) {
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
      this.box(-5, 1.2, -19 - i * 0.65, 0.75, 0.55, 0.5, this.metal);
      for (let j = 0; j < 3; j++)
        this.cylinder(
          -4.6,
          1.17,
          -19 - i * 0.65 + j * 0.1 - 0.1,
          0.045,
          0.06,
          this.dark,
          'x',
        );
    }
    this.box(0, 1.25, -23.7, 2.5, 2.5, 0.18, this.metal);
    this.box(0, 1.35, -23.58, 1.7, 1.8, 0.08, this.dark);
    this.box(0, 2.7, -23.4, 1.5, 0.17, 0.08, this.exitLight);
    this.sign('TUNNELS', 0, 3.2, -23.35, 1.5);
    this.sign('MUNITIONS', 0, 2.75, -9.66, 1.7);
    this.sign('04  /  KASEMATTE', 2.8, 2.9, 2.28, 2.4);
    this.box(0, 0, 0, 0.01, 0.01, 0.01, this.dark); // shared origin marker stays under the floor
    const kitMat = new T.MeshStandardMaterial({
      color: '#ddd2ac',
      roughness: 0.85,
    });
    const kit = new T.Mesh(new T.BoxGeometry(0.6, 0.28, 0.45), kitMat);
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
      bumpScale: 0.045,
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
  private gun() {
    this.cylinder(-4.7, 0.15, 8.5, 1.75, 0.3, this.dark);
    this.cylinder(-4.7, 0.55, 8.5, 0.72, 0.85, this.metal);
    this.box(-4.8, 1.1, 8.5, 2.4, 0.5, 0.95, this.metal);
    this.cylinder(-6.6, 1.7, 8.5, 0.19, 5.6, this.metal, 'x');
    this.cylinder(-7.6, 1.7, 8.5, 0.125, 4.7, this.dark, 'x');
    this.cylinder(-4.3, 1.9, 8.5, 0.13, 1.8, this.metal, 'x');
    this.box(-3.65, 1.76, 8.5, 0.8, 0.8, 0.75, this.dark);
    for (const z of [7.98, 9.02]) {
      this.box(-4.7, 1.43, z, 1.9, 1.26, 0.22, this.metal);
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
    this.part(
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
    const material = await uniformMaterial();
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
      }
    });
    const [idleClip, walkClip] = guardClips(gltf.scene);
    for (let i = 0; i < 4; i++) {
      const root = new T.Group(),
        model = clone(gltf.scene);
      model.scale.setScalar(scale);
      model.rotation.y = Math.PI;
      model.position.y = -bounds.min.y * scale;
      root.add(model);
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
        root,
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
      root.add(rifle);
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
      flash.position.set(0, 1.29, -0.9);
      this.guards.push({
        root,
        model,
        mixer,
        idle,
        walk,
        helmet,
        head,
        flash,
        arms,
        rifle,
        joints: [
          'Spine',
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
    // Instances share the source meshes; dispose its unused skeleton separately.
    gltf.scene.traverse((o) => {
      if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
    });
  }
  reset() {
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
    this.guards.forEach((g) => {
      g.deathPose = undefined;
      g.joints.forEach((j) => j.bone.quaternion.copy(j.rest));
      g.rifle.position.set(0, 0, 0);
      g.rifle.rotation.set(0, 0, 0);
      g.mixer.setTime(0);
    });
  }
  private stain(x: number, z: number, seed: number) {
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
    mesh.position.set(x, 0.016, z);
    this.scene.add(mesh);
    this.stains.push({ mesh, life: 18 });
  }
  private effects(events: Effect[]) {
    for (const e of events) {
      if (!['stone', 'hit'].includes(e.kind)) continue;
      const blood = e.kind === 'hit',
        count = blood ? 12 : 6,
        direction = e.direction ?? [0, 0, 1];
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
        const speed = 0.35 + (i % 4) * 0.23;
        this.particles.push({
          mesh,
          velocity: new T.Vector3(
            direction[0] * speed + Math.sin(i * 7.2) * 0.5,
            0.15 + direction[1] * speed + Math.sin(i * 2.3) * 0.55,
            direction[2] * speed + Math.cos(i * 4.1) * 0.5,
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
    this.camera.position.set(
      b.x,
      1.65 + (steady ? 0 : Math.sin(b.steps * 8) * 0.018),
      b.z,
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.set(b.pitch, b.yaw, 0);
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
    this.muzzle.visible = active && b.recoil > 0.7;
    this.muzzle.rotation.y = b.time * 37;
    this.muzzleLight.intensity = this.muzzle.visible ? 9 : 0;
    this.medkit.visible = b.medkit;
    const cleared = b.guards.every((g) => g.health <= 0);
    this.exitLight.emissive.set(cleared ? '#5cce97' : '#cf7e2c');
    b.guards.forEach((g, i) => {
      const a = this.guards[i];
      if (!a) return;
      const reaction = guardReaction(g);
      a.root.rotation.order = 'YXZ';
      a.root.position.set(g.x, reaction.height, g.z);
      a.root.rotation.y =
        g.health > 0 ? Math.atan2(g.x - b.x, g.z - b.z) : a.root.rotation.y;
      a.root.rotation.x = reaction.pitch;
      a.root.rotation.z = reaction.roll;
      if (g.health > 0) {
        a.deathPose = undefined;
        // Restore non-animated joints before applying each frame's flinch.
        for (const joint of a.joints)
          if (joint.name === 'Head') joint.bone.quaternion.copy(joint.rest);
        a.idle.setEffectiveWeight(g.moving ? 0 : 1);
        a.walk.setEffectiveWeight(g.moving ? 1 : 0);
        a.mixer.update(frame);
        // Aim the animated arms at the rifle using each bone's local +Y axis.
        a.root.updateMatrixWorld(true);
        for (let arm = 0; arm < a.arms.length; arm++) {
          const bone = a.arms[arm];
          if (!bone?.parent) continue;
          const side = arm < 2 ? -1 : 1;
          const target = a.root.localToWorld(
            new T.Vector3(
              side * (arm % 2 ? 0.09 : 0.28),
              arm % 2 ? 1.25 : 1.1,
              arm % 2 ? -0.4 : -0.12,
            ),
          );
          const direction = target
            .sub(bone.getWorldPosition(new T.Vector3()))
            .normalize();
          const desired = new T.Quaternion().setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            direction,
          );
          const parent = bone.parent
            .getWorldQuaternion(new T.Quaternion())
            .invert();
          bone.quaternion.copy(parent.multiply(desired));
          bone.updateMatrixWorld(true);
        }
      }
      if (g.health <= 0) {
        if (!a.deathPose)
          a.deathPose = a.joints.map((j) => j.bone.quaternion.clone());
        a.joints.forEach((joint, index) => {
          joint.bone.quaternion.copy(a.deathPose![index]);
          const leg = joint.name.endsWith('Leg'),
            arm = joint.name.includes('Arm');
          if (leg)
            joint.bone.rotateX(
              (joint.name.includes('Up') ? -1 : 1.6) * reaction.knees,
            );
          if (joint.name === 'Spine') joint.bone.rotateX(reaction.fold);
          if (joint.name === 'Head')
            joint.bone.rotateZ(reaction.fall * 0.18 * (g.id % 2 ? 1 : -1));
          if (arm) {
            joint.bone.rotateX(reaction.fall * 0.45);
            joint.bone.rotateZ(
              reaction.fall * (joint.name.startsWith('Left') ? -0.35 : 0.35),
            );
          }
        });
        // Rifle slips down from the hands during collapse, without explosive knockback.
        a.rifle.position.y = -reaction.fall * 0.35;
        a.rifle.rotation.z = reaction.fall * (g.id % 2 ? 0.45 : -0.45);
      } else {
        for (const joint of a.joints) {
          if (joint.name === 'Spine') joint.bone.rotateX(reaction.fold);
          if (joint.name.endsWith('Leg'))
            joint.bone.rotateX(
              reaction.knees * (joint.name.includes('Up') ? -1 : 1),
            );
          if (joint.name === 'Head' && g.hitRegion === 'head')
            joint.bone.rotateX(reaction.pitch);
        }
        a.rifle.position.y = -Math.sin((g.hitTime / 0.32) * Math.PI) * 0.055;
        a.rifle.rotation.z = 0;
      }
      a.flash.visible = active && g.health > 0 && g.flash > 0;
    });
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= frame;
      p.velocity.y -= frame * 7.5;
      p.mesh.position.addScaledVector(p.velocity, frame);
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
