import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { worldUV } from './detail';
import { rooms, solids, doorLayouts } from './simulation';

/** Real silhouette and shadow geometry; no flat decals stand in for these fixtures. */
export function addBunkerArchitecture(
  scene: T.Scene,
  concrete: T.Material,
  steel: T.Material,
  dark: T.Material,
  brass: T.Material,
) {
  const fixtures: T.Mesh[] = [];
  const mesh = (
    geometry: T.BufferGeometry,
    material: T.Material,
    x: number,
    y: number,
    z: number,
  ) => {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    fixtures.push(m);
    return m;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: T.Material,
  ) =>
    mesh(
      worldUV(
        new RoundedBoxGeometry(w, h, d, 3, Math.min(0.06, w / 6, h / 6, d / 6)),
      ),
      mat,
      x,
      y,
      z,
    );
  const tube = (points: T.Vector3[], radius: number, material: T.Material) =>
    mesh(
      new T.TubeGeometry(new T.CatmullRomCurve3(points), 32, radius, 12, false),
      material,
      0,
      0,
      0,
    );
  // Barrel vault: an actual curved intrados, plus proud ribs and haunches. The
  // geometry stays above head height and within the corridor's existing walls.
  function arch(
    outerX: number,
    outerY: number,
    innerX: number,
    innerY: number,
    depth: number,
    z: number,
    mat: T.Material,
    centerX = 0,
    spring = 2.25,
  ) {
    const shape = new T.Shape();
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI - (i * Math.PI) / 40,
        x = Math.cos(a) * outerX,
        y = spring + Math.sin(a) * outerY;
      if (i === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    for (let i = 0; i <= 40; i++) {
      const a = (i * Math.PI) / 40;
      shape.lineTo(Math.cos(a) * innerX, spring + Math.sin(a) * innerY);
    }
    shape.closePath();
    mesh(
      worldUV(
        new T.ExtrudeGeometry(shape, {
          depth,
          bevelEnabled: true,
          bevelSegments: 2,
          steps: 1,
          bevelSize: 0.015,
          bevelThickness: 0.015,
          curveSegments: 24,
        }),
      ),
      mat,
      centerX,
      0,
      z,
    );
  }
  arch(2.02, 1.15, 1.78, 0.94, 11.8, -9.9, concrete);
  for (const z of [1.65, -1, -4, -7, -9.65]) {
    arch(1.81, 0.98, 1.66, 0.84, 0.24, z, concrete);
    for (const x of [-1.73, 1.73])
      box(x, 1.15, z + 0.12, 0.18, 2.3, 0.27, concrete);
  }
  // Room-scale vaults replace the flat-box silhouette throughout the interior.
  // Spring lines stay above a standing person's head; the existing passages
  // remain clear, including the 2.9 m blast doors and the gun embrasure.
  for (const r of rooms.filter((r) => r.w >= 8 && r.d >= 8)) {
    const spring = r.h - 1.15,
      half = r.w / 2 - 0.16;
    arch(
      half + 0.12,
      1.25,
      half - 0.08,
      1.08,
      r.d - 0.5,
      r.z - r.d / 2 + 0.25,
      concrete,
      r.x,
      spring,
    );
    for (let z = r.z - r.d / 2 + 1.1; z < r.z + r.d / 2 - 0.5; z += 3.4) {
      arch(half - 0.06, 1.08, half - 0.3, 0.87, 0.3, z, concrete, r.x, spring);
      // Haunch blocks are high enough not to intrude into movement or doors.
      for (const side of [-1, 1])
        box(
          r.x + side * (half - 0.12),
          spring - 0.14,
          z + 0.15,
          0.3,
          0.38,
          0.43,
          concrete,
        );
    }
  }
  // Deep, curved concrete reveals frame the first tunnel, visible from spawn.
  arch(2.32, 1.23, 1.73, 0.87, 0.85, 1.72, concrete, 0, 2.23);
  for (const x of [-2.03, 2.03]) box(x, 1.13, 2.16, 0.54, 2.26, 0.88, concrete);
  // Substantial jambs and rounded lintels give every working blast door depth.
  for (const door of doorLayouts) {
    for (const side of [-1, 1])
      box(door.x + side * 1.61, 1.46, door.z, 0.3, 2.92, 0.68, concrete);
    box(door.x, 3.02, door.z, 3.5, 0.22, 0.68, concrete);
  }
  // Raised cast-concrete skirtings and wall courses catch raking light. They
  // follow actual wall segments rather than spanning across openings.
  for (const wall of solids.filter(
    (w) => !w.kind && w.y - w.h / 2 < 0.1 && (w.w < 1 || w.d < 1),
  )) {
    const alongZ = wall.w < 1;
    for (const side of [-1, 1]) {
      const x = wall.x + (alongZ ? side * (wall.w / 2 + 0.025) : 0);
      const z = wall.z + (alongZ ? 0 : side * (wall.d / 2 + 0.025));
      box(
        x,
        0.18,
        z,
        alongZ ? 0.09 : wall.w,
        0.36,
        alongZ ? wall.d : 0.09,
        concrete,
      );
      box(
        x,
        1.22,
        z,
        alongZ ? 0.065 : wall.w,
        0.1,
        alongZ ? wall.d : 0.065,
        concrete,
      );
    }
  }
  // Eye-level service manifolds: curved elbows, valve wheels and collars.
  // Mounted close to the right wall, within its existing player clearance.
  for (const r of rooms.filter((r) => r.w >= 8)) {
    const x = r.x + r.w / 2 - 0.36,
      z = r.z + r.d * 0.22;
    tube(
      [
        new T.Vector3(x, 0.2, z),
        new T.Vector3(x, 1.65, z),
        new T.Vector3(x, 1.92, z - 0.25),
        new T.Vector3(x, 1.92, z - 1.7),
      ],
      0.095,
      steel,
    );
    for (const height of [0.48, 1.1, 1.53]) {
      const collar = mesh(
        new T.CylinderGeometry(0.125, 0.125, 0.075, 20),
        dark,
        x,
        height,
        z,
      );
      collar.rotation.y = 0.1;
    }
    const wheel = mesh(
      new T.TorusGeometry(0.24, 0.025, 10, 32),
      brass,
      x - 0.12,
      1.12,
      z,
    );
    wheel.rotation.y = Math.PI / 2;
    const hub = mesh(
      new T.CylinderGeometry(0.065, 0.065, 0.2, 16),
      dark,
      x - 0.05,
      1.12,
      z,
    );
    hub.rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const spoke = box(x - 0.12, 1.12, z, 0.028, 0.45, 0.028, steel);
      spoke.rotation.x = (i * Math.PI) / 4;
    }
  }
  // Large overhead extraction duct with cylindrical seams, elbows and brackets.
  for (const r of rooms.filter((r) => r.w >= 8)) {
    const x = r.x + r.w / 2 - 0.65,
      y = r.h - 1.0;
    const duct = mesh(
      new T.CylinderGeometry(0.24, 0.24, r.d - 1, 24, 1),
      steel,
      x,
      y,
      r.z,
    );
    duct.rotation.x = Math.PI / 2;
    for (let z = r.z - r.d / 2 + 1; z < r.z + r.d / 2 - 0.3; z += 2) {
      const flange = mesh(
        new T.TorusGeometry(0.255, 0.025, 8, 28),
        dark,
        x,
        y,
        z,
      );
      flange.rotation.z = 0.15;
      box(x, y + 0.3, z, 0.055, 0.65, 0.08, steel);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        mesh(
          new T.SphereGeometry(0.024, 6, 4),
          brass,
          x + Math.cos(a) * 0.26,
          y + Math.sin(a) * 0.26,
          z + 0.035,
        );
      }
    }
    tube(
      [
        new T.Vector3(x, y, r.z + r.d / 2 - 0.6),
        new T.Vector3(x, y - 0.16, r.z + r.d / 2 - 0.35),
        new T.Vector3(x, y - 0.75, r.z + r.d / 2 - 0.35),
      ],
      0.24,
      steel,
    );
  }
  // Rounded gun-mount sandbags occupy the existing gun collision footprint.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#a09170';
  c.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 128; i += 2) {
    c.fillStyle = i % 4 ? '#8a7d61' : '#b0a07a';
    c.fillRect(i, 0, 1, 128);
    c.globalAlpha = 0.35;
    c.fillRect(0, i, 128, 1);
    c.globalAlpha = 1;
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  const sack = new T.MeshStandardMaterial({
    map: texture,
    bumpMap: texture,
    bumpScale: 0.009,
    roughness: 1,
    color: '#bbb298',
  });
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 5; i++) {
      const bag = mesh(
        new T.SphereGeometry(1, 16, 10),
        sack,
        -6.22 + row * 0.05,
        0.24 + row * 0.32,
        7.25 + i * 0.55 + (row % 2) * 0.13,
      );
      bag.scale.set(0.34, 0.2, 0.34);
      bag.rotation.y = i * 0.17;
      mesh(
        new T.TorusGeometry(0.22, 0.009, 6, 20),
        sack,
        -6.22,
        0.24 + row * 0.32,
        7.25 + i * 0.55,
      ).rotation.x = Math.PI / 2;
    }
  // Recessed circular vents create a deep silhouette against the concrete wall.
  for (const [x, z, y] of [
    [4.1, 1.69, 3.3],
    [-3, -24.31, 2.7],
    [2, -55.69, 3.15],
    [22, -47.69, 2.8],
  ]) {
    const backing = mesh(
      new T.CylinderGeometry(0.36, 0.36, 0.13, 32),
      dark,
      x,
      y,
      z,
    );
    backing.rotation.x = Math.PI / 2;
    mesh(new T.TorusGeometry(0.35, 0.045, 10, 36), steel, x, y, z + 0.1);
    for (let i = 0; i < 7; i++)
      box(
        x,
        y - 0.23 + i * 0.078,
        z + 0.16,
        Math.sqrt(0.3 * 0.3 - Math.pow(-0.23 + i * 0.078, 2)) * 2,
        0.023,
        0.1,
        steel,
      );
  }
  // Irregular chunks break the perfectly planar lower wall silhouette without
  // putting obstacles into the walkway or changing its collision envelope.
  const rockGeometry = new T.IcosahedronGeometry(1, 1);
  for (const r of rooms.filter((r) => r.w >= 8))
    for (let i = 0; i < 12; i++) {
      const side = i % 2 ? 1 : -1;
      const m = mesh(
        rockGeometry,
        concrete,
        r.x + side * (r.w / 2 - 0.3),
        0.1,
        r.z - r.d / 2 + 0.8 + ((i * 0.77) % (r.d - 1.6)),
      );
      m.scale.set(0.07 + (i % 3) * 0.025, 0.07 + (i % 4) * 0.018, 0.12);
      m.rotation.set(i * 0.7, i * 0.4, i * 0.2);
    }
  // Static fixtures share a handful of draw calls even on mobile. Their curved
  // silhouette does not require hundreds of separately submitted meshes.
  const batches = new Map<T.Material, T.Mesh[]>();
  for (const fixture of fixtures) {
    const material = fixture.material as T.Material;
    const batch = batches.get(material);
    if (batch) batch.push(fixture);
    else batches.set(material, [fixture]);
  }
  const originals = new Set<T.BufferGeometry>();
  for (const [material, batch] of batches) {
    const transformed = batch.map((fixture) => {
      fixture.updateMatrixWorld(true);
      const geometry = fixture.geometry.index
        ? fixture.geometry.toNonIndexed()
        : fixture.geometry.clone();
      geometry.applyMatrix4(fixture.matrixWorld);
      return geometry;
    });
    const geometry = mergeGeometries(transformed);
    transformed.forEach((g) => g.dispose());
    if (!geometry) continue;
    const combined = new T.Mesh(geometry, material);
    combined.castShadow = combined.receiveShadow = true;
    scene.add(combined);
    for (const fixture of batch) {
      originals.add(fixture.geometry);
      fixture.removeFromParent();
    }
  }
  originals.forEach((g) => g.dispose());
}
