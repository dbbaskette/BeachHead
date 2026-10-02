import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { worldUV } from './detail';
import { doorLayouts } from './simulation';
import type { BunkerEquipment } from './equipment';

/** Machinery is assembled to human scale; all movable door parts share one transform. */
export function addExpansion(
  scene: T.Scene,
  metal: T.Material,
  dark: T.Material,
  brass: T.Material,
  equipment: BunkerEquipment,
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
    const mesh = new T.Mesh(
      worldUV(
        new RoundedBoxGeometry(
          w,
          h,
          d,
          3,
          Math.min(0.025, w / 6, h / 6, d / 6),
        ),
      ),
      mat,
    );
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
  const doors = doorLayouts.map(({ x: originX, z }) => {
    const group = new T.Group();
    group.position.set(originX, 0, z);
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
      const wheel = new T.Mesh(new T.TorusGeometry(0.24, 0.025, 10, 32), dark);
      wheel.position.set(-0.72, 1.25, side * 0.25);
      group.add(wheel);
      for (let i = 0; i < 5; i++) {
        const spoke = box(
          group,
          -0.72,
          1.25,
          side * 0.25,
          0.45,
          0.025,
          0.025,
          metal,
        );
        spoke.rotation.z = (i * Math.PI) / 5;
      }
      cylinder(group, -0.72, 1.25, side * 0.26, 0.07, 0.17, brass, 'z');
      box(group, 0, 2.2, side * 0.11, 0.5, 0.22, 0.04, dark);
      for (const x of [-1.3, 1.3])
        box(group, x, 1.45, side * 0.11, 0.04, 2.72, 0.045, dark);
    }
    for (const x of [-1.48, 1.48])
      box(scene, originX + x, 1.5, z, 0.14, 3.1, 0.4, dark);
    box(scene, originX, 3.04, z, 3.25, 0.12, 0.42, metal);
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
    const radio = equipment.radio(0.92, 0.65, 1.05);
    radio.position.set(-2.8, 1.01, z);
    radio.rotation.y = Math.PI / 2;
    scene.add(radio);
  }
  // Diesel generator, flywheel, cylinder heads, fuel lines, exhaust and switchgear.
  box(scene, 3, 0.18, -37, 2.2, 0.35, 3.8, dark);
  const engine = new T.Group();
  equipment.rod(
    engine,
    [3, 0.8, -38.3],
    [3, 0.8, -35.75],
    0.58,
    equipment.enamel,
    0.53,
    32,
  );
  equipment.box(engine, [3, 0.42, -37], [1.2, 0.28, 2.8], dark, 0.1);
  for (let i = 0; i < 6; i++) {
    const z = -38.1 + i * 0.43;
    equipment.rod(
      engine,
      [3, 0.95, z],
      [3, 1.53, z],
      0.24,
      equipment.enamel,
      0.22,
      24,
    );
    equipment.box(
      engine,
      [3, 1.54, z],
      [0.82, 0.22, 0.34],
      equipment.enamel,
      0.08,
    );
    equipment.tube(
      engine,
      [
        [2.6, 1.5, z],
        [2.38, 1.4, z],
        [2.35, 1.05, z - 0.07],
      ],
      0.035,
      brass,
    );
    equipment.tube(
      engine,
      [
        [3.4, 1.44, z],
        [3.63, 1.4, z],
        [3.67, 1.12, z],
      ],
      0.085,
      dark,
    );
  }
  equipment.rod(engine, [3.67, 1.12, -38.3], [3.67, 1.12, -35.8], 0.115, dark);
  scene.add(equipment.finish(engine));
  cylinder(scene, 3, 0.9, -35.4, 0.63, 0.3, dark, 'z');
  cylinder(scene, 3, 0.9, -35.2, 0.18, 0.15, brass, 'z');
  for (let i = 0; i < 6; i++) {
    const z = -38.1 + i * 0.43;
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
  for (const z of [-34, -40]) {
    const drum = equipment.barrel();
    drum.position.set(3.8, 0, z);
    scene.add(drum);
  }
  return doors;
}
