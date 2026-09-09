import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { NavalMaterials } from './materials';

function worldUV(geo: THREE.BufferGeometry, scale = 4) {
  const p = geo.attributes.position,
    n = geo.attributes.normal,
    uv = geo.attributes.uv;
  if (!uv || !n) return geo;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)),
      ay = Math.abs(n.getY(i));
    uv.setXY(
      i,
      (ax > 0.6 ? p.getZ(i) : p.getX(i)) / scale,
      (ay > 0.6 ? p.getZ(i) : p.getY(i)) / scale,
    );
  }
  return geo;
}
export function box(
  parent: THREE.Object3D,
  size: number[],
  pos: number[],
  mat: THREE.Material,
) {
  const mesh = new THREE.Mesh(
    worldUV(new THREE.BoxGeometry(...(size as [number, number, number]))),
    mat,
  );
  mesh.position.set(...(pos as [number, number, number]));
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(
  parent: THREE.Object3D,
  r: number,
  l: number,
  pos: number[],
  mat: THREE.Material,
  top = r,
  segments = 16,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(top, r, l, segments),
    mat,
  );
  mesh.position.set(...(pos as [number, number, number]));
  mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function line(
  parent: THREE.Object3D,
  a: number[],
  b: number[],
  material: THREE.LineBasicMaterial,
) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...(a as [number, number, number])),
    new THREE.Vector3(...(b as [number, number, number])),
  ]);
  parent.add(new THREE.Line(geo, material));
}
function plate(
  parent: THREE.Object3D,
  w: number,
  h: number,
  pos: number[],
  mat: THREE.Material,
  ry = 0,
) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(...(pos as [number, number, number]));
  mesh.rotation.y = ry;
  parent.add(mesh);
  return mesh;
}
function boltRow(
  parent: THREE.Object3D,
  count: number,
  start: THREE.Vector3,
  step: THREE.Vector3,
  m: NavalMaterials,
) {
  const bolts = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.075, 0.085, 0.06, 6),
    m.gunmetal,
    count,
  );
  const o = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    o.position.copy(start).addScaledVector(step, i);
    o.updateMatrix();
    bolts.setMatrixAt(i, o.matrix);
  }
  bolts.castShadow = true;
  parent.add(bolts);
}
function hatch(
  root: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  m: NavalMaterials,
) {
  box(root, [1.8, 0.15, 2.4], [x, y, z], m.dark);
  box(root, [1.55, 0.12, 2.1], [x, y + 0.12, z], m.steel);
  const wheel = new THREE.Mesh(
    new THREE.TorusGeometry(0.26, 0.035, 6, 18),
    m.gunmetal,
  );
  wheel.rotation.x = -Math.PI / 2;
  wheel.position.set(x, y + 0.26, z);
  root.add(wheel);
  box(root, [0.5, 0.05, 0.05], [x, y + 0.27, z], m.gunmetal);
  box(root, [0.06, 0.05, 0.5], [x, y + 0.27, z], m.gunmetal);
}
function turret(root: THREE.Object3D, z: number, m: NavalMaterials, scale = 1) {
  const group = new THREE.Group();
  group.position.set(0, 8, z);
  group.scale.setScalar(scale);
  root.add(group);
  cylinder(group, 4, 1.4, [0, 0, 0], m.dark);
  const armor = box(group, [7, 3.5, 7], [0, 2, 0], m.steel);
  armor.geometry.dispose();
  const shape = new THREE.Shape();
  shape.moveTo(-3.5, -3.3);
  shape.lineTo(3.5, -3.3);
  shape.lineTo(3.5, 1.5);
  shape.lineTo(2.4, 3.4);
  shape.lineTo(-2.4, 3.4);
  shape.lineTo(-3.5, 1.5);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 3.5,
    bevelEnabled: true,
    bevelSize: 0.2,
    bevelThickness: 0.2,
    bevelSegments: 1,
  });
  geo.rotateX(-Math.PI / 2);
  armor.geometry = worldUV(geo);
  armor.position.y = 0.3;
  for (const x of [-1.65, 1.65]) {
    const sleeve = cylinder(group, 0.68, 3, [x, 2.5, -4], m.steel);
    sleeve.rotation.x = Math.PI / 2;
    const barrel = cylinder(
      group,
      0.36,
      12,
      [x, 2.5, -10],
      m.gunmetal,
      0.5,
      20,
    );
    barrel.rotation.x = Math.PI / 2;
    const muzzle = new THREE.Mesh(
      new THREE.RingGeometry(0.19, 0.36, 20),
      m.gunmetal,
    );
    muzzle.position.set(x, 2.5, -16);
    muzzle.rotation.y = Math.PI;
    group.add(muzzle);
    plate(group, 0.4, 0.4, [x, 2.5, -15.99], m.black, Math.PI);
  }
  hatch(group, 0, 4, 1, m);
  return group;
}
/** Collapse static mesh parts by material, retaining cables and instance batches. */
function bake(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<THREE.Material, THREE.BufferGeometry[]>(),
    remove: THREE.Mesh[] = [];
  root.traverse((o) => {
    if (
      o instanceof THREE.Mesh &&
      !(o instanceof THREE.InstancedMesh) &&
      !Array.isArray(o.material)
    ) {
      let g = o.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(o.matrixWorld));
      if (g.index) {
        const indexed = g;
        g = g.toNonIndexed();
        indexed.dispose();
      }
      g.deleteAttribute('uv1');
      g.deleteAttribute('color');
      const list = groups.get(o.material) || [];
      list.push(g);
      groups.set(o.material, list);
      remove.push(o);
    }
  });
  for (const o of remove) {
    o.removeFromParent();
    o.geometry.dispose();
  }
  for (const [mat, geos] of groups) {
    const g = mergeGeometries(geos, false);
    geos.forEach((v) => v.dispose());
    if (g) {
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
}
export function makeShip(
  length: number,
  width: number,
  m: NavalMaterials,
  id = '01',
) {
  const root = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -length * 0.53);
  shape.bezierCurveTo(
    width * 0.22,
    -length * 0.46,
    width * 0.46,
    -length * 0.28,
    width * 0.5,
    -length * 0.1,
  );
  shape.lineTo(width * 0.48, length * 0.36);
  shape.quadraticCurveTo(0, length * 0.51, -width * 0.48, length * 0.36);
  shape.lineTo(-width * 0.5, -length * 0.1);
  shape.bezierCurveTo(
    -width * 0.46,
    -length * 0.28,
    -width * 0.22,
    -length * 0.46,
    0,
    -length * 0.53,
  );
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 6.5,
    bevelEnabled: true,
    bevelThickness: 1,
    bevelSize: 1.1,
    bevelSegments: 2,
    curveSegments: 14,
  });
  g.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(worldUV(g), m.steel);
  hull.position.y = 6.2;
  root.add(hull);
  const waterline = new THREE.Mesh(worldUV(g.clone()), m.red);
  waterline.scale.set(0.994, 0.28, 0.995);
  waterline.position.y = 1.7;
  root.add(waterline);
  const deck = new THREE.Mesh(worldUV(new THREE.ShapeGeometry(shape)), m.deck);
  deck.rotation.x = Math.PI / 2;
  deck.position.y = 6.3;
  deck.material.side = THREE.DoubleSide;
  root.add(deck);
  box(root, [width * 0.57, 4, length * 0.35], [0, 8.5, 0], m.steel);
  box(root, [width * 0.48, 5, length * 0.14], [0, 13, -length * 0.09], m.steel);
  box(
    root,
    [width * 0.6, 2.6, length * 0.11],
    [0, 17.1, -length * 0.11],
    m.steel,
  );
  box(
    root,
    [width * 0.66, 0.45, length * 0.125],
    [0, 18.7, -length * 0.11],
    m.dark,
  );
  for (let x = -width * 0.25; x < width * 0.26; x += 2) {
    box(root, [1.35, 1.1, 0.15], [x, 17.2, -length * 0.166], m.glass);
  }
  for (const side of [-1, 1]) {
    for (let z = -length * 0.15; z < -length * 0.06; z += 2)
      box(root, [0.15, 1.1, 1.2], [side * width * 0.304, 17.2, z], m.glass);
    for (let z = -length * 0.35; z < length * 0.35; z += 5) {
      const port = new THREE.Mesh(new THREE.CircleGeometry(0.36, 12), m.black);
      port.position.set(side * width * 0.503, 4.5, z);
      port.rotation.y = (side * Math.PI) / 2;
      root.add(port);
    }
    plate(
      root,
      9,
      3.4,
      [side * (width * 0.504 + 1), 3.8, -length * 0.15],
      m.label(id),
      (side * Math.PI) / 2,
    );
    for (const z of [-length * 0.18, length * 0.19]) {
      const boat = new THREE.Mesh(
        new THREE.CapsuleGeometry(1, 7, 4, 8),
        m.ivory,
      );
      boat.rotation.x = Math.PI / 2;
      boat.position.set(side * width * 0.34, 9, z);
      boat.scale.set(1, 0.7, 1);
      root.add(boat);
      box(root, [0.25, 3, 8], [side * width * 0.37, 8.5, z], m.dark);
    }
    for (let z = -length * 0.3; z < length * 0.35; z += 6) {
      cylinder(root, 0.075, 1.6, [side * width * 0.45, 7.3, z], m.steel);
    }
    const lm = new THREE.LineBasicMaterial({ color: '#8c9d9b' });
    for (const y of [7.2, 8])
      line(
        root,
        [side * width * 0.45, y, -length * 0.3],
        [side * width * 0.45, y, length * 0.35],
        lm,
      );
    for (const z of [-length * 0.24, length * 0.28]) {
      cylinder(root, 1.4, 1, [side * width * 0.32, 7, z], m.dark);
      const aa = cylinder(
        root,
        0.2,
        4,
        [side * width * 0.32, 9, z - 1],
        m.gunmetal,
      );
      aa.rotation.x = 0.6;
    }
  }
  for (const z of [length * 0.04, length * 0.17]) {
    cylinder(root, 2.15, 9, [0, 15, z], m.dark, 1.9, 24);
    cylinder(root, 2.3, 0.8, [0, 19.5, z], m.black, 2.3, 24);
    for (const x of [-1, 1])
      box(root, [0.35, 8, 0.35], [x * 2.2, 15, z], m.steel);
    cylinder(root, 2.2, 0.5, [0, 12, z], m.steel);
  }
  const lm = new THREE.LineBasicMaterial({ color: '#536977' });
  for (const x of [-2, 2]) {
    cylinder(root, 0.23, 19, [x, 26, -length * 0.04], m.steel);
    line(root, [x, 35, -length * 0.04], [0, 40, -length * 0.04], lm);
  }
  cylinder(root, 0.18, 21, [0, 29, -length * 0.04], m.steel);
  box(root, [13, 0.35, 0.3], [0, 34, -length * 0.04], m.dark);
  for (const side of [-1, 1])
    line(
      root,
      [0, 39, -length * 0.04],
      [side * width * 0.42, 8, length * 0.35],
      lm,
    );
  const radar = box(root, [5, 2, 0.2], [0, 38, -length * 0.04], m.dark);
  radar.rotation.y = 0.25;
  turret(root, -length * 0.32, m, 0.9);
  turret(root, length * 0.33, m, length > 130 ? 1.15 : 1);
  for (const z of [-length * 0.41, length * 0.26])
    hatch(root, width * 0.22, 6.5, z, m);
  for (let z = -length * 0.04; z < length * 0.14; z += 3)
    box(root, [1.4, 0.3, 1.8], [width * 0.2, 11, z], m.dark);
  // Bow anchor winches and chain runs.
  for (const side of [-1, 1]) {
    cylinder(root, 0.7, 0.8, [side * 2.8, 7, -length * 0.41], m.dark);
    box(root, [0.2, 0.14, 10], [side * 2.8, 6.5, -length * 0.4], m.gunmetal);
  }
  bake(root);
  return root;
}
export function makePlayerDeck(m: NavalMaterials) {
  const root = new THREE.Group();
  box(root, [28, 3, 91], [0, 2, -13], m.dark);
  box(root, [27, 0.35, 90], [0, 3.8, -13], m.deck);
  for (const x of [-12.8, 12.8]) {
    for (let z = -54; z < 29; z += 4)
      cylinder(root, 0.055, 2, [x, 5, z], m.steel, 0.055, 8);
    const lm = new THREE.LineBasicMaterial({ color: '#a9b1a5' });
    for (const y of [4.9, 5.9]) line(root, [x, y, -54], [x, y, 29], lm);
    for (const z of [-43, -22, 5]) {
      box(root, [1.5, 0.2, 2], [x * 0.88, 4.1, z], m.dark);
      cylinder(root, 0.25, 0.55, [x * 0.88, 4.45, z], m.gunmetal);
    }
  }
  for (const z of [-35, -20, 0, 14]) hatch(root, -7, 4.2, z, m);
  for (const side of [-1, 1]) {
    box(root, [0.12, 0.03, 46], [side * 5.9, 4.02, -24], m.ivory);
    for (let z = -15; z < 20; z += 1.5)
      box(root, [0.8, 0.04, 0.35], [side * 6.5, 4.03, z], m.brass);
    box(root, [3, 2.8, 5], [side * 9, 5.4, 9], m.dark);
    for (let z = 7; z < 11; z += 0.6)
      box(root, [2.8, 0.04, 0.06], [side * 9, 6.82, z], m.gunmetal);
  }
  bake(root);
  const mount = new THREE.Group();
  mount.position.set(0, 6, -8);
  root.add(mount);
  cylinder(mount, 5.7, 2.8, [0, 0, 0], m.dark, 5.7, 48);
  cylinder(mount, 5.85, 0.3, [0, 1.3, 0], m.gunmetal, 5.85, 48);
  const turretGroup = new THREE.Group();
  mount.add(turretGroup);
  const shield = box(turretGroup, [9.7, 4, 7.8], [0, 2.2, 0.2], m.steel);
  // Chamfered face and roof edges catch the sunlight.
  box(turretGroup, [9.9, 0.22, 8], [0, 4.3, 0.2], m.gunmetal);
  box(turretGroup, [0.15, 3.7, 7.7], [-4.86, 2.2, 0.2], m.dark);
  box(turretGroup, [0.15, 3.7, 7.7], [4.86, 2.2, 0.2], m.dark);
  plate(turretGroup, 3.8, 0.65, [0, 2.8, 4.12], m.label('MOUNT 01'));
  plate(turretGroup, 2.6, 0.26, [0, 2.1, 4.13], m.label('127 MM / TWIN'));
  for (const x of [-3.8, 3.8]) {
    box(turretGroup, [1.15, 1.45, 0.15], [x, 2.3, 4.18], m.dark);
    for (let y = 1.8; y < 2.8; y += 0.16)
      box(turretGroup, [0.9, 0.045, 0.12], [x, y, 4.28], m.gunmetal);
  }
  boltRow(
    turretGroup,
    17,
    new THREE.Vector3(-4.5, 4.47, 3.8),
    new THREE.Vector3(0.55, 0, 0),
    m,
  );
  boltRow(
    turretGroup,
    14,
    new THREE.Vector3(-4.7, 4.47, -3.5),
    new THREE.Vector3(0, 0, 0.55),
    m,
  );
  boltRow(
    turretGroup,
    14,
    new THREE.Vector3(4.7, 4.47, -3.5),
    new THREE.Vector3(0, 0, 0.55),
    m,
  );
  hatch(turretGroup, 0, 4.45, 1, m);
  bake(turretGroup);
  const guns = new THREE.Group();
  guns.position.set(0, 3.3, -2.5);
  turretGroup.add(guns);
  const muzzles: THREE.Object3D[] = [];
  for (const x of [-2.15, 2.15]) {
    cylinder(guns, 1.1, 0.25, [x, 0, 0], m.dark, 1.1, 24).rotation.x =
      Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const ring = cylinder(
        guns,
        0.81,
        0.16,
        [x, 0, -i * 0.26],
        m.black,
        0.81,
        24,
      );
      ring.rotation.x = Math.PI / 2;
    }
    const barrel = cylinder(guns, 0.36, 15, [x, 0, -9], m.gunmetal, 0.62, 32);
    barrel.rotation.x = Math.PI / 2;
    for (const z of [-3, -6]) {
      const sleeve = cylinder(guns, 0.68, 0.45, [x, 0, z], m.steel, 0.68, 24);
      sleeve.rotation.x = Math.PI / 2;
    }
    const lip = new THREE.Mesh(
      new THREE.RingGeometry(0.245, 0.37, 32),
      m.gunmetal,
    );
    lip.position.set(x, 0, -16.51);
    lip.rotation.y = Math.PI;
    guns.add(lip);
    plate(guns, 0.48, 0.48, [x, 0, -16.5], m.black, Math.PI);
    const hydraulic = cylinder(
      guns,
      0.2,
      5,
      [x + 0.85, -0.4, -3],
      m.gunmetal,
      0.2,
      16,
    );
    hydraulic.rotation.x = Math.PI / 2;
    const muzzle = new THREE.Object3D();
    muzzle.position.set(x, 0, -16.8);
    guns.add(muzzle);
    muzzles.push(muzzle);
  }
  // Static deck and turret stay separate from the articulating gun assembly.
  shield.receiveShadow = true;
  return { root, turret: turretGroup, guns, muzzles };
}
export function makeIsland(
  x: number,
  z: number,
  radius: number,
  height: number,
  seed: number,
) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, 180, 180);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position,
    colors = [];
  const heightAt = (px: number, pz: number) => {
    const radial = Math.hypot(px / radius, pz / radius);
    const ridge =
      Math.sin(px * 0.007 + seed) * 0.22 +
      Math.cos(pz * 0.01 + seed) * 0.16 +
      Math.sin((px + pz) * 0.019) * 0.08;
    return Math.max(
      -5,
      Math.pow(Math.max(0, 1 - radial), 1.9) * height * (1 + ridge) - 4,
    );
  };
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i),
      pz = p.getZ(i),
      h = heightAt(px, pz);
    p.setY(i, h);
    const rock = Math.sin(px * 0.025) * Math.cos(pz * 0.032);
    const c = new THREE.Color(
      h < 5
        ? '#adab89'
        : rock > 0.32 && h > 60
          ? '#7b8277'
          : h > height * 0.55
            ? '#546552'
            : '#405c43',
    );
    c.multiplyScalar(
      0.88 +
        Math.sin(px * 0.13 + pz * 0.07) * 0.07 +
        Math.sin(px * 0.032 - pz * 0.021) * 0.06,
    );
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.97 }),
  );
  terrain.receiveShadow = true;
  group.add(terrain);
  // Instanced treetops add a recognizable vegetation scale without individual draw calls.
  const treeMat = new THREE.MeshStandardMaterial({
    color: '#354d3a',
    roughness: 1,
  });
  const trees = new THREE.InstancedMesh(
    new THREE.ConeGeometry(3, 12, 5),
    treeMat,
    550,
  );
  const o = new THREE.Object3D();
  let rng = seed * 941 + 1;
  for (let i = 0; i < 550; i++) {
    rng = (rng * 1664525 + 1013904223) >>> 0;
    const a = (rng / 4294967296) * Math.PI * 2;
    rng = (rng * 1664525 + 1013904223) >>> 0;
    const r = radius * (0.23 + (rng / 4294967296) * 0.52);
    const px = Math.cos(a) * r,
      pz = Math.sin(a) * r,
      h = heightAt(px, pz);
    o.position.set(px, h + 5, pz);
    o.scale.set(1.1, 1 + (i % 5) * 0.2, 1.1);
    o.rotation.y = a;
    o.updateMatrix();
    trees.setMatrixAt(i, o.matrix);
  }
  group.add(trees);
  return group;
}
