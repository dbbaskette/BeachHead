import { beachHeight } from './terrain';
import * as THREE from 'three';
import type { PillboxBattle } from './types';
export class WreckSmoke {
  private groups = new Map<number, { root: THREE.Group; start: number }>();
  private texture: THREE.DataTexture;
  constructor(private scene: THREE.Scene) {
    const size = 64,
      data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const dx = (x - 31.5) / 31.5,
          dy = (y - 31.5) / 31.5,
          r = Math.hypot(dx, dy);
        const noise =
          0.78 +
          0.14 * Math.sin(x * 0.39 + Math.sin(y * 0.23) * 2) +
          0.08 * Math.cos(y * 0.51 + x * 0.19);
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
        data[i + 3] = Math.round(
          Math.pow(Math.max(0, 1 - r), 1.7) * noise * 220,
        );
      }
    this.texture = new THREE.DataTexture(data, size, size);
    this.texture.needsUpdate = true;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
  }
  update(battle: PillboxBattle) {
    const ids = new Set(
      battle.jeeps.filter((j) => j.phase === 'wreck').map((j) => j.id),
    );
    for (const [id, v] of this.groups)
      if (!ids.has(id) || battle.time < v.start) {
        this.remove(v.root);
        this.groups.delete(id);
      }
    for (const j of battle.jeeps) {
      if (j.phase !== 'wreck') continue;
      let value = this.groups.get(j.id);
      if (!value) {
        const root = new THREE.Group();
        root.name = `jeep-smolder-${j.id}`;
        for (let i = 0; i < 7; i++)
          root.add(
            new THREE.Sprite(
              new THREE.SpriteMaterial({
                map: this.texture,
                color: '#33332e',
                transparent: true,
                depthWrite: false,
                rotation: i * 1.7,
              }),
            ),
          );
        this.scene.add(root);
        value = { root, start: battle.time };
        this.groups.set(j.id, value);
      }
      value.root.position.set(j.x, beachHeight(j.x, j.z) + 1.1, j.z + 0.6);
      const elapsed = battle.time - value.start;
      value.root.children.forEach((child, i) => {
        const age = elapsed - i * 0.7;
        child.visible = age >= 0 && elapsed < 42;
        const phase = (Math.max(0, age) % 5.6) / 5.6;
        child.position.set(
          phase * 2.8 + Math.sin(i + phase * 4) * 0.18,
          phase * 6,
          -phase * 1.8,
        );
        child.scale.setScalar(1.3 + phase * 3.3);
        const mat = (child as THREE.Sprite).material;
        mat.opacity =
          Math.sin(phase * Math.PI) *
          0.36 *
          Math.min(1, Math.max(0, (42 - elapsed) / 12));
        mat.rotation = i * 1.7 + phase * 0.35;
      });
    }
  }
  private remove(root: THREE.Group) {
    root.children.forEach((o) => (o as THREE.Sprite).material.dispose());
    root.removeFromParent();
  }
  dispose() {
    for (const v of this.groups.values()) this.remove(v.root);
    this.groups.clear();
    this.texture.dispose();
  }
}
