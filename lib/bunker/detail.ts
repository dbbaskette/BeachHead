import * as T from 'three';
import { rooms } from './simulation';

/** Box UVs measured in metres: identical concrete grain on every wall size. */
export function worldUV(geometry: T.BufferGeometry) {
  const p = geometry.getAttribute('position'),
    n = geometry.getAttribute('normal'),
    uv = geometry.getAttribute('uv');
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(n.getX(i)) > 0.5) uv.setXY(i, p.getZ(i), p.getY(i));
    else if (Math.abs(n.getY(i)) > 0.5) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
  return geometry;
}

export function addBunkerDetail(
  scene: T.Scene,
  concrete: T.Material,
  metal: T.Material,
  dark: T.Material,
  brass: T.Material,
) {
  const mesh = (
    g: T.BufferGeometry,
    m: T.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    scene.add(o);
    return o;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m = metal,
  ) => mesh(worldUV(new T.BoxGeometry(w, h, d)), m, x, y, z);
  const tube = (points: T.Vector3[], radius: number, m = dark) =>
    mesh(
      new T.TubeGeometry(new T.CatmullRomCurve3(points), 24, radius, 8, false),
      m,
      0,
      0,
      0,
    );
  const grimeCanvas = document.createElement('canvas');
  grimeCanvas.width = 256;
  grimeCanvas.height = 512;
  const ctx = grimeCanvas.getContext('2d')!;
  for (let i = 0; i < 150; i++) {
    const x = (i * 67) % 256,
      h = 60 + ((i * 131) % 450);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(20,26,18,.16)');
    g.addColorStop(1, 'rgba(20,26,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, 1 + (i % 5), h);
  }
  const grime = new T.CanvasTexture(grimeCanvas);
  const stain = new T.MeshStandardMaterial({
    map: grime,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  for (const room of rooms) {
    for (const side of [-1, 1]) {
      // Water running down formwork, plus a chipped footing against the wall.
      const x = side * (room.w / 2 - 0.26);
      const patch = mesh(
        new T.PlaneGeometry(room.d, room.h),
        stain,
        x,
        room.h / 2,
        room.z,
      );
      patch.rotation.y = (-side * Math.PI) / 2;
      patch.castShadow = false;
      box(x, 0.12, room.z, 0.1, 0.24, room.d, concrete);
      for (
        let z = room.z - room.d / 2 + 0.6;
        z < room.z + room.d / 2;
        z += 1.8
      ) {
        for (let y = 0.75; y < room.h; y += 0.9) {
          const hole = mesh(
            new T.CircleGeometry(0.026, 8),
            dark,
            x - side * 0.006,
            y,
            z,
          );
          hole.rotation.y = (-side * Math.PI) / 2;
        }
      }
    }
    // Concrete pour seams, subtle rather than a tile grid.
    for (let y = 0.9; y < room.h; y += 0.9) {
      for (const side of [-1, 1])
        box(side * (room.w / 2 - 0.265), y, room.z, 0.009, 0.009, room.d, dark);
    }
  }
  // Thick steel tunnel surround and an open blast door folded against the wall.
  for (const x of [-1.85, 1.85]) box(x, 1.65, 2.24, 0.14, 3.3, 0.2, dark);
  box(0, 3.28, 2.24, 3.85, 0.16, 0.2, dark);
  box(2.8, 1.55, 2.39, 1.7, 3.05, 0.18, metal);
  for (const y of [0.28, 2.82]) box(2.8, y, 2.5, 1.52, 0.12, 0.07, dark);
  for (const x of [2.12, 3.48])
    for (let y = 0.28; y < 2.9; y += 0.32) {
      const bolt = mesh(
        new T.CylinderGeometry(0.035, 0.035, 0.04, 6),
        metal,
        x,
        y,
        2.53,
      );
      bolt.rotation.x = Math.PI / 2;
    }
  const latch = mesh(
    new T.TorusGeometry(0.23, 0.025, 8, 24),
    dark,
    3.12,
    1.5,
    2.56,
  );
  for (let i = 0; i < 3; i++) {
    const spoke = box(3.12, 1.5, 2.56, 0.44, 0.026, 0.026, metal);
    spoke.rotation.z = (i * Math.PI) / 3;
  }
  latch.castShadow = true;
  box(-2.42, 1.85, 2.29, 0.4, 0.55, 0.18, metal);
  for (const x of [-2.53, -2.35])
    tube(
      [
        new T.Vector3(x, 2.05, 2.38),
        new T.Vector3(x, 3.8, 2.38),
        new T.Vector3(x - 0.3, 4.02, 2.38),
        new T.Vector3(-6.5, 4.02, 2.38),
      ],
      0.032,
      metal,
    );
  box(2.9, 3.91, 2.34, 1.1, 0.95, 0.2, metal);
  for (let i = 1; i <= 4; i++)
    mesh(new T.TorusGeometry(i * 0.09, 0.013, 8, 28), dark, 2.9, 3.91, 2.48);
  for (let i = 0; i < 8; i++) {
    const grill = box(2.9, 3.91, 2.49, 0.77, 0.016, 0.02, dark);
    grill.rotation.z = (i * Math.PI) / 8;
  }
  tube(
    [
      new T.Vector3(5.8, 4.35, 5),
      new T.Vector3(5.8, 4.35, 3),
      new T.Vector3(5.65, 4.1, 2.7),
      new T.Vector3(5.25, 3.5, 2.5),
    ],
    0.23,
    metal,
  );
  for (let i = 0; i < 5; i++) {
    const collar = mesh(
      new T.TorusGeometry(0.24, 0.025, 8, 24),
      dark,
      5.8,
      4.35,
      3 + i * 0.4,
    );
    collar.rotation.set(0, 0, 0);
  }
  // Traversing rails and bolted trunnion plates make the gun a heavy machine.
  for (const radius of [1.53, 1.7]) {
    const rail = mesh(
      new T.TorusGeometry(radius, 0.035, 8, 64),
      metal,
      -4.7,
      0.34,
      8.5,
    );
    rail.rotation.x = Math.PI / 2;
  }
  for (const z of [7.86, 9.14]) {
    for (const x of [-5.45, -4.85, -4.25])
      for (const y of [0.94, 1.96]) {
        const bolt = mesh(
          new T.CylinderGeometry(0.042, 0.042, 0.06, 6),
          metal,
          x,
          y,
          z,
        );
        bolt.rotation.x = Math.PI / 2;
      }
    const trunnion = mesh(
      new T.CylinderGeometry(0.23, 0.23, 0.18, 32),
      dark,
      -4.8,
      1.65,
      z,
    );
    trunnion.rotation.x = Math.PI / 2;
  }
  // Actual barrel vault: closed masonry ceiling instead of floating arch segments.
  const vault = new T.CylinderGeometry(
    1.72,
    1.72,
    11.9,
    40,
    1,
    true,
    0,
    Math.PI,
  );
  vault.rotateZ(Math.PI / 2);
  vault.rotateY(Math.PI / 2);
  const vaultMat = (concrete as T.MeshStandardMaterial).clone();
  vaultMat.side = T.DoubleSide;
  mesh(vault, vaultMat, 0, 1.72, -4);
  // Cables droop between their mounting clips.
  for (const z of [14, 8, 3])
    tube(
      [
        new T.Vector3(6.5, 3.8, z),
        new T.Vector3(6.4, 3.56, z - 2),
        new T.Vector3(6.5, 3.8, z - 4),
      ],
      0.018,
    );
  // Recoil cylinders, sliding breech rails, sight assembly and mechanical fittings.
  for (const z of [8.15, 8.85]) {
    const ram = mesh(
      new T.CylinderGeometry(0.09, 0.09, 2.3, 24),
      metal,
      -4.85,
      1.95,
      z,
    );
    ram.rotation.z = Math.PI / 2;
    const rod = mesh(
      new T.CylinderGeometry(0.045, 0.045, 1.3, 20),
      brass,
      -3.95,
      1.95,
      z,
    );
    rod.rotation.z = Math.PI / 2;
    box(-4.5, 1.54, z, 2.1, 0.065, 0.09, dark);
    for (let i = 0; i < 9; i++)
      box(-5.35 + i * 0.22, 1.45, z, 0.055, 0.11, 0.14, metal);
  }
  box(-3.27, 1.66, 8.5, 0.07, 0.38, 0.44, metal);
  box(-3.2, 1.7, 8.5, 0.05, 0.23, 0.3, dark);
  tube(
    [
      new T.Vector3(-3.5, 1.85, 8.84),
      new T.Vector3(-3.2, 1.86, 8.99),
      new T.Vector3(-3.17, 1.5, 9.02),
    ],
    0.035,
    metal,
  );
  box(-4.1, 1.95, 9.1, 0.12, 0.65, 0.12, dark);
  const optic = mesh(
    new T.CylinderGeometry(0.065, 0.065, 0.42, 20),
    metal,
    -4.1,
    2.28,
    9.1,
  );
  optic.rotation.z = Math.PI / 2;
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12;
    const bolt = mesh(
      new T.CylinderGeometry(0.03, 0.03, 0.025, 6),
      metal,
      -4.7 + Math.cos(a) * 0.65,
      1.0,
      8.5 + Math.sin(a) * 0.65,
    );
    bolt.rotation.y = a;
  }
  // Grease around the pedestal, scattered casings and floor cracks.
  const wet = new T.MeshStandardMaterial({
    color: '#272b27',
    roughness: 0.24,
    metalness: 0.2,
    transparent: true,
    opacity: 0.24,
    depthWrite: false,
  });
  for (let i = 0; i < 9; i++) {
    const shape = new T.Shape();
    for (let j = 0; j <= 24; j++) {
      const a = (j / 24) * Math.PI * 2,
        r = 0.6 + Math.sin(j * 13 + i) * 0.14;
      const x = Math.cos(a) * r,
        y = Math.sin(a) * r * 0.6;
      if (j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const o = mesh(
      new T.ShapeGeometry(shape),
      wet,
      Math.sin(i * 9) * 5,
      0.013,
      14 - i * 4.2,
    );
    o.rotation.x = -Math.PI / 2;
    o.castShadow = false;
  }
  for (let i = 0; i < 18; i++) {
    const shell = mesh(
      new T.CylinderGeometry(0.023, 0.024, 0.14, 10),
      brass,
      -2.95 - Math.abs(Math.sin(i * 3)) * 0.7,
      0.027,
      7.5 + Math.sin(i * 7) * 1.25,
    );
    shell.rotation.set(Math.PI / 2, 0, i * 1.3);
  }
  // Lamp cages give the light sources a practical industrial construction.
  for (const [x, z, y] of [
    [-5, 4, 3.4],
    [5, 12, 3.4],
    [0, -1, 2.85],
    [0, -7, 2.85],
    [-4, -12, 3.1],
    [4, -20, 3.1],
  ]) {
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      box(
        x + Math.cos(a) * 0.12,
        y - 0.1,
        z + Math.sin(a) * 0.12,
        0.012,
        0.22,
        0.012,
        dark,
      );
    }
    const ring = mesh(
      new T.TorusGeometry(0.12, 0.01, 6, 20),
      dark,
      x,
      y - 0.21,
      z,
    );
    ring.rotation.x = Math.PI / 2;
  }
}

export function addWeaponDetail(
  weapon: T.Group,
  steel: T.Material,
  dark: T.Material,
  wood: T.Material,
) {
  const part = (
    g: T.BufferGeometry,
    m: T.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const o = new T.Mesh(g, m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    weapon.add(o);
    return o;
  };
  // MP40 receiver seams, cocking handle, ejection port, barrel nut, folding stock.
  part(new T.BoxGeometry(0.004, 0.02, 0.14), dark, -0.039, 0.014, -0.16);
  part(new T.BoxGeometry(0.005, 0.019, 0.085), dark, 0.037, 0.013, -0.24);
  const handle = part(
    new T.CylinderGeometry(0.011, 0.011, 0.052, 12),
    steel,
    -0.065,
    0.008,
    -0.09,
  );
  handle.rotation.z = Math.PI / 2;
  part(new T.SphereGeometry(0.014, 12, 8), dark, -0.09, 0.008, -0.09);
  for (const z of [-0.36, -0.385, -0.405]) {
    const nut = part(
      new T.CylinderGeometry(0.028, 0.028, 0.012, 24),
      steel,
      0,
      0.009,
      z,
    );
    nut.rotation.x = Math.PI / 2;
  }
  for (const x of [-0.025, 0.025]) {
    part(new T.BoxGeometry(0.006, 0.017, 0.3), steel, x, -0.055, 0.12);
    for (let i = 0; i < 7; i++)
      part(
        new T.BoxGeometry(0.003, 0.08, 0.003),
        dark,
        x,
        -0.105,
        0.04 + i * 0.009,
      );
  }
  part(new T.BoxGeometry(0.059, 0.085, 0.012), wood, 0, -0.065, 0.27);
  const guard = part(
    new T.TorusGeometry(0.036, 0.005, 8, 24),
    steel,
    0,
    -0.087,
    -0.04,
  );
  guard.rotation.y = Math.PI / 2;
  guard.scale.y = 0.78;
  part(
    new T.BoxGeometry(0.009, 0.04, 0.008),
    dark,
    0,
    -0.075,
    -0.038,
  ).rotation.x = -0.3;
  for (const z of [-0.06, -0.29]) {
    const screw = part(
      new T.CylinderGeometry(0.005, 0.005, 0.079, 8),
      steel,
      0,
      -0.025,
      z,
    );
    screw.rotation.z = Math.PI / 2;
  }
  // Fingers wrap the magazine housing and pistol grip instead of spherical mittens.
  const glove = new T.MeshStandardMaterial({
    color: '#514738',
    roughness: 0.96,
  });
  for (let i = 0; i < 4; i++) {
    const f = part(
      new T.CapsuleGeometry(0.013, 0.047, 4, 10),
      glove,
      -0.018,
      -0.06 - i * 0.018,
      -0.23,
    );
    f.rotation.z = Math.PI / 2;
    f.rotation.y = 0.25;
    const r = part(
      new T.CapsuleGeometry(0.014, 0.041, 4, 10),
      glove,
      0.014,
      -0.07 - i * 0.018,
      0.06,
    );
    r.rotation.z = Math.PI / 2;
  }
}
