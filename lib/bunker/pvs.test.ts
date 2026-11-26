import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { rooms } from './simulation';
import { roomIndexAt, visibleRooms } from './pvs';
import { batchBunkerScenery } from './static-batches';

function makeDoors(open: number[] = []) {
  return Array.from({ length: 5 }, (_, i) => ({
    progress: open.includes(i) ? 1 : 0,
  }));
}

void test('roomIndexAt resolves every bunker room center and clamps exterior coordinates to nearest room', () => {
  for (let i = 0; i < rooms.length; i++) {
    assert.equal(roomIndexAt(rooms[i].x, rooms[i].z), i);
  }
  assert.equal(roomIndexAt(0, 35), 0);
  assert.equal(roomIndexAt(40, -17), 8);
});

void test('visibleRooms stops at closed blast doors and allows straight corridors plus one corner', () => {
  const closed = visibleRooms(0, makeDoors([]));
  assert.deepEqual(
    [...closed].sort((a, b) => a - b),
    [0, 1, 2, 7, 8],
  );
  for (const hidden of [3, 4, 5, 6, 9, 10, 11]) {
    assert.equal(closed.has(hidden), false);
  }

  // Opening blast door 0 reveals Switchboard (3), while closed door 1 blocks Generator room (4).
  const door0Open = visibleRooms(0, makeDoors([0]));
  assert.equal(door0Open.has(3), true);
  assert.equal(door0Open.has(4), false);

  // Opening spine doors 0..2 opens the main axis and 1-turn East loop via room 10, while closed door 4 blocks room 11.
  const spineOpen = visibleRooms(0, makeDoors([0, 1, 2]));
  for (const r of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    assert.equal(spineOpen.has(r), true);
  }
  assert.equal(spineOpen.has(11), false);

  // From East Barracks (8), closed door 3 blocks Infirmary (9) and Records vault (11); opening door 3/4 reveals them.
  const fromBarracksClosed = visibleRooms(8, makeDoors([]));
  assert.equal(fromBarracksClosed.has(9), false);
  assert.equal(fromBarracksClosed.has(11), false);

  const fromBarracksDoor3 = visibleRooms(8, makeDoors([3]));
  assert.equal(fromBarracksDoor3.has(9), true);
  assert.equal(fromBarracksDoor3.has(10), true);
  assert.equal(fromBarracksDoor3.has(4), true);
  assert.equal(fromBarracksDoor3.has(11), false);

  const fromBarracksDoor34 = visibleRooms(8, makeDoors([3, 4]));
  assert.equal(fromBarracksDoor34.has(9), true);
  assert.equal(fromBarracksDoor34.has(11), true);
});

void test('batchBunkerScenery bins world-baked meshes by geometry bounding-box center into 8m cells', () => {
  const root = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial();
  const makeBakedBox = (x: number, y: number, z: number) => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(x, y, z);
    const mesh = new THREE.Mesh(geo, mat);
    root.add(mesh);
    return mesh;
  };
  // All meshes share position=(0,0,0), simulating pre-translated pipes/cables.
  makeBakedBox(0, 1, 0);
  makeBakedBox(1, 1, 1);
  makeBakedBox(0, 1, -30);
  makeBakedBox(1, 1, -31);

  const saved = batchBunkerScenery(root, []);
  assert.equal(saved, 2);
  assert.equal(root.children.length, 2);

  const bounds = root.children.map((child) => {
    const mesh = child as THREE.Mesh;
    const box = mesh.userData.worldBounds as THREE.Box3;
    assert.ok(box instanceof THREE.Box3);
    return box;
  });
  bounds.sort((a, b) => a.min.z - b.min.z);
  assert.ok(bounds[0].max.z < -25);
  assert.ok(bounds[1].min.z > -5);

  for (const child of root.children) {
    if (child instanceof THREE.Mesh) child.geometry.dispose();
  }
  mat.dispose();
});
