import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FOXHOLES } from './foxholes';
import { beachHeight } from './terrain';

function createFoxholeTextures() {
  const size = 128;
  const bagColor = new Uint8Array(size * size * 4);
  const bagBump = new Uint8Array(size * size * 4);
  const woodColor = new Uint8Array(size * size * 4);
  const woodBump = new Uint8Array(size * size * 4);
  let seed = 194406;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const weave =
        ((x + (y & 1)) & 1 ? 15 : -15) + ((y + (x & 1)) & 1 ? 10 : -10);
      const bNoise = (rand() - 0.5) * 24;
      const bv = Math.max(125, Math.min(250, Math.round(200 + weave + bNoise)));
      bagColor[idx] = bv;
      bagColor[idx + 1] = Math.round(bv * 0.94);
      bagColor[idx + 2] = Math.round(bv * 0.78);
      bagColor[idx + 3] = 255;
      const bb = Math.max(
        0,
        Math.min(255, Math.round(128 + weave * 3 + bNoise)),
      );
      bagBump[idx] = bagBump[idx + 1] = bagBump[idx + 2] = bb;
      bagBump[idx + 3] = 255;

      const grain =
        Math.sin(x * 0.55 + Math.sin(y * 0.11) * 3.5) * 18 +
        Math.sin(y * 0.08 + x * 0.9) * 8 +
        (rand() - 0.5) * 18;
      const wv = Math.max(85, Math.min(240, Math.round(180 + grain)));
      woodColor[idx] = wv;
      woodColor[idx + 1] = Math.round(wv * 0.88);
      woodColor[idx + 2] = Math.round(wv * 0.72);
      woodColor[idx + 3] = 255;
      const wb = Math.max(0, Math.min(255, Math.round(128 + grain * 2)));
      woodBump[idx] = woodBump[idx + 1] = woodBump[idx + 2] = wb;
      woodBump[idx + 3] = 255;
    }
  }
  const make = (data: Uint8Array, srgb: boolean, rx: number, ry: number) => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  };
  return {
    bagMap: make(bagColor, true, 2, 2),
    bagBump: make(bagBump, false, 2, 2),
    woodMap: make(woodColor, true, 1, 2),
    woodBump: make(woodBump, false, 1, 2),
  };
}

/** Sandbag lips and timber revetments sit around actual depressions in the beach mesh. */
export class FoxholeDetail {
  private root = new THREE.Group();
  private textures: THREE.Texture[];
  private bagGeometry = new RoundedBoxGeometry(1.03, 0.32, 0.58, 3, 0.12);
  private boardGeometry = new THREE.BoxGeometry(0.25, 1.65, 0.12);
  private bagMaterial: THREE.MeshStandardMaterial;
  private boardMaterial: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene) {
    this.root.name = 'dug-in-foxholes';
    const maps = createFoxholeTextures();
    this.textures = [maps.bagMap, maps.bagBump, maps.woodMap, maps.woodBump];
    this.bagMaterial = new THREE.MeshStandardMaterial({
      color: '#baab88',
      map: maps.bagMap,
      bumpMap: maps.bagBump,
      bumpScale: 0.04,
      roughness: 1,
    });
    this.boardMaterial = new THREE.MeshStandardMaterial({
      color: '#6b5b49',
      map: maps.woodMap,
      bumpMap: maps.woodBump,
      bumpScale: 0.03,
      roughness: 0.95,
    });
    const bags = new THREE.InstancedMesh(
      this.bagGeometry,
      this.bagMaterial,
      FOXHOLES.length * 11,
    );
    const boards = new THREE.InstancedMesh(
      this.boardGeometry,
      this.boardMaterial,
      FOXHOLES.length * 11,
    );
    const part = new THREE.Object3D();
    bags.castShadow =
      bags.receiveShadow =
      boards.castShadow =
      boards.receiveShadow =
        true;
    this.root.add(bags, boards);
    for (const hole of FOXHOLES) {
      for (let i = 0; i < 11; i++) {
        const angle = 0.12 + (i * (Math.PI - 0.24)) / 10;
        const x = hole.x + Math.cos(angle) * hole.radius;
        const z = hole.z + (Math.sin(angle) * hole.radius) / 1.12;
        part.position.set(x, beachHeight(x, z) + 0.15, z);
        part.rotation.set(
          ((i % 3) - 1) * 0.06,
          -angle - Math.PI / 2,
          (i % 2) * 0.04,
        );
        part.updateMatrix();
        bags.setMatrixAt(hole.id * 11 + i, part.matrix);
      }
      for (let i = 0; i < 11; i++) {
        const x = hole.x + (i - 5) * 0.3,
          z = hole.z - 1.4;
        part.position.set(x, beachHeight(x, z) + 0.85, z);
        part.rotation.set(-0.12, 0, ((i % 3) - 1) * 0.035);
        part.updateMatrix();
        boards.setMatrixAt(hole.id * 11 + i, part.matrix);
      }
    }
    scene.add(this.root);
  }

  dispose() {
    for (const child of this.root.children)
      (child as THREE.InstancedMesh).dispose();
    this.root.removeFromParent();
    this.bagGeometry.dispose();
    this.boardGeometry.dispose();
    this.bagMaterial.dispose();
    this.boardMaterial.dispose();
    this.textures.forEach((t) => t.dispose());
  }
}
