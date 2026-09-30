import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FOXHOLES } from './foxholes';
import { beachHeight } from './terrain';

/** Sandbag lips and timber revetments sit around actual depressions in the beach mesh. */
export class FoxholeDetail {
  private root = new THREE.Group();
  private bagGeometry = new RoundedBoxGeometry(1.03, 0.32, 0.58, 3, 0.12);
  private boardGeometry = new THREE.BoxGeometry(0.25, 1.05, 0.12);
  private bagMaterial = new THREE.MeshStandardMaterial({
    color: '#807457',
    roughness: 1,
  });
  private boardMaterial = new THREE.MeshStandardMaterial({
    color: '#514537',
    roughness: 0.95,
  });

  constructor(scene: THREE.Scene) {
    this.root.name = 'dug-in-foxholes';
    const bags = new THREE.InstancedMesh(
      this.bagGeometry,
      this.bagMaterial,
      FOXHOLES.length * 9,
    );
    const boards = new THREE.InstancedMesh(
      this.boardGeometry,
      this.boardMaterial,
      FOXHOLES.length * 9,
    );
    const part = new THREE.Object3D();
    bags.castShadow =
      bags.receiveShadow =
      boards.castShadow =
      boards.receiveShadow =
        true;
    this.root.add(bags, boards);
    for (const hole of FOXHOLES) {
      for (let i = 0; i < 9; i++) {
        const angle = 0.12 + (i * (Math.PI - 0.24)) / 8;
        const x = hole.x + Math.cos(angle) * 2.4;
        const z = hole.z + Math.sin(angle) * 2.1;
        part.position.set(x, beachHeight(x, z) + 0.15, z);
        part.rotation.set(
          ((i % 3) - 1) * 0.06,
          -angle - Math.PI / 2,
          (i % 2) * 0.04,
        );
        part.updateMatrix();
        bags.setMatrixAt(hole.id * 9 + i, part.matrix);
      }
      for (let i = 0; i < 9; i++) {
        const x = hole.x + (i - 4) * 0.27,
          z = hole.z - 1.05;
        part.position.set(x, beachHeight(x, z) + 0.37, z);
        part.rotation.set(-0.12, 0, ((i % 3) - 1) * 0.035);
        part.updateMatrix();
        boards.setMatrixAt(hole.id * 9 + i, part.matrix);
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
  }
}
