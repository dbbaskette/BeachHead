import * as T from 'three';
import { TankArt, makeTank, makeCover, makeEnemy } from './art';
import { consolidateTank as consolidate } from './art';
import { makeSky } from '../naval/ocean';
import { COASTAL_SUN } from '../naval/daylight';
import { TOUCH_LAYOUT_QUERY } from '../touch-input';
import { type TankState, type TankEvent, tankMuzzle } from './simulation';
import { SUPPLY } from './map';
import { buildTerrain, terrainHeight } from './terrain';
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
  glow: boolean;
};
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
  private particles: Particle[] = [];
  private smoke: T.InstancedMesh;
  private chips: T.InstancedMesh;
  private shells: T.InstancedMesh;
  private object = new T.Object3D();
  private color = new T.Color();
  private last = 0;
  private shake = 0;
  private trackPhase = 0;
  private trackMarks: T.InstancedMesh;
  private markCount = 0;
  private markDistance = 0;
  private markX = 0;
  private markZ = 18;
  private cameraReady = false;
  private observer: ResizeObserver;
  private disposed = false;
  private smokeClock = 0;
  private river: T.Mesh;
  private supply = new T.Group();
  private bridge = new T.Group();
  private allies: T.Group[] = [];
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
    const sun = new T.DirectionalLight('#ffe2b7', 3);
    sun.position.copy(COASTAL_SUN).multiplyScalar(200);
    sun.castShadow = !touch;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -70,
      right: 70,
      top: 70,
      bottom: -70,
      near: 1,
      far: 550,
    });
    sun.shadow.normalBias = 0.04;
    sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(sun);
    const pmrem = new T.PMREMGenerator(this.renderer),
      env = new T.Scene();
    env.add(this.sky.clone());
    this.env = pmrem.fromScene(env, 0.15, 0.1, 1800);
    this.scene.environment = this.env.texture;
    this.scene.environmentIntensity = 0.3;
    pmrem.dispose();
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
    this.art.textures.add(treadMap);
    const treadMat = new T.MeshBasicMaterial({
      map: treadMap,
      transparent: true,
      depthWrite: false,
      opacity: 0.34,
    });
    this.art.materials.add(treadMat);
    const treadGeo = this.art.geo(new T.PlaneGeometry(0.5, 0.72));
    treadGeo.rotateX(-Math.PI / 2);
    this.trackMarks = new T.InstancedMesh(treadGeo, treadMat, 900);
    this.trackMarks.count = 0;
    this.trackMarks.frustumCulled = false;
    this.trackMarks.instanceMatrix.setUsage(T.DynamicDrawUsage);
    this.scene.add(this.trackMarks);
    const water = this.art.mat('#596d60', 0.22);
    water.normalMap = this.art.texture('water-normal.jpg');
    water.normalMap.repeat.set(12, 1);
    water.normalScale.set(0.3, 0.3);
    water.metalness = 0.08;
    this.river = this.art.mesh(
      this.scene,
      this.art.geo(new T.PlaneGeometry(900, 26, 1, 1)),
      water,
      [0, -1.05, -322],
      [1, 1, 1],
    );
    this.river.rotation.x = -Math.PI / 2;
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
    this.supply.position.set(SUPPLY.x, 0, SUPPLY.z);
    this.scene.add(this.supply);
    for (let i = 0; i < 5; i++) {
      const ally = makeEnemy(this.art, 'rocket').root;
      ally.position.set((i % 2 ? 1 : -1) * 2, 0, 35 + i * 2);
      this.allies.push(ally);
      this.scene.add(ally);
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!,
      gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,.75)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const smokeTexture = new T.CanvasTexture(canvas);
    this.art.textures.add(smokeTexture);
    const smokeMat = new T.MeshBasicMaterial({
      map: smokeTexture,
      transparent: true,
      depthWrite: false,
      opacity: 0.65,
    });
    this.art.materials.add(smokeMat);
    this.smoke = new T.InstancedMesh(
      this.art.geo(new T.PlaneGeometry(1, 1)),
      smokeMat,
      180,
    );
    this.smoke.frustumCulled = false;
    this.smoke.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const glow = new T.MeshBasicMaterial({
      color: '#ffd1a0',
      toneMapped: false,
    });
    this.art.materials.add(glow);
    this.chips = new T.InstancedMesh(this.art.sphere, glow, 100);
    this.chips.frustumCulled = false;
    this.shells = new T.InstancedMesh(this.art.sphere, glow, 80);
    this.shells.frustumCulled = false;
    this.scene.add(this.smoke, this.chips, this.shells);
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
    for (let j = 0; j < 34; j++) {
      const angle = j * 2.399,
        radius = 1.6 + Math.sin(j * 4) * 0.9;
      const leaf = a.mesh(
        root,
        a.foliage,
        a.leaves,
        [
          x + Math.sin(angle) * radius * scale,
          (5 + (j % 5) * 0.55) * scale,
          z + Math.cos(angle) * radius * scale,
        ],
        [3.5 * scale, 3.5 * scale, 1],
      );
      leaf.rotation.set((j % 3) * 0.65, angle, (j % 2) * 0.5);
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
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }
  private burst(e: TankEvent) {
    if (e.kind === 'repair' || e.kind === 'win') return;
    const big = e.kind === 'destroy',
      hot = ['cannon', 'mg', 'ricochet', 'damage'].includes(e.kind);
    if (big)
      for (let i = 0; i < 5; i++)
        this.particles.push({
          x: e.at.x + Math.sin(i) * 0.5,
          y: e.at.y + 0.4,
          z: e.at.z + Math.cos(i) * 0.5,
          vx: Math.sin(i) * 3,
          vy: 2,
          vz: Math.cos(i) * 3,
          age: 0,
          life: 0.35,
          size: 1.2,
          glow: true,
        });
    const count = e.kind === 'mg' ? 2 : e.kind === 'warning' ? 1 : big ? 22 : 9;
    for (let i = 0; i < count; i++) {
      const n = e.at.x + e.at.z + i * 8.7 + this.last;
      this.particles.push({
        x: e.at.x,
        y: e.at.y,
        z: e.at.z,
        vx: Math.sin(n * 3) * (big ? 5 : 2),
        vy: big ? 2 + (i % 5) * 1.2 : hot ? 1 : 1.5,
        vz: Math.cos(n * 7) * (big ? 5 : 2),
        age: 0,
        life: hot ? 0.15 + i * 0.025 : big ? 3 + i * 0.1 : 1.8,
        size: hot ? 0.08 : big ? 1.5 : 0.6,
        glow: hot,
      });
    }
    if (e.kind === 'damage') this.shake = 1;
    if (e.kind === 'cannon' && e.strength === 1) this.shake = 0.3;
    if (
      big &&
      Math.hypot(
        e.at.x - this.player.root.position.x,
        e.at.z - this.player.root.position.z,
      ) < 30
    )
      this.shake = 0.6;
    this.particles = this.particles.slice(-180);
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
    for (const e of s.events) this.burst(e);
    s.events = [];
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
          -0.043,
          s.z + Math.sin(s.yaw) * side * 1.43,
        );
        this.object.rotation.set(0, -s.yaw, 0);
        this.object.scale.setScalar(1);
        this.object.updateMatrix();
        this.trackMarks.setMatrixAt(this.markCount++ % 900, this.object.matrix);
      }
      this.trackMarks.count = Math.min(900, this.markCount);
      this.trackMarks.instanceMatrix.needsUpdate = true;
    }

    this.player.root.position.set(
      s.x,
      0.045 +
        (reduced
          ? 0
          : Math.sin(s.distance * 3) *
            Math.min(0.05, Math.abs(s.speed) * 0.009)),
      s.z,
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
      m.intact.visible = c.health > 0;
      m.ruin.visible = c.health <= 0;
    }
    for (const e of s.enemies) {
      if (e.kind === 'tank') {
        this.enemyTank.root.visible = e.active;
        this.enemyTank.root.position.set(e.x, 0, e.z);
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
        )
          this.particles.push({
            x: e.x,
            y: 1,
            z: e.z,
            vx: 0.7,
            vy: 1.6,
            vz: 0.1,
            age: 0,
            life: 5,
            size: 2,
            glow: false,
          });
      if (Math.abs(s.speed) > 0.5)
        this.particles.push({
          x: s.x - Math.sin(s.yaw) * 2,
          y: 0.3,
          z: s.z + Math.cos(s.yaw) * 2,
          vx: 0.6,
          vy: 0.4,
          vz: 0,
          age: 0,
          life: 2,
          size: 1,
          glow: false,
        });
    }
    const follow = zoom ? 7.2 : 15,
      eye = new T.Vector3(
        s.x - Math.sin(s.turret) * follow,
        zoom ? 5.1 : 6.2,
        s.z + Math.cos(s.turret) * follow,
      );
    if (!this.cameraReady || s.status !== 'playing') {
      this.camera.position.copy(eye);
      this.cameraReady = true;
    } else this.camera.position.lerp(eye, Math.min(1, dt * 9));
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
    let dust = 0,
      chips = 0;
    this.particles = this.particles.filter((p) => p.age < p.life).slice(-180);
    for (const p of this.particles) {
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.glow) p.vy -= dt * 9;
      this.object.position.set(p.x, Math.max(0.05, p.y), p.z);
      this.object.quaternion.copy(this.camera.quaternion);
      const size = p.size * (1 + p.age * 0.8) * (1 - (p.age / p.life) * 0.65);
      this.object.scale.set(size, size, size);
      this.object.updateMatrix();
      if (p.glow && chips < 100)
        this.chips.setMatrixAt(chips++, this.object.matrix);
      else if (dust < 180) {
        this.smoke.setMatrixAt(dust, this.object.matrix);
        this.color
          .setRGB(0.47, 0.44, 0.38)
          .multiplyScalar(1 - (p.age / p.life) * 0.3);
        this.smoke.setColorAt(dust++, this.color);
      }
    }
    this.smoke.count = dust;
    this.chips.count = chips;
    this.smoke.instanceMatrix.needsUpdate = true;
    if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;
    this.chips.instanceMatrix.needsUpdate = true;
    this.shells.count = Math.min(80, s.shells.length);
    s.shells.slice(0, 80).forEach((r, i) => {
      this.object.position.set(r.x, r.y, r.z);
      this.object.quaternion.setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        new T.Vector3(r.vx, r.vy, r.vz).normalize(),
      );
      this.object.scale.set(
        r.mg ? 0.035 : 0.09,
        r.mg ? 0.035 : 0.09,
        r.mg ? 1 : 2,
      );
      this.object.updateMatrix();
      this.shells.setMatrixAt(i, this.object.matrix);
    });
    this.shells.instanceMatrix.needsUpdate = true;
    (this.river.material as T.MeshStandardMaterial).normalMap!.offset.x =
      s.time * 0.008;
    this.allies.forEach((a, i) => {
      a.visible = s.phase === 'hold' || s.status === 'won';
      a.position.set(
        (i % 2 ? 1 : -1) * (2 + i * 0.3),
        0,
        s.z + Math.max(8, 65 - s.hold * 1.3) + i * 2,
      );
      a.rotation.y = Math.PI;
    });
    this.renderer.render(this.scene, this.camera);
  }
  reset() {
    this.particles = [];
    this.last = 0;
    this.trackPhase = 0;
    this.markCount = 0;
    this.markDistance = 0;
    this.markX = 0;
    this.markZ = 18;
    this.trackMarks.count = 0;
    this.shake = 0;
    this.cameraReady = false;
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.lost);
    this.renderer.domElement.remove();
    this.scene.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
      if (o instanceof T.DirectionalLight) o.shadow.dispose();
    });
    this.sky.geometry.dispose();
    (this.sky.material as T.Material).dispose();
    this.env.dispose();
    this.art.dispose();
    this.renderer.dispose();
  }
}
