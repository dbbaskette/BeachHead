import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { assetUrl } from '../asset-url';
import { rooms, solids, type BunkerState, type Effect } from './simulation';

type Actor = {
  root: T.Group;
  model: T.Object3D;
  mixer: T.AnimationMixer;
  idle: T.AnimationAction;
  walk: T.AnimationAction;
  helmet: T.Mesh;
  head?: T.Object3D;
  flash: T.Mesh;
  arms: (T.Object3D | undefined)[];
};
type Particle = {
  mesh: T.Mesh;
  velocity: T.Vector3;
  life: number;
  duration: number;
};
export class BunkerScene {
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(68, 1, 0.05, 180);
  private renderer: T.WebGLRenderer;
  private observer: ResizeObserver;
  private weapon = new T.Group();
  private muzzle: T.Mesh;
  private muzzleLight = new T.PointLight('#ffc57a', 0, 4);
  private guards: Actor[] = [];
  private particles: Particle[] = [];
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
  private world = new T.Vector3();
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
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio, touch ? 1.25 : 1.75),
    );
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.shadowMap.enabled = !touch;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    const environment = new RoomEnvironment();
    const pmrem = new T.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(environment, 0.05);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.32;
    environment.dispose();
    pmrem.dispose();
    this.scene.background = new T.Color('#6f8991');
    this.scene.fog = new T.FogExp2('#667577', 0.009);
    this.scene.add(new T.HemisphereLight('#c5d5d4', '#484035', 1.65));
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
    const timber = new T.TextureLoader().load(
      assetUrl('/textures/deck-color.jpg'),
    );
    timber.colorSpace = T.SRGBColorSpace;
    timber.wrapS = timber.wrapT = T.RepeatWrapping;
    timber.repeat.set(1.5, 1.5);
    this.resources.add(timber);
    this.wood.map = timber;
    const concrete = this.surface('pillbox-concrete', '#a3a098', 1.1);
    const floor = this.surface('pillbox-concrete', '#77786e', 2.4);
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
    const damp = new T.MeshStandardMaterial({
      color: '#393c34',
      roughness: 0.3,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    for (let i = 0; i < 22; i++) {
      const z = 14 - i * 1.65,
        width = z > 2 ? 12 : z < -10 ? 10 : 3;
      const puddle = new T.Mesh(
        new T.CircleGeometry(0.4 + (i % 4) * 0.2, 18),
        damp,
      );
      puddle.rotation.x = -Math.PI / 2;
      puddle.scale.set(1.8, 1, 1);
      puddle.position.set(Math.sin(i * 2.39) * (width / 2 - 1), 0.012, z);
      this.scene.add(puddle);
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
    // Embrasure: sea, distant shoreline, and a heavy gun pointing out of the slit.
    const seaMat = new T.MeshStandardMaterial({
      color: '#607d84',
      roughness: 0.25,
      metalness: 0.35,
    });
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
    this.gun();
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
    const resize = () => {
      if (this.disposed) return;
      this.camera.aspect = host.clientWidth / Math.max(1, host.clientHeight);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(host.clientWidth, host.clientHeight);
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
    const map = load('diffuse');
    map.colorSpace = T.SRGBColorSpace;
    return new T.MeshStandardMaterial({
      map,
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
    return this.part(this.scene, new T.BoxGeometry(w, h, d), mat, [x, y, z]);
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
    const light = new T.PointLight('#ffd295', 32, 11, 2);
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
    this.box(-3.65, 1.65, 8.5, 0.65, 0.6, 0.6, this.dark);
    for (const z of [7.98, 9.02]) {
      this.box(-4.7, 1.2, z, 1.8, 0.8, 0.2, this.metal);
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
      assetUrl('/models/Soldier.glb'),
    );
    if (this.disposed) {
      this.release(gltf.scene);
      return;
    }
    const bounds = new T.Box3().setFromObject(gltf.scene),
      scale = 1.8 / (bounds.max.y - bounds.min.y);
    gltf.scene.traverse((o) => {
      if (o instanceof T.Mesh) {
        if (o.name.toLowerCase().includes('visor')) o.visible = false;
        o.geometry.computeBoundingBox();
        const low = o.geometry.boundingBox!.min.z,
          span = Math.max(0.001, o.geometry.boundingBox!.max.z - low);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (m instanceof T.MeshStandardMaterial) {
            m.color.set('#b2b2a7');
            m.onBeforeCompile = (shader) => {
              shader.vertexShader =
                'varying float vUniformHeight;\n' + shader.vertexShader;
              shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>\nvUniformHeight=(position.z - (${low.toFixed(5)}))/${span.toFixed(5)};`,
              );
              shader.fragmentShader =
                'varying float vUniformHeight;\n' + shader.fragmentShader;
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <map_fragment>',
                `#include <map_fragment>
                float detail=clamp(dot(diffuseColor.rgb,vec3(.299,.587,.114))*.7+.45,.4,1.);
                vec3 wool=vec3(.22,.25,.19)*detail;
                vec3 leather=vec3(.06,.048,.037)*detail;
                diffuseColor.rgb=mix(diffuseColor.rgb,mix(leather,wool,smoothstep(.12,.2,vUniformHeight)),1.-smoothstep(.8,.87,vUniformHeight));`,
              );
            };
            m.customProgramCacheKey = () => 'bunker-field-grey-v1';
            m.roughness = 1;
            m.metalness = 0;
          }
      }
    });
    const idleClip = gltf.animations.find(
        (a) => a.name.toLowerCase() === 'idle',
      )!,
      walkClip = gltf.animations.find((a) => a.name.toLowerCase() === 'walk')!;
    for (let i = 0; i < 4; i++) {
      const root = new T.Group(),
        model = clone(gltf.scene);
      model.scale.setScalar(scale);
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
      const helmet = this.part(
        root,
        new T.SphereGeometry(0.175, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6),
        this.metal,
        [0, 1.72, 0],
      );
      helmet.scale.y = 0.75;
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
      this.part(
        root,
        new T.BoxGeometry(0.085, 0.095, 0.48),
        this.wood,
        [0, 1.25, -0.25],
      );
      this.part(
        root,
        new T.CylinderGeometry(0.023, 0.023, 0.55, 12),
        this.dark,
        [0, 1.29, -0.59],
        [Math.PI / 2, 0, 0],
      );
      this.part(
        root,
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
    this.guards.forEach((g) => g.mixer.setTime(0));
  }
  private effects(events: Effect[]) {
    for (const e of events) {
      if (!['stone', 'hit'].includes(e.kind)) continue;
      for (let i = 0; i < 6; i++) {
        const mat = new T.MeshBasicMaterial({
          color: e.kind === 'hit' ? '#762c20' : i % 2 ? '#d2ba8b' : '#f8d190',
          transparent: true,
        });
        const mesh = new T.Mesh(
          new T.SphereGeometry(e.kind === 'hit' ? 0.022 : 0.015, 5, 4),
          mat,
        );
        mesh.position.set(e.x, e.y, e.z);
        this.scene.add(mesh);
        this.particles.push({
          mesh,
          velocity: new T.Vector3(
            Math.sin(i * 7.2) * 1.2,
            0.5 + i * 0.15,
            Math.cos(i * 4.1),
          ),
          life: 0.45,
          duration: 0.45,
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
      a.root.position.set(g.x, g.down * 0.13, g.z);
      a.root.rotation.y =
        g.health > 0 ? Math.atan2(g.x - b.x, g.z - b.z) : a.root.rotation.y;
      a.root.rotation.x = g.down * Math.PI * 0.48;
      a.root.rotation.z = g.down * (i % 2 ? 0.15 : -0.15);
      if (g.health > 0) {
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
      if (a.head) {
        a.root.updateMatrixWorld(true);
        a.head.getWorldPosition(this.world);
        a.helmet.position.copy(a.root.worldToLocal(this.world));
        a.helmet.position.y += 0.06;
      }
      a.helmet.visible = g.down < 0.9;
      a.flash.visible = active && g.health > 0 && g.flash > 0;
    });
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= frame;
      p.velocity.y -= frame * 4;
      p.mesh.position.addScaledVector(p.velocity, frame);
      (p.mesh.material as T.MeshBasicMaterial).opacity = p.life / p.duration;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as T.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
    this.sea.position.y = -3 + Math.sin(b.time * 0.45) * 0.07;
    this.renderer.render(this.scene, this.camera);
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
    this.environment.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
