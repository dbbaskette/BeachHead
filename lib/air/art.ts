import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assetUrl } from '../asset-url';
import { GUNS, RACKS } from './flight';
import { CONVERGENCE } from './weapons';
import { shoreline, terrainHeight } from './targets';
import type { AirTarget } from './types';
import { coastalMaterial, instrumentTexture, paintTexture } from './surfaces';

/** Every mesh shares scene-owned resources; retry only restores transforms. */
export class AirArt {
  geometries = new Set<THREE.BufferGeometry>();
  materials = new Set<THREE.Material>();
  textures = new Set<THREE.Texture>();
  box = this.geo(new THREE.BoxGeometry(1, 1, 1));
  sphere = this.geo(new THREE.SphereGeometry(1, 12, 8));
  cylinder = this.geo(new THREE.CylinderGeometry(1, 1, 1, 12));
  fender = this.geo(new THREE.TorusGeometry(0.65, 0.2, 6, 12));
  olive = this.mat('#555c3e', 0.72);
  steel = this.mat('#555e60', 0.57);
  dark = this.mat('#1f292b', 0.74);
  rubber = this.mat('#181b1a', 1);
  sand = this.mat('#aa9b71', 0.95);
  pale = this.mat('#bdbbae', 0.7);
  red = this.mat('#913c2a', 0.7);
  glass = this.mat('#99c5cc', 0.18);
  wood = this.mat('#74634a', 0.95);
  paint = paintTexture();
  constructor() {
    this.textures.add(this.paint);
    for (const material of [this.olive, this.steel, this.pale])
      material.map = this.paint;
  }
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
  const smooth = a.geo(new THREE.SphereGeometry(1, 36, 24));
  const fuselage = a.mesh(
    root,
    smooth,
    a.olive,
    [0, -0.55, -1],
    [1.15, 1.12, 5.8],
  );
  fuselage.castShadow = true;
  a.mesh(root, smooth, a.steel, [0, -0.5, -5.5], [0.94, 0.94, 1.2]);
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
  const canopyCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.91, 2.85, -1.5),
    new THREE.Vector3(-1.05, 3.8, -1.6),
    new THREE.Vector3(-0.68, 4.65, -1.8),
    new THREE.Vector3(0, 4.87, -1.85),
    new THREE.Vector3(0.68, 4.65, -1.8),
    new THREE.Vector3(1.05, 3.8, -1.6),
    new THREE.Vector3(0.91, 2.85, -1.5),
  ]);
  a.mesh(
    root,
    a.geo(new THREE.TubeGeometry(canopyCurve, 32, 0.028, 6, false)),
    a.steel,
    [0, 0, 0],
    [1, 1, 1],
  );
  const fin = a.block(root, a.olive, [0, 0.8, 4.7], [0.18, 2.2, 1.65]);
  fin.rotation.x = -0.2;
  const cockpit = new THREE.Group();
  root.add(cockpit);
  const panel = a.block(cockpit, a.dark, [0, 2.48, -0.85], [1.88, 0.7, 0.19]);
  const instruments = instrumentTexture();
  if (instruments) {
    a.textures.add(instruments);
    const face = new THREE.MeshStandardMaterial({
      map: instruments,
      roughness: 0.66,
      metalness: 0.12,
    });
    a.materials.add(face);
    a.mesh(
      cockpit,
      a.geo(new THREE.PlaneGeometry(1.8, 0.675)),
      face,
      [0, 2.48, -0.744],
      [1, 1, 1],
    );
  }
  // Padded coaming shields instruments without covering the gunsight.
  a.mesh(
    cockpit,
    a.cylinder,
    a.rubber,
    [0, 2.85, -0.78],
    [0.06, 1.98, 0.06],
  ).rotation.z = Math.PI / 2;
  panel.name = 'instrument-panel';
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
  propMaterial.side = THREE.DoubleSide;
  propMaterial.opacity = 0.075;
  a.mesh(
    prop,
    a.geo(new THREE.RingGeometry(0.38, 2.3, 64)),
    propMaterial,
    [0, 0, 0],
    [1, 1, 1],
  );
  a.mesh(root, smooth, a.steel, [0, -0.5, -6.6], [0.36, 0.36, 0.62]);
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
  hull.map = a.paint;
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
      const hullShape = new THREE.Shape();
      hullShape.moveTo(-width * 0.43, -length * 0.5);
      hullShape.lineTo(width * 0.43, -length * 0.5);
      hullShape.lineTo(width * 0.5, length * 0.34);
      hullShape.quadraticCurveTo(
        width * 0.5,
        length * 0.5,
        width * 0.3,
        length * 0.5,
      );
      hullShape.lineTo(-width * 0.3, length * 0.5);
      hullShape.quadraticCurveTo(
        -width * 0.5,
        length * 0.5,
        -width * 0.5,
        length * 0.34,
      );
      hullShape.closePath();
      const hullGeo = a.geo(
        new THREE.ExtrudeGeometry(hullShape, {
          depth: 3,
          bevelEnabled: true,
          bevelSize: 0.45,
          bevelThickness: 0.5,
          bevelSegments: 2,
          steps: 1,
        }),
      );
      hullGeo.rotateX(Math.PI / 2);
      a.mesh(root, hullGeo, hull, [0, 3.8, 0], [1, 1, 1]);
      a.block(root, a.dark, [0, 4.1, 0], [width * 0.84, 0.5, length * 0.84]);
      for (const side of [-1, 1]) {
        a.block(
          root,
          hull,
          [side * width * 0.46, 5, 0],
          [width * 0.055, 3, length * 0.95],
        );
        a.block(
          detail,
          a.pale,
          [side * width * 0.46, 6.55, 0],
          [0.32, 0.24, length * 0.94],
        );
        a.block(
          detail,
          a.wood,
          [side * width * 0.34, 4.65, -length * 0.08],
          [width * 0.16, 0.3, length * 0.54],
        );
        for (let i = 0; i < 6; i++) {
          const z = -length * 0.36 + i * length * 0.14;
          a.block(
            detail,
            a.steel,
            [side * width * 0.425, 5, z],
            [0.18, 2.8, 0.24],
          );
          if (i % 2 === 0) {
            const fender = a.mesh(
              detail,
              a.fender,
              a.rubber,
              [side * width * 0.52, 3.1, z],
              [1, 1, 1],
            );
            fender.rotation.y = Math.PI / 2;
          }
        }
      }
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
      for (let i = 0; i < 5; i++)
        a.block(ramp, a.steel, [0, 0.53, -0.4 + i * 0.2], [0.95, 0.07, 0.025]);
      a.block(
        detail,
        a.steel,
        [0, 10.6, length * 0.28],
        [width * 0.77, 0.4, length * 0.24],
      );
      for (const side of [-1, 1])
        a.block(
          detail,
          a.dark,
          [side * width * 0.355, 8.7, length * 0.28],
          [0.12, 1.6, length * 0.13],
        );
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
    gun.rotation.x = 0.7;
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
  // Ribs, rails, cargo and fenders share one draw per material at the detail LOD.
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of detail.children.slice()) {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material))
      continue;
    child.updateMatrix();
    const geometry = child.geometry.clone().applyMatrix4(child.matrix);
    const group = batches.get(child.material) ?? [];
    group.push(geometry);
    batches.set(child.material, group);
    detail.remove(child);
  }
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    if (merged) detail.add(new THREE.Mesh(a.geo(merged), material));
    geometries.forEach((geometry) => geometry.dispose());
  }
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return { root, detail, hull };
}

export function makeCoast(a: AirArt) {
  const root = new THREE.Group();
  root.name = 'air-coast';
  const geo = a.geo(new THREE.PlaneGeometry(1700, 9000, 100, 300));
  geo.rotateX(-Math.PI / 2);
  geo.translate(750, 0, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i),
      inland = -60 + 1640 * Math.pow((i % 101) / 100, 1.6),
      x = shoreline(z) + inland;
    pos.setXYZ(
      i,
      x,
      inland < 0 ? Math.max(-3, inland * 0.06) : terrainHeight(x, z),
      z,
    );
  }
  geo.computeVertexNormals();
  const sand = a.texture('pillbox-sand-diffuse.jpg', true),
    normal = a.texture('pillbox-sand-normal.jpg');
  normal.repeat.set(70, 350);
  const mat = coastalMaterial(sand, normal);
  a.materials.add(mat);
  const land = new THREE.Mesh(geo, mat);
  land.receiveShadow = true;
  root.add(land);
  let seed = 58173;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const stone = a.geo(new THREE.IcosahedronGeometry(1, 1));
  const rocks = new THREE.InstancedMesh(stone, a.wood, 240),
    grass = new THREE.InstancedMesh(stone, a.mat('#686b43', 1), 600),
    obstacles = new THREE.InstancedMesh(a.box, a.dark, 480);
  const object = new THREE.Object3D();
  for (let i = 0; i < 600; i++) {
    const z = random() * 8400 - 4200,
      x = shoreline(z) + 85 + random() * 620,
      y = terrainHeight(x, z);
    object.position.set(x, y + 0.25, z);
    object.scale.set(1 + random() * 3, 0.4 + random(), 1 + random() * 2);
    object.rotation.set(0, random() * 6.28, 0.1);
    object.updateMatrix();
    grass.setMatrixAt(i, object.matrix);
    if (i < 240) {
      object.scale.set(
        1 + random() * 3,
        0.6 + random() * 1.8,
        1 + random() * 4,
      );
      object.updateMatrix();
      rocks.setMatrixAt(i, object.matrix);
    }
    if (i < 160) {
      const zz = -2200 + (i % 80) * 55 + random() * 16,
        xx = shoreline(zz) + 35 + Math.floor(i / 80) * 33 + random() * 8;
      for (let beam = 0; beam < 3; beam++) {
        object.position.set(xx, terrainHeight(xx, zz) + 1.7, zz);
        object.scale.set(0.35, 5, 0.35);
        object.rotation.set(
          beam === 2 ? Math.PI / 2 : 0.72,
          beam * 0.9,
          beam === 0 ? 0.8 : -0.8,
        );
        object.updateMatrix();
        obstacles.setMatrixAt(i * 3 + beam, object.matrix);
      }
    }
  }
  root.add(rocks, grass, obstacles);
  const trunks = new THREE.InstancedMesh(a.cylinder, a.wood, 280);
  const foliage = a.mat('#4a5735', 0.97);
  const crowns = new THREE.InstancedMesh(stone, foliage, 1120);
  for (let i = 0; i < 280; i++) {
    const cluster = Math.floor(i / 14),
      cx = 420 + (cluster % 4) * 240,
      cz = -3900 + Math.floor(cluster / 4) * 1800;
    const x = cx + (random() - 0.5) * 280,
      z = cz + (random() - 0.5) * 1500,
      height = 9 + random() * 16,
      y = terrainHeight(x, z);
    object.position.set(x, y + height * 0.36, z);
    object.rotation.set(0, random() * 6.28, 0);
    object.scale.set(
      0.35 + height * 0.025,
      height * 0.72,
      0.35 + height * 0.025,
    );
    object.updateMatrix();
    trunks.setMatrixAt(i, object.matrix);
    for (let lobe = 0; lobe < 4; lobe++) {
      object.position.set(
        x + (random() - 0.5) * height * 0.45,
        y + height * (0.55 + random() * 0.3),
        z + (random() - 0.5) * height * 0.45,
      );
      object.scale.set(
        height * (0.2 + random() * 0.16),
        height * (0.22 + random() * 0.2),
        height * (0.2 + random() * 0.16),
      );
      object.rotation.set(random(), random() * 6.28, random());
      object.updateMatrix();
      crowns.setMatrixAt(i * 4 + lobe, object.matrix);
      crowns.setColorAt(
        i * 4 + lobe,
        new THREE.Color().setHSL(
          0.2 + random() * 0.045,
          0.2 + random() * 0.15,
          0.54 + random() * 0.18,
        ),
      );
    }
  }
  crowns.castShadow = true;
  trunks.castShadow = true;
  rocks.castShadow = true;
  obstacles.castShadow = true;
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
