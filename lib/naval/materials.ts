import { assetUrl } from '../asset-url';
import * as THREE from 'three';

/** Per-scene ownership: textures and shared materials survive replay, then dispose together. */
export function createNavalMaterials() {
  const textures: THREE.Texture[] = [];
  const texture = (canvas: HTMLCanvasElement, color = false) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    textures.push(t);
    return t;
  };
  const paint = document.createElement('canvas');
  paint.width = paint.height = 1024;
  const ctx = paint.getContext('2d')!;
  let seed = 781;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = '#869698';
  ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 40000; i++) {
    const n = Math.floor(100 + random() * 80);
    ctx.fillStyle = `rgba(${n},${n + 8},${n + 9},${0.03 + random() * 0.1})`;
    ctx.fillRect(
      random() * 1024,
      random() * 1024,
      1 + random() * 9,
      1 + random() * 3,
    );
  }
  // Welded panels, salt streaks and localized chipped paint.
  for (const y of [0, 512]) {
    ctx.fillStyle = '#384a4e';
    ctx.fillRect(0, y, 1024, 3);
    ctx.fillStyle = '#b2bebc';
    ctx.fillRect(0, y + 3, 1024, 2);
    for (let x = 30; x < 1024; x += 72) {
      ctx.fillStyle = '#293b40';
      ctx.beginPath();
      ctx.arc(x, y + 16, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#b0b8b0';
      ctx.fillRect(x - 2, y + 13, 3, 2);
    }
  }
  for (let i = 0; i < 160; i++) {
    const x = random() * 1024,
      y = random() * 1024;
    ctx.fillStyle = `rgba(78,49,28,${0.12 + random() * 0.2})`;
    ctx.fillRect(x, y, 1 + random() * 4, 15 + random() * 95);
    ctx.fillStyle = '#4a5855';
    ctx.fillRect(x, y, 2 + random() * 6, 1 + random() * 3);
  }
  const color = texture(paint, true);
  const relief = document.createElement('canvas');
  relief.width = relief.height = 512;
  const rc = relief.getContext('2d')!;
  rc.fillStyle = '#888';
  rc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 20000; i++) {
    const n = Math.round(90 + random() * 80);
    rc.fillStyle = `rgb(${n},${n},${n})`;
    rc.fillRect(random() * 512, random() * 512, 1, 1);
  }
  rc.fillStyle = '#444';
  rc.fillRect(0, 0, 512, 2);
  rc.fillRect(0, 256, 512, 2);
  const bump = texture(relief);
  const load = (file: string, isColor = false) => {
    const t = new THREE.TextureLoader().load(assetUrl('/textures/' + file));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (isColor) t.colorSpace = THREE.SRGBColorSpace;
    textures.push(t);
    return t;
  };
  const steel = new THREE.MeshStandardMaterial({
    color: '#a0aeb0',
    map: color,
    bumpMap: bump,
    bumpScale: 0.045,
    roughness: 0.57,
    metalness: 0.42,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: '#364b55',
    map: color,
    bumpMap: bump,
    bumpScale: 0.035,
    roughness: 0.49,
    metalness: 0.65,
  });
  const deck = new THREE.MeshStandardMaterial({
    color: '#a7b1a3',
    map: load('deck-color.jpg', true),
    normalMap: load('deck-normal.jpg'),
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughnessMap: load('deck-roughness.jpg'),
    roughness: 0.92,
    metalness: 0.4,
  });
  const gunmetal = new THREE.MeshStandardMaterial({
    color: '#46535c',
    map: color,
    bumpMap: bump,
    bumpScale: 0.018,
    roughness: 0.3,
    metalness: 0.8,
  });
  const black = new THREE.MeshStandardMaterial({
    color: '#111c22',
    roughness: 0.65,
    metalness: 0.2,
  });
  const brass = new THREE.MeshStandardMaterial({
    color: '#b09556',
    roughness: 0.38,
    metalness: 0.7,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#243e4c',
    roughness: 0.12,
    metalness: 0.4,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
  });
  const red = new THREE.MeshStandardMaterial({
    color: '#843f2a',
    map: color,
    roughness: 0.75,
    metalness: 0.25,
  });
  const ivory = new THREE.MeshStandardMaterial({
    color: '#d6d5bb',
    roughness: 0.72,
  });
  const materials = {
    steel,
    dark,
    deck,
    gunmetal,
    black,
    brass,
    glass,
    red,
    ivory,
  };
  const label = (text: string, width = 512, height = 128) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    const x = c.getContext('2d')!;
    x.fillStyle = '#e4e4d0';
    x.font = `bold ${height * 0.68}px monospace`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(text, width / 2, height / 2);
    const t = texture(c, true);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.MeshStandardMaterial({
      map: t,
      transparent: true,
      depthWrite: false,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    extra.push(m);
    return m;
  };
  const extra: THREE.Material[] = [];
  return {
    ...materials,
    label,
    dispose() {
      textures.forEach((t) => t.dispose());
      Object.values(materials).forEach((m) => m.dispose());
      extra.forEach((m) => m.dispose());
    },
  };
}
export type NavalMaterials = ReturnType<typeof createNavalMaterials>;
