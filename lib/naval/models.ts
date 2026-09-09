import * as THREE from 'three';

const steel = new THREE.MeshStandardMaterial({
  color: '#667477',
  roughness: 0.66,
  metalness: 0.45,
});
const dark = new THREE.MeshStandardMaterial({
  color: '#283e47',
  roughness: 0.72,
  metalness: 0.4,
});
const deck = new THREE.MeshStandardMaterial({
  color: '#8a8d81',
  roughness: 0.85,
});
const glass = new THREE.MeshStandardMaterial({
  color: '#142d36',
  roughness: 0.2,
  metalness: 0.65,
});
const rust = new THREE.MeshStandardMaterial({
  color: '#694538',
  roughness: 0.9,
});
export function box(
  parent: THREE.Object3D,
  size: number[],
  pos: number[],
  mat: THREE.Material = steel,
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(...(size as [number, number, number])),
    mat,
  );
  mesh.position.set(...(pos as [number, number, number]));
  parent.add(mesh);
  return mesh;
}
function tube(
  parent: THREE.Object3D,
  radius: number,
  length: number,
  pos: number[],
  mat = dark,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius * 1.1, length, 10),
    mat,
  );
  mesh.position.set(...(pos as [number, number, number]));
  parent.add(mesh);
  return mesh;
}
function wire(
  parent: THREE.Object3D,
  a: number[],
  b: number[],
  color = '#3b4c4e',
) {
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(...(a as [number, number, number])),
    new THREE.Vector3(...(b as [number, number, number])),
  ]);
  parent.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })));
}
export function makeShip(length = 110, width = 21) {
  const root = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -length * 0.53);
  shape.lineTo(width * 0.38, -length * 0.36);
  shape.lineTo(width * 0.5, -length * 0.19);
  shape.lineTo(width * 0.5, length * 0.37);
  shape.quadraticCurveTo(0, length * 0.52, -width * 0.5, length * 0.37);
  shape.lineTo(-width * 0.5, -length * 0.19);
  shape.lineTo(-width * 0.38, -length * 0.36);
  shape.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 7,
    bevelEnabled: true,
    bevelThickness: 1.6,
    bevelSize: 1.2,
    bevelSegments: 2,
    steps: 1,
  });
  hullGeo.rotateX(Math.PI / 2);
  const hull = new THREE.Mesh(hullGeo, steel);
  hull.position.y = 6;
  root.add(hull);
  const top = new THREE.Mesh(new THREE.ShapeGeometry(shape), deck);
  top.rotation.x = Math.PI / 2;
  top.position.y = 6.3;
  top.material.side = THREE.DoubleSide;
  root.add(top);
  box(root, [width * 0.72, 5, length * 0.35], [0, 9, 0]);
  box(root, [width * 0.58, 5, length * 0.16], [0, 14, -length * 0.09]);
  box(root, [width * 0.64, 3, length * 0.1], [0, 18, -length * 0.11]);
  box(root, [width * 0.66, 1.3, 1], [0, 18.3, -length * 0.16 - 0.6], glass);
  for (const x of [-1, 1])
    box(
      root,
      [0.8, 1.3, length * 0.09],
      [x * width * 0.33, 18.3, -length * 0.11],
      glass,
    );
  for (const z of [length * 0.05, length * 0.18]) {
    tube(root, 2.3, 10, [0, 17, z], steel);
    tube(root, 2.4, 0.8, [0, 22.1, z]);
  }
  tube(root, 0.4, 20, [0, 27, -length * 0.035]);
  box(root, [13, 0.5, 0.5], [0, 31, -length * 0.035]);
  wire(root, [0, 37, -length * 0.035], [-width * 0.35, 7, length * 0.27]);
  wire(root, [0, 37, -length * 0.035], [width * 0.35, 7, length * 0.27]);
  for (const z of [-length * 0.32, length * 0.32]) {
    const turret = box(root, [width * 0.5, 4, 9], [0, 9, z]);
    for (const x of [-2, 2]) {
      const barrel = tube(turret, 0.65, 13, [x, 1, -9]);
      barrel.rotation.x = Math.PI / 2;
    }
  }
  for (const x of [-width * 0.44, width * 0.44]) {
    for (let z = -length * 0.25; z < length * 0.37; z += 8)
      tube(root, 0.09, 2, [x, 7.3, z]);
    wire(root, [x, 8.3, -length * 0.25], [x, 8.3, length * 0.37]);
  }
  for (const z of [-18, -9, 8, 17])
    box(root, [2, 2, 4], [width * 0.37, 7, z], rust);
  return root;
}
export function makePlayerDeck() {
  const root = new THREE.Group();
  box(root, [29, 5, 90], [0, 3, -4], dark);
  box(root, [27, 0.2, 90], [0, 5.6, -4], deck);
  for (let z = -44; z < 39; z += 3)
    box(root, [26, 0.025, 0.055], [0, 5.75, z], dark);
  for (const x of [-13, 13]) {
    for (let z = -40; z < 40; z += 6) tube(root, 0.09, 2, [x, 6.7, z], steel);
    wire(root, [x, 7.7, -40], [x, 7.7, 40]);
    wire(root, [x, 6.8, -40], [x, 6.8, 40]);
  }
  const turret = new THREE.Group();
  turret.position.set(0, 7, -8);
  root.add(turret);
  const base = tube(turret, 5.5, 3, [0, 0, 0], steel);
  base.geometry.computeVertexNormals();
  box(turret, [9, 4, 8], [0, 2, 0], steel);
  const guns = new THREE.Group();
  guns.position.set(0, 3, -2);
  turret.add(guns);
  for (const x of [-2.1, 2.1]) {
    const barrel = tube(guns, 0.62, 17, [x, 0, -9], dark);
    barrel.rotation.x = Math.PI / 2;
    const collar = tube(guns, 0.91, 4, [x, 0, -3], steel);
    collar.rotation.x = Math.PI / 2;
  }
  return { root, turret, guns };
}
export function makeIsland(
  x: number,
  z: number,
  radius: number,
  height: number,
  seed: number,
) {
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2, 55, 55);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i),
      pz = pos.getZ(i);
    const d = Math.hypot(px / radius, pz / radius);
    const ridge =
      Math.sin(px * 0.017 + seed) * 0.17 +
      Math.cos(pz * 0.025 + seed) * 0.12 +
      Math.sin((px + pz) * 0.043) * 0.05;
    const h = Math.max(
      -4,
      Math.pow(Math.max(0, 1 - d), 1.7) * height * (1 + ridge * 2) - 3,
    );
    pos.setY(i, h);
    const col = new THREE.Color(
      h < 7 ? '#999480' : h < height * 0.42 ? '#3e5d50' : '#596a5d',
    );
    col.multiplyScalar(0.8 + (0.5 + 0.5 * Math.sin(i * 17.4)) * 0.25);
    colors.push(col.r, col.g, col.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  );
  mesh.position.set(x, 0, z);
  return mesh;
}
