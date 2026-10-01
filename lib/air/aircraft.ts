import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AirArt } from './art';
import { GUNS, RACKS } from './flight';
import { CONVERGENCE } from './weapons';
import { instrumentTexture, aircraftSkin } from './surfaces';

/** Smooth elliptical sections give the cowling and tail a continuous silhouette. */
function fuselageGeometry() {
  const sections = [
    [-6.3, -0.48, 0.92, 0.92],
    [-6.1, -0.48, 1.08, 1.03],
    [-5, -0.48, 1.11, 1.06],
    [-3.8, -0.48, 1.08, 1.02],
    [-2, -0.43, 1.02, 1.03],
    [0, -0.35, 0.93, 1.04],
    [2, -0.26, 0.68, 0.79],
    [4, -0.14, 0.43, 0.54],
    [5.8, -0.02, 0.17, 0.29],
    [6.4, 0.03, 0.015, 0.03],
  ];
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  for (let row = 0; row < sections.length; row++)
    for (let col = 0; col <= 48; col++) {
      const [z, y, rx, ry] = sections[row],
        theta = (col / 48) * Math.PI * 2;
      positions.push(Math.cos(theta) * rx, y + Math.sin(theta) * ry, z);
      uv.push(col / 48, (z + 6.3) / 12.7);
      if (row < sections.length - 1 && col < 48) {
        const n = row * 49 + col;
        indices.push(n, n + 1, n + 49, n + 1, n + 50, n + 49);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Rounded leading edge, camber, taper and dihedral instead of a scaled box. */
export function wingGeometry(side: number) {
  const positions: number[] = [],
    uv: number[] = [],
    indices: number[] = [];
  const spans = [0.65, 1.2, 2.8, 4.5, 6.2, 7.4, 8, 8.25];
  for (let row = 0; row < spans.length; row++)
    for (let col = 0; col <= 32; col++) {
      const span = spans[row],
        tip = span / 8.25,
        theta = (col / 32) * Math.PI * 2,
        t = (1 - Math.cos(theta)) / 2;
      const chord = 3.5 - tip * 1.75,
        leading = -1.5 + tip * 0.65;
      const thickness =
        (0.26 - tip * 0.17) * (row === spans.length - 1 ? 0.18 : 1);
      positions.push(
        side * span,
        -0.52 +
          span * 0.035 +
          Math.sin(Math.PI * t) * 0.07 +
          Math.sin(theta) * thickness * (1 - 0.5 * t),
        leading + t * chord,
      );
      uv.push(tip, t);
      if (row < spans.length - 1 && col < 32) {
        const n = row * 33 + col;
        if (side > 0) indices.push(n, n + 1, n + 33, n + 1, n + 34, n + 33);
        else indices.push(n, n + 33, n + 1, n + 1, n + 33, n + 34);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

export function makeAirframe(a: AirArt) {
  const root = new THREE.Group();
  root.name = 'player-fighter-bomber';
  const smooth = a.geo(new THREE.SphereGeometry(1, 32, 20));
  const paint = a.mat('#73795c', 0.63);
  paint.map = a.paint;
  const metal = a.mat('#7f8581', 0.4),
    black = a.mat('#222a24', 0.87),
    canvas = a.mat('#726d49', 0.95);
  const body = a.mesh(
    root,
    a.geo(fuselageGeometry()),
    paint,
    [0, 0, 0],
    [1, 1, 1],
  );
  body.name = 'shaped-fuselage';
  // Cowling lips, cooling flaps, exhaust stacks and anti-glare upper skin.
  for (const z of [-6.24, -4.15]) {
    const ring = a.mesh(
      root,
      a.geo(new THREE.TorusGeometry(1.025, 0.027, 6, 48)),
      metal,
      [0, -0.48, z],
      [1, 1, 1],
    );
    ring.name = 'cowling-seam';
  }
  a.mesh(root, smooth, black, [0, 0.2, -4.75], [0.7, 0.42, 1.5]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const exhaust = a.mesh(
        root,
        a.cylinder,
        metal,
        [side * 1.02, -0.18, -3.9 + i * 0.28],
        [0.085, 0.29, 0.085],
      );
      exhaust.rotation.z = side * 1.15;
      a.mesh(
        root,
        a.sphere,
        black,
        [side * 1.09, -0.05, -3.88 + i * 0.28],
        [0.045, 0.045, 0.065],
      );
      const flap = a.block(
        root,
        paint,
        [side * 1.075, -0.55, -4.25 + i * 0.16],
        [0.055, 0.65, 0.11],
      );
      flap.rotation.z = side * 0.12;
    }
  }
  const wingPaint = a.mat('#ffffff', 0.68),
    skin = aircraftSkin();
  if (skin) {
    a.textures.add(skin);
    wingPaint.map = skin;
  } else {
    wingPaint.color.copy(paint.color);
    wingPaint.map = a.paint;
  }
  const ailerons: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const wing = a.mesh(
      root,
      a.geo(wingGeometry(side)),
      wingPaint,
      [0, 0, 0],
      [1, 1, 1],
    );
    wing.name = side < 0 ? 'port-wing' : 'starboard-wing';
    a.mesh(root, smooth, paint, [side * 0.96, -0.4, 0.1], [0.7, 0.23, 2]);
    const aileron = new THREE.Group();
    aileron.position.set(side * 6.5, -0.22, 1.0);
    root.add(aileron);
    a.block(aileron, paint, [0, 0, 0.22], [2.4, 0.075, 0.42]);
    ailerons.push(aileron);
    a.mesh(
      root,
      smooth,
      side < 0 ? a.red : a.mat('#406b4d', 0.35),
      [side * 8.16, -0.2, 0.05],
      [0.08, 0.045, 0.13],
    );
    a.mesh(root, smooth, paint, [side * 1.45, 0.04, 5], [1.75, 0.105, 1.03]);
  }
  a.mesh(root, smooth, paint, [0, 1.04, 5.25], [0.105, 1.3, 0.96]).rotation.x =
    -0.28;
  // Connected cockpit shell slopes into the nose; the raised viewpoint stays arcade-friendly.
  for (const side of [-1, 1]) {
    const wall = a.block(
      root,
      paint,
      [side * 1.35, 1.96, -0.02],
      [0.16, 1.6, 3.1],
    );
    wall.rotation.z = side * 0.12;
    a.block(root, black, [side * 1.48, 2.78, -0.15], [0.14, 0.13, 3.4]);
    a.block(root, metal, [side * 1.43, 2.7, -0.15], [0.025, 0.025, 3.25]);
    for (let i = 0; i < 9; i++)
      a.mesh(
        root,
        a.sphere,
        metal,
        [side * 1.49, 2.85, -1.55 + i * 0.35],
        [0.022, 0.014, 0.022],
      );
  }
  function brace(points: number[][], radius = 0.027) {
    for (let i = 1; i < points.length; i++) {
      const from = new THREE.Vector3(...points[i - 1]),
        to = new THREE.Vector3(...points[i]),
        direction = to.clone().sub(from),
        mid = from.clone().add(to).multiplyScalar(0.5);
      const strut = a.mesh(root, a.cylinder, metal, mid.toArray(), [
        radius,
        direction.length(),
        radius,
      ]);
      strut.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );
      a.mesh(root, a.sphere, metal, to.toArray(), [
        radius * 1.1,
        radius * 1.1,
        radius * 1.1,
      ]);
    }
  }
  // Angular armor-glass windshield with slim side pillars, no central aiming obstruction.
  brace([
    [-1.48, 2.8, -1.7],
    [-1.45, 3.1, -1.82],
    [-0.96, 4.95, -2.0],
    [-0.82, 5.02, -2.0],
    [0.82, 5.02, -2.0],
    [0.96, 4.95, -2.0],
    [1.45, 3.1, -1.82],
    [1.48, 2.8, -1.7],
  ]);
  for (const side of [-1, 1])
    brace(
      [
        [side * 0.96, 4.95, -2],
        [side * 1.46, 5.22, 0.2],
        [side * 1.45, 5.08, 2.4],
      ],
      0.022,
    );
  const glazing = a.mat('#c5d6cd', 0.12);
  Object.assign(glazing, {
    transparent: true,
    opacity: 0.022,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glassGeometry = a.geo(new THREE.BufferGeometry());
  glassGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-1.43, 2.9, -1.8, 1.43, 2.9, -1.8, 0.94, 4.95, -2, -0.94, 4.95, -2],
      3,
    ),
  );
  glassGeometry.setIndex([0, 1, 2, 0, 2, 3]);
  glassGeometry.computeVertexNormals();
  a.mesh(root, glassGeometry, glazing, [0, 0, 0], [1, 1, 1]);
  const hoodPositions: number[] = [],
    hoodUV: number[] = [],
    hoodIndices: number[] = [];
  const hoodSections = [
    [-4.8, 0.72, 0.64],
    [-3.5, 1.15, 0.9],
    [-2.45, 2.05, 1.1],
    [-1.72, 2.79, 1.3],
  ];
  for (let row = 0; row < hoodSections.length; row++)
    for (let j = 0; j <= 16; j++) {
      const [z, top, width] = hoodSections[row],
        angle = (j / 16) * Math.PI;
      hoodPositions.push(
        Math.cos(angle) * width,
        top - (1 - Math.sin(angle)) * 0.35,
        z,
      );
      hoodUV.push(j / 16, row / 3);
      if (row < 3 && j < 16) {
        const n = row * 17 + j;
        hoodIndices.push(n, n + 1, n + 17, n + 1, n + 18, n + 17);
      }
    }
  const hoodGeometry = a.geo(new THREE.BufferGeometry());
  hoodGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(hoodPositions, 3),
  );
  hoodGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(hoodUV, 2));
  hoodGeometry.setIndex(hoodIndices);
  hoodGeometry.computeVertexNormals();
  const antiGlare = a.mat('#414b32', 0.87);
  antiGlare.map = a.paint;
  a.mesh(root, hoodGeometry, antiGlare, [0, 0, 0], [1, 1, 1]);
  const cockpit = new THREE.Group();
  root.add(cockpit);
  const panel = a.block(cockpit, black, [0, 2.4, -0.85], [2.5, 0.94, 0.22]);
  panel.name = 'instrument-panel';
  const instruments = instrumentTexture();
  if (instruments) {
    a.textures.add(instruments);
    const face = a.mat('#ffffff', 0.67);
    face.map = instruments;
    a.mesh(
      cockpit,
      a.geo(new THREE.PlaneGeometry(2.4, 0.9)),
      face,
      [0, 2.4, -0.731],
      [1, 1, 1],
    );
  }
  const altitudeNeedle = new THREE.Group();
  altitudeNeedle.position.set(
    (190 / 1024 - 0.5) * 2.4,
    2.4 + (0.5 - 136 / 384) * 0.9,
    -0.718,
  );
  cockpit.add(altitudeNeedle);
  const needlePaint = a.mat('#e1ddbc', 0.8);
  a.block(altitudeNeedle, needlePaint, [0, 0.065, 0], [0.008, 0.15, 0.002]);
  a.mesh(altitudeNeedle, a.sphere, metal, [0, 0, 0.004], [0.012, 0.012, 0.004]);
  a.mesh(
    cockpit,
    a.cylinder,
    a.rubber,
    [0, 2.9, -0.73],
    [0.075, 2.6, 0.075],
  ).rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    a.block(cockpit, black, [side * 1.14, 1.82, 0.45], [0.4, 0.35, 1.7]);
    a.mesh(
      cockpit,
      a.cylinder,
      metal,
      [side * 1.12, 2.12, 0.2],
      [0.022, 0.35, 0.022],
    ).rotation.x = 0.4;
    a.mesh(
      cockpit,
      a.sphere,
      side < 0 ? canvas : a.red,
      [side * 1.12, 2.29, 0.27],
      [0.085, 0.055, 0.08],
    );
  }
  // Compact reflector sight; the gameplay reticle still uses the ballistic solution.
  a.block(root, black, [0, 2.6, -2.04], [0.16, 0.1, 0.2]);
  const sight = a.mesh(
    root,
    a.geo(new THREE.PlaneGeometry(0.35, 0.24)),
    glazing,
    [0, 2.82, -2.16],
    [1, 1, 1],
  );
  sight.rotation.x = -0.12;
  const prop = new THREE.Group();
  prop.position.set(0, -0.48, -6.42);
  root.add(prop);
  const blur = a.mat('#544e35', 0.8);
  Object.assign(blur, {
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
  });
  a.mesh(
    prop,
    a.geo(new THREE.RingGeometry(0.3, 2.28, 80)),
    blur,
    [0, 0, 0],
    [1, 1, 1],
  );
  const tipBlur = a.mat('#c4b66d', 0.7);
  Object.assign(tipBlur, {
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
  });
  a.mesh(
    prop,
    a.geo(new THREE.RingGeometry(2.13, 2.28, 80)),
    tipBlur,
    [0, 0, -0.005],
    [1, 1, 1],
  );
  a.mesh(root, smooth, metal, [0, -0.48, -6.52], [0.34, 0.34, 0.47]);
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
  // Static airframe fittings share draws; moving racks, prop and instruments stay independent.
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of root.children.slice()) {
    if (
      !(child instanceof THREE.Mesh) ||
      Array.isArray(child.material) ||
      child.material.transparent
    )
      continue;
    child.updateMatrix();
    const geometry = child.geometry.clone().applyMatrix4(child.matrix);
    const group = batches.get(child.material) ?? [];
    group.push(geometry);
    batches.set(child.material, group);
    root.remove(child);
  }
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    if (merged) root.add(new THREE.Mesh(a.geo(merged), material));
    geometries.forEach((geometry) => geometry.dispose());
  }
  root.traverse((object) => {
    if (
      object instanceof THREE.Mesh &&
      !Array.isArray(object.material) &&
      !object.material.transparent
    ) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return { root, prop, gunNodes, bombs, cockpit, ailerons, altitudeNeedle };
}
