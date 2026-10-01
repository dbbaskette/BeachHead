import * as T from 'three';
import { FlakArt, aircraft, gun, paratrooper, consolidate } from './art';
import { makeOcean, makeSky } from '../naval/ocean';
import { COASTAL_SUN } from '../naval/daylight';
import { TOUCH_LAYOUT_QUERY } from '../touch-input';
import {
  aimDirection,
  eyePosition,
  type FlakState,
  type FlakEvent,
  type Vec,
} from './simulation';
const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);} float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);} float fbm(vec2 p){return noise(p)*.55+noise(p*2.03)*.28+noise(p*4.07)*.14;}`;
type Puff = {
  at: Vec;
  age: number;
  life: number;
  size: number;
  shade: number;
  glow: boolean;
};
/** Billboard pool: one draw for drifting smoke, one for cloud layers. */
function smokeMesh(a: FlakArt, count: number) {
  const g = a.geo(new T.PlaneGeometry(1, 1)),
    alphas = new Float32Array(count),
    alpha = new T.InstancedBufferAttribute(alphas, 1);
  g.setAttribute('alpha', alpha);
  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 } },
    vertexShader: `attribute float alpha;varying vec2 uvv;varying float opacity;varying vec3 tint;void main(){uvv=uv;opacity=alpha;tint=instanceColor;vec4 p=modelViewMatrix*instanceMatrix*vec4(0,0,0,1);p.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*p;}`,
    fragmentShader:
      `varying vec2 uvv;varying float opacity;varying vec3 tint;uniform float time;${noise}void main(){vec2 p=uvv*2.-1.;float cloud=fbm(uvv*6.+vec2(time*.015,0));float edge=1.-smoothstep(.3,1.,length(p)+(cloud-.5)*.45);float shade=.65+uvv.y*.4+cloud*.22;gl_FragColor=vec4(tint*shade,edge*cloud*opacity);#include <tonemapping_fragment>\n#include <colorspace_fragment>}`.replace(
        ';#include',
        ';\n#include',
      ),
  });
  a.materials.add(mat);
  const mesh = new T.InstancedMesh(g, mat, count);
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.frustumCulled = false;
  for (let i = 0; i < count; i++) mesh.setColorAt(i, new T.Color('white'));
  return { mesh, alpha, alphas, mat };
}
export class FlakScene {
  private renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(59, 1, 0.08, 12000);
  private art = new FlakArt();
  private weapon = gun(this.art);
  private sky = makeSky();
  private ocean = makeOcean();
  private environment: T.WebGLRenderTarget;
  private smoke = smokeMesh(this.art, 180);
  private clouds = smokeMesh(this.art, 48);
  private puffs: Puff[] = [];
  private object = new T.Object3D();
  private color = new T.Color();
  private planes = Array.from({ length: 6 }, (_, i) => ({
    id: -1,
    ...aircraft(this.art, i < 3 ? 'bomber' : 'transport'),
    kind: i < 3 ? 'bomber' : 'transport',
  }));
  private troops = Array.from({ length: 20 }, () => ({
    id: -1,
    ...paratrooper(this.art),
  }));
  private trailArray = new Float32Array(40 * 6);
  private trails: T.LineSegments;
  private trailGeometry = new T.BufferGeometry();
  private bombs: T.InstancedMesh;
  private shells: T.InstancedMesh;
  private observer: ResizeObserver;
  private light = new T.PointLight('#ffd89e', 0, 8);
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
    this.renderer.shadowMap.enabled = !touch;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onLost);
    this.scene.add(
      this.sky,
      this.ocean.mesh,
      this.weapon.root,
      this.smoke.mesh,
      this.clouds.mesh,
      this.light,
    );
    this.scene.fog = new T.FogExp2('#afc1c1', 0.00038);
    this.scene.add(new T.HemisphereLight('#c4d3d3', '#797159', 1.15));
    const sun = new T.DirectionalLight('#ffdfb0', 3.1);
    sun.position.copy(COASTAL_SUN).multiplyScalar(200);
    sun.castShadow = !touch;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, {
      left: -20,
      right: 20,
      top: 20,
      bottom: -20,
      near: 1,
      far: 500,
    });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.normalBias = 0.025;
    this.scene.add(sun);
    const pmrem = new T.PMREMGenerator(this.renderer),
      env = new T.Scene();
    env.add(this.sky.clone());
    this.environment = pmrem.fromScene(env, 0.15, 0.1, 12000);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();
    this.buildCoast();
    for (const p of this.planes) {
      p.root.visible = false;
      this.scene.add(p.root);
    }
    for (const p of this.troops) {
      p.root.visible = false;
      this.scene.add(p.root);
    }
    this.trailGeometry.setAttribute(
      'position',
      new T.BufferAttribute(this.trailArray, 3).setUsage(T.DynamicDrawUsage),
    );
    this.trailGeometry.setDrawRange(0, 0);
    const trailMat = new T.LineBasicMaterial({
      color: '#ffe1a5',
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
    });
    this.art.materials.add(trailMat);
    this.trails = new T.LineSegments(this.trailGeometry, trailMat);
    this.trails.frustumCulled = false;
    this.scene.add(this.trails);
    this.bombs = new T.InstancedMesh(this.art.sphere, this.art.dark, 8);
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
    for (let i = 0; i < 48; i++) {
      const angle = i * 2.399;
      const distance = 1100 + (i % 5) * 430;
      this.object.position.set(
        Math.sin(angle) * distance,
        450 + (i % 7) * 90,
        Math.cos(angle) * distance,
      );
      this.object.rotation.set(0, 0, 0);
      this.object.scale.set(420 + (i % 4) * 110, 110 + (i % 3) * 50, 1);
      this.object.updateMatrix();
      this.clouds.mesh.setMatrixAt(i, this.object.matrix);
      this.clouds.mesh.setColorAt(
        i,
        new T.Color(i % 3 ? '#d9dfd8' : '#a8b6b5'),
      );
      this.clouds.alphas[i] = 0.95;
    }
    this.clouds.alpha.needsUpdate = true;
    this.clouds.mesh.instanceColor!.needsUpdate = true;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }
  private buildCoast() {
    const a = this.art,
      root = new T.Group();
    const sand = a.mat('#b5ad91', 0.98);
    sand.map = a.texture('pillbox-sand-diffuse.jpg', true);
    sand.normalMap = a.texture('pillbox-sand-normal.jpg');
    sand.roughnessMap = a.texture('pillbox-sand-roughness.jpg');
    for (const t of [sand.map, sand.normalMap, sand.roughnessMap])
      t.repeat.set(500, 280);
    sand.normalScale.set(0.7, 0.7);
    const g = a.geo(new T.PlaneGeometry(3500, 1900, 100, 70));
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        z = pos.getZ(i) + 850;
      const h =
        2.3 +
        Math.sin(x * 0.008) *
          Math.sin(z * 0.013) *
          Math.min(17, Math.max(0, z) * 0.08) +
        Math.sin(x * 0.021 + z * 0.019) * 1.3;
      pos.setXYZ(i, x, h, z);
    }
    g.computeVertexNormals();
    a.mesh(root, g, sand, [0, 0, 0], [1, 1, 1]);
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
    // Layered canvas sandbags, with flattened seams and irregular fabric folds.
    const bagMaterial = a.mat('#92876b', 0.98);
    bagMaterial.map = a.texture('pillbox-sand-diffuse.jpg', true);
    bagMaterial.normalMap = a.texture('pillbox-sand-normal.jpg');
    bagMaterial.normalScale.set(0.22, 0.22);
    const bagGeometry = a.geo(new T.SphereGeometry(1, 16, 10));
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
          a.geo(new T.TorusGeometry(1, 0.01, 4, 24)),
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
    const grassMat = a.mat('#676b48', 1),
      grass = new T.InstancedMesh(
        a.geo(new T.ConeGeometry(0.18, 1.2, 3)),
        grassMat,
        900,
      );
    for (let i = 0; i < 900; i++) {
      const x = Math.sin(i * 52.31) * 120,
        z = -55 + (i % 97) * 1.8;
      if (Math.hypot(x, z - 4) < 12) {
        this.object.scale.set(0, 0, 0);
      } else
        this.object.scale.set(0.6 + (i % 4) * 0.2, 0.3 + (i % 7) * 0.13, 0.6);
      this.object.position.set(
        x,
        2.8 +
          Math.sin(x * 0.008) *
            Math.sin(z * 0.013) *
            Math.min(17, Math.max(0, z) * 0.08) +
          Math.sin(x * 0.021 + z * 0.019) * 1.3,
        z,
      );
      this.object.rotation.set(0.1, i, 0.15);
      this.object.updateMatrix();
      grass.setMatrixAt(i, this.object.matrix);
    }
    this.scene.add(grass);
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
  reset() {
    this.puffs = [];
    this.previous = 0;
    this.smokeClock = 0;
    this.ambientClock = 0;
    this.flash = 0;
    this.shake = 0;
    for (const p of this.planes) p.id = -1;
    for (const p of this.troops) p.id = -1;
  }
  private puff(
    at: Vec,
    size: number,
    life: number,
    shade: number,
    glow = false,
  ) {
    if (this.puffs.length >= 180) this.puffs.shift();
    this.puffs.push({ at: { ...at }, size, life, shade, glow, age: 0 });
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
    this.camera.fov = zoom ? 35 : this.camera.aspect < 0.85 ? 70 : 59;
    this.camera.updateProjectionMatrix();
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
        p.falling ? -0.1 - p.falling * 0.09 : Math.sin(p.age * 0.3) * 0.01,
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
    let n = 0;
    for (const r of s.rounds.slice(0, 40)) {
      const scale = 0.025;
      this.trailArray.set(
        [
          r.x - r.vx * scale,
          r.y - r.vy * scale,
          r.z - r.vz * scale,
          r.x,
          r.y,
          r.z,
        ],
        n * 6,
      );
      n++;
    }
    this.trailGeometry.attributes.position.needsUpdate = true;
    this.trailGeometry.setDrawRange(0, n * 2);
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
      this.object.scale.set(0.24, 0.24, 1.1);
      this.object.updateMatrix();
      this.bombs.setMatrixAt(i, this.object.matrix);
    }
    this.bombs.instanceMatrix.needsUpdate = true;
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
    for (const p of this.puffs) {
      p.age += dt;
      p.at.x += dt * (p.glow ? 0 : 3);
      p.at.y += dt * (p.glow ? 0 : 1.8);
    }
    this.puffs = this.puffs.filter((p) => p.age < p.life);
    this.smoke.mesh.count = this.puffs.length;
    this.puffs.forEach((p, i) => {
      this.object.position.set(p.at.x, p.at.y, p.at.z);
      const size = p.size * (1 + p.age * 0.25);
      this.object.scale.set(size, size, 1);
      this.object.rotation.set(0, 0, 0);
      this.object.updateMatrix();
      this.smoke.mesh.setMatrixAt(i, this.object.matrix);
      this.color.setRGB(
        p.glow ? 3 : p.shade,
        p.glow ? 1.4 : p.shade,
        p.glow ? 0.3 : p.shade * 0.98,
      );
      this.smoke.mesh.setColorAt(i, this.color);
      this.smoke.alphas[i] = (1 - p.age / p.life) * (p.glow ? 2 : 1.7);
    });
    this.smoke.mesh.instanceMatrix.needsUpdate = true;
    this.smoke.mesh.instanceColor!.needsUpdate = true;
    this.smoke.alpha.needsUpdate = true;
    this.smoke.mat.uniforms.time.value = s.time;
    this.clouds.mat.uniforms.time.value = s.time;
    this.ocean.update(s.time, { ships: [] });
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.disposed = true;
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.onLost,
    );
    this.renderer.domElement.remove();
    this.scene.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
      if (o instanceof T.Light && 'shadow' in o)
        (o as T.DirectionalLight).shadow?.dispose();
    });
    this.trailGeometry.dispose();
    this.ocean.dispose();
    (this.sky.material as T.Material).dispose();
    this.sky.geometry.dispose();
    this.environment.dispose();
    this.art.dispose();
    this.renderer.dispose();
    this.puffs = [];
  }
}
