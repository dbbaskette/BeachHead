import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import type { NavalMaterials } from './materials';
import { makeIsland, makePlayerDeck, makeShip } from './models';

function createMockNavalMaterials(): NavalMaterials {
  const extra: THREE.Material[] = [];
  const labelCache = new Map<string, THREE.MeshStandardMaterial>();
  const base = {
    steel: new THREE.MeshStandardMaterial({ color: '#a0aeb0' }),
    dark: new THREE.MeshStandardMaterial({ color: '#364b55' }),
    deck: new THREE.MeshStandardMaterial({ color: '#a7b1a3' }),
    gunmetal: new THREE.MeshStandardMaterial({ color: '#46535c' }),
    black: new THREE.MeshStandardMaterial({ color: '#111c22' }),
    brass: new THREE.MeshStandardMaterial({ color: '#b09556' }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#243e4c' }),
    red: new THREE.MeshStandardMaterial({ color: '#843f2a' }),
    ivory: new THREE.MeshStandardMaterial({ color: '#d6d5bb' }),
  };
  return {
    ...base,
    label(text: string) {
      let mat = labelCache.get(text);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({
          color: '#e4e4d0',
          transparent: true,
          depthWrite: false,
        });
        labelCache.set(text, mat);
        extra.push(mat);
      }
      return mat;
    },
    dispose() {
      for (const mat of Object.values(base)) mat.dispose();
      for (const mat of extra) mat.dispose();
    },
  };
}

function disposeObjectResources(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) {
      o.geometry.dispose();
      o.dispose();
    } else if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
      o.geometry.dispose();
      if (o instanceof THREE.Line) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    }
  });
}

void test('makeShip orients deck upward without DoubleSide and batches cables into LineSegments', () => {
  const materials = createMockNavalMaterials();
  assert.equal(materials.deck.side, THREE.FrontSide);

  const ship = makeShip(120, 18, materials, '42');
  assert.equal(materials.deck.side, THREE.FrontSide);

  let deckMeshCount = 0;
  let lineSegments = 0;
  let standaloneLines = 0;
  ship.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material === materials.deck) {
      deckMeshCount++;
      const normal = o.geometry.getAttribute('normal');
      assert.ok(normal && normal.count > 0);
      for (let i = 0; i < normal.count; i++) {
        assert.ok(normal.getY(i) > 0.99);
      }
    }
    if (o instanceof THREE.LineSegments) lineSegments++;
    else if (o instanceof THREE.Line) standaloneLines++;
  });
  assert.equal(deckMeshCount, 1);
  assert.equal(lineSegments, 1);
  assert.equal(standaloneLines, 0);

  disposeObjectResources(ship);
  materials.dispose();
});

void test('makePlayerDeck instances 45 turret bolts, bakes guns cleanly, and batches cables', () => {
  const materials = createMockNavalMaterials();
  const deck = makePlayerDeck(materials);

  const boltMeshes: THREE.InstancedMesh[] = [];
  let lineSegments = 0;
  let standaloneLines = 0;
  deck.root.traverse((o) => {
    if (o instanceof THREE.InstancedMesh) boltMeshes.push(o);
    if (o instanceof THREE.LineSegments) lineSegments++;
    else if (o instanceof THREE.Line) standaloneLines++;
  });
  assert.equal(boltMeshes.length, 1);
  assert.equal(boltMeshes[0].count, 45);
  assert.equal(lineSegments, 1);
  assert.equal(standaloneLines, 0);
  assert.equal(deck.muzzles.length, 2);

  let gunMeshes = 0;
  deck.guns.traverse((o) => {
    if (o instanceof THREE.Mesh) gunMeshes++;
  });
  assert.ok(gunMeshes > 0 && gunMeshes <= 4);

  disposeObjectResources(deck.root);
  materials.dispose();
});

void test('makeIsland builds 64x64 vertex-colored terrain with normalized normals', () => {
  const island = makeIsland(0, -1200, 320, 95, 3);
  const terrain = island.getObjectByName('island-terrain');
  assert.ok(terrain instanceof THREE.Mesh);

  const pos = terrain.geometry.getAttribute('position');
  const normal = terrain.geometry.getAttribute('normal');
  const color = terrain.geometry.getAttribute('color');
  assert.ok(pos && normal && color);
  assert.equal(pos.count, 65 * 65);
  assert.equal(normal.count, 65 * 65);
  assert.equal(color.count, 65 * 65);

  for (let i = 0; i < normal.count; i++) {
    const len = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
    assert.ok(Math.abs(len - 1) < 1e-4);
    for (let c = 0; c < 3; c++) {
      const value =
        c === 0 ? color.getX(i) : c === 1 ? color.getY(i) : color.getZ(i);
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    }
  }

  island.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => m.dispose());
    }
  });
  disposeObjectResources(island);
});
