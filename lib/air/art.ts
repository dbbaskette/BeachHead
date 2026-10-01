import * as THREE from 'three';
import { assetUrl } from '../asset-url';
import { GUNS, RACKS } from './flight';
import { CONVERGENCE } from './weapons';
import { shoreline, terrainHeight } from './targets';
import type { AirTarget } from './types';

/** Every mesh shares scene-owned resources; retry only restores transforms. */
export class AirArt {
  geometries = new Set<THREE.BufferGeometry>();
  materials = new Set<THREE.Material>();
  textures = new Set<THREE.Texture>();
  box = this.geo(new THREE.BoxGeometry(1, 1, 1));
  sphere = this.geo(new THREE.SphereGeometry(1, 12, 8));
  cylinder = this.geo(new THREE.CylinderGeometry(1, 1, 1, 12));
  olive = this.mat('#555c3e', 0.72);
  steel = this.mat('#555e60', 0.57);
  dark = this.mat('#1f292b', 0.74);
  rubber = this.mat('#181b1a', 1);
  sand = this.mat('#aa9b71', 0.95);
  pale = this.mat('#bdbbae', 0.7);
  red = this.mat('#913c2a', 0.7);
  glass = this.mat('#99c5cc', 0.18);
  wood = this.mat('#74634a', 0.95);
  geo<T extends THREE.BufferGeometry>(g: T) {
    this.geometries.add(g);
    return g;
  }
  mat(color: string, roughness: number) {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: roughness < 0.75 ? 0.28 : 0,
    });
    this.materials.add(m);
    return m;
  }
  mesh(
    parent: THREE.Object3D,
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    p: number[],
    scale: number[],
  ) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p[0], p[1], p[2]);
    m.scale.set(scale[0], scale[1], scale[2]);
    parent.add(m);
    return m;
  }
  block(
    parent: THREE.Object3D,
    mat: THREE.Material,
    p: number[],
    scale: number[],
  ) {
    return this.mesh(parent, this.box, mat, p, scale);
  }
  texture(path: string, color = false) {
    const t = new THREE.TextureLoader().load(assetUrl('/textures/' + path));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(t);
    return t;
  }
  dispose() {
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
  }
}

export function makeAirframe(a: AirArt) {
  const root = new THREE.Group();
  root.name = 'player-fighter-bomber';
  const fuselage = a.mesh(
    root,
    a.sphere,
    a.olive,
    [0, -0.55, -1],
    [1.15, 1.12, 5.8],
  );
  fuselage.castShadow = true;
  a.mesh(root, a.sphere, a.steel, [0, -0.5, -5.5], [0.94, 0.94, 1.2]);
  for (const side of [-1, 1]) {
    const wing = a.block(
      root,
      a.olive,
      [side * 4.25, -0.55, 0.45],
      [7.9, 0.22, 2.9],
    );
    wing.rotation.z = side * 0.025;
    wing.rotation.y = side * 0.04;
    for (let n = 0; n < 8; n++)
      a.block(
        root,
        a.steel,
        [side * (1.7 + n * 0.83), -0.425, 0.5],
        [0.027, 0.012, 2.55],
      );
    for (let n = 0; n < 3; n++)
      a.block(
        root,
        n % 2 ? a.dark : a.pale,
        [side * (4.6 + n * 0.58), -0.418, 0.5],
        [0.42, 0.014, 2.7],
      );
    a.block(root, a.olive, [side * 1.9, 0.02, 4.7], [3.3, 0.17, 1.5]);
    a.block(root, a.dark, [side * 0.91, 2.85, -0.45], [0.07, 0.07, 3.6]);
    const strut = a.block(
      root,
      a.steel,
      [side * 0.93, 3.62, -1.5],
      [0.055, 1.45, 0.055],
    );
    strut.rotation.z = side * 0.23;
    a.block(root, a.steel, [side * 0.95, 0.5, -3], [0.16, 0.14, 2.9]);
    for (let i = 0; i < 8; i++)
      a.mesh(
        root,
        a.sphere,
        a.pale,
        [side * 0.96, 0.65, -3.8 + i * 0.4],
        [0.027, 0.027, 0.027],
      );
  }
  const fin = a.block(root, a.olive, [0, 0.8, 4.7], [0.18, 2.2, 1.65]);
  fin.rotation.x = -0.2;
  const cockpit = new THREE.Group();
  root.add(cockpit);
  const panel = a.block(cockpit, a.dark, [0, 2.74, -0.7], [1.92, 0.85, 0.25]);
  panel.rotation.x = -0.18;
  const dialGeo = a.geo(new THREE.CylinderGeometry(0.17, 0.17, 0.02, 20));
  for (let i = 0; i < 5; i++) {
    const dial = a.mesh(
      cockpit,
      dialGeo,
      a.pale,
      [-0.68 + i * 0.34, 2.85, -0.54],
      [1, 1, 1],
    );
    dial.rotation.x = Math.PI / 2;
    const face = a.mesh(
      cockpit,
      dialGeo,
      a.rubber,
      [-0.68 + i * 0.34, 2.85, -0.525],
      [0.86, 0.86, 1],
    );
    face.rotation.x = Math.PI / 2;
    const needle = a.block(
      cockpit,
      a.pale,
      [-0.68 + i * 0.34, 2.9, -0.5],
      [0.012, 0.11, 0.012],
    );
    needle.rotation.z = (i - 2) * 0.4;
  }
  a.block(root, a.dark, [0, 1.12, -2.1], [0.24, 0.42, 0.24]);
  const sight = a.block(root, a.glass, [0, 1.5, -2.25], [0.44, 0.33, 0.015]);
  sight.material = a.glass.clone();
  a.materials.add(sight.material);
  Object.assign(sight.material, {
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const prop = new THREE.Group();
  prop.position.set(0, -0.5, -6.5);
  root.add(prop);
  const propMaterial = a.dark.clone();
  Object.assign(propMaterial, {
    transparent: true,
    opacity: 0.14,
    depthWrite: false,
  });
  a.materials.add(propMaterial);
  for (let i = 0; i < 3; i++) {
    const blade = a.block(prop, propMaterial, [0, 0, 0], [0.23, 4.6, 0.08]);
    blade.rotation.z = (i * Math.PI) / 3;
  }
  const gunNodes = GUNS.map((p, i) => {
    const n = new THREE.Object3D();
    n.name = `air-gun-${i}`;
    n.position.set(p.x, p.y, p.z);
    root.add(n);
    const d = new THREE.Vector3(
      CONVERGENCE.x - p.x,
      CONVERGENCE.y - p.y,
      CONVERGENCE.z - p.z,
    ).normalize();
    const barrel = a.mesh(
      root,
      a.cylinder,
      a.dark,
      [p.x - d.x * 1.3, p.y - d.y * 1.3, p.z - d.z * 1.3],
      [0.13, 2.6, 0.13],
    );
    barrel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    return n;
  });
  const bombs = RACKS.map((p, i) => {
    const n = new THREE.Group();
    n.name = `air-rack-${i}`;
    n.position.set(p.x, p.y, p.z);
    root.add(n);
    a.mesh(n, a.sphere, a.olive, [0, 0, 0], [0.28, 0.28, 1.15]);
    a.block(n, a.steel, [0, 0, 0.9], [0.75, 0.05, 0.52]);
    a.block(n, a.steel, [0, 0, 0.9], [0.05, 0.75, 0.52]);
    a.block(root, a.dark, [p.x, -0.76, p.z], [0.22, 0.45, 0.65]);
    return n;
  });
  return { root, prop, gunNodes, bombs, cockpit };
}

export function makeTargetModel(a: AirArt, t: AirTarget) {
  const root = new THREE.Group(),
    detail = new THREE.Group();
  root.add(detail);
  root.name = t.id;
  const hull = a.mat(
    t.kind === 'command'
      ? '#677980'
      : t.kind === 'truck'
        ? '#657047'
        : '#687263',
    0.72,
  );
  if (['craft', 'carrier', 'command'].includes(t.kind)) {
    const command = t.kind === 'command',
      length = command ? 124 : t.half.x * 2,
      width = command ? 56 : t.half.z * 2;
    if (command) {
      const shape = new THREE.Shape();
      shape.moveTo(-width * 0.43, length * 0.46);
      shape.lineTo(-width * 0.5, length * 0.3);
      shape.lineTo(-width * 0.5, -length * 0.22);
      shape.lineTo(-width * 0.3, -length * 0.41);
      shape.lineTo(0, -length * 0.5);
      shape.lineTo(width * 0.3, -length * 0.41);
      shape.lineTo(width * 0.5, -length * 0.22);
      shape.lineTo(width * 0.5, length * 0.3);
      shape.lineTo(width * 0.43, length * 0.46);
      shape.closePath();
      const hullGeometry = a.geo(
        new THREE.ExtrudeGeometry(shape, {
          depth: 7,
          bevelEnabled: true,
          bevelSegments: 2,
          steps: 1,
          bevelSize: 1.4,
          bevelThickness: 1.4,
        }),
      );
      hullGeometry.rotateX(Math.PI / 2);
      a.mesh(root, hullGeometry, hull, [0, 5, 0], [1, 1, 1]);
      const deckGeometry = a.geo(new THREE.ShapeGeometry(shape));
      deckGeometry.rotateX(Math.PI / 2);
      const deckMaterial = a.wood.clone();
      deckMaterial.side = THREE.DoubleSide;
      a.materials.add(deckMaterial);
      a.mesh(root, deckGeometry, deckMaterial, [0, 6.45, 0], [0.94, 1, 0.94]);
      for (const side of [-1, 1]) {
        for (const z of [-25, -13, -1, 11, 23, 35]) {
          a.block(
            detail,
            a.pale,
            [side * width * 0.46, 8, z],
            [0.25, 3.3, 0.25],
          );
          a.block(detail, a.dark, [side * width * 0.5, 3.8, z], [0.16, 1, 1.6]);
        }
        a.block(detail, a.pale, [side * width * 0.46, 9.5, 5], [0.3, 0.3, 62]);
        for (const z of [28, 42])
          a.mesh(
            detail,
            a.sphere,
            a.pale,
            [side * width * 0.36, 9, z],
            [3, 2, 7],
          );
      }
      for (const z of [-8, 38]) {
        a.mesh(detail, a.cylinder, a.steel, [0, 8, z], [4, 3, 4]);
        a.block(detail, a.dark, [0, 10, z - 5], [0.8, 0.8, 11]);
      }
    } else {
      a.block(root, hull, [0, 2, 0], [width, 4, length]);
      a.block(root, a.dark, [0, 4.1, 0], [width * 0.84, 0.5, length * 0.84]);
      for (const side of [-1, 1])
        a.block(
          root,
          hull,
          [side * width * 0.46, 5, 0],
          [width * 0.055, 3, length * 0.95],
        );
    }
    if (command) {
      a.block(
        root,
        a.pale,
        [0, 10, length * 0.12],
        [width * 0.57, 13, length * 0.26],
      );
      a.block(
        root,
        a.steel,
        [0, 17, length * 0.12],
        [width * 0.64, 1.3, length * 0.29],
      );
      for (let n = 0; n < 5; n++)
        a.block(
          detail,
          a.dark,
          [-width * 0.22 + n * width * 0.11, 14, -length * 0.017],
          [width * 0.065, 2, 0.3],
        );
      for (const z of [-13, 13]) {
        a.mesh(root, a.cylinder, a.dark, [0, 22, z], [4, 16, 4]);
        a.mesh(root, a.cylinder, a.pale, [0, 28, z], [4.2, 2.8, 4.2]);
      }
      const mast = a.mesh(
        detail,
        a.cylinder,
        a.steel,
        [0, 31, -length * 0.25],
        [0.4, 39, 0.4],
      );
      mast.name = 'command-mast';
      a.block(detail, a.steel, [0, 37, -length * 0.25], [24, 0.5, 0.5]);
      const flag = a.block(root, a.red, [4, 44, -length * 0.25], [8, 5, 0.15]);
      flag.rotation.y = 0.3;
      for (const z of [-40, -29, -18])
        a.block(root, a.pale, [0, 6.6, z], [width * 0.55, 0.25, 4]);
    } else {
      a.block(
        root,
        hull,
        [0, 7, length * 0.28],
        [width * 0.7, 7, length * 0.2],
      );
      a.block(
        detail,
        a.dark,
        [0, 8.8, length * 0.175],
        [width * 0.52, 1.5, 0.15],
      );
      const ramp = a.block(
        root,
        hull,
        [0, 2.4, -length * 0.46],
        [width * 0.83, 0.55, length * 0.16],
      );
      ramp.name = 'ramp';
      ramp.rotation.x = -0.15;
      for (let n = 0; n < 4; n++)
        a.block(
          detail,
          a.wood,
          [
            ((n % 2) - 0.5) * width * 0.34,
            5.1,
            -length * 0.12 + Math.floor(n / 2) * 5,
          ],
          [width * 0.25, 2, 3],
        );
      a.mesh(
        detail,
        a.cylinder,
        a.dark,
        [0, 12, length * 0.3],
        [0.16, 5, 0.16],
      );
    }
  } else if (t.kind === 'truck') {
    a.block(root, hull, [0, 2, 0], [5, 2, 10]);
    a.block(root, a.wood, [0, 4, 2], [4.6, 2, 5]);
    a.block(root, hull, [0, 4, -3], [4.8, 3, 3]);
    a.block(root, a.glass, [0, 4.3, -4.55], [3.9, 1.5, 0.1]);
    for (const x of [-2.5, 2.5])
      for (const z of [-3.2, 3.3]) {
        const wheel = a.mesh(
          detail,
          a.cylinder,
          a.rubber,
          [x, 1.5, z],
          [1.25, 0.55, 1.25],
        );
        wheel.rotation.z = Math.PI / 2;
      }
  } else if (t.kind === 'flak') {
    a.mesh(root, a.cylinder, a.sand, [0, 0.7, 0], [7, 1.4, 7]);
    a.mesh(root, a.cylinder, hull, [0, 2, 0], [2, 3, 2]);
    const gun = a.block(root, a.dark, [0, 5, -2], [0.6, 0.6, 8]);
    gun.rotation.x = -0.7;
    a.block(root, hull, [0, 4, -1], [5, 4, 0.4]);
    for (let i = 0; i < 10; i++)
      a.mesh(
        detail,
        a.sphere,
        a.wood,
        [Math.sin(i * 0.628) * 6, 1.5, Math.cos(i * 0.628) * 6],
        [1.9, 1, 1],
      );
  } else {
    for (let n = 0; n < 9; n++)
      a.block(
        root,
        n % 3 === 0 ? a.olive : a.wood,
        [((n % 3) - 1) * 7, 2 + (n % 2), (Math.floor(n / 3) - 1) * 7],
        [5, 4 + (n % 2) * 2, 5],
      );
    for (let i = 0; i < 3; i++)
      a.mesh(detail, a.cylinder, a.dark, [-11, 2, i * 4 - 4], [1.6, 4, 1.6]);
  }
  return { root, detail, hull };
}

export function makeCoast(a: AirArt) {
  const root = new THREE.Group();
  root.name = 'air-coast';
  const geo = a.geo(new THREE.PlaneGeometry(1700, 9000, 100, 300));
  geo.rotateX(-Math.PI / 2);
  geo.translate(750, 0, 0);
  const pos = geo.attributes.position,
    colors = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i),
      z = pos.getZ(i),
      land = x - shoreline(z);
    pos.setY(i, land < 0 ? -1.3 : terrainHeight(x, z));
    const c = new THREE.Color(
      land < 28 ? '#c4bda3' : land > 170 ? '#c3cca4' : '#ffedc4',
    );
    const shade = 0.92 + Math.sin(x * 0.15 + z * 0.053) * 0.04;
    c.multiplyScalar(shade);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const sand = a.texture('pillbox-sand-diffuse.jpg', true),
    normal = a.texture('pillbox-sand-normal.jpg');
  sand.repeat.set(60, 300);
  normal.repeat.copy(sand.repeat);
  const mat = new THREE.MeshStandardMaterial({
    map: sand,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.5, 0.5),
    vertexColors: true,
    roughness: 0.98,
  });
  a.materials.add(mat);
  const land = new THREE.Mesh(geo, mat);
  land.receiveShadow = true;
  root.add(land);
  const rocks = new THREE.InstancedMesh(a.sphere, a.wood, 240),
    grass = new THREE.InstancedMesh(a.box, a.olive, 600),
    obstacles = new THREE.InstancedMesh(a.box, a.dark, 160);
  const object = new THREE.Object3D();
  for (let i = 0; i < 600; i++) {
    const z = -3600 + ((i * 127.83) % 7200),
      x = 85 + ((i * 63.73) % 590),
      y = terrainHeight(x, z);
    object.position.set(x, y + 0.7, z);
    object.scale.set(0.6 + (i % 4), 1.4, 0.5);
    object.rotation.set(0, i * 2.3, 0.1);
    object.updateMatrix();
    grass.setMatrixAt(i, object.matrix);
    if (i < 240) {
      object.scale.set(1.4 + (i % 5), 0.9 + (i % 3), 1.8 + (i % 6));
      object.updateMatrix();
      rocks.setMatrixAt(i, object.matrix);
    }
    if (i < 160) {
      const zz = -2200 + i * 28;
      object.position.set(shoreline(zz) + 45, 2, zz);
      object.scale.set(0.7, 6, 0.7);
      object.rotation.set(0.7, 0, i % 2 ? 0.7 : -0.7);
      object.updateMatrix();
      obstacles.setMatrixAt(i, object.matrix);
    }
  }
  root.add(rocks, grass, obstacles);
  const trunks = new THREE.InstancedMesh(a.cylinder, a.wood, 240);
  const crowns = new THREE.InstancedMesh(
    a.geo(new THREE.ConeGeometry(1, 1, 7)),
    a.olive,
    240,
  );
  for (let i = 0; i < 240; i++) {
    const x = 420 + ((i * 83.17) % 1020),
      z = -4200 + ((i * 197.39) % 8400),
      height = 12 + (i % 13);
    object.position.set(x, terrainHeight(x, z) + height * 0.35, z);
    object.rotation.set(0, i, 0);
    object.scale.set(0.6, height * 0.7, 0.6);
    object.updateMatrix();
    trunks.setMatrixAt(i, object.matrix);
    object.position.y = terrainHeight(x, z) + height * 0.7;
    object.scale.set(height * 0.3, height, height * 0.3);
    object.updateMatrix();
    crowns.setMatrixAt(i, object.matrix);
  }
  root.add(trunks, crowns);
  for (let i = 0; i < 6; i++) {
    const z = -2100 + i * 800,
      x = 450 + (i % 2) * 180;
    a.block(root, a.wood, [x, terrainHeight(x, z) + 7, z], [32, 14, 20]);
    const roof = a.block(
      root,
      a.dark,
      [x, terrainHeight(x, z) + 15, z],
      [37, 3, 25],
    );
    roof.rotation.z = 0.08;
  }
  return root;
}
