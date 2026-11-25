import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AirArt } from '../air/art';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Cover, EnemyKind } from './map';
const _uvPos = new T.Vector3();
const _uvNorm = new T.Vector3();

function projectWorldUVs(
  geometry: T.BufferGeometry,
  scale: number,
): T.BufferGeometry {
  const pos = geometry.getAttribute('position');
  const norm = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  if (!pos || !norm || !uv) return geometry;
  for (let i = 0; i < pos.count; i++) {
    _uvPos.fromBufferAttribute(pos, i);
    _uvNorm.fromBufferAttribute(norm, i);
    const ax = Math.abs(_uvNorm.x),
      ay = Math.abs(_uvNorm.y),
      az = Math.abs(_uvNorm.z);
    if (ax >= ay && ax >= az) uv.setXY(i, _uvPos.z * scale, _uvPos.y * scale);
    else if (ay >= ax && ay >= az)
      uv.setXY(i, _uvPos.x * scale, _uvPos.z * scale);
    else uv.setXY(i, _uvPos.x * scale, _uvPos.y * scale);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** Normalize indexed and beveled geometry before batching, projecting consistent world-space UVs. */
export function consolidateTank(root: T.Group, a: Pick<AirArt, 'geo'>) {
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<T.Material, T.BufferGeometry[]>();
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      const g = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const mat = o.material as T.Material;
      const preserveUV =
        !Array.isArray(mat) &&
        (mat.transparent ||
          mat.alphaTest > 0 ||
          mat.userData?.preserveUV === true);
      if (!preserveUV) {
        const scale =
          (!Array.isArray(mat) &&
            (mat.userData?.worldUVScale as number | undefined)) ||
          0.45;
        projectWorldUVs(g, scale);
      }
      g.applyMatrix4(inverse);
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

function createTilePbrTextures(addTex: (t: T.Texture) => void) {
  const size = 256;
  const diffuse = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const cols = 8;
  const rows = 8;
  const tileW = size / cols;
  const tileH = size / rows;
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / tileH);
    const vInTile = (y % tileH) / tileH;
    const xShift = (row % 2) * (tileW * 0.5);
    for (let x = 0; x < size; x++) {
      const sx = (x + xShift) % size;
      const col = Math.floor(sx / tileW);
      const uInTile = (sx % tileW) / tileW;
      const borderX = Math.min(uInTile, 1 - uInTile) * tileW;
      const borderY = Math.min(vInTile, 1 - vInTile) * tileH;
      const mortar = Math.min(borderX, borderY) < 2.2 ? -0.55 : 0;
      const lap = vInTile * 0.48;
      const tileSeed = hash(col * 17 + row, row * 31 + col);
      const grain = (hash(x, y) - 0.5) * 0.14;
      const h = lap + mortar + tileSeed * 0.18 + grain;
      heights[y * size + x] = h;
      const shade = Math.max(
        70,
        Math.min(
          240,
          Math.round(
            168 + (tileSeed - 0.5) * 44 + lap * 28 + mortar * 95 + grain * 24,
          ),
        ),
      );
      const o = (y * size + x) * 4;
      diffuse[o] = diffuse[o + 1] = diffuse[o + 2] = shade;
      diffuse[o + 3] = 255;
      const r = Math.max(
        115,
        Math.min(
          245,
          Math.round(195 - tileSeed * 25 + (mortar < 0 ? 35 : 0) + grain * 30),
        ),
      );
      rough[o] = rough[o + 1] = rough[o + 2] = r;
      rough[o + 3] = 255;
    }
  }
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * 2.6;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * 2.6;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      normal[o] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  }
  const make = (data: Uint8Array, srgb: boolean) => {
    const t = new T.DataTexture(data, size, size, T.RGBAFormat);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = T.SRGBColorSpace;
    t.needsUpdate = true;
    addTex(t);
    return t;
  };
  return {
    map: make(diffuse, true),
    normalMap: make(normal, false),
    roughnessMap: make(rough, false),
  };
}

function createArmorPbrTextures(addTex: (t: T.Texture) => void) {
  const size = 256;
  const diffuse = new Uint8Array(size * size * 4);
  const normal = new Uint8Array(size * size * 4);
  const rough = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x),
      iy = Math.floor(y),
      fx = x - ix,
      fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx),
      uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy),
      b = hash(ix + 1, iy),
      c = hash(ix, iy + 1),
      d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  for (let y = 0; y < size; y++) {
    const weldY = Math.abs((y % 128) - 2) < 2;
    for (let x = 0; x < size; x++) {
      const cast =
        noise(x * 0.08, y * 0.08) * 0.55 +
        noise(x * 0.24, y * 0.24) * 0.3 +
        hash(x, y) * 0.15;
      const weld = weldY ? Math.sin(x * 0.45) * 0.25 + 0.3 : 0;
      const h = cast * 0.65 + weld;
      heights[y * size + x] = h;
      const base = Math.max(
        130,
        Math.min(242, Math.round(196 + (cast - 0.5) * 42 + weld * 20)),
      );
      const o = (y * size + x) * 4;
      diffuse[o] = diffuse[o + 1] = diffuse[o + 2] = base;
      diffuse[o + 3] = 255;
      const r = Math.max(
        105,
        Math.min(245, Math.round(178 - (cast - 0.5) * 50 + (weld ? 28 : 0))),
      );
      rough[o] = rough[o + 1] = rough[o + 2] = r;
      rough[o + 3] = 255;
    }
  }
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * 1.9;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * 1.9;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      normal[o] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  }
  const make = (data: Uint8Array, srgb: boolean) => {
    const t = new T.DataTexture(data, size, size, T.RGBAFormat);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = T.SRGBColorSpace;
    t.needsUpdate = true;
    addTex(t);
    return t;
  };
  return {
    map: make(diffuse, true),
    normalMap: make(normal, false),
    roughnessMap: make(rough, false),
  };
}

function applyArmorWeathering(mat: T.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = 'varying float vArmorY;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       #ifdef USE_INSTANCING
         vArmorY = transformed.y;
       #else
         vArmorY = (modelMatrix * vec4(transformed, 1.0)).y;
       #endif`,
    );
    shader.fragmentShader = 'varying float vArmorY;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       float armorMud = (1.0 - smoothstep(0.42, 1.05, vArmorY)) * 0.68;
       diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.21, 0.14), armorMud);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       roughnessFactor = mix(roughnessFactor, 0.96, (1.0 - smoothstep(0.42, 1.05, vArmorY)) * 0.68);`,
    );
  };
  mat.customProgramCacheKey = () => 'tank-armor-mud-v1';
}

export class TankArt extends AirArt {
  rounded = this.geo(new RoundedBoxGeometry(1, 1, 1, 2, 0.08));
  round = this.geo(new T.SphereGeometry(1, 24, 16));
  stone = this.mat('#a79e89', 0.92);
  altStone = this.mat('#968e7e', 0.92);
  roof = this.mat('#5b666e', 0.88);
  terracottaRoof = this.mat('#875946', 0.88);
  enemyPaint = this.mat('#797663', 0.76);
  dirt = this.mat('#716d4f', 1);
  leaf = this.mat('#81906b', 0.94);
  foliage = this.geo(new T.PlaneGeometry(1, 1));
  leaves = this.mat('#99a982', 0.97);
  constructor() {
    super();
    if (typeof document !== 'undefined') {
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
      this.leaf.map = leafTexture;
      this.leaf.bumpMap = leafTexture;
      this.leaf.bumpScale = 0.14;
    }
    this.leaves.alphaTest = 0.45;
    this.leaves.side = T.DoubleSide;
    this.leaves.userData.preserveUV = true;
    this.leaf.userData.worldUVScale = 0.55;

    const stoneDiffuse = this.texture('pillbox-concrete-diffuse.jpg', true);
    const stoneNormal = this.texture('pillbox-concrete-normal.jpg');
    const stoneRough = this.texture('pillbox-concrete-roughness.jpg');
    for (const s of [this.stone, this.altStone]) {
      s.map = stoneDiffuse;
      s.normalMap = stoneNormal;
      s.roughnessMap = stoneRough;
      s.normalScale.set(0.65, 0.65);
      s.userData.worldUVScale = 0.36;
    }

    this.wood.map = this.texture('deck-color.jpg', true);
    this.wood.normalMap = this.texture('deck-normal.jpg');
    this.wood.roughnessMap = this.texture('deck-roughness.jpg');
    this.wood.normalScale.set(0.5, 0.5);
    this.wood.color.set('#9c8468');
    this.wood.roughness = 0.9;
    this.wood.userData.worldUVScale = 0.6;

    const tiles = createTilePbrTextures((t) => this.textures.add(t));
    for (const r of [this.roof, this.terracottaRoof]) {
      r.map = tiles.map;
      r.normalMap = tiles.normalMap;
      r.roughnessMap = tiles.roughnessMap;
      r.normalScale.set(0.75, 0.75);
      r.userData.worldUVScale = 0.55;
    }

    const armor = createArmorPbrTextures((t) => this.textures.add(t));
    for (const p of [this.olive, this.enemyPaint]) {
      p.map = armor.map;
      p.normalMap = armor.normalMap;
      p.roughnessMap = armor.roughnessMap;
      p.normalScale.set(0.42, 0.42);
      p.metalness = 0.34;
      p.roughness = 0.72;
      p.userData.worldUVScale = 0.42;
      applyArmorWeathering(p);
    }
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
    wheels: T.Mesh[] = [],
    sprockets: T.Mesh[] = [];
  const paint = enemy ? (a.enemyPaint ?? a.mat('#797663', 0.76)) : a.olive;

  if (enemy) {
    // Angular Panzer silhouette: wider hull, sloped front glacis, armored side skirts, twin exhausts.
    a.block(body, a.dark, [0, 0.72, 0], [2.44, 0.78, 5.5]);
    a.block(body, paint, [0, 1.24, 0.05], [2.88, 0.78, 5.15]);
    const glacis = a.block(body, paint, [0, 1.32, -2.35], [2.84, 0.88, 1.15]);
    glacis.rotation.x = -0.58;
    a.block(body, paint, [0, 1.66, 1.25], [2.68, 0.2, 2.35]);
    for (let i = 0; i < 6; i++) {
      a.block(body, a.dark, [0, 1.78, 0.55 + i * 0.26], [1.45, 0.04, 0.09]);
    }
    for (const side of [-1, 1]) {
      a.block(body, paint, [side * 1.54, 1.36, 0], [0.42, 0.12, 5.65]);
      // Side armor skirts (Schürzen) and hanging brackets.
      a.block(body, paint, [side * 1.72, 0.96, 0.08], [0.06, 0.88, 4.9]);
      for (const z of [-1.8, 0.1, 1.9]) {
        a.block(body, a.dark, [side * 1.64, 1.18, z], [0.16, 0.12, 0.14]);
      }
      a.mesh(
        body,
        a.round,
        a.pale,
        [side * 1.25, 1.62, -2.42],
        [0.12, 0.12, 0.08],
      );
      const exhaust = a.mesh(
        body,
        a.cylinder,
        a.dark,
        [side * 0.72, 1.05, 2.68],
        [0.14, 0.62, 0.14],
      );
      exhaust.rotation.x = 0.12;
      a.soft(body, a.wood, [side * 1.45, 1.48, 0.55], [0.14, 0.14, 2.1]);
    }
    // Extruded angular hexagonal Panzer turret: tapered narrow front cheeks (-Z), wider flanks, rear storage bin (+Z).
    const turretShape = new T.Shape();
    turretShape.moveTo(-0.56, -1.02);
    turretShape.lineTo(0.56, -1.02);
    turretShape.lineTo(1.02, -0.25);
    turretShape.lineTo(0.94, 1.08);
    turretShape.lineTo(-0.94, 1.08);
    turretShape.lineTo(-1.02, -0.25);
    turretShape.closePath();
    const hullGeo = a.geo(
      new T.ExtrudeGeometry(turretShape, {
        depth: 0.68,
        bevelEnabled: true,
        bevelThickness: 0.06,
        bevelSize: 0.06,
        bevelSegments: 2,
      }),
    );
    hullGeo.rotateX(Math.PI / 2);
    a.mesh(turret, hullGeo, paint, [0, 0.72, 0], [1, 1, 1]);
    a.mesh(turret, a.cylinder, a.dark, [0, 0.02, 0], [1.1, 0.16, 1.1]);
    a.block(turret, paint, [0, 0.34, 1.38], [1.45, 0.54, 0.48]);
    a.mesh(turret, a.cylinder, paint, [0.36, 0.86, 0.32], [0.34, 0.26, 0.34]);
    a.mesh(turret, a.cylinder, a.dark, [0.36, 0.94, 0.32], [0.35, 0.06, 0.35]);
    a.block(turret, paint, [0, 0.36, -1.08], [1.15, 0.46, 0.42]);
    // Long 75mm cannon with double-baffle muzzle brake.
    a.block(barrel, paint, [0, 0, -0.15], [0.38, 0.32, 0.65]);
    const tube = a.mesh(
      barrel,
      a.cylinder,
      paint,
      [0, 0, -2.15],
      [0.095, 4.3, 0.095],
    );
    tube.rotation.x = Math.PI / 2;
    const collar = a.mesh(
      barrel,
      a.cylinder,
      a.dark,
      [0, 0, -0.75],
      [0.145, 0.9, 0.145],
    );
    collar.rotation.x = Math.PI / 2;
    const brake = a.mesh(
      barrel,
      a.cylinder,
      a.dark,
      [0, 0, -4.35],
      [0.18, 0.38, 0.18],
    );
    brake.rotation.x = Math.PI / 2;
    a.block(barrel, paint, [0, 0, -4.35], [0.42, 0.24, 0.14]);
    barrel.position.set(0, 0.38, -1.12);
  } else {
    // Player M4 Sherman cast-hull silhouette.
    a.soft(body, a.dark, [0, 0.72, 0], [2.4, 0.84, 5.4]);
    a.soft(body, paint, [0, 1.24, 0], [2.72, 0.96, 5]);
    const glacis = a.soft(body, paint, [0, 1.52, -2], [2.65, 0.7, 1.25]);
    glacis.rotation.x = -0.32;
    a.soft(body, paint, [0, 1.74, 0.8], [2.6, 0.24, 3]);
    for (const x of [-0.76, 0.76]) {
      a.mesh(body, a.cylinder, paint, [x, 1.94, -1], [0.43, 0.1, 0.48]);
      a.soft(body, a.dark, [x, 2.02, -1.23], [0.27, 0.1, 0.1]);
      a.soft(body, paint, [x * 1.9, 1.32, 0], [0.25, 0.2, 5.9]);
      for (let z = -1; z <= 1; z++)
        a.soft(body, a.dark, [x * 1.9, 1.48, z * 1.1], [0.12, 0.12, 0.7]);
      a.mesh(
        body,
        a.round,
        a.pale,
        [x * 1.55, 1.56, -2.46],
        [0.13, 0.13, 0.09],
      );
    }
    for (let i = 0; i < 8; i++)
      a.block(body, a.dark, [0, 1.89, 0.4 + i * 0.18], [1.35, 0.04, 0.06]);
    for (const side of [-1, 1]) {
      for (const z of [-1.48, 0, 1.48])
        a.soft(body, paint, [side * 1.59, 1.06, z], [0.22, 0.52, 0.65]);
      a.soft(body, a.wood, [side * 1.45, 1.58, 0.6], [0.16, 0.16, 2.2]);
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
  }

  for (const side of [-1, 1]) {
    // 6 road wheels rest inside the lower track run (y = 0.52, r = 0.40 -> bottom at y = 0.12).
    for (let i = 0; i < 6; i++) {
      const z = -1.55 + i * 0.62;
      const wheel = a.mesh(
        root,
        a.cylinder,
        a.rubber,
        [side * 1.43, 0.52, z],
        [0.4, 0.28, 0.4],
      );
      wheel.rotation.z = Math.PI / 2;
      wheels.push(wheel);
    }
    // Front drive sprocket & rear idler aligned with the track arc centers at y = 0.62, z = ±2.15.
    for (const z of [-2.15, 2.15]) {
      const sprocket = a.mesh(
        root,
        a.cylinder,
        paint,
        [side * 1.43, 0.62, z],
        [0.47, 0.36, 0.47],
      );
      sprocket.rotation.z = Math.PI / 2;
      sprocket.castShadow = true;
      sprocket.receiveShadow = true;
      sprockets.push(sprocket);
    }
  }
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
      [x, 2.02, 2],
      [0.24, 0.8, 0.24],
    ).rotation.z = Math.PI / 2;

  let texture: T.Texture | null = null;
  if (typeof document !== 'undefined') {
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
    texture = new T.CanvasTexture(mark);
    texture.colorSpace = T.SRGBColorSpace;
    a.textures.add(texture);
  }
  const material = new T.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    roughness: 0.9,
  });
  a.materials.add(material);
  for (const side of [-1, 1]) {
    if (enemy) {
      const m = a.mesh(
        turret,
        a.geo(new T.PlaneGeometry(0.58, 0.58)),
        material,
        [side * 1.08, 0.38, 0.25],
        [1, 1, 1],
      );
      m.rotation.y = (side * Math.PI) / 2 + side * 0.06;
    } else {
      // Conform the star decal cleanly 2.5 cm proud of the curved Sherman turret ellipsoid.
      const patch = a.geo(new T.PlaneGeometry(0.62, 0.62, 8, 6));
      patch.rotateY((side * Math.PI) / 2);
      const pos = patch.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const py = 0.35 + pos.getY(i);
        const pz = 0.15 + pos.getZ(i);
        const dy = (py - 0.35) / 0.65;
        const dz = (pz - 0.15) / 1.48;
        const radial = Math.min(0.88, dy * dy + dz * dz);
        const surfX = 1.2 * Math.sqrt(1 - radial);
        const nx = surfX / (1.2 * 1.2);
        const ny = (py - 0.35) / (0.65 * 0.65);
        const nz = (pz - 0.15) / (1.48 * 1.48);
        const inv = 0.025 / Math.hypot(nx, ny, nz);
        pos.setXYZ(i, side * (surfX + nx * inv), py + ny * inv, pz + nz * inv);
      }
      pos.needsUpdate = true;
      patch.computeVertexNormals();
      a.mesh(turret, patch, material, [0, 0, 0], [1, 1, 1]);
    }
  }
  consolidateTank(body, a);
  turret.traverse((o) => {
    if (o instanceof T.Mesh) {
      const transparent = !Array.isArray(o.material) && o.material.transparent;
      o.castShadow = !transparent;
      o.receiveShadow = true;
    }
  });
  for (const wheel of wheels) {
    wheel.castShadow = true;
    wheel.receiveShadow = true;
  }
  // Keep barrel and turret independent from the static hull.
  root.add(body, turret);
  const tracks = new T.InstancedMesh(a.rounded, a.dark, 88);
  tracks.castShadow = true;
  tracks.receiveShadow = true;
  tracks.instanceMatrix.setUsage(T.DynamicDrawUsage);
  tracks.frustumCulled = false;
  root.add(tracks);
  return { root, turret, barrel, wheels, sprockets, tracks };
}
export function makeCover(a: TankArt, c: Cover) {
  const root = new T.Group(),
    intact = new T.Group(),
    ruin = new T.Group();
  const collapseParts: T.Group[] = [];
  const fractured = new T.Group();
  fractured.visible = false;
  root.add(fractured);
  root.position.set(c.x, 0, c.z);
  root.add(intact, ruin);
  ruin.visible = false;
  if (c.kind === 'house') {
    const wall = c.id % 3 === 0 ? (a.altStone ?? a.stone) : a.stone;
    const roofMat =
      c.id % 2 === 1 && a.terracottaRoof ? a.terracottaRoof : a.roof;
    // Separate wall shells allow individual masonry panels to lose support.
    for (const side of [-1, 1]) {
      a.soft(
        intact,
        wall,
        [side * (c.w / 2 - 0.35), c.h / 2, 0],
        [0.7, c.h, c.d],
      );
      a.soft(
        intact,
        wall,
        [0, c.h / 2, side * (c.d / 2 - 0.35)],
        [c.w, c.h, 0.7],
      );
    }
    const profile = new T.Shape();
    profile.moveTo(-c.w / 2 - 0.5, 0);
    profile.lineTo(0, 3.3);
    profile.lineTo(c.w / 2 + 0.5, 0);
    profile.closePath();
    const gable = a.geo(
      new T.ExtrudeGeometry(profile, {
        depth: 0.5,
        bevelEnabled: false,
        steps: 1,
      }),
    );
    for (const side of [-1, 1]) {
      a.mesh(
        intact,
        gable,
        wall,
        [0, c.h, (side * c.d) / 2 - (side > 0 ? 0.5 : 0)],
        [1, 1, 1],
      );
      const roof = a.soft(
        intact,
        roofMat,
        [side * (c.w / 4 + 0.25), c.h + 1.65, 0],
        [Math.hypot(c.w / 2 + 0.5, 3.3), 0.23, c.d + 1],
      );
      roof.rotation.z = -side * Math.atan2(3.3, c.w / 2 + 0.5);
    }
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
          roofMat,
          [side * c.w * 0.25, c.h + 1.68, -c.d / 2 + t * c.d],
          [c.w * 0.56, 0.09, 0.08],
        );
        beam.rotation.z = -side * Math.atan2(3.3, c.w / 2);
      }
    // Jagged masonry courses leave uneven openings, rather than a rectangular fence.
    for (let side = 0; side < 4; side++) {
      const width = side < 2 ? c.d : c.w;
      const profile = new T.Shape();
      profile.moveTo(-width / 2, 0);
      profile.lineTo(width / 2, 0);
      for (let j = 8; j >= 0; j--) {
        const height =
          0.35 + Math.abs(Math.sin(j * 2.7 + side * 1.9 + c.id)) * 2.5;
        profile.lineTo((j / 8 - 0.5) * width, height);
      }
      profile.closePath();
      const broken = a.geo(
        new T.ExtrudeGeometry(profile, {
          depth: 0.8,
          bevelEnabled: false,
          steps: 1,
        }),
      );
      const stub = a.mesh(
        ruin,
        broken,
        wall,
        side < 2
          ? [(side === 0 ? -1 : 1) * c.w * 0.43, 0, 0]
          : [0, 0, (side === 2 ? -1 : 1) * c.d * 0.44],
        [1, 1, 1],
      );
      if (side < 2) stub.rotation.y = Math.PI / 2;
    }
    for (let i = 0; i < 32; i++) {
      const tile = a.block(
        ruin,
        roofMat,
        [
          Math.sin(i * 5.2) * c.w * 0.4,
          0.17 + Math.abs(Math.sin(i * 3.1)) * 0.6,
          Math.cos(i * 2.1) * c.d * 0.4,
        ],
        [0.55 + (i % 3) * 0.3, 0.09, 0.85],
      );
      tile.rotation.set(Math.sin(i) * 0.6, i * 1.7, Math.cos(i) * 0.35);
    }
    for (let i = 0; i < 18; i++) {
      const b = a.soft(
        ruin,
        i % 3 ? wall : roofMat,
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
    // Normandy bocage: earthen bank beneath irregular shrub clusters and overhanging leafy cards.
    a.soft(intact, a.dirt, [0, 0.45, 0], [c.w * 0.85, 0.9, c.d]);
    const bushGeo = new T.IcosahedronGeometry(1, 1);
    const bPos = bushGeo.getAttribute('position');
    for (let k = 0; k < bPos.count; k++) {
      const vx = bPos.getX(k),
        vy = bPos.getY(k),
        vz = bPos.getZ(k);
      const bump = 0.86 + 0.24 * Math.sin(vx * 5.1 + vy * 3.7 + vz * 4.3);
      bPos.setXYZ(k, vx * bump, vy * bump, vz * bump);
    }
    bushGeo.computeVertexNormals();
    a.geo(bushGeo);
    const shrubs = 14;
    for (let i = 0; i < shrubs; i++) {
      const t = (i + 0.5) / shrubs - 0.5;
      const lobe = a.mesh(
        intact,
        bushGeo,
        a.leaf,
        [
          Math.sin(i * 3.7 + c.id) * c.w * 0.24,
          1.15 + (i % 3) * 0.36,
          t * c.d * 0.92,
        ],
        [
          c.w * (0.28 + (i % 3) * 0.08),
          0.85 + (i % 4) * 0.25,
          (c.d / shrubs) * (1.25 + (i % 2) * 0.45),
        ],
      );
      lobe.rotation.set(Math.sin(i) * 0.2, i * 1.1, Math.cos(i) * 0.2);
    }
    if (a.foliage) {
      for (let i = 0; i < 24; i++) {
        const t = (i + 0.5) / 24 - 0.5;
        const side = i % 2 ? 1 : -1;
        const card = a.mesh(
          intact,
          a.foliage,
          a.leaves,
          [
            side * c.w * (0.22 + (i % 3) * 0.12),
            1.2 + (i % 4) * 0.35,
            t * c.d * 0.94,
          ],
          [1.6 + (i % 3) * 0.4, 1.6 + (i % 3) * 0.4, 1],
        );
        card.rotation.set(0.35 + (i % 3) * 0.3, i * 2.1, side * 0.4);
      }
    }
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
  if (c.kind === 'house') {
    // Wall footings and two separate roof slopes retain their own rigid motion.
    const pivots = [
      [-c.w / 2, 0, 0],
      [c.w / 2, 0, 0],
      [0, 0, -c.d / 2],
      [0, 0, c.d / 2],
      [0, c.h, 0],
      [0, c.h, 0],
    ];
    for (const p of pivots) {
      const group = new T.Group();
      group.position.set(...(p as [number, number, number]));
      collapseParts.push(group);
    }
    for (const child of intact.children.slice()) {
      const p = child.position;
      const index =
        p.y >= c.h - 0.3
          ? p.x < 0
            ? 4
            : 5
          : Math.abs(p.x) / (c.w / 2) > Math.abs(p.z) / (c.d / 2)
            ? p.x < 0
              ? 0
              : 1
            : p.z < 0
              ? 2
              : 3;
      child.position.sub(collapseParts[index].position);
      collapseParts[index].add(child);
    }
    for (const group of collapseParts) {
      consolidateTank(group, a);
      fractured.add(group);
      intact.add(group.clone(true));
    }
    // Ordinary gameplay retains one draw per material; fracture batches render only during collapse.
    consolidateTank(intact, a);
  } else consolidateTank(intact, a);
  consolidateTank(ruin, a);
  return { root, intact, ruin, collapseParts, fractured };
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

/** Articulated US GI supporter distinct from German anti-tank squads. */
export function makeAlly(a: TankArt) {
  const root = new T.Group();
  const torso = new T.Group();
  const leftLeg = new T.Group();
  const rightLeg = new T.Group();
  const leftArm = new T.Group();
  const rightArm = new T.Group();

  const khaki = a.mat('#6f6a4f', 0.95);
  const trousers = a.mat('#615c46', 0.96);
  const helmet = a.mat('#4c563f', 0.78);
  const pack = a.mat('#9b8e6c', 0.95);
  const skin = a.mat('#ab8e72', 0.92);

  a.mesh(torso, a.round, khaki, [0, 1.0, 0], [0.32, 0.48, 0.21]);
  a.soft(torso, pack, [0, 0.98, 0.16], [0.28, 0.38, 0.14]);
  a.soft(torso, pack, [0, 0.76, 0], [0.35, 0.08, 0.25]);
  a.mesh(torso, a.round, skin, [0, 1.56, -0.02], [0.16, 0.22, 0.16]);
  a.mesh(torso, a.round, helmet, [0, 1.71, 0], [0.24, 0.15, 0.25]);
  consolidateTank(torso, a);
  root.add(torso);

  for (const [side, group] of [
    [-1, leftLeg],
    [1, rightLeg],
  ] as const) {
    group.position.set(side * 0.13, 0.68, 0);
    a.mesh(group, a.cylinder, trousers, [0, -0.31, 0], [0.12, 0.62, 0.12]);
    a.soft(group, a.dark, [0, -0.63, -0.06], [0.18, 0.12, 0.34]);
    consolidateTank(group, a);
    root.add(group);
  }

  leftArm.position.set(-0.24, 1.24, 0);
  a.mesh(
    leftArm,
    a.cylinder,
    khaki,
    [0, -0.22, -0.1],
    [0.095, 0.52, 0.095],
  ).rotation.x = -0.55;
  consolidateTank(leftArm, a);

  rightArm.position.set(0.24, 1.24, 0);
  a.mesh(
    rightArm,
    a.cylinder,
    khaki,
    [0, -0.2, -0.14],
    [0.095, 0.52, 0.095],
  ).rotation.x = -0.75;
  // M1 Garand rifle carried at ready in right arm.
  a.soft(rightArm, a.wood, [0, -0.22, -0.34], [0.055, 0.09, 0.65]).rotation.x =
    -0.4;
  a.mesh(
    rightArm,
    a.cylinder,
    a.dark,
    [0, -0.09, -0.66],
    [0.025, 0.52, 0.025],
  ).rotation.x = Math.PI / 2 - 0.4;
  consolidateTank(rightArm, a);

  root.add(leftArm, rightArm);
  return { root, leftLeg, rightLeg, leftArm, rightArm };
}
