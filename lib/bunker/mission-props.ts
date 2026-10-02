import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { chargeSites } from './simulation';
import { worldUV } from './detail';

/** Props use the same metre-scale collision footprint as the mission layout. */
export function addMissionProps(
  scene: T.Scene,
  metal: T.Material,
  dark: T.Material,
  wood: T.Material,
) {
  const weave = document.createElement('canvas');
  weave.width = weave.height = 256;
  const ctx = weave.getContext('2d')!;
  ctx.fillStyle = '#a4a28d';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 256; i += 2) {
    ctx.fillStyle = i % 4 ? '#8d8a74' : '#b8b49b';
    ctx.fillRect(i, 0, 1, 256);
    ctx.globalAlpha = 0.35;
    ctx.fillRect(0, i, 256, 1);
    ctx.globalAlpha = 1;
  }
  const fabricTexture = new T.CanvasTexture(weave);
  fabricTexture.colorSpace = T.SRGBColorSpace;
  fabricTexture.wrapS = fabricTexture.wrapT = T.RepeatWrapping;
  fabricTexture.repeat.set(5, 5);
  const fabric = new T.MeshStandardMaterial({
    map: fabricTexture,
    bumpMap: fabricTexture,
    bumpScale: 0.006,
    color: '#666652',
    roughness: 1,
  });
  const linen = new T.MeshStandardMaterial({ color: '#b3ac92', roughness: 1 });
  const dial = new T.MeshStandardMaterial({
    color: '#bcaa76',
    emissive: '#bda358',
    emissiveIntensity: 0.65,
  });
  function box(
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: T.Material,
  ) {
    const mesh = new T.Mesh(
      new RoundedBoxGeometry(w, h, d, 2, Math.min(0.025, w / 8, h / 8, d / 8)),
      material,
    );
    worldUV(mesh.geometry);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  const packageModel = () => {
    const group = new T.Group();
    box(group, 0, 0, 0, 0.42, 0.28, 0.16, fabric);
    for (const x of [-0.14, 0.14])
      box(group, x, 0, 0, 0.045, 0.295, 0.175, linen);
    box(group, 0, 0.04, 0.1, 0.12, 0.085, 0.04, dark);
    box(group, 0, 0.19, 0, 0.16, 0.045, 0.06, fabric);
    return group;
  };
  const charges = chargeSites.map((site) => {
    const group = packageModel();
    group.position.set(site.x, site.y, site.z + 0.06);
    scene.add(group);
    return group;
  });
  const held = packageModel();
  held.scale.setScalar(0.7);
  held.position.set(0.23, -0.32, -0.65);
  held.rotation.y = -0.12;
  for (const site of chargeSites) {
    box(scene, site.x, 0.13, -54.8, 2.2, 0.26, 1.2, dark);
    box(scene, site.x, 1.15, -54.8, 2.1, 2, 1.1, metal);
    for (const y of [0.55, 1.2, 1.85]) {
      box(scene, site.x, y, -54.23, 1.9, 0.55, 0.035, dark);
      box(scene, site.x - 0.35, y + 0.1, -54.195, 0.5, 0.18, 0.03, dial);
      for (let i = 0; i < 5; i++) {
        const knob = new T.Mesh(
          new T.CylinderGeometry(0.055, 0.055, 0.06, 12),
          dark,
        );
        knob.rotation.x = Math.PI / 2;
        knob.position.set(site.x - 0.7 + i * 0.34, y - 0.12, -54.15);
        scene.add(knob);
      }
    }
    for (let i = 0; i < 11; i++)
      box(scene, site.x - 0.83 + i * 0.16, 2.08, -54.8, 0.06, 0.04, 0.7, dark);
    // Exposed conduit and cable trays lead into the underground communications network.
    box(scene, site.x, 2.8, -55.65, 0.08, 1.6, 0.08, dark);
  }
  box(scene, 0, 3.55, -55.6, 7.8, 0.1, 0.18, metal);
  for (const x of [16, 22])
    for (const z of [-14, -19.5]) {
      for (const y of [0.48, 1.4]) {
        box(scene, x, y, z, 1.4, 0.12, 2.2, metal);
        box(scene, x, y + 0.12, z, 1.3, 0.18, 2.1, fabric);
        box(scene, x, y + 0.24, z - 0.7, 1.05, 0.15, 0.45, linen);
        box(scene, x, y + 0.22, z + 0.4, 1.32, 0.03, 1.2, fabric);
      }
      for (const dx of [-0.66, 0.66])
        for (const dz of [-1, 1])
          box(scene, x + dx, 0.86, z + dz, 0.045, 1.72, 0.045, metal);
    }
  for (const x of [16, 22]) {
    box(scene, x, 0.7, -28, 1.4, 0.15, 2.4, metal);
    box(scene, x, 0.82, -28, 1.35, 0.15, 2.3, linen);
    box(scene, x, 0.97, -28.8, 1, 0.12, 0.45, fabric);
    for (const z of [-27.1, -28.9])
      box(scene, x, 0.35, z, 1.1, 0.7, 0.05, metal);
  }
  for (const z of [-39.5, -41, -42.5, -44])
    for (const y of [0.4, 1, 1.6]) {
      box(scene, 21.97, y, z, 0.08, 0.5, 1.35, metal);
      box(scene, 21.9, y + 0.05, z, 0.08, 0.07, 0.25, dark);
      box(scene, 21.91, y + 0.16, z, 0.02, 0.08, 0.32, linen);
    }
  const supplies = [
    [19, -33.5],
    [17, -44.5],
  ].map(([x, z]) => {
    const group = new T.Group();
    box(group, 0, 0.2, 0, 0.65, 0.4, 0.5, wood);
    box(group, 0, 0.415, 0, 0.38, 0.025, 0.12, linen);
    box(group, 0, 0.418, 0, 0.12, 0.025, 0.38, linen);
    group.position.set(x, 0, z);
    scene.add(group);
    return group;
  });
  return { charges, held, supplies };
}
