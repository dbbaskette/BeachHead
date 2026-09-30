import * as THREE from 'three';
import { beachHeight } from './terrain';

const LIFE = 6;
const MAX_BLASTS = 4;

/** Short pressure impulse and flash, followed by airborne debris and lingering dust. */
export class GrenadeBlast {
  readonly shake = new THREE.Vector3();
  roll = 0;
  private blasts: Array<{ root: THREE.Group; age: number }> = [];
  private texture: THREE.DataTexture;
  private light = new THREE.PointLight('#ffc783', 0, 32, 2);
  private debrisGeometry = new THREE.IcosahedronGeometry(0.13, 0);
  private debrisMaterial = new THREE.MeshStandardMaterial({
    color: '#665d4c',
    roughness: 1,
  });

  constructor(private scene: THREE.Scene) {
    const size = 64,
      data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const r = Math.hypot((x - 31.5) / 31.5, (y - 31.5) / 31.5);
        const noise =
          0.8 +
          0.13 * Math.sin(x * 0.34 + Math.cos(y * 0.19) * 2) +
          0.07 * Math.cos(y * 0.41);
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = Math.round(
          Math.pow(Math.max(0, 1 - r), 1.4) * noise * 255,
        );
      }
    this.texture = new THREE.DataTexture(data, size, size);
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.scene.add(this.light);
  }

  trigger(x: number, z: number) {
    if (this.blasts.length >= MAX_BLASTS)
      this.remove(this.blasts.shift()!.root);
    const root = new THREE.Group();
    root.name = 'grenade-blast';
    root.position.set(x, beachHeight(x, z) + 1.2, z);
    root.add(
      new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.texture,
          color: '#ffcb77',
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
        }),
      ),
    );
    for (let i = 0; i < 9; i++)
      root.add(
        new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: this.texture,
            color: i % 3 ? '#8d887c' : '#5d5c55',
            transparent: true,
            depthWrite: false,
            opacity: 0,
          }),
        ),
      );
    for (let i = 0; i < 8; i++)
      root.add(new THREE.Mesh(this.debrisGeometry, this.debrisMaterial));
    this.scene.add(root);
    this.blasts.push({ root, age: 0 });
  }

  update(dt: number, reducedMotion: boolean) {
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    this.shake.set(0, 0, 0);
    this.roll = 0;
    this.light.intensity = 0;
    for (const blast of this.blasts) {
      blast.age += step;
      const { root, age } = blast;
      const flash = root.children[0] as THREE.Sprite;
      flash.visible = age < 0.24;
      flash.scale.setScalar(2 + age * 25);
      flash.material.opacity = Math.max(0, 1 - age / 0.24);
      if (flash.visible) {
        this.light.position.copy(root.position).y += 1.5;
        this.light.intensity = Math.max(
          this.light.intensity,
          180 * Math.pow(1 - age / 0.24, 2),
        );
      }
      const decay = Math.exp(-age * 5.5);
      if (!reducedMotion) {
        this.shake.x += Math.sin(age * 53) * decay * 0.45;
        this.shake.y += Math.cos(age * 41) * decay * 0.3;
        this.shake.z += Math.sin(age * 35) * decay * 0.25;
        this.roll += Math.sin(age * 47) * decay * 0.018;
      }
      for (let i = 1; i <= 9; i++) {
        const puff = root.children[i] as THREE.Sprite;
        const angle = i * 2.399;
        const spread = Math.min(age, 1.1) * (1 + (i % 3));
        puff.position.set(
          Math.cos(angle) * spread + age * 0.45,
          (i % 3) * 0.6 + age * 0.55,
          Math.sin(angle) * spread,
        );
        puff.scale.setScalar(2.3 + age * 1.25);
        puff.material.opacity =
          Math.min(1, age / 0.15) * Math.max(0, 1 - age / LIFE) * 0.7;
        puff.material.rotation = angle + age * 0.06;
      }
      for (let i = 10; i < root.children.length; i++) {
        const shard = root.children[i],
          angle = i * 2.399;
        shard.visible = age < 1.6;
        shard.position.set(
          Math.cos(angle) * age * 4,
          Math.max(-1.05, (4 + (i % 3)) * age - 4.9 * age * age),
          Math.sin(angle) * age * 4,
        );
        shard.rotation.set(age * i, age * 7, 0);
      }
    }
    this.shake.clampLength(0, 0.6);
    this.roll = THREE.MathUtils.clamp(this.roll, -0.025, 0.025);
    this.blasts = this.blasts.filter((b) => {
      if (b.age < LIFE) return true;
      this.remove(b.root);
      return false;
    });
  }

  private remove(root: THREE.Group) {
    for (const child of root.children)
      if (child instanceof THREE.Sprite) child.material.dispose();
    root.removeFromParent();
  }

  clear() {
    for (const blast of this.blasts) this.remove(blast.root);
    this.blasts = [];
    this.shake.set(0, 0, 0);
    this.roll = this.light.intensity = 0;
  }

  dispose() {
    this.clear();
    this.light.removeFromParent();
    this.texture.dispose();
    this.debrisGeometry.dispose();
    this.debrisMaterial.dispose();
  }
}
