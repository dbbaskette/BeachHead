import * as THREE from 'three';
import { makeShip, makePlayerDeck, makeIsland } from './models';
import { makeOcean, makeSky } from './ocean';
import {
  shellPosition,
  rangeToElevation,
  type Battle,
  type BattleEvent,
} from './simulation';

type Effect = {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  velocity: THREE.Vector3;
  growth: number;
};
export type ScreenPoint = { x: number; y: number; visible: boolean };
export class NavalScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(49, 1, 1, 18000);
  private ocean = makeOcean();
  private player = makePlayerDeck();
  private ships = new Map<string, THREE.Group>();
  private shells = new Map<string, THREE.Mesh>();
  private effects: Effect[] = [];
  private particleGeo = new THREE.IcosahedronGeometry(1, 1);
  private shellGeo = new THREE.SphereGeometry(1, 8, 6);
  private shellMaterial = new THREE.MeshBasicMaterial({ color: '#ffe8a8' });
  private enemyMaterial = new THREE.MeshBasicMaterial({ color: '#ffb16c' });
  private reticle: THREE.Mesh;
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.onLost);
    this.scene.fog = new THREE.FogExp2('#a9bcc0', 0.00026);
    this.scene.add(makeSky(), this.ocean.mesh, this.player.root);
    this.scene.add(new THREE.HemisphereLight('#d7e9ec', '#344650', 2.4));
    const sun = new THREE.DirectionalLight('#ffe0ad', 3.1);
    sun.position.set(-900, 600, -900);
    this.scene.add(sun);
    this.scene.add(
      makeIsland(-1800, -2700, 1200, 370, 3),
      makeIsland(1900, -3600, 1800, 510, 9),
      makeIsland(100, -5200, 2100, 310, 5),
    );
    const ring = new THREE.RingGeometry(13, 14.5, 48);
    this.reticle = new THREE.Mesh(
      ring,
      new THREE.MeshBasicMaterial({
        color: '#edc782',
        transparent: true,
        opacity: 0.75,
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
    this.camera.aspect = this.width / Math.max(this.height, 1);
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
      const a = THREE.MathUtils.degToRad(battle.heading);
      this.burst(Math.sin(a) * 23, 11, -Math.cos(a) * 23, '#ffcd73', 9, 2, 11);
    }
    if (event.type === 'hit' || event.type === 'sunk') {
      const ship = battle.ships.find((s) => s.id === event.shipId);
      if (ship)
        this.burst(
          ship.x,
          7,
          ship.z,
          event.type === 'sunk' ? '#ff9c42' : '#ffd19b',
          event.type === 'sunk' ? 45 : 20,
          3,
          23,
        );
    }
    if (event.type === 'damaged') {
      this.damage = 1;
      this.burst(12, 0, -40, '#d9f0ed', 20, 2, 19);
    }
  }
  private burst(
    x: number,
    y: number,
    z: number,
    color: string,
    count: number,
    life: number,
    power: number,
  ) {
    for (let i = 0; i < count && this.effects.length < 180; i++) {
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.particleGeo, material);
      mesh.position.set(x, y, z);
      const scale = 1 + Math.random() * 3;
      mesh.scale.setScalar(scale);
      this.scene.add(mesh);
      this.effects.push({
        mesh,
        life: life * (0.5 + Math.random() * 0.5),
        max: life,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * power,
          Math.random() * power,
          (Math.random() - 0.5) * power,
        ),
        growth: 2 + Math.random() * 3,
      });
    }
  }
  reset() {
    for (const mesh of this.ships.values()) {
      this.scene.remove(mesh);
      this.disposeObject(mesh);
    }
    this.ships.clear();
    for (const mesh of this.shells.values()) this.scene.remove(mesh);
    this.shells.clear();
    for (const effect of this.effects) {
      this.scene.remove(effect.mesh);
      (effect.mesh.material as THREE.Material).dispose();
    }
    this.effects = [];
    this.recoil = 0;
    this.damage = 0;
  }
  render(battle: Battle, dt: number, reducedMotion: boolean) {
    if (battle.status !== 'paused') this.visualTime += dt;
    const t = this.visualTime,
      activeDt = battle.status === 'paused' ? 0 : dt;
    this.ocean.material.uniforms.uTime.value = t;
    this.recoil = Math.max(0, this.recoil - activeDt * 3);
    this.damage = Math.max(0, this.damage - activeDt * 2);
    const angle = THREE.MathUtils.degToRad(battle.heading);
    const bob = reducedMotion ? 0 : Math.sin(t * 0.8) * 0.22;
    this.camera.position.set(0, 24 + bob, 35);
    this.camera.lookAt(
      Math.sin(angle) * 900,
      6 + (!reducedMotion ? this.recoil * 4 : 0),
      35 - Math.cos(angle) * 900,
    );
    if (!reducedMotion)
      this.camera.rotation.z =
        Math.sin(t * 0.45) * 0.0018 + Math.sin(t * 40) * this.damage * 0.006;
    this.player.turret.rotation.y = -angle;
    this.player.guns.rotation.x =
      THREE.MathUtils.degToRad(rangeToElevation(battle.range)) * 0.4;
    this.player.guns.position.z = -2 + this.recoil * 2;
    for (const ship of battle.ships) {
      let mesh = this.ships.get(ship.id);
      if (!mesh) {
        mesh = makeShip(ship.length, ship.width);
        this.ships.set(ship.id, mesh);
        this.scene.add(mesh);
      }
      mesh.position.x = ship.x;
      mesh.position.z = ship.z;
      mesh.rotation.y = -ship.heading;
      if (ship.health <= 0) {
        mesh.position.y = Math.max(-42, mesh.position.y - activeDt * 3);
        mesh.rotation.z += activeDt * 0.035;
      } else {
        mesh.position.y = Math.sin(t * 0.7 + ship.x) * 0.4;
        mesh.rotation.z = Math.sin(t * 0.5 + ship.z) * 0.008;
      }
      // Funnel smoke uses a small bounded pool, emitted at a frame-rate-independent interval.
      if (
        activeDt > 0 &&
        ship.health > 0 &&
        Math.floor(t * 4) !== Math.floor((t - activeDt) * 4)
      ) {
        this.burst(
          ship.x,
          24,
          ship.z,
          ship.health < ship.maxHealth ? '#4c4e49' : '#839092',
          1,
          4,
          3,
        );
      }
    }
    const live = new Set(battle.shells.map((s) => s.id));
    for (const [id, mesh] of this.shells)
      if (!live.has(id)) {
        // The simulation resolves impact between frames. Use its exact endpoint,
        // never the shell's last rendered position.
        this.burst(
          mesh.userData.targetX,
          0,
          mesh.userData.targetZ,
          '#d7ebea',
          16,
          1.8,
          20,
        );
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
        mesh.userData.targetX = shell.targetX;
        mesh.userData.targetZ = shell.targetZ;
        this.shells.set(shell.id, mesh);
        this.scene.add(mesh);
      }
      const p = shellPosition(shell);
      mesh.position.set(p.x, p.y, p.z);
      mesh.scale.setScalar(shell.enemy ? 2.5 : 2);
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= activeDt;
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        (e.mesh.material as THREE.Material).dispose();
        this.effects.splice(i, 1);
        continue;
      }
      e.mesh.position.addScaledVector(e.velocity, activeDt);
      e.velocity.y -= activeDt * 2;
      e.mesh.scale.addScalar(activeDt * e.growth);
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(
        0.75,
        (e.life / e.max) * 0.8,
      );
    }
    this.reticle.position.set(
      Math.sin(angle) * battle.range,
      2,
      -Math.cos(angle) * battle.range,
    );
    this.reticle.visible = battle.status === 'playing';
    this.renderer.render(this.scene, this.camera);
  }
  private disposeObject(object: THREE.Object3D) {
    const materials = new Set<THREE.Material>();
    object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (Array.isArray(child.material)
          ? child.material
          : [child.material]
        ).forEach((m) => materials.add(m));
      } else if (child instanceof THREE.Line) {
        child.geometry.dispose();
        materials.add(child.material as THREE.Material);
      }
    });
    materials.forEach((m) => m.dispose());
  }
  dispose() {
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener(
      'webglcontextlost',
      this.onLost,
    );
    this.disposeObject(this.scene);
    this.particleGeo.dispose();
    this.shellGeo.dispose();
    this.shellMaterial.dispose();
    this.enemyMaterial.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
