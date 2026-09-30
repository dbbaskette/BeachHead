import * as THREE from 'three';
import { beachHeight } from './terrain';
import { SMOKE_FLIGHT, SMOKE_LIFETIME, type PillboxBattle } from './types';

/** Local, depth-tested screens; the simulation still allows fire through smoke. */
export class AssaultSmoke {
  private screens = new Map<number, THREE.Group>();
  private texture: THREE.DataTexture;
  private canisterGeometry = new THREE.CylinderGeometry(0.09, 0.09, 0.28, 8);
  private canisterMaterial = new THREE.MeshStandardMaterial({
    color: '#777768',
    roughness: 0.8,
  });

  constructor(private scene: THREE.Scene) {
    const size = 96;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = (x - 47.5) / 47.5,
          dy = (y - 47.5) / 47.5;
        const billows =
          0.09 * Math.sin(x * 0.19 + Math.cos(y * 0.13) * 2) +
          0.055 * Math.cos(y * 0.31 + x * 0.08);
        const alpha = Math.pow(
          Math.max(0, 1 - Math.hypot(dx, dy) + billows),
          1.5,
        );
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = Math.round(222 + billows * 100);
        data[i + 3] = Math.round(Math.min(1, alpha) * 255);
      }
    this.texture = new THREE.DataTexture(data, size, size);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
  }

  update(battle: PillboxBattle) {
    const ids = new Set(battle.smoke.map((s) => s.id));
    for (const [id, root] of this.screens)
      if (!ids.has(id)) {
        this.remove(root);
        this.screens.delete(id);
      }
    for (const smoke of battle.smoke) {
      let root = this.screens.get(smoke.id);
      if (!root) {
        root = new THREE.Group();
        root.name = `assault-smoke-${smoke.id}`;
        root.add(new THREE.Mesh(this.canisterGeometry, this.canisterMaterial));
        for (let i = 0; i < 12; i++)
          root.add(
            new THREE.Sprite(
              new THREE.SpriteMaterial({
                map: this.texture,
                color: i % 3 ? '#d8d8cd' : '#aeb4ae',
                depthWrite: false,
                depthTest: true,
                transparent: true,
              }),
            ),
          );
        this.scene.add(root);
        this.screens.set(smoke.id, root);
      }
      const flight = Math.min(1, smoke.age / SMOKE_FLIGHT);
      const canister = root.children[0];
      const x = THREE.MathUtils.lerp(smoke.x, smoke.targetX, flight);
      const z = THREE.MathUtils.lerp(smoke.z, smoke.targetZ, flight);
      canister.position.set(
        x,
        beachHeight(x, z) +
          0.15 +
          (1 - flight) * 1.5 +
          Math.sin(flight * Math.PI) * 3.2,
        z,
      );
      canister.rotation.set(smoke.age * 7, 0, smoke.age * 3);
      const age = Math.max(0, smoke.age - SMOKE_FLIGHT);
      const bloom = Math.min(1, age / 1.8);
      const fade = Math.min(1, (SMOKE_LIFETIME - age) / 3);
      for (let i = 1; i < root.children.length; i++) {
        const puff = root.children[i] as THREE.Sprite;
        const angle = i * 2.399 + smoke.id;
        const spread = (i % 4) * 1.2 * bloom;
        const px = smoke.targetX + Math.cos(angle) * spread + age * 0.32;
        const pz = smoke.targetZ + Math.sin(angle) * spread;
        puff.position.set(
          px,
          beachHeight(px, pz) + 0.7 + (i % 3) * 0.7 + age * 0.08,
          pz,
        );
        puff.scale.setScalar(
          (3.8 + (i % 3) + age * 0.15) * (0.3 + bloom * 0.7),
        );
        puff.material.opacity = Math.max(0, bloom * fade * 0.72);
        puff.material.rotation = angle + age * 0.035;
      }
    }
  }

  private remove(root: THREE.Group) {
    for (const child of root.children)
      if (child instanceof THREE.Sprite) child.material.dispose();
    root.removeFromParent();
  }

  dispose() {
    for (const root of this.screens.values()) this.remove(root);
    this.screens.clear();
    this.texture.dispose();
    this.canisterGeometry.dispose();
    this.canisterMaterial.dispose();
  }
}
