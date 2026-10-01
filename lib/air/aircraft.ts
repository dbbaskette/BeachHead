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
  // A continuous cockpit tub, rather than rails floating above the fuselage.
  const interior = a.mat('#424c3d', 0.87),
    trim = a.mat('#181f1b', 0.92);
  interior.map = a.paint;
  const cockpit = new THREE.Group();
  root.add(cockpit);
  for (const side of [-1, 1]) {
    const wall = a.block(
      root,
      interior,
      [side * 1.64, 1.75, 1.25],
      [0.28, 1.8, 4.2],
    );
    wall.rotation.z = side * 0.15;
    a.block(root, trim, [side * 1.78, 2.64, 1.3], [0.23, 0.2, 4.25]);
    a.block(root, metal, [side * 1.68, 2.66, 1.3], [0.028, 0.03, 4.1]);
    for (let n = 0; n < 8; n++)
      a.mesh(
        root,
        a.sphere,
        metal,
        [side * 1.79, 2.75, -0.5 + n * 0.48],
        [0.022, 0.016, 0.022],
      );
    // Side consoles, throttle quadrant, levers and wiring stay inside the tub.
    a.block(cockpit, interior, [side * 1.38, 1.92, 2.12], [0.58, 0.48, 1.9]);
    a.block(cockpit, trim, [side * 1.4, 2.19, 2], [0.48, 0.045, 1.5]);
    for (let n = 0; n < 3; n++) {
      const lever = a.mesh(
        cockpit,
        a.cylinder,
        metal,
        [side * (1.28 + n * 0.09), 2.39, 1.6],
        [0.015, 0.38, 0.015],
      );
      lever.rotation.x = 0.32;
      a.mesh(
        cockpit,
        a.sphere,
        n === 0 ? black : n === 1 ? canvas : a.red,
        [side * (1.28 + n * 0.09), 2.56, 1.66],
        [0.047, 0.035, 0.055],
      );
    }
    for (let n = 0; n < 4; n++)
      a.block(
        cockpit,
        metal,
        [side * 1.39, 2.24, 2.1 + n * 0.2],
        [0.035, 0.08, 0.035],
      );
  }
  function brace(
    points: number[][],
    radius = 0.048,
    material: THREE.Material = interior,
  ) {
    for (let i = 1; i < points.length; i++) {
      const from = new THREE.Vector3(...points[i - 1]),
        to = new THREE.Vector3(...points[i]),
        direction = to.clone().sub(from),
        mid = from.clone().add(to).multiplyScalar(0.5);
      const strut = a.mesh(root, a.cylinder, material, mid.toArray(), [
        radius,
        direction.length(),
        radius,
      ]);
      strut.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        direction.normalize(),
      );
      a.mesh(root, a.sphere, material, to.toArray(), [
        radius * 1.1,
        radius * 1.1,
        radius * 1.1,
      ]);
    }
  }
  const glazing = a.mat('#b6ceca', 0.12);
  Object.assign(glazing, {
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  function windowPane(points: number[][]) {
    const geometry = a.geo(new THREE.BufferGeometry());
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(points.flat(), 3),
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    a.mesh(root, geometry, glazing, [0, 0, 0], [1, 1, 1]);
  }
  // Front armored pane and angled quarter windows connect to the canopy above the pilot.
  const lower = 2.55,
    upper = 5.65;
  brace(
    [
      [-1.35, lower, -0.65],
      [-0.98, upper, -0.9],
      [0.98, upper, -0.9],
      [1.35, lower, -0.65],
    ],
    0.055,
  );
  windowPane([
    [-1.35, lower, -0.65],
    [1.35, lower, -0.65],
    [0.98, upper, -0.9],
    [-0.98, upper, -0.9],
  ]);
  for (const side of [-1, 1]) {
    brace(
      [
        [side * 1.35, lower, -0.65],
        [side * 1.92, 2.65, 2.8],
      ],
      0.065,
      trim,
    );
    brace(
      [
        [side * 0.98, upper, -0.9],
        [side * 1.78, 5.42, 2.2],
        [side * 1.92, 2.65, 2.8],
      ],
      0.055,
    );
    windowPane([
      [side * 1.35, lower, -0.65],
      [side * 1.92, 2.65, 2.8],
      [side * 1.78, 5.42, 2.2],
      [side * 0.98, upper, -0.9],
    ]);
    for (const z of [-0.45, 0.3, 1.1, 1.9])
      a.mesh(
        root,
        a.sphere,
        metal,
        [side * (1.38 + (z + 0.45) * 0.17), 2.72, z],
        [0.022, 0.02, 0.022],
      );
  }
  brace(
    [
      [-1.78, 5.42, 2.2],
      [-1, 5.98, 2.4],
      [0, 6.1, 2.45],
      [1, 5.98, 2.4],
      [1.78, 5.42, 2.2],
    ],
    0.075,
    trim,
  );
  // Rounded nose skin reaches all the way back to the windshield sill.
  const hoodPositions: number[] = [],
    hoodUV: number[] = [],
    hoodIndices: number[] = [];
  const hoodSections = [
    [-5.8, 0.52, 0.82],
    [-4.5, 0.79, 1.03],
    [-2.8, 1.6, 1.16],
    [-0.65, 2.53, 1.39],
    [0.8, 2.7, 1.68],
  ];
  for (let row = 0; row < hoodSections.length; row++)
    for (let j = 0; j <= 24; j++) {
      const [z, top, width] = hoodSections[row],
        angle = (j / 24) * Math.PI;
      hoodPositions.push(
        Math.cos(angle) * width,
        top - (1 - Math.sin(angle)) * 0.48,
        z,
      );
      hoodUV.push(j / 24, row / 4);
      if (row < hoodSections.length - 1 && j < 24) {
        const n = row * 25 + j;
        hoodIndices.push(n, n + 1, n + 25, n + 1, n + 26, n + 25);
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
  const antiGlare = a.mat('#3c452e', 0.91);
  antiGlare.map = a.paint;
  a.mesh(root, hoodGeometry, antiGlare, [0, 0, 0], [1, 1, 1]);
  // Broad, curved bulkhead with an opaque lower panel and padded glare shield.
  const panelShape = new THREE.Shape();
  panelShape.moveTo(-1.7, -1.05);
  panelShape.lineTo(-1.7, 0.32);
  panelShape.quadraticCurveTo(-1.5, 0.9, 0, 0.9);
  panelShape.quadraticCurveTo(1.5, 0.9, 1.7, 0.32);
  panelShape.lineTo(1.7, -1.05);
  panelShape.closePath();
  const panel = a.mesh(
    root,
    a.geo(
      new THREE.ExtrudeGeometry(panelShape, {
        depth: 0.16,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.035,
        bevelSegments: 2,
        steps: 1,
      }),
    ),
    trim,
    [0, 1.98, 1.05],
    [1, 1, 1],
  );
  panel.name = 'instrument-bulkhead';
  brace(
    [
      [-1.73, 2.3, 1.2],
      [-1.45, 2.7, 1.2],
      [-0.75, 2.86, 1.2],
      [0, 2.89, 1.2],
      [0.75, 2.86, 1.2],
      [1.45, 2.7, 1.2],
      [1.73, 2.3, 1.2],
    ],
    0.085,
    trim,
  );
  const instruments = instrumentTexture();
  if (instruments) {
    a.textures.add(instruments);
    const face = a.mat('#ffffff', 0.8);
    face.map = instruments;
    a.mesh(
      cockpit,
      a.geo(new THREE.PlaneGeometry(2.95, 1.10625)),
      face,
      [0, 2.04, 1.255],
      [1, 1, 1],
    );
  }
  const attitude = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { bank: { value: 0 }, pitch: { value: 0 } },
    vertexShader:
      'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float bank;uniform float pitch;
      void main(){vec2 p=vUv*2.-1.;if(dot(p,p)>1.)discard;
        vec2 q=mat2(cos(bank),sin(bank),-sin(bank),cos(bank))*p;
        float horizon=q.y+pitch*3.;vec3 color=mix(vec3(.24,.12,.055),vec3(.13,.32,.43),smoothstep(-.012,.012,horizon));
        float line=(1.-smoothstep(.012,.025,abs(horizon)))*(1.-smoothstep(.78,.92,abs(q.x)));
        float ladder=(1.-smoothstep(.005,.015,abs(abs(horizon)-.27)))*(1.-smoothstep(.2,.26,abs(q.x)));
        color=mix(color,vec3(.72,.76,.68),max(line,ladder)*.9);
        float wings=(1.-smoothstep(.012,.025,abs(p.y)))*smoothstep(.08,.10,abs(p.x))*(1.-smoothstep(.47,.5,abs(p.x)));
        float hub=1.-smoothstep(.028,.045,length(p));color=mix(color,vec3(.94,.65,.17),max(wings,hub));
        color*=1.-dot(p,p)*.17;gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  a.materials.add(attitude);
  a.mesh(
    cockpit,
    a.geo(new THREE.PlaneGeometry(0.43, 0.43)),
    attitude,
    [(540 / 1024 - 0.5) * 2.95, 2.04 + (0.5 - 136 / 384) * 1.10625, 1.274],
    [1, 1, 1],
  );
  const altitudeNeedle = new THREE.Group();
  altitudeNeedle.position.set(
    (190 / 1024 - 0.5) * 2.95,
    2.04 + (0.5 - 136 / 384) * 1.10625,
    1.27,
  );
  cockpit.add(altitudeNeedle);
  a.block(
    altitudeNeedle,
    a.mat('#e1ddbc', 0.8),
    [0, 0.08, 0],
    [0.009, 0.18, 0.003],
  );
  a.mesh(altitudeNeedle, a.sphere, metal, [0, 0, 0.004], [0.015, 0.015, 0.004]);
  // Reflector sight has a glass plate, metal clips, projector lens and supporting arm.
  a.block(root, trim, [0, 2.67, 0.1], [0.26, 0.19, 0.35]);
  a.mesh(root, a.cylinder, black, [0, 2.83, 0.04], [0.105, 0.045, 0.105]);
  const lens = a.mat('#95b5a5', 0.16);
  a.mesh(root, a.cylinder, lens, [0, 2.86, 0.04], [0.077, 0.008, 0.077]);
  for (const side of [-1, 1])
    a.block(root, metal, [side * 0.155, 2.99, -0.03], [0.023, 0.28, 0.028]);
  windowPane([
    [-0.15, 2.96, -0.055],
    [0.15, 2.96, -0.055],
    [0.15, 3.18, -0.09],
    [-0.15, 3.18, -0.09],
  ]);
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
    const geometry = (
      child.geometry.index
        ? child.geometry.toNonIndexed()
        : child.geometry.clone()
    ).applyMatrix4(child.matrix);
    const group = batches.get(child.material) ?? [];
    group.push(geometry);
    batches.set(child.material, group);
    root.remove(child);
  }
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    geometries.forEach((geometry) => geometry.dispose());
    if (!merged) throw new Error('Aircraft geometry could not be assembled');
    root.add(new THREE.Mesh(a.geo(merged), material));
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
  return {
    root,
    prop,
    gunNodes,
    bombs,
    cockpit,
    ailerons,
    altitudeNeedle,
    attitude,
  };
}
