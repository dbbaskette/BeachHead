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
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = roughCanvas.height = 512;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = '#c4c4c4';
  rctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16000; i++) {
    const v = Math.round(145 + random() * 68);
    rctx.fillStyle = `rgb(${v},${v},${v})`;
    rctx.fillRect(
      random() * 512,
      random() * 512,
      1 + random() * 4,
      1 + random() * 2,
    );
  }
  const aoCanvas = document.createElement('canvas');
  aoCanvas.width = aoCanvas.height = 512;
  const actx = aoCanvas.getContext('2d')!;
  actx.fillStyle = '#ffffff';
  actx.fillRect(0, 0, 512, 512);
  for (const y of [0, 256]) {
    rctx.fillStyle = '#e0e0e0';
    rctx.fillRect(0, y, 512, 3);
    actx.fillStyle = '#929292';
    actx.fillRect(0, y, 512, 4);
    for (let x = 15; x < 512; x += 36) {
      actx.fillStyle = '#848484';
      actx.beginPath();
      actx.arc(x, y + 8, 2.5, 0, Math.PI * 2);
      actx.fill();
    }
  }
  for (let i = 0; i < 90; i++) {
    const x = random() * 512,
      y = random() * 512,
      len = 8 + random() * 48;
    // Salt/rust streaks dull specular response; bare metal scuffs polish it.
    const rustStreak = i % 3 !== 0;
    const v = rustStreak ? 225 : 105;
    rctx.fillStyle = `rgba(${v},${v},${v},0.45)`;
    rctx.fillRect(x, y, 1 + random() * 3, len);
  }
  const roughnessMap = texture(roughCanvas);
  const aoMap = texture(aoCanvas);
  aoMap.channel = 0;
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
    roughnessMap,
    aoMap,
    aoMapIntensity: 0.65,
    roughness: 0.72,
    metalness: 0.42,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: '#364b55',
    map: color,
    bumpMap: bump,
    bumpScale: 0.035,
    roughnessMap,
    aoMap,
    aoMapIntensity: 0.65,
    roughness: 0.62,
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
    roughnessMap,
    aoMap,
    aoMapIntensity: 0.65,
    roughness: 0.4,
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
  const extra: THREE.Material[] = [];
  const labelCache = new Map<string, THREE.MeshStandardMaterial>();
  const label = (text: string, width = 512, height = 128) => {
    const key = `${text}:${width}x${height}`;
    const cached = labelCache.get(key);
    if (cached) return cached;
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
    labelCache.set(key, m);
    return m;
  };
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
