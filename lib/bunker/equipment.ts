import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { worldUV } from './detail';

type Point = [number, number, number];

/** Metre-scale prop construction. Each finished prop is batched by material. */
export class BunkerEquipment {
  readonly enamel: T.MeshStandardMaterial;
  readonly bakelite = new T.MeshStandardMaterial({
    color: '#29231e',
    roughness: 0.36,
  });
  readonly canvas = new T.MeshStandardMaterial({
    color: '#666952',
    roughness: 0.97,
  });
  readonly linen = new T.MeshStandardMaterial({
    color: '#b8ae96',
    roughness: 0.96,
  });
  readonly dial: T.MeshStandardMaterial;

  constructor(
    readonly metal: T.Material,
    readonly dark: T.Material,
    readonly wood: T.Material,
    readonly brass: T.Material,
  ) {
    this.enamel = (metal as T.MeshStandardMaterial).clone();
    this.enamel.color.set('#646d60');
    this.enamel.roughness = 0.48;
    this.enamel.metalness = 0.45;
    const face = document.createElement('canvas');
    face.width = face.height = 256;
    const c = face.getContext('2d')!;
    c.fillStyle = '#cfbd8d';
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = '#363329';
    c.fillStyle = '#363329';
    c.lineWidth = 3;
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI * (1.15 + (i * 0.7) / 40);
      const r = i % 5 === 0 ? 82 : 91;
      c.beginPath();
      c.moveTo(128 + Math.cos(a) * r, 147 + Math.sin(a) * r);
      c.lineTo(128 + Math.cos(a) * 104, 147 + Math.sin(a) * 104);
      c.stroke();
    }
    c.font = '16px monospace';
    c.textAlign = 'center';
    c.fillText('0     50     100', 128, 100);
    c.font = '12px monospace';
    c.fillText('SIGNAL / mA', 128, 195);
    c.strokeStyle = '#7b3024';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(128, 157);
    c.lineTo(167, 67);
    c.stroke();
    c.beginPath();
    c.arc(128, 157, 7, 0, Math.PI * 2);
    c.fill();
    const texture = new T.CanvasTexture(face);
    texture.colorSpace = T.SRGBColorSpace;
    this.dial = new T.MeshStandardMaterial({
      map: texture,
      roughness: 0.62,
      emissive: '#9e7339',
      emissiveMap: texture,
      emissiveIntensity: 0.16,
    });
    const weave = document.createElement('canvas');
    weave.width = weave.height = 128;
    const w = weave.getContext('2d')!;
    w.fillStyle = '#9b9b8c';
    w.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 128; i += 2) {
      w.fillStyle = i % 4 ? '#aaa99c' : '#858779';
      w.fillRect(i, 0, 1, 128);
      w.fillRect(0, i, 128, 1);
    }
    const cloth = new T.CanvasTexture(weave);
    cloth.wrapS = cloth.wrapT = T.RepeatWrapping;
    cloth.repeat.set(4, 4);
    for (const mat of [this.canvas, this.linen]) {
      mat.bumpMap = cloth;
      mat.bumpScale = 0.004;
    }
  }

  mesh(g: T.Group, geo: T.BufferGeometry, mat: T.Material, p: Point) {
    const m = new T.Mesh(geo, mat);
    m.position.set(...p);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  }
  box(g: T.Group, p: Point, size: Point, mat: T.Material, bevel = 0.025) {
    const geo = worldUV(
      new RoundedBoxGeometry(
        ...size,
        2,
        Math.min(bevel, ...size.map((n) => n / 4)),
      ),
    );
    if (mat === this.wood) {
      const uv = geo.getAttribute('uv');
      const vertical = size[1] > size[0] && size[1] > size[2];
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i),
          v = uv.getY(i);
        uv.setXY(
          i,
          (vertical ? v : u) + p[0] * 0.31 + p[2] * 0.19,
          (vertical ? u : v) + p[1] * 0.73,
        );
      }
    }
    return this.mesh(g, geo, mat, p);
  }

  rod(
    g: T.Group,
    a: Point,
    b: Point,
    radius: number,
    mat: T.Material,
    endRadius = radius,
    segments = 16,
  ) {
    const start = new T.Vector3(...a),
      end = new T.Vector3(...b),
      delta = end.clone().sub(start);
    const m = this.mesh(
      g,
      new T.CylinderGeometry(endRadius, radius, delta.length(), segments),
      mat,
      start.add(end).multiplyScalar(0.5).toArray() as Point,
    );
    m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), delta.normalize());
    return m;
  }
  tube(g: T.Group, points: Point[], radius: number, mat: T.Material) {
    return this.mesh(
      g,
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
        Math.max(16, points.length * 6),
        radius,
        8,
        false,
      ),
      mat,
      [0, 0, 0],
    );
  }
  ring(
    g: T.Group,
    p: Point,
    radius: number,
    thickness: number,
    mat: T.Material,
  ) {
    return this.mesh(g, new T.TorusGeometry(radius, thickness, 8, 32), mat, p);
  }
  finish(g: T.Group) {
    const batches = new Map<T.Material, T.Mesh[]>();
    for (const child of g.children) {
      const m = child as T.Mesh;
      const material = m.material as T.Material;
      const batch = batches.get(material) ?? [];
      batch.push(m);
      batches.set(material, batch);
    }
    for (const [material, parts] of batches) {
      const geometries = parts.map((m) => {
        m.updateMatrix();
        const geo = m.geometry.index
          ? m.geometry.toNonIndexed()
          : m.geometry.clone();
        return geo.applyMatrix4(m.matrix);
      });
      const combined = mergeGeometries(geometries);
      geometries.forEach((geo) => geo.dispose());
      if (!combined) continue;
      for (const part of parts) {
        part.geometry.dispose();
        g.remove(part);
      }
      this.mesh(g, combined, material, [0, 0, 0]);
    }
    return g;
  }

  crate(w: number, h: number, d: number) {
    const g = new T.Group();
    g.name = 'Timber ammunition chest';
    // Separate boards, recessed joints, end-grain edges and timber battens.
    const count = Math.max(3, Math.ceil(h / 0.22));
    this.box(g, [0, h / 2, 0], [w - 0.07, h - 0.04, d - 0.07], this.dark, 0.01);
    for (let i = 0; i < count; i++) {
      const y = ((i + 0.5) * h) / count;
      for (const side of [-1, 1]) {
        this.box(
          g,
          [0, y, side * (d / 2 - 0.026)],
          [w - 0.02, h / count - 0.012, 0.05],
          this.wood,
          0.009,
        );
        this.box(
          g,
          [side * (w / 2 - 0.026), y, 0],
          [0.05, h / count - 0.012, d - 0.08],
          this.wood,
          0.009,
        );
      }
    }
    const lidCount = Math.ceil(d / 0.2);
    for (let i = 0; i < lidCount; i++)
      this.box(
        g,
        [0, h - 0.035, -d / 2 + ((i + 0.5) * d) / lidCount],
        [w, 0.07, d / lidCount - 0.009],
        this.wood,
        0.008,
      );
    for (const side of [-1, 1]) {
      for (const x of [-w * 0.36, w * 0.36]) {
        this.box(
          g,
          [x, h / 2, side * (d / 2 - 0.008)],
          [0.105, h, 0.045],
          this.wood,
          0.012,
        );
        for (const y of [0.1, h - 0.1])
          this.rod(
            g,
            [x, y, side * (d / 2 + 0.015)],
            [x, y, side * (d / 2 + 0.025)],
            0.012,
            this.dark,
            0.012,
            6,
          );
      }
      // Drooping rope handles on the ends; they remain within player clearance.
      this.tube(
        g,
        [
          [(side * w) / 2, h * 0.68, -d * 0.18],
          [side * (w / 2 + 0.025), h * 0.49, -d * 0.11],
          [side * (w / 2 + 0.025), h * 0.49, d * 0.11],
          [(side * w) / 2, h * 0.68, d * 0.18],
        ],
        0.023,
        this.canvas,
      );
      for (const x of [-w * 0.27, w * 0.27]) {
        this.box(
          g,
          [x, h * 0.83, side * (d / 2 + 0.021)],
          [0.07, 0.16, 0.018],
          this.dark,
          0.009,
        );
        this.rod(
          g,
          [x - 0.045, h * 0.86, side * (d / 2 + 0.035)],
          [x + 0.045, h * 0.86, side * (d / 2 + 0.035)],
          0.017,
          this.metal,
        );
      }
    }
    return this.finish(g);
  }

  /** Front is +Z; an assembled radio set rather than a glowing cuboid. */
  radio(w = 0.9, h = 0.55, d = 0.6) {
    const g = new T.Group();
    g.name = 'Valve radio receiver';
    this.box(g, [0, h / 2, 0], [w, h, d], this.enamel, 0.055);
    this.box(
      g,
      [0, h / 2, d / 2 + 0.007],
      [w - 0.05, h - 0.05, 0.025],
      this.dark,
      0.035,
    );
    this.box(
      g,
      [0, h / 2, d / 2 + 0.022],
      [w - 0.08, h - 0.08, 0.02],
      this.enamel,
      0.025,
    );
    const r = h * 0.19,
      z = d / 2 + 0.04;
    for (const x of [-w * 0.21, w * 0.15]) {
      this.rod(
        g,
        [x, h * 0.63, z - 0.02],
        [x, h * 0.63, z + 0.006],
        r * 1.09,
        this.bakelite,
      );
      this.mesh(g, new T.CircleGeometry(r * 0.94, 32), this.dial, [
        x,
        h * 0.63,
        z + 0.008,
      ]);
      this.ring(g, [x, h * 0.63, z + 0.014], r, 0.009, this.metal);
    }
    for (let i = 0; i < 4; i++) {
      const x = -w * 0.29 + i * w * 0.19;
      this.rod(
        g,
        [x, h * 0.22, z],
        [x, h * 0.22, z + 0.055],
        0.035,
        this.bakelite,
        0.039,
        24,
      );
      this.box(
        g,
        [x, h * 0.22 + 0.02, z + 0.058],
        [0.007, 0.021, 0.004],
        this.linen,
        0.001,
      );
    }
    for (const side of [-1, 1]) {
      const x = side * (w / 2 - 0.055);
      this.tube(
        g,
        [
          [x, h * 0.25, z],
          [x, h * 0.31, z + 0.075],
          [x, h * 0.74, z + 0.075],
          [x, h * 0.8, z],
        ],
        0.018,
        this.metal,
      );
      for (const y of [0.05, h - 0.05])
        this.rod(
          g,
          [x, y, z - 0.01],
          [x, y, z + 0.006],
          0.013,
          this.metal,
          0.013,
          6,
        );
    }
    for (let i = 0; i < 9; i++)
      this.box(
        g,
        [-w * 0.3 + i * w * 0.075, h + 0.002, -0.03],
        [0.018, 0.005, d * 0.48],
        this.dark,
        0.002,
      );
    for (const x of [-w * 0.35, w * 0.35])
      for (const z of [-d * 0.32, d * 0.32])
        this.rod(g, [x, -0.025, z], [x, 0.015, z], 0.04, this.bakelite);
    return this.finish(g);
  }

  radioRack() {
    const g = new T.Group();
    g.name = 'Communications rack';
    this.box(g, [0, 0.12, 0], [2.16, 0.24, 1.15], this.dark, 0.05);
    for (const x of [-1, 1]) {
      this.box(g, [x, 1.15, 0], [0.13, 1.95, 1.05], this.enamel, 0.04);
      for (let y = 0.36; y < 2; y += 0.18)
        this.rod(g, [x, y, 0.52], [x, y, 0.54], 0.013, this.metal, 0.013, 6);
    }
    this.box(g, [0, 2.09, 0], [2.1, 0.08, 1.05], this.enamel, 0.04);
    for (let i = 0; i < 3; i++) {
      const radio = this.radio(1.77, 0.55, 0.91);
      // Flatten the already-batched set into the rack before final batching.
      while (radio.children.length) {
        const part = radio.children[0];
        part.position.y += 0.28 + i * 0.59;
        g.add(part);
      }
    }
    this.tube(
      g,
      [
        [0.8, 2.13, -0.2],
        [0.7, 2.36, -0.3],
        [0.25, 2.35, -0.4],
        [0.2, 2.1, -0.45],
      ],
      0.023,
      this.bakelite,
    );
    return this.finish(g);
  }

  private cushion(g: T.Group, p: Point, size: Point, mat: T.Material) {
    const geo = new T.SphereGeometry(1, 32, 16);
    const positions = geo.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i),
        y = positions.getY(i),
        z = positions.getZ(i);
      // A soft superellipsoid: broad padded faces and pinched seams, no box corners.
      const power = (v: number, exponent: number) =>
        Math.sign(v) * Math.pow(Math.abs(v), exponent);
      positions.setXYZ(
        i,
        (power(x, 0.48) * size[0]) / 2,
        (power(y, 0.75) * size[1]) / 2 +
          Math.sin(z * 13 + x * 9) * 0.008 * (1 - Math.abs(y)),
        (power(z, 0.48) * size[2]) / 2,
      );
    }
    geo.computeVertexNormals();
    return this.mesh(g, geo, mat, p);
  }
  bed(bunk = true) {
    const g = new T.Group();
    g.name = bunk ? 'Tubular bunk bed' : 'Infirmary cot';
    const levels = bunk ? [0.48, 1.4] : [0.7];
    for (const y of levels) {
      for (const x of [-0.65, 0.65])
        this.rod(g, [x, y, -1.02], [x, y, 1.02], 0.033, this.enamel);
      for (const z of [-1.02, 1.02])
        this.rod(g, [-0.65, y, z], [0.65, y, z], 0.035, this.enamel);
      this.cushion(g, [0, y + 0.105, 0], [1.27, 0.19, 2.08], this.canvas);
      this.cushion(
        g,
        [-0.04, y + 0.25, -0.72],
        [0.88, 0.22, 0.47],
        this.linen,
      ).rotation.y = 0.07;
      // A draped blanket with a body-shaped sag and folds over both bed rails.
      const cloth = new T.PlaneGeometry(1.5, 1.3, 24, 20);
      const p = cloth.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i),
          v = p.getY(i);
        const drop = Math.max(0, Math.abs(u) - 0.56) * 1.4;
        p.setXYZ(
          i,
          u,
          y +
            0.245 -
            drop +
            Math.sin(u * 23 + v * 5) * 0.012 +
            Math.sin(v * 15) * 0.008,
          v + 0.34,
        );
      }
      // PlaneGeometry's original normal points down after the above remapping.
      const index = cloth.getIndex()!;
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i);
        index.setX(i, index.getX(i + 2));
        index.setX(i + 2, a);
      }
      cloth.computeVertexNormals();
      this.mesh(g, cloth, bunk ? this.canvas : this.linen, [0, 0, 0]);
      for (const side of [-1, 1])
        this.tube(
          g,
          [
            [side * 0.64, y + 0.04, -1],
            [side * 0.62, y + 0.08, -0.5],
            [side * 0.62, y + 0.08, 0.5],
            [side * 0.64, y + 0.04, 1],
          ],
          0.007,
          this.linen,
        );
    }
    for (const z of [-1.02, 1.02]) {
      const top = levels.at(-1)! + 0.5;
      for (const x of [-0.65, 0.65])
        this.rod(g, [x, 0.03, z], [x, top - 0.15, z], 0.028, this.enamel);
      this.tube(
        g,
        [
          [-0.65, top - 0.15, z],
          [-0.62, top - 0.04, z],
          [-0.5, top, z],
          [0, top, z],
          [0.5, top, z],
          [0.62, top - 0.04, z],
          [0.65, top - 0.15, z],
        ],
        0.028,
        this.enamel,
      );
      for (const x of [-0.3, 0, 0.3])
        this.rod(g, [x, levels[0], z], [x, top, z], 0.012, this.enamel);
    }
    if (bunk) {
      for (const x of [-0.36, 0.36])
        this.rod(g, [x, 0.07, 1.04], [x, 1.6, 1.04], 0.021, this.metal);
      for (const y of [0.3, 0.65, 1, 1.35])
        this.rod(g, [-0.36, y, 1.04], [0.36, y, 1.04], 0.018, this.metal);
    }
    return this.finish(g);
  }

  barrel() {
    const g = new T.Group();
    g.name = 'Pressed steel oil drum';
    const profile: T.Vector2[] = [
      [0, 0],
      [0.37, 0],
      [0.41, 0.03],
      [0.415, 0.09],
      [0.4, 0.13],
      [0.4, 0.36],
      [0.43, 0.39],
      [0.43, 0.43],
      [0.4, 0.46],
      [0.4, 0.86],
      [0.43, 0.89],
      [0.43, 0.93],
      [0.4, 0.96],
      [0.4, 1.2],
      [0.42, 1.25],
      [0.41, 1.3],
      [0, 1.3],
    ].map(([x, y]) => new T.Vector2(x, y));
    this.mesh(g, new T.LatheGeometry(profile, 40), this.enamel, [0, 0, 0]);
    for (const y of [0.05, 1.28])
      this.ring(g, [0, y, 0], 0.411, 0.012, this.metal).rotation.x =
        Math.PI / 2;
    this.rod(
      g,
      [0.21, 1.3, 0.08],
      [0.21, 1.32, 0.08],
      0.045,
      this.dark,
      0.045,
      6,
    );
    this.rod(
      g,
      [-0.23, 1.3, -0.08],
      [-0.23, 1.315, -0.08],
      0.018,
      this.dark,
      0.018,
      6,
    );
    return this.finish(g);
  }
}
