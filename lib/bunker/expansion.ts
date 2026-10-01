import * as T from 'three';
import { doorLayouts } from './simulation';

/** Machinery is assembled to human scale; all movable door parts share one transform. */
export function addExpansion(
  scene: T.Scene,
  metal: T.Material,
  dark: T.Material,
  brass: T.Material,
) {
  const box = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: T.Material,
  ) => {
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const cylinder = (
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    mat: T.Material,
    axis = 'y',
  ) => {
    const mesh = new T.Mesh(new T.CylinderGeometry(r, r, h, 16), mat);
    mesh.position.set(x, y, z);
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const doors = doorLayouts.map(({ z }) => {
    const group = new T.Group();
    group.position.z = z;
    scene.add(group);
    box(group, 0, 1.45, 0, 2.8, 2.9, 0.18, metal);
    for (const y of [0.22, 1.45, 2.7])
      box(group, 0, y, 0.11, 2.55, 0.1, 0.08, dark);
    for (const x of [-1.12, 1.12]) {
      box(group, x, 1.45, 0.12, 0.08, 2.65, 0.08, dark);
      for (let y = 0.35; y < 2.7; y += 0.38)
        cylinder(group, x, y, 0.19, 0.025, 0.06, brass, 'z');
    }
    for (const side of [-1, 1]) {
      box(group, -0.9, 1.3, side * 0.22, 0.07, 0.38, 0.08, brass);
      box(group, 0, 2.2, side * 0.11, 0.5, 0.22, 0.04, dark);
    }
    for (const x of [-1.48, 1.48]) box(scene, x, 1.5, z, 0.14, 3.1, 0.4, dark);
    box(scene, 0, 3.04, z, 3.25, 0.12, 0.42, metal);
    return group;
  });
  // Radio rack: steel faceplates, Bakelite knobs, warm dial windows and ventilation.
  const dial = new T.MeshStandardMaterial({
    color: '#c0a775',
    emissive: '#df9e4d',
    emissiveIntensity: 0.3,
    roughness: 0.5,
  });
  for (const z of [-27, -28.2, -29.4]) {
    box(scene, -2.8, 1.3, z, 1.1, 0.65, 0.95, metal);
    box(scene, -2.23, 1.3, z, 0.035, 0.52, 0.8, dark);
    box(scene, -2.205, 1.45, z, 0.025, 0.15, 0.43, dial);
    for (let j = 0; j < 4; j++) {
      const knob = cylinder(
        scene,
        -2.16,
        1.15,
        z - 0.3 + j * 0.2,
        0.055,
        0.07,
        dark,
        'z',
      );
      knob.rotation.set(0, 0, Math.PI / 2);
    }
    for (let j = 0; j < 8; j++)
      box(scene, -2.8, 1.638, z - 0.32 + j * 0.09, 0.7, 0.01, 0.025, dark);
  }
  // Diesel generator, flywheel, cylinder heads, fuel lines, exhaust and switchgear.
  box(scene, 3, 0.18, -37, 2.2, 0.35, 3.8, dark);
  box(scene, 3, 0.83, -37, 1.3, 1, 2.8, metal);
  cylinder(scene, 3, 0.9, -35.4, 0.63, 0.3, dark, 'z');
  cylinder(scene, 3, 0.9, -35.2, 0.18, 0.15, brass, 'z');
  for (let i = 0; i < 6; i++) {
    const z = -38.1 + i * 0.43;
    box(scene, 3, 1.48, z, 1.15, 0.25, 0.33, metal);
    cylinder(scene, 2.5, 1.7, z, 0.055, 0.45, brass);
    for (const x of [2.53, 3.47])
      cylinder(scene, x, 1.64, z, 0.038, 0.12, dark);
  }
  cylinder(scene, 3.7, 2.3, -38.2, 0.12, 2.1, dark);
  cylinder(scene, 3.7, 3.3, -36.7, 0.12, 3, dark, 'z');
  box(scene, -4.55, 1.6, -37, 0.28, 2.4, 2.6, metal);
  for (const z of [-36.3, -37, -37.7]) {
    box(scene, -4.38, 2.15, z, 0.04, 0.27, 0.38, dial);
    box(scene, -4.32, 1.35, z, 0.18, 0.5, 0.08, dark);
  }
  for (const z of [-34, -40]) cylinder(scene, 3.8, 0.65, z, 0.42, 1.3, metal);
  return doors;
}
