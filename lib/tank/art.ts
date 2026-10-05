import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AirArt } from '../air/art';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Cover, EnemyKind } from './map';
/** Normalize indexed and beveled geometry before batching, retaining local transforms. */
export function consolidateTank(root: T.Group, a: Pick<AirArt, 'geo'>) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<T.Material, T.BufferGeometry[]>();
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      const g = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld).applyMatrix4(inverse);
      const mat = o.material as T.Material;
      const list = groups.get(mat) || [];
      list.push(g);
      groups.set(mat, list);
    }
  });
  root.clear();
  for (const [material, geometries] of groups) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((g) => g.dispose());
    if (merged) {
      const m = new T.Mesh(a.geo(merged), material);
      m.castShadow = true;
      m.receiveShadow = true;
      root.add(m);
    }
  }
}
export class TankArt extends AirArt {
  rounded = this.geo(new RoundedBoxGeometry(1, 1, 1, 2, 0.08));
  round = this.geo(new T.SphereGeometry(1, 24, 16));
  stone = this.mat('#a79e89', 0.95);
  roof = this.mat('#555f66', 0.92);
  dirt = this.mat('#716d4f', 1);
  leaf = this.mat('#81906b', 0.96);
  foliage = this.geo(new T.PlaneGeometry(1, 1));
  leaves = this.mat('#99a982', 0.97);
  constructor() {
    super();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d')!;
    for (let i = 0; i < 420; i++) {
      const x = 128 + Math.sin(i * 12.3) * Math.sqrt((i % 47) / 47) * 120,
        y = 128 + Math.cos(i * 8.1) * Math.sqrt((i % 53) / 53) * 120;
      const shade = 65 + ((i * 19) % 85);
      c.fillStyle = `rgb(${shade * 0.8},${shade},${shade * 0.55})`;
      c.beginPath();
      c.ellipse(x, y, 3 + (i % 5), 2 + (i % 3), i, 0, Math.PI * 2);
      c.fill();
    }
    const leafTexture = new T.CanvasTexture(canvas);
    leafTexture.colorSpace = T.SRGBColorSpace;
    this.textures.add(leafTexture);
    this.leaves.map = leafTexture;
    this.leaves.alphaTest = 0.45;
    this.leaves.side = T.DoubleSide;
    this.leaf.map = leafTexture;
    this.leaf.bumpMap = leafTexture;
    this.leaf.bumpScale = 0.16;

    this.stone.map = this.texture('bunker-weathered-concrete.jpg', true);
    this.stone.bumpMap = this.stone.map;
    this.stone.bumpScale = 0.12;
    this.wood.map = this.texture('bunker-timber.jpg', true);
    this.roof.map = this.texture('bunker-worn-steel.jpg', true);
    this.roof.bumpMap = this.roof.map;
    this.roof.bumpScale = 0.08;
  }
  soft(root: T.Object3D, mat: T.Material, p: number[], size: number[]) {
    return this.mesh(root, this.rounded, mat, p, size);
  }
}
export function makeTank(a: TankArt, enemy = false) {
  const root = new T.Group(),
    body = new T.Group(),
    turret = new T.Group(),
    barrel = new T.Group(),
    wheels: T.Mesh[] = [];
  const paint = enemy ? a.mat('#88816a', 0.77) : a.olive;
  paint.map = a.paint;
  a.soft(body, a.dark, [0, 0.77, 0], [2.4, 0.9, 5.4]);
  a.soft(body, paint, [0, 1.28, 0], [2.72, 1, 5]);
  const glacis = a.soft(body, paint, [0, 1.55, -2], [2.65, 0.7, 1.25]);
  glacis.rotation.x = -0.32;
  a.soft(body, paint, [0, 1.78, 0.8], [2.6, 0.24, 3]);
  for (const x of [-0.76, 0.76]) {
    a.mesh(body, a.cylinder, paint, [x, 1.98, -1], [0.43, 0.1, 0.48]);
    a.soft(body, a.dark, [x, 2.06, -1.23], [0.27, 0.1, 0.1]);
    a.soft(body, paint, [x * 1.9, 1.34, 0], [0.25, 0.2, 5.9]);
    for (let z = -1; z <= 1; z++)
      a.soft(body, a.dark, [x * 1.9, 1.5, z * 1.1], [0.12, 0.12, 0.7]);
    a.mesh(body, a.round, a.pale, [x * 1.55, 1.6, -2.46], [0.13, 0.13, 0.09]);
  }
  for (let i = 0; i < 8; i++)
    a.block(body, a.dark, [0, 1.93, 0.4 + i * 0.18], [1.35, 0.04, 0.06]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const wheel = a.mesh(
        root,
        a.cylinder,
        a.rubber,
        [side * 1.42, 0.7, -1.85 + i * 0.73],
        [0.49, 0.26, 0.49],
      );
      wheel.rotation.z = Math.PI / 2;
      wheels.push(wheel);
      const cap = a.mesh(
        body,
        a.cylinder,
        paint,
        [side * 1.58, 0.7, -1.85 + i * 0.73],
        [0.31, 0.045, 0.31],
      );
      cap.rotation.z = Math.PI / 2;
    }
    for (const z of [-2.48, 2.48]) {
      const wheel = a.mesh(
        body,
        a.cylinder,
        paint,
        [side * 1.42, 0.79, z],
        [0.49, 0.35, 0.49],
      );
      wheel.rotation.z = Math.PI / 2;
    }
    for (const z of [-1.48, 0, 1.48])
      a.soft(body, paint, [side * 1.59, 1.08, z], [0.22, 0.52, 0.65]);
    a.soft(body, a.wood, [side * 1.45, 1.62, 0.6], [0.16, 0.16, 2.2]);
  }
  a.mesh(turret, a.cylinder, paint, [0, 0, 0], [1.08, 0.22, 1.08]);
  a.mesh(turret, a.round, paint, [0, 0.35, 0.15], [1.2, 0.65, 1.48]);
  a.soft(turret, paint, [0, 0.34, -0.99], [1.1, 0.72, 0.65]);
  a.mesh(turret, a.cylinder, paint, [0.38, 0.96, 0.15], [0.39, 0.14, 0.39]);
  a.soft(turret, a.dark, [0.38, 1.02, -0.05], [0.3, 0.1, 0.15]);
  a.mesh(turret, a.cylinder, a.dark, [-0.48, 0.95, 0.5], [0.018, 1.8, 0.018]);
  a.soft(turret, a.wood, [0, 0.35, 1.48], [1.5, 0.6, 0.35]);
  a.mesh(barrel, a.round, paint, [0, 0, 0], [0.48, 0.37, 0.5]);
  const tube = a.mesh(
    barrel,
    a.cylinder,
    paint,
    [0, 0, -1.75],
    [0.12, 3.5, 0.12],
  );
  tube.rotation.x = Math.PI / 2;
  const bore = a.mesh(
    barrel,
    a.cylinder,
    a.dark,
    [0, 0, -3.51],
    [0.087, 0.025, 0.087],
  );
  bore.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.4, -1.03);
  turret.position.set(0, 2, 0);
  turret.add(barrel);
  // Raised bolts, tow eyes and rolled canvas break up the silhouette.
  for (const x of [-1, 1])
    for (const z of [-2.42, 2.42]) {
      const eye = a.mesh(body, a.fender, paint, [x, 1, z], [0.17, 0.17, 0.17]);
      eye.rotation.y = Math.PI / 2;
    }
  for (const x of [-0.8, 0.8])
    a.mesh(
      body,
      a.cylinder,
      a.wood,
      [x, 2.07, 2],
      [0.24, 0.8, 0.24],
    ).rotation.z = Math.PI / 2;
  const mark = document.createElement('canvas');
  mark.width = 128;
  mark.height = 128;
  const c = mark.getContext('2d')!;
  c.fillStyle = '#dadcc7';
  if (enemy) {
    c.fillRect(48, 17, 32, 94);
    c.fillRect(17, 48, 94, 32);
    c.fillStyle = '#293028';
    c.fillRect(55, 17, 18, 94);
    c.fillRect(17, 55, 94, 18);
  } else {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 22 : 51,
        angle = (i * Math.PI) / 5 - Math.PI / 2;
      c.lineTo(64 + Math.cos(angle) * r, 64 + Math.sin(angle) * r);
    }
    c.closePath();
    c.fill();
  }
  const texture = new T.CanvasTexture(mark);
  texture.colorSpace = T.SRGBColorSpace;
  a.textures.add(texture);
  const material = new T.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    roughness: 0.9,
  });
  a.materials.add(material);
  for (const side of [-1, 1]) {
    const m = a.mesh(
      turret,
      a.geo(new T.PlaneGeometry(1, 1)),
      material,
      [side * 1.15, 0.32, 0.08],
      [0.65, 0.65, 1],
    );
    m.rotation.y = (side * Math.PI) / 2;
  }
  consolidateTank(body, a);
  // Keep barrel and turret independent from the static hull.
  root.add(body, turret);
  const tracks = new T.InstancedMesh(a.rounded, a.dark, 88);
  tracks.instanceMatrix.setUsage(T.DynamicDrawUsage);
  tracks.frustumCulled = false;
  root.add(tracks);
  return { root, turret, barrel, wheels, tracks };
}
export function makeCover(a: TankArt, c: Cover) {
  const root = new T.Group(),
    intact = new T.Group(),
    ruin = new T.Group();
  root.position.set(c.x, 0, c.z);
  root.add(intact, ruin);
  ruin.visible = false;
  if (c.kind === 'house') {
    const wall = c.id % 3 === 0 ? a.mat('#968e7e', 0.95) : a.stone;
    if (wall !== a.stone) {
      wall.map = a.stone.map;
      wall.bumpMap = a.stone.map;
      wall.bumpScale = 0.1;
    }
    a.soft(intact, wall, [0, c.h / 2, 0], [c.w, c.h, c.d]);
    const profile = new T.Shape();
    profile.moveTo(-c.w / 2 - 0.5, 0);
    profile.lineTo(0, 3.3);
    profile.lineTo(c.w / 2 + 0.5, 0);
    profile.closePath();
    const roof = a.geo(
      new T.ExtrudeGeometry(profile, {
        depth: c.d + 1,
        bevelEnabled: true,
        bevelSize: 0.08,
        bevelThickness: 0.08,
        bevelSegments: 1,
        steps: 1,
      }),
    );
    a.mesh(intact, roof, a.roof, [0, c.h, -c.d / 2 - 0.5], [1, 1, 1]);
    a.soft(intact, a.stone, [c.w * 0.27, c.h + 2.5, 0], [1, 3, 1.1]);
    for (const side of [-1, 1]) {
      for (const z of [-c.d * 0.32, 0, c.d * 0.32])
        for (const y of [2.3, c.h - 2]) {
          a.soft(
            intact,
            a.dark,
            [side * (c.w / 2 + 0.015), y, z],
            [0.07, 1.65, 1.35],
          );
          a.soft(
            intact,
            a.stone,
            [side * (c.w / 2 + 0.13), y - 0.89, z],
            [0.45, 0.18, 1.75],
          );
          for (const dz of [-0.85, 0.85]) {
            const shutter = a.soft(
              intact,
              a.wood,
              [side * (c.w / 2 + 0.18), y, z + dz],
              [0.12, 1.8, 0.39],
            );
            shutter.rotation.y = side * 0.22;
          }
          a.block(
            intact,
            a.wood,
            [side * (c.w / 2 + 0.08), y, z],
            [0.1, 0.07, 1.4],
          );
        }
      a.soft(
        intact,
        a.wood,
        [side * (c.w / 2 + 0.04), 1.35, c.d * 0.25],
        [0.13, 2.7, 1.3],
      );
      a.block(
        intact,
        a.stone,
        [side * (c.w / 2 + 0.12), c.h - 0.2, 0],
        [0.3, 0.22, c.d + 0.6],
      );
    }
    for (const side of [-1, 1])
      for (const x of [-c.w * 0.27, c.w * 0.27])
        for (const y of [2.3, c.h - 2]) {
          a.soft(
            intact,
            a.dark,
            [x, y, side * (c.d / 2 + 0.03)],
            [1.3, 1.65, 0.08],
          );
          a.soft(
            intact,
            a.stone,
            [x, y - 0.89, side * (c.d / 2 + 0.11)],
            [1.7, 0.18, 0.35],
          );
          for (const dx of [-0.8, 0.8])
            a.soft(
              intact,
              a.wood,
              [x + dx, y, side * (c.d / 2 + 0.09)],
              [0.35, 1.8, 0.13],
            );
        }
    for (const side of [-1, 1])
      for (let i = 0; i < 12; i++) {
        const t = (i + 0.5) / 12;
        const beam = a.block(
          intact,
          a.roof,
          [side * c.w * 0.25, c.h + 1.68, -c.d / 2 + t * c.d],
          [c.w * 0.56, 0.09, 0.08],
        );
        beam.rotation.z = -side * Math.atan2(3.3, c.w / 2);
      }
    // Broken wall stubs and exposed beams replace the destroyed structure.
    for (const side of [-1, 1]) {
      a.soft(ruin, wall, [side * c.w * 0.43, 1.5, 0], [1, 3, c.d]);
      a.soft(ruin, wall, [0, 1, side * c.d * 0.44], [c.w, 2, 1]);
    }
    for (let i = 0; i < 18; i++) {
      const b = a.soft(
        ruin,
        i % 3 ? a.stone : a.roof,
        [
          Math.sin(i * 5.2) * c.w * 0.46,
          0.25 + (i % 3) * 0.16,
          Math.cos(i * 2.1) * c.d * 0.44,
        ],
        [1 + (i % 3) * 0.5, 0.45, 1.4],
      );
      b.rotation.set(i * 0.2, i * 1.7, 0.2);
    }
    for (let i = 0; i < 4; i++) {
      const beam = a.soft(
        ruin,
        a.wood,
        [-c.w * 0.3 + i * 2.3, 1, 0],
        [0.24, 0.25, c.d * 0.8],
      );
      beam.rotation.z = i * 0.22;
    }
  } else if (c.kind === 'hedge') {
    for (let i = 0; i < 8; i++)
      a.mesh(
        intact,
        a.round,
        a.leaf,
        [Math.sin(i * 3) * 1.1, 1.4 + (i % 2) * 0.4, ((i - 3.5) * c.d) / 8],
        [c.w * 0.6, 1.7, c.d / 6],
      );
  } else if (c.kind === 'fence') {
    for (let x = -c.w / 2; x < c.w / 2; x += 1.5)
      a.soft(intact, a.wood, [x, 0.65, 0], [0.12, 1.3, 0.13]);
    for (const y of [0.4, 0.95])
      a.soft(intact, a.wood, [0, y, 0], [c.w, 0.1, 0.1]);
    for (let i = 0; i < 8; i++) {
      const b = a.soft(
        ruin,
        a.wood,
        [(i - 3.5) * 1.8, 0.15, Math.sin(i) * 0.5],
        [1.5, 0.1, 0.13],
      );
      b.rotation.y = i;
    }
  } else {
    a.soft(intact, a.stone, [0, c.h / 2, 0], [c.w, c.h, c.d]);
    for (let x = -c.w / 2; x < c.w / 2; x += 1.1)
      a.soft(intact, a.stone, [x, c.h + 0.1, 0], [1, 0.2, c.d + 0.15]);
    for (let i = 0; i < 12; i++) {
      const b = a.soft(
        ruin,
        a.stone,
        [((i - 5.5) * c.w) / 12, 0.19, Math.sin(i * 4) * 0.6],
        [0.8, 0.4, 0.7],
      );
      b.rotation.y = i;
    }
  }
  consolidateTank(intact, a);
  consolidateTank(ruin, a);
  return { root, intact, ruin };
}
export function makeEnemy(a: TankArt, kind: EnemyKind) {
  const root = new T.Group(),
    soldier = new T.Group(),
    weapon = new T.Group();
  root.add(soldier, weapon);
  if (kind === 'gun') {
    a.soft(weapon, a.olive, [0, 0.8, 0], [2.7, 1.4, 0.15]);
    const barrel = a.mesh(
      weapon,
      a.cylinder,
      a.dark,
      [0, 1.25, -1.6],
      [0.12, 3.5, 0.12],
    );
    barrel.rotation.x = Math.PI / 2;
    for (const x of [-1, 1]) {
      const wheel = a.mesh(
        weapon,
        a.cylinder,
        a.rubber,
        [x, 0.48, 0.3],
        [0.46, 0.2, 0.46],
      );
      wheel.rotation.z = Math.PI / 2;
      a.soft(weapon, a.olive, [x * 0.5, 0.17, 1.2], [0.18, 0.22, 2.7]);
    }
  } else if (kind === 'demolition') {
    for (const x of [-1, 1])
      a.soft(weapon, a.wood, [x, 0.45, 0], [1.5, 0.9, 1.5]);
    a.soft(weapon, a.dark, [0, 1.05, 0], [0.7, 0.7, 0.6]);
    a.mesh(weapon, a.cylinder, a.steel, [0, 1.68, 0], [0.04, 0.7, 0.04]);
    a.soft(weapon, a.wood, [0, 2.01, 0], [0.65, 0.1, 0.1]);
  } else {
    const uniform = a.mat('#5c6255', 0.96);
    a.mesh(soldier, a.round, uniform, [0, 0.9, 0], [0.34, 0.52, 0.22]);
    a.mesh(
      soldier,
      a.round,
      a.mat('#a58b70', 0.94),
      [0, 1.56, -0.03],
      [0.17, 0.23, 0.17],
    );
    a.mesh(soldier, a.round, a.olive, [0, 1.72, 0], [0.24, 0.13, 0.24]);
    for (const side of [-1, 1]) {
      const arm = a.mesh(
        soldier,
        a.cylinder,
        uniform,
        [side * 0.31, 1.15, -0.23],
        [0.11, 0.64, 0.11],
      );
      arm.rotation.x = -0.8;
      arm.rotation.z = side * 0.28;
      const leg = a.mesh(
        soldier,
        a.cylinder,
        uniform,
        [side * 0.2, 0.34, 0.03],
        [0.14, 0.62, 0.14],
      );
      leg.rotation.x = side * 0.17;
      a.soft(soldier, a.dark, [side * 0.2, 0.05, -0.08], [0.22, 0.15, 0.39]);
    }
    const tube = a.mesh(
      weapon,
      a.cylinder,
      a.olive,
      [0, 0, -0.4],
      [0.065, 1.3, 0.065],
    );
    tube.rotation.x = Math.PI / 2;
    weapon.position.set(0.22, 1.32, -0.03);
  }
  consolidateTank(soldier, a);
  consolidateTank(weapon, a);
  return { root, soldier, weapon };
}
