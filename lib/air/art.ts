import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assetUrl } from '../asset-url';
import { shoreline, terrainHeight } from './targets';
import type { AirTarget } from './types';
import { coastalMaterial, paintTexture } from './surfaces';
export { makeAirframe } from './aircraft';

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
      const makeCommandShape = (flipY = false) => {
        const s = flipY ? -1 : 1;
        const shape = new THREE.Shape();
        shape.moveTo(-width * 0.43, s * length * 0.46);
        shape.lineTo(-width * 0.5, s * length * 0.3);
        shape.lineTo(-width * 0.5, s * -length * 0.22);
        shape.lineTo(-width * 0.3, s * -length * 0.41);
        shape.lineTo(0, s * -length * 0.5);
        shape.lineTo(width * 0.3, s * -length * 0.41);
        shape.lineTo(width * 0.5, s * -length * 0.22);
        shape.lineTo(width * 0.5, s * length * 0.3);
        shape.lineTo(width * 0.43, s * length * 0.46);
        shape.closePath();
        return shape;
      };
      const hullGeometry = new THREE.ExtrudeGeometry(makeCommandShape(), {
        depth: 7,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 1.4,
        bevelThickness: 1.4,
      });
      hullGeometry.rotateX(Math.PI / 2);
      a.mesh(root, hullGeometry, hull, [0, 5, 0], [1, 1, 1]);
      // Negate shape Y and rotate -PI/2 so the deck surface normal faces +Y without DoubleSide.
      const deckGeometry = new THREE.ShapeGeometry(makeCommandShape(true));
      deckGeometry.rotateX(-Math.PI / 2);
      a.mesh(root, deckGeometry, a.wood, [0, 6.45, 0], [0.94, 1, 0.94]);
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
      const hullGeo = new THREE.ExtrudeGeometry(hullShape, {
        depth: 3,
        bevelEnabled: true,
        bevelSize: 0.45,
        bevelThickness: 0.5,
        bevelSegments: 2,
        steps: 1,
      });
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
  // Ribs, rails, cargo, fenders and static target hulls share one draw per material.
  const mergeStaticChildren = (
    container: THREE.Object3D,
    skip = new Set<THREE.Object3D>(),
  ) => {
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const rawUnshared = new Set<THREE.BufferGeometry>();
    for (const child of container.children.slice()) {
      if (
        skip.has(child) ||
        !(child instanceof THREE.Mesh) ||
        Array.isArray(child.material)
      )
        continue;
      child.updateMatrix();
      const raw = child.geometry;
      if (!a.geometries.has(raw)) rawUnshared.add(raw);
      const geometry = (
        raw.index ? raw.toNonIndexed() : raw.clone()
      ).applyMatrix4(child.matrix);
      const group = batches.get(child.material) ?? [];
      group.push(geometry);
      batches.set(child.material, group);
      container.remove(child);
    }
    rawUnshared.forEach((geometry) => geometry.dispose());
    for (const [material, geometries] of batches) {
      const merged = mergeGeometries(geometries, false);
      if (merged) container.add(new THREE.Mesh(a.geo(merged), material));
      geometries.forEach((geometry) => geometry.dispose());
    }
  };
  mergeStaticChildren(detail);
  const ramp = root.getObjectByName('ramp');
  if (ramp instanceof THREE.Mesh && ramp.children.length > 0) {
    // Keep ramp articulated at its bow hinge while combining its 5 treads into 1 draw.
    mergeStaticChildren(ramp);
  }
  const keepSeparate = new Set<THREE.Object3D>([detail]);
  if (ramp) keepSeparate.add(ramp);
  mergeStaticChildren(root, keepSeparate);
  root.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      const transparent =
        !Array.isArray(object.material) && object.material.transparent;
      object.castShadow = !transparent;
      object.receiveShadow = true;
    }
  });
  return { root, detail, hull, ramp: ramp ?? null };
}

function surfaceDetailBump() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let s = 21911;
  for (let i = 0; i < size * size; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const x = i % size;
    const y = Math.floor(i / size);
    const wave = Math.sin(x * 0.25 + y * 0.17) * 26;
    const v = Math.max(
      0,
      Math.min(255, Math.round(128 + wave + ((s >>> 24) - 128) * 0.55)),
    );
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.needsUpdate = true;
  return tex;
}

function grassTuftGeometry() {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI) / 3;
    const dx = Math.cos(angle) * 0.55;
    const dz = Math.sin(angle) * 0.55;
    const nx = -Math.sin(angle) * 0.14;
    const nz = Math.cos(angle) * 0.14;
    positions.push(
      -dx,
      0,
      -dz,
      dx,
      0,
      dz,
      dx * 0.6 + nx,
      1,
      dz * 0.6 + nz,
      -dx,
      0,
      -dz,
      dx * 0.6 + nx,
      1,
      dz * 0.6 + nz,
      -dx * 0.6 + nx,
      1,
      -dz * 0.6 + nz,
    );
    uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
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
  const sand = a.texture('pillbox-sand-diffuse.webp', true),
    normal = a.texture('pillbox-sand-normal.webp');
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
  let rockSeed = 91417;
  const rockRand = () => {
    rockSeed = (Math.imul(rockSeed, 1664525) + 1013904223) >>> 0;
    return rockSeed / 4294967296;
  };
  const stone = a.geo(new THREE.IcosahedronGeometry(1, 1));
  const coastalBump = surfaceDetailBump();
  a.textures.add(coastalBump);
  const rockMat = a.mat('#6e6a5c', 0.94);
  rockMat.map = a.paint;
  rockMat.bumpMap = coastalBump;
  rockMat.bumpScale = 0.08;
  const grassMat = a.mat('#ffffff', 0.98);
  grassMat.side = THREE.DoubleSide;
  const grassGeo = a.geo(grassTuftGeometry());
  const rocks = new THREE.InstancedMesh(stone, rockMat, 240),
    grass = new THREE.InstancedMesh(grassGeo, grassMat, 600),
    obstacles = new THREE.InstancedMesh(a.box, a.dark, 480);
  const object = new THREE.Object3D();
  const tint = new THREE.Color();
  for (let i = 0; i < 600; i++) {
    const z = random() * 8400 - 4200,
      x = shoreline(z) + 85 + random() * 620,
      y = terrainHeight(x, z);
    object.position.set(x, y, z);
    object.scale.set(
      1.2 + random() * 2.5,
      0.7 + random() * 1.4,
      1.2 + random() * 2.5,
    );
    object.rotation.set(0, random() * 6.28, (random() - 0.5) * 0.2);
    object.updateMatrix();
    grass.setMatrixAt(i, object.matrix);
    tint.setHSL(
      0.2 + random() * 0.055,
      0.25 + random() * 0.15,
      0.26 + random() * 0.14,
    );
    grass.setColorAt(i, tint);
    if (i < 240) {
      const rz = rockRand() * 8400 - 4200,
        rx = shoreline(rz) + 50 + rockRand() * 620,
        ry = terrainHeight(rx, rz);
      object.position.set(rx, ry + 0.25, rz);
      object.scale.set(
        1 + rockRand() * 3,
        0.6 + rockRand() * 1.8,
        1 + rockRand() * 4,
      );
      object.rotation.set(
        rockRand() * 0.4,
        rockRand() * 6.28,
        rockRand() * 0.4,
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
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
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
  const wallGeos: THREE.BufferGeometry[] = [];
  const roofGeos: THREE.BufferGeometry[] = [];
  const buildingWallMat = a.mat('#a8a496', 0.94);
  buildingWallMat.map = a.paint;
  buildingWallMat.bumpMap = coastalBump;
  buildingWallMat.bumpScale = 0.04;
  const buildingRoofMat = a.mat('#4f3c33', 0.9);
  for (let i = 0; i < 6; i++) {
    const z = -2100 + i * 800,
      x = 450 + (i % 2) * 180,
      y = terrainHeight(x, z);
    const wall = (
      a.box.index ? a.box.toNonIndexed() : a.box.clone()
    ).applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + 7, z),
        new THREE.Quaternion(),
        new THREE.Vector3(32, 14, 20),
      ),
    );
    wallGeos.push(wall);
    const roof = (
      a.box.index ? a.box.toNonIndexed() : a.box.clone()
    ).applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(x, y + 15, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.08)),
        new THREE.Vector3(37, 3, 25),
      ),
    );
    roofGeos.push(roof);
  }
  const mergedWalls = mergeGeometries(wallGeos, false);
  const mergedRoofs = mergeGeometries(roofGeos, false);
  wallGeos.forEach((g) => g.dispose());
  roofGeos.forEach((g) => g.dispose());
  if (mergedWalls) {
    const wallsMesh = new THREE.Mesh(a.geo(mergedWalls), buildingWallMat);
    wallsMesh.castShadow = wallsMesh.receiveShadow = true;
    root.add(wallsMesh);
  }
  if (mergedRoofs) {
    const roofsMesh = new THREE.Mesh(a.geo(mergedRoofs), buildingRoofMat);
    roofsMesh.castShadow = roofsMesh.receiveShadow = true;
    root.add(roofsMesh);
  }
  return root;
}
