import * as THREE from 'three';
import { makeShip, makePlayerDeck, makeIsland } from './models';
import { createNavalMaterials } from './materials';
import { makeOcean, makeSky } from './ocean';
import { NavalEffects } from './effects';
import {
  shellPosition,
  rangeToElevation,
  type Battle,
  type BattleEvent,
} from './simulation';

export type ScreenPoint = { x: number; y: number; visible: boolean };
export class NavalScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 0.5, 18000);
  private materials = createNavalMaterials();
  private ocean = makeOcean();
  private player = makePlayerDeck(this.materials);
  private effects = new NavalEffects(this.scene);
  private ships = new Map<string, THREE.Group>();
  private shells = new Map<string, THREE.Mesh>();
  private shellGeo = new THREE.CapsuleGeometry(0.36, 4, 3, 8);
  private shellMaterial = new THREE.MeshBasicMaterial({ color: '#ffdf98' });
  private enemyMaterial = new THREE.MeshBasicMaterial({ color: '#ff9e54' });
  private reticle: THREE.Mesh;
  private environment: THREE.WebGLRenderTarget;
  private muzzleLight = new THREE.PointLight('#ffbb62', 0, 70, 1.7);
  private width = 1;
  private height = 1;
  private recoil = 0;
  private damage = 0;
  private visualTime = 0;
  private observer: ResizeObserver;
  private onLost = (event: Event) => {
    event.preventDefault();
    this.onError(
      'Graphics were interrupted. Reload the game to reconnect to your GPU.',
    );
  };
  constructor(
    private host: HTMLElement,
    private onError: (message: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onLost);
    this.scene.fog = new THREE.FogExp2('#9eb9c0', 0.00016);
    const sky = makeSky();
    this.scene.add(sky, this.ocean.mesh, this.player.root);
    const environmentScene = new THREE.Scene();
    environmentScene.add(sky.clone());
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(environmentScene, 0.08, 0.1, 18000);
    pmrem.dispose();
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.72;
    this.scene.add(new THREE.HemisphereLight('#c7e0e6', '#344a50', 0.8));
    const sun = new THREE.DirectionalLight('#ffe2b5', 3.1);
    sun.position.set(-40, 52, 65);
    sun.target.position.set(0, 0, -16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -42,
      right: 42,
      top: 65,
      bottom: -65,
      near: 1,
      far: 190,
    });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.1;
    this.scene.add(sun, sun.target, this.muzzleLight);
    this.scene.add(
      makeIsland(-1700, -2700, 1300, 350, 3),
      makeIsland(1900, -3400, 1700, 470, 9),
      makeIsland(50, -5100, 2000, 320, 5),
    );
    this.reticle = new THREE.Mesh(
      new THREE.RingGeometry(13, 14.2, 48),
      new THREE.MeshBasicMaterial({
        color: '#edc782',
        transparent: true,
        opacity: 0.65,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    this.reticle.rotation.x = -Math.PI / 2;
    this.scene.add(this.reticle);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }
  private resize() {
    this.width = this.host.clientWidth;
    this.height = this.host.clientHeight;
    this.camera.aspect = this.width / Math.max(1, this.height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }
  project(x: number, y: number, z: number): ScreenPoint {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    return {
      x: (p.x * 0.5 + 0.5) * this.width,
      y: (-0.5 * p.y + 0.5) * this.height,
      visible:
        p.z > -1 && p.z < 1 && Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95,
    };
  }
  event(event: BattleEvent, battle: Battle) {
    if (event.type === 'fired') {
      this.recoil = 1;
      this.player.root.updateMatrixWorld(true);
      const d = new THREE.Vector3(
        Math.sin((battle.heading * Math.PI) / 180),
        0.08,
        -Math.cos((battle.heading * Math.PI) / 180),
      ).normalize();
      for (const muzzle of this.player.muzzles)
        this.effects.muzzle(muzzle.getWorldPosition(new THREE.Vector3()), d);
      this.muzzleLight.position.copy(
        this.player.muzzles[0].getWorldPosition(new THREE.Vector3()),
      );
      this.muzzleLight.intensity = 90;
    }
    if (event.type === 'hit' || event.type === 'sunk') {
      // A sink emits both hit and sunk; render one substantial blast.
      const ship = battle.ships.find((s) => s.id === event.shipId);
      if (ship && (event.type === 'sunk' || ship.health > 0))
        this.effects.explosion(
          new THREE.Vector3(ship.x, 10, ship.z),
          event.type === 'sunk',
        );
    }
    if (event.type === 'enemy-fired') {
      const ship = battle.ships.find((s) => s.id === event.shipId);
      if (ship)
        this.effects.muzzle(
          new THREE.Vector3(ship.x, 10, ship.z),
          new THREE.Vector3(-ship.x, 0, -ship.z).normalize(),
        );
    }
    if (event.type === 'miss') this.effects.splash(event.x, event.z);
    if (event.type === 'damaged') {
      this.damage = 1;
      this.effects.explosion(new THREE.Vector3(11, 5, -12));
      this.effects.splash(21, -30);
    }
  }
  reset() {
    // Ships have stable identities: reset their transforms instead of rebuilding shared resources.
    for (const mesh of this.ships.values()) {
      mesh.position.y = 0;
      mesh.rotation.z = 0;
      mesh.visible = true;
    }
    for (const mesh of this.shells.values()) this.scene.remove(mesh);
    this.shells.clear();
    this.effects.reset();
    this.recoil = 0;
    this.damage = 0;
    this.muzzleLight.intensity = 0;
  }
  render(battle: Battle, dt: number, reducedMotion: boolean, scope = false) {
    const activeDt = battle.status === 'paused' ? 0 : dt;
    this.visualTime += activeDt;
    const t = this.visualTime;
    this.ocean.update(t, battle);
    this.recoil = Math.max(0, this.recoil - activeDt * 3.5);
    this.damage = Math.max(0, this.damage - activeDt * 2);
    this.muzzleLight.intensity = Math.max(
      0,
      this.muzzleLight.intensity - activeDt * 800,
    );
    const angle = THREE.MathUtils.degToRad(battle.heading),
      bob = reducedMotion ? 0 : Math.sin(t * 0.8) * 0.11;
    const wantedFov = scope ? 22 : 46;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, wantedFov, 15, dt);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(Math.sin(angle) * 1.4, 16 + bob, 23);
    this.camera.lookAt(
      Math.sin(angle) * 900,
      scope ? 12 : 10 + (!reducedMotion ? this.recoil * 2 : 0),
      23 - Math.cos(angle) * 900,
    );
    if (!reducedMotion)
      this.camera.rotation.z =
        Math.sin(t * 0.45) * 0.0012 + Math.sin(t * 40) * this.damage * 0.003;
    this.player.root.visible = !scope;
    this.player.turret.rotation.y = -angle;
    this.player.guns.rotation.x =
      THREE.MathUtils.degToRad(rangeToElevation(battle.range)) * 0.28;
    this.player.guns.position.z = -2.5 + this.recoil * 0.65;
    for (const [i, ship] of battle.ships.entries()) {
      let mesh = this.ships.get(ship.id);
      if (!mesh) {
        mesh = makeShip(
          ship.length,
          ship.width,
          this.materials,
          ['D 17', 'C 42', 'B 09'][i],
        );
        this.ships.set(ship.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.x = ship.x;
      mesh.position.z = ship.z;
      mesh.rotation.y = -ship.heading;
      if (ship.health <= 0) {
        mesh.position.y = Math.max(-43, mesh.position.y - activeDt * 2.6);
        mesh.rotation.z = Math.min(0.65, mesh.rotation.z + activeDt * 0.035);
        mesh.visible = mesh.position.y > -42;
      } else {
        mesh.position.y = Math.sin(t * 0.7 + i) * 0.24;
        mesh.rotation.z = Math.sin(t * 0.5 + i) * 0.006;
      }
      if (
        activeDt > 0 &&
        mesh.visible &&
        Math.floor(t * 2) !== Math.floor((t - activeDt) * 2)
      ) {
        const damaged = ship.health < ship.maxHealth;
        mesh.updateWorldMatrix(true, false);
        const exhaust = mesh.localToWorld(
          new THREE.Vector3(
            0,
            damaged ? 9 : 20,
            damaged ? 0 : ship.length * 0.04,
          ),
        );
        this.effects.smoke(exhaust, damaged);
      }
    }
    const live = new Set(battle.shells.map((s) => s.id));
    for (const [id, mesh] of this.shells)
      if (!live.has(id)) {
        this.scene.remove(mesh);
        this.shells.delete(id);
      }
    for (const shell of battle.shells) {
      let mesh = this.shells.get(shell.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          this.shellGeo,
          shell.enemy ? this.enemyMaterial : this.shellMaterial,
        );
        Object.assign(mesh.userData, {
          targetX: shell.targetX,
          targetZ: shell.targetZ,
          enemy: shell.enemy,
        });
        this.shells.set(shell.id, mesh);
        this.scene.add(mesh);
      }
      const p = shellPosition(shell),
        ahead = shellPosition({
          ...shell,
          age: Math.min(shell.duration, shell.age + 0.01),
        });
      mesh.position.set(p.x, p.y, p.z);
      const dir = new THREE.Vector3(
        ahead.x - p.x,
        ahead.y - p.y,
        ahead.z - p.z,
      );
      if (dir.lengthSq() > 0)
        mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.normalize(),
        );
      mesh.scale.setScalar(
        Math.max(0.8, mesh.position.distanceTo(this.camera.position) / 500),
      );
    }
    this.effects.update(activeDt);
    this.reticle.position.set(
      Math.sin(angle) * battle.range,
      0.4,
      -Math.cos(angle) * battle.range,
    );
    this.reticle.visible = battle.status === 'playing';
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.onLost,
    );
    this.effects.dispose();
    this.ocean.dispose();
    this.environment.dispose();
    const materials = new Set<THREE.Material>(),
      geometries = new Set<THREE.BufferGeometry>();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        geometries.add(o.geometry);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          materials.add(m),
        );
      }
      if (o instanceof THREE.DirectionalLight) o.shadow.dispose();
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.materials.dispose();
    this.shellGeo.dispose();
    this.shellMaterial.dispose();
    this.enemyMaterial.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
