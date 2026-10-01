import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AirArt } from '../air/art';

/** Merge static pieces by material. Propellers and the gun cradle stay separate. */
export function consolidate(root: T.Group, a: AirArt) {
  root.updateMatrixWorld(true);
  const groups = new Map<T.Material, T.BufferGeometry[]>();
  root.traverse((o) => {
    if (o instanceof T.Mesh && !(o instanceof T.InstancedMesh)) {
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const m = o.material as T.Material;
      if (!groups.has(m)) groups.set(m, []);
      groups.get(m)!.push(g);
    }
  });
  root.clear();
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  for (const [mat, geos] of groups) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (merged) {
      const mesh = new T.Mesh(a.geo(merged), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }
}
function panelTexture(a: AirArt) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#a9aaa1';
  c.fillRect(0, 0, 512, 512);
  let seed = 710;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 13000; i++) {
    c.fillStyle = `rgba(${rand() > 0.4 ? '20,25,18' : '240,235,207'},${rand() * 0.14})`;
    c.fillRect(rand() * 512, rand() * 512, rand() * 3 + 0.4, rand() * 5 + 0.2);
  }
  c.lineWidth = 1;
  c.strokeStyle = '#50574d';
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 3; col++) {
      const x = col * 171,
        y = row * 128;
      c.strokeRect(x, y, 171, 128);
      c.strokeStyle = '#c5c5ac';
      c.strokeRect(x + 2, y + 2, 167, 124);
      c.strokeStyle = '#50574d';
      for (let n = 8; n < 171; n += 12) {
        c.fillStyle = '#555c50';
        c.fillRect(x + n, y + 5, 2, 2);
        c.fillRect(x + n, y + 122, 2, 2);
      }
    }
  const t = new T.CanvasTexture(canvas);
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  a.textures.add(t);
  return t;
}
export class FlakArt extends AirArt {
  panels = panelTexture(this);
  olivePaint = this.mat('#62674e', 0.68);
  belly = this.mat('#969f99', 0.58);
  black = this.mat('#202622', 0.83);
  canopy = this.mat('#729b9f', 0.18);
  brass = this.mat('#c5a263', 0.34);
  constructor() {
    super();
    this.olivePaint.map = this.panels;
    this.belly.map = this.panels;
    this.canopy.metalness = 0.65;
    this.brass.metalness = 0.85;
  }
}
function fuselage(a: FlakArt, transport: boolean) {
  const length = transport ? 19.5 : 16.1;
  const profile = [
    [0, 0.12],
    [0.035, 0.62],
    [0.1, 1.12],
    [0.22, 1.32],
    [0.4, 1.35],
    [0.63, 1.08],
    [0.83, 0.6],
    [0.97, 0.2],
    [1, 0.03],
  ];
  const geo = a.geo(
    new T.LatheGeometry(
      profile.map(([t, r]) => new T.Vector2(r, (t - 0.5) * length)),
      24,
    ),
  );
  geo.rotateX(Math.PI / 2);
  return geo;
}
/** Closed airfoil loft with tapered tips and slight dihedral; coordinates in metres. */
function wing(a: FlakArt, span: number, chord: number) {
  const vertices: number[] = [],
    indices: number[] = [],
    uv: number[] = [];
  const stations = [-1, -0.94, -0.5, -0.17, 0, 0.17, 0.5, 0.94, 1];
  const n = 16;
  for (const x of stations) {
    const taper = 1 - Math.abs(x) * 0.62,
      center = Math.abs(x) * 1.1;
    for (let j = 0; j < n; j++) {
      const theta = (j / n) * Math.PI * 2,
        z = Math.cos(theta) * chord * 0.5 * taper + center,
        y = Math.sin(theta) * chord * 0.055 * taper + Math.abs(x) * 0.48;
      vertices.push(x * span * 0.5, y, z);
      uv.push((x + 1) * 0.5, j / n);
    }
  }
  for (let i = 0; i < stations.length - 1; i++)
    for (let j = 0; j < n; j++) {
      const k = i * n + j,
        l = i * n + ((j + 1) % n);
      indices.push(k, l, l + n, k, l + n, k + n);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return a.geo(g);
}
function insignia(a: FlakArt) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#e2e1d0';
  c.fillRect(18, 44, 220, 40);
  c.fillStyle = '#1c2a36';
  c.fillRect(18, 49, 220, 30);
  c.beginPath();
  c.arc(128, 64, 57, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#e2e1d0';
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5,
      r = i % 2 ? 20 : 49;
    c.lineTo(128 + Math.cos(angle) * r, 64 + Math.sin(angle) * r);
  }
  c.closePath();
  c.fill();
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  a.textures.add(map);
  const m = new T.MeshStandardMaterial({
    map,
    transparent: true,
    roughness: 0.8,
    side: T.DoubleSide,
    depthWrite: false,
  });
  a.materials.add(m);
  return m;
}
export function aircraft(a: FlakArt, kind: 'bomber' | 'transport') {
  const root = new T.Group(),
    body = new T.Group(),
    props: T.Group[] = [];
  const transport = kind === 'transport',
    length = transport ? 19.5 : 16.1,
    span = transport ? 29.1 : 20.6;
  a.mesh(body, fuselage(a, transport), a.olivePaint, [0, 0, 0], [1, 1, 1]);
  a.mesh(body, a.sphere, a.belly, [0, -0.32, -0.4], [1.18, 0.82, length * 0.4]);
  a.mesh(
    body,
    wing(a, span, transport ? 4.5 : 4),
    a.olivePaint,
    [0, -0.32, -0.7],
    [1, 1, 1],
  );
  a.mesh(
    body,
    wing(a, transport ? 8.5 : 7, 2.6),
    a.olivePaint,
    [0, 0.35, length * 0.39],
    [1, 1, 1],
  );
  const tail = a.geo(new T.SphereGeometry(1, 12, 8));
  if (transport)
    a.mesh(body, tail, a.olivePaint, [0, 1.55, length * 0.37], [0.16, 2, 2.1]);
  else
    for (const side of [-1, 1])
      a.mesh(
        body,
        tail,
        a.olivePaint,
        [side * 2.8, 1.15, length * 0.38],
        [0.18, 1.65, 1.6],
      );
  // Framed cockpit and glazed bomber nose.
  a.mesh(
    body,
    a.sphere,
    a.canopy,
    [0, 0.64, -length * 0.32],
    [1.04, 0.74, 1.85],
  );
  for (const x of [-0.65, 0, 0.65])
    a.block(body, a.olivePaint, [x, 0.93, -length * 0.33], [0.055, 0.065, 2.4]);
  for (const z of [-length * 0.4, -length * 0.32, -length * 0.25])
    a.block(body, a.olivePaint, [0, 1.16, z], [1.45, 0.07, 0.08]);
  if (!transport) {
    a.mesh(
      body,
      a.sphere,
      a.canopy,
      [0, 0.02, -length * 0.435],
      [0.75, 0.72, 1.25],
    );
    for (const x of [-0.43, 0, 0.43])
      a.block(body, a.olivePaint, [x, 0.53, -length * 0.44], [0.05, 0.05, 1.6]);
    a.mesh(body, a.sphere, a.canopy, [0, 1.15, -1], [0.62, 0.7, 0.65]);
    a.block(body, a.dark, [0.2, 1.5, -2.2], [0.09, 0.09, 2.4]);
  }
  if (transport)
    for (const side of [-1, 1])
      for (let i = 0; i < 7; i++)
        a.block(
          body,
          a.canopy,
          [side * 1.28, 0.3, -2 + i * 0.83],
          [0.025, 0.46, 0.42],
        );
  const marking = insignia(a),
    plate = a.geo(new T.PlaneGeometry(1, 1));
  for (const side of [-1, 1]) {
    const m = a.mesh(
      body,
      plate,
      marking,
      [side * 1.02, 0.05, 3],
      [2.7, 1.35, 1],
    );
    m.rotation.y = (side * Math.PI) / 2;
    const top = a.mesh(
      body,
      plate,
      marking,
      [side * span * 0.34, 0.22, -0.1],
      [3.5, 1.75, 1],
    );
    top.rotation.x = -Math.PI / 2;
    const engineX = side * (transport ? 4.35 : 3.8);
    a.mesh(
      body,
      a.sphere,
      a.olivePaint,
      [engineX, -0.1, -1.3],
      [1.04, 1.1, 3.15],
    );
    const cowling = a.mesh(
      body,
      a.cylinder,
      a.olivePaint,
      [engineX, 0, -3.4],
      [1.12, 1.65, 1.12],
    );
    cowling.rotation.x = Math.PI / 2;
    const face = a.mesh(
      body,
      a.cylinder,
      a.black,
      [engineX, 0, -4.25],
      [0.92, 0.08, 0.92],
    );
    face.rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const cylinder = a.mesh(
        body,
        a.cylinder,
        a.steel,
        [engineX + Math.cos(angle) * 0.58, Math.sin(angle) * 0.58, -4.32],
        [0.13, 0.4, 0.13],
      );
      cylinder.rotation.z = angle - Math.PI / 2;
    }
    const prop = new T.Group();
    a.mesh(prop, a.sphere, a.steel, [0, 0, 0], [0.25, 0.25, 0.45]);
    for (let i = 0; i < 3; i++) {
      const blade = a.mesh(
        prop,
        a.sphere,
        a.black,
        [Math.sin(i * 2.094) * 0.82, Math.cos(i * 2.094) * 0.82, 0],
        [0.11, 1.3, 0.07],
      );
      blade.rotation.z = -i * 2.094;
    }
    prop.position.set(engineX, 0, -4.6);
    props.push(prop);
    const blurMat = new T.MeshBasicMaterial({
      color: '#b5b3a0',
      transparent: true,
      opacity: 0.1,
      side: T.DoubleSide,
      depthWrite: false,
    });
    a.materials.add(blurMat);
    a.mesh(
      body,
      a.geo(new T.CircleGeometry(2, 32)),
      blurMat,
      [engineX, 0, -4.58],
      [1, 1, 1],
    );
    // Exhaust outlet, nacelle seams and wing aileron hinge.
    a.block(body, a.dark, [engineX + side * 0.8, -0.45, -2.2], [0.2, 0.2, 1]);
    a.block(
      body,
      a.dark,
      [side * span * 0.34, -0.04, 1.15],
      [span * 0.21, 0.025, 0.035],
    );
  }
  consolidate(body, a);
  root.add(body, ...props);
  return { root, props };
}
export function gun(a: FlakArt) {
  const base = new T.Group(),
    yaw = new T.Group(),
    cradle = new T.Group();
  const steel = a.mat('#545b4c', 0.65);
  steel.map = a.texture('deck-color.jpg', true);
  steel.normalMap = a.texture('deck-normal.jpg');
  steel.roughnessMap = a.texture('deck-roughness.jpg');
  a.mesh(base, a.cylinder, steel, [0, 4.6, 4], [1.55, 0.3, 1.55]);
  a.mesh(base, a.cylinder, a.dark, [0, 4.8, 4], [1.15, 0.18, 1.15]);
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    a.mesh(
      base,
      a.cylinder,
      a.steel,
      [Math.cos(angle) * 1.36, 4.77, 4 + Math.sin(angle) * 1.36],
      [0.055, 0.09, 0.055],
    );
  }
  for (const side of [-1, 1]) {
    a.block(yaw, steel, [side * 0.85, -0.45, 0], [0.22, 1.35, 0.8]);
    a.mesh(
      yaw,
      a.cylinder,
      a.steel,
      [side * 0.86, 0, 0],
      [0.3, 0.22, 0.3],
    ).rotation.z = Math.PI / 2;
  }
  for (const x of [-0.46, 0.46])
    for (const y of [0, 0.4]) {
      a.block(cradle, steel, [x, y, -0.45], [0.32, 0.28, 1.6]);
      const barrel = a.mesh(
        cradle,
        a.cylinder,
        a.dark,
        [x, y, -2],
        [0.053, 2, 0.053],
      );
      barrel.rotation.x = Math.PI / 2;
      const jacket = a.mesh(
        cradle,
        a.cylinder,
        steel,
        [x, y, -1.65],
        [0.095, 1.1, 0.095],
      );
      jacket.rotation.x = Math.PI / 2;
      for (let i = 0; i < 7; i++)
        for (const side of [-1, 1])
          a.mesh(
            cradle,
            a.sphere,
            a.black,
            [x + side * 0.089, y, -1.2 - i * 0.14],
            [0.008, 0.024, 0.044],
          );
      const brake = a.mesh(
        cradle,
        a.cylinder,
        a.steel,
        [x, y, -3],
        [0.085, 0.19, 0.085],
      );
      brake.rotation.x = Math.PI / 2;
      const bore = a.mesh(
        cradle,
        a.cylinder,
        a.black,
        [x, y, -3.105],
        [0.06, 0.005, 0.06],
      );
      bore.rotation.x = Math.PI / 2;
      a.block(
        cradle,
        steel,
        [x + Math.sign(x) * 0.29, y + 0.05, -0.1],
        [0.34, 0.34, 0.6],
      );
      for (let i = 0; i < 6; i++)
        a.block(
          cradle,
          a.dark,
          [x + Math.sign(x) * 0.29, y + 0.223, -0.33 + i * 0.08],
          [0.3, 0.015, 0.017],
        );
      for (let i = 0; i < 5; i++)
        a.mesh(
          cradle,
          a.sphere,
          a.steel,
          [x - 0.17, y + 0.07, -0.9 + i * 0.3],
          [0.026, 0.025, 0.025],
        );
    }
  a.block(yaw, steel, [0, -0.6, 0.8], [0.8, 0.12, 0.65]);
  a.block(yaw, a.black, [0, -0.48, 0.85], [0.62, 0.09, 0.55]);
  for (const side of [-1, 1]) {
    const wheel = a.mesh(
      yaw,
      a.geo(new T.TorusGeometry(0.27, 0.023, 6, 24)),
      a.dark,
      [side * 0.8, -0.35, 1],
      [1, 1, 1],
    );
    wheel.rotation.y = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const spoke = a.block(
        yaw,
        a.steel,
        [side * 0.8, -0.35, 1],
        [0.03, 0.5, 0.025],
      );
      spoke.rotation.x = (i * Math.PI) / 3;
    }
    a.block(yaw, a.dark, [side * 0.53, -0.65, 1.4], [0.12, 0.14, 0.38]);
  }
  consolidate(base, a);
  consolidate(yaw, a);
  consolidate(cradle, a);
  yaw.add(cradle);
  yaw.position.set(0, 5.9, 4);
  base.add(yaw);
  return { root: base, yaw, cradle };
}
export function paratrooper(a: FlakArt) {
  const root = new T.Group(),
    body = new T.Group();
  a.mesh(body, a.sphere, a.olivePaint, [0, 0, 0], [0.28, 0.48, 0.19]);
  a.mesh(body, a.sphere, a.olivePaint, [0, 0.64, 0], [0.22, 0.17, 0.22]);
  a.mesh(body, a.sphere, a.wood, [0, 0.49, -0.04], [0.16, 0.15, 0.16]);
  for (const side of [-1, 1]) {
    const leg = a.block(
      body,
      a.olivePaint,
      [side * 0.18, -0.63, 0],
      [0.18, 0.55, 0.18],
    );
    leg.rotation.z = side * 0.2;
    a.block(body, a.dark, [side * 0.23, -0.98, -0.07], [0.19, 0.16, 0.32]);
    const arm = a.block(
      body,
      a.olivePaint,
      [side * 0.39, 0.12, 0],
      [0.14, 0.55, 0.14],
    );
    arm.rotation.z = -side * 0.45;
    a.block(body, a.pale, [side * 0.13, 0.06, -0.205], [0.05, 0.7, 0.035]);
  }
  a.block(body, a.olivePaint, [0, 0, 0.23], [0.43, 0.6, 0.18]);
  consolidate(body, a);
  root.add(body);
  const canopy = new T.Group(),
    fabric = a.mat('#c1bda0', 0.98);
  fabric.side = T.DoubleSide;
  const dome = a.geo(
    new T.SphereGeometry(3.6, 24, 12, 0, Math.PI * 2, 0.08, Math.PI * 0.47),
  );
  a.mesh(canopy, dome, fabric, [0, 3.9, 0], [1, 0.65, 1]);
  const points: T.Vector3[] = [];
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    points.push(
      new T.Vector3(Math.cos(angle) * 3.58, 4.05, Math.sin(angle) * 3.58),
      new T.Vector3(Math.cos(angle) * 0.26, 0.42, Math.sin(angle) * 0.22),
    );
    for (let j = 1; j < 10; j++) {
      const t = (j / 10) * Math.PI * 0.47,
        u = ((j + 1) / 10) * Math.PI * 0.47;
      points.push(
        new T.Vector3(
          Math.cos(angle) * Math.sin(t) * 3.61,
          3.9 + Math.cos(t) * 2.35,
          Math.sin(angle) * Math.sin(t) * 3.61,
        ),
        new T.Vector3(
          Math.cos(angle) * Math.sin(u) * 3.61,
          3.9 + Math.cos(u) * 2.35,
          Math.sin(angle) * Math.sin(u) * 3.61,
        ),
      );
    }
  }
  const lineMat = new T.LineBasicMaterial({ color: '#777a65' });
  a.materials.add(lineMat);
  canopy.add(
    new T.LineSegments(
      a.geo(new T.BufferGeometry().setFromPoints(points)),
      lineMat,
    ),
  );
  root.add(canopy);
  return { root, canopy };
}
