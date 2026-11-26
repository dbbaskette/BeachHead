import * as THREE from 'three';

/** Deterministic layered noise: shared by weathered surfaces and coastal shaders. */
export const noiseGLSL = `
float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
float terrainNoise(vec2 p){return noise2(p)*.57+noise2(p*2.07+13.7)*.28+noise2(p*4.13-9.2)*.15;}
`;

export function paintTexture() {
  const size = 256,
    data = new Uint8Array(size * size * 4);
  let seed = 49117;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const grain = (seed / 4294967296 - 0.5) * 17;
      const seam = x % 128 < 2 || y % 64 < 2;
      const rivet = Math.hypot((x % 16) - 8, (y % 64) - 6) < 1.25;
      const scratch = seed % 991 < 4;
      const c = seam ? 148 : rivet ? 170 : scratch ? 193 : 202 + grain;
      const i = (y * size + x) * 4;
      data.set([c, c, c, 255], i);
    }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

export function instrumentTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 384;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#182123';
  c.fillRect(0, 0, 1024, 384);
  const gauges = [
    ['ALT', 190, 136, 85],
    ['AIR SPEED', 355, 136, 233],
    ['RPM', 730, 136, 2200],
    ['OIL', 875, 136, 5],
  ] as const;
  for (const [name, x, y, value] of gauges) {
    const radius = name === 'OIL' ? 59 : name === 'RPM' ? 65 : 73;
    const rim = c.createRadialGradient(
      x - 20,
      y - 25,
      radius * 0.7,
      x,
      y,
      radius + 8,
    );
    rim.addColorStop(0, '#111617');
    rim.addColorStop(0.75, '#4d5959');
    rim.addColorStop(0.88, '#798481');
    rim.addColorStop(1, '#20292a');
    c.fillStyle = rim;
    c.beginPath();
    c.arc(x, y, radius + 8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#0b1112';
    c.beginPath();
    c.arc(x, y, radius - 2, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 40; i++) {
      const a = ((i / 40) * 1.65 + 0.68) * Math.PI,
        inner = radius - (i % 5 ? 9 : 17);
      c.strokeStyle = i > 33 ? '#c27c56' : '#c8d1b5';
      c.lineWidth = i % 5 ? 1.5 : 3;
      c.beginPath();
      c.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
      c.lineTo(x + Math.cos(a) * (radius - 4), y + Math.sin(a) * (radius - 4));
      c.stroke();
      if (i % 5 === 0) {
        c.font = '16px monospace';
        c.fillStyle = '#bbc7b2';
        c.textAlign = 'center';
        c.fillText(
          String(i / 5),
          x + Math.cos(a) * (radius - 30),
          y + Math.sin(a) * (radius - 30) + 5,
        );
      }
    }
    c.textAlign = 'center';
    c.font = 'bold 12px monospace';
    c.fillStyle = '#a4b8a4';
    c.fillText(
      ({ ALT: 'HÖHE', 'AIR SPEED': 'FAHRT', RPM: 'U/MIN', OIL: 'ÖL' } as const)[
        name
      ],
      x,
      y - 20,
    );
    c.fillStyle = '#172121';
    c.fillRect(x - 28, y + 22, 56, 20);
    c.fillStyle = '#d4d8bb';
    c.font = '16px monospace';
    c.fillText(
      name === 'ALT'
        ? '×100 M'
        : name === 'RPM'
          ? '×1000'
          : name === 'OIL'
            ? 'ATÜ'
            : '×100 KM/H',
      x,
      y + 38,
    );
    const maximum = name === 'RPM' ? 7000 : name === 'OIL' ? 7 : 700;
    const angle = (0.68 + (value / maximum) * 1.65) * Math.PI;
    c.strokeStyle = '#e1ddbc';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(x - Math.cos(angle) * 13, y - Math.sin(angle) * 13);
    c.lineTo(
      x + Math.cos(angle) * (radius - 22),
      y + Math.sin(angle) * (radius - 22),
    );
    if (name !== 'ALT') c.stroke();
    c.fillStyle = '#808b7d';
    c.beginPath();
    c.arc(x, y, 5, 0, Math.PI * 2);
    c.fill();
  }
  // The central attitude indicator is animated by the 3D cockpit; this is its bezel.
  const gyroRim = c.createRadialGradient(525, 116, 60, 540, 136, 88);
  gyroRim.addColorStop(0, '#101714');
  gyroRim.addColorStop(0.8, '#202c27');
  gyroRim.addColorStop(0.9, '#738075');
  gyroRim.addColorStop(1, '#101714');
  c.fillStyle = gyroRim;
  c.beginPath();
  c.arc(540, 136, 88, 0, Math.PI * 2);
  c.fill();
  for (let i = -3; i <= 3; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 9;
    c.strokeStyle = '#dedfc5';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(540 + Math.cos(angle) * 79, 136 + Math.sin(angle) * 79);
    c.lineTo(540 + Math.cos(angle) * 85, 136 + Math.sin(angle) * 85);
    c.stroke();
  }
  c.fillStyle = '#b5b9a4';
  c.textAlign = 'center';
  c.font = '12px monospace';
  c.fillText('HORIZONT', 540, 242);
  c.textAlign = 'left';
  c.fillStyle = '#b5b9a4';
  c.font = '14px monospace';
  c.fillText('KRAFTSTOFF L / R', 75, 295);
  c.fillText('ZÜNDUNG', 352, 295);
  c.fillText('BOMBENABWURF', 592, 295);
  c.fillText('SCHARF', 848, 295);
  for (let i = 0; i < 7; i++) {
    const x = 90 + i * 132;
    c.fillStyle = i === 6 ? '#925137' : '#374443';
    c.beginPath();
    c.arc(x, 327, 12, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#bcc5b5';
    c.fillRect(x - 2, 310, 4, 20);
  }
  for (const x of [24, 1000])
    for (const y of [24, 360]) {
      c.fillStyle = '#82908a';
      c.beginPath();
      c.arc(x, y, 5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#222b2a';
      c.beginPath();
      c.moveTo(x - 3, y);
      c.lineTo(x + 3, y);
      c.stroke();
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export type CoastalSurfaceOptions = {
  shoreAxis?: 'x' | 'z';
  shoreOffset?: number;
  grassStart?: number;
  grassEnd?: number;
  roadOffset?: number;
};

/** World-scale sand/grass blending avoids the checkerboard repetition visible from altitude. */
export function coastalMaterial(
  map: THREE.Texture,
  normal: THREE.Texture,
  options: CoastalSurfaceOptions = {},
) {
  const {
    shoreAxis = 'x',
    shoreOffset = 0,
    grassStart = 92,
    grassEnd = 230,
    roadOffset = 320,
  } = options;
  const hasRoad = roadOffset < 1000;
  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: 0.9,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 coastPosition;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ncoastPosition=position;',
      );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\nvarying vec3 coastPosition;\n${noiseGLSL}`,
    );
    const shoreExpr =
      shoreAxis === 'z'
        ? `${shoreOffset.toFixed(1)} + sin(p.x * 0.015) * 6.0`
        : `${shoreOffset.toFixed(1)} + sin(p.y * 0.0025) * 24.0 + sin(p.y * 0.009) * 6.0`;
    const inlandExpr = shoreAxis === 'z' ? 'p.z - shore' : 'p.x - shore';
    const roadExpr = hasRoad
      ? `1.0 - smoothstep(4.0, 8.0, abs(inland - (${roadOffset.toFixed(1)} + sin(p.y * 0.002) * 35.0)))`
      : '0.0';
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec2 p=coastPosition.xz;
      float shore=${shoreExpr};
      float inland=${inlandExpr};
      float macro=terrainNoise(p*.012);
      vec2 warp=vec2(noise2(p*.018),noise2(p*.018+53.))*2.;
      vec3 sandA=texture2D(map,p*.038+warp*.15).rgb;
      vec3 sandB=texture2D(map,mat2(.8,-.6,.6,.8)*p*.019+warp*.09).rgb;
      vec3 sand=mix(sandA,sandB,.52)*vec3(1.2,1.13,.98);
      float duneGrass=smoothstep(${grassStart.toFixed(1)},${grassEnd.toFixed(1)},inland+(macro-.5)*170.);
      vec3 vegetation=mix(vec3(.18,.23,.105),vec3(.42,.4,.22),macro);
      float closeGrain=terrainNoise(p*.29);
      vegetation*=.88+closeGrain*.24;
      vec3 surface=mix(sand,vegetation,duneGrass*.88);
      float wet=1.-smoothstep(1.,24.,inland+(macro-.5)*12.);
      surface*=mix(1.,.52,wet);
      float road=${roadExpr};
      surface=mix(surface,sand*.66,road*.65);
      surface*=.85+macro*.3;
      diffuseColor.rgb*=surface;
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
      roughnessFactor=mix(mix(0.9,0.96,duneGrass),0.26,wet);`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#ifdef USE_NORMALMAP_TANGENTSPACE
        vec2 worldNormUvA=p*0.14;
        vec2 worldNormUvB=mat2(0.8,-0.6,0.6,0.8)*(p*0.047)+warp*0.04;
        vec3 mapN1=texture2D(normalMap,worldNormUvA).xyz*2.0-1.0;
        vec3 mapN2=texture2D(normalMap,worldNormUvB).xyz*2.0-1.0;
        vec3 mapN=normalize(vec3((mapN1.xy*0.65+mapN2.xy*0.35)*normalScale,1.0));
        mat3 worldTbn=getTangentFrame(-vViewPosition,normal,worldNormUvA);
        normal=normalize(worldTbn*mapN);
      #endif`,
    );
  };
  material.customProgramCacheKey = () =>
    `air-coast-v3-${shoreAxis}-${grassStart}-${roadOffset}`;
  return material;
}

/** Procedural aircraft panel normal and roughness maps; safe in both browser and Node. */
export function aircraftSurfaceMaps() {
  const size = 256;
  const normalData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  const heights = new Float32Array(size * size);
  let seed = 31337;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const seamX = x % 64 < 2;
      const seamY = y % 64 < 2;
      const seam = seamX || seamY;
      const rivet =
        !seam &&
        (x % 16 === 4 || x % 16 === 12) &&
        (y % 64 === 6 || y % 64 === 58);
      const brush = (rand() - 0.5) * 0.08;
      heights[idx] = (seam ? -0.45 : rivet ? 0.25 : 0) + brush;
      // Worn bare aluminum along panel edges drops roughness (~0.36), flat camo stays ~0.78.
      const edgeWear =
        (x % 64 >= 2 && x % 64 < 5) || (y % 64 >= 2 && y % 64 < 5);
      const r = seam
        ? 222
        : rivet || edgeWear
          ? 96
          : Math.round(188 + brush * 120);
      const o = idx * 4;
      roughData[o] = roughData[o + 1] = roughData[o + 2] = r;
      roughData[o + 3] = 255;
    }
  }
  for (let y = 0; y < size; y++) {
    const ym = (y - 1 + size) % size;
    const yp = (y + 1) % size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (heights[y * size + xp] - heights[y * size + xm]) * 2.2;
      const dy = (heights[yp * size + x] - heights[ym * size + x]) * 2.2;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      normalData[o] = Math.round((-dx * inv * 0.5 + 0.5) * 255);
      normalData[o + 1] = Math.round((-dy * inv * 0.5 + 0.5) * 255);
      normalData[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      normalData[o + 3] = 255;
    }
  }
  const make = (data: Uint8Array) => {
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = 4;
    tex.needsUpdate = true;
    return tex;
  };
  return { normalMap: make(normalData), roughnessMap: make(roughData) };
}

/** Painted wing skin: subdued seams, rivets, access panels and period-style markings. */
export function aircraftSkin() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#727f7c';
  c.fillRect(0, 0, 1024, 512);
  const shade = c.createLinearGradient(0, 0, 0, 512);
  shade.addColorStop(0, '#86958f');
  shade.addColorStop(0.2, '#788782');
  shade.addColorStop(1, '#4b5a58');
  c.fillStyle = shade;
  c.fillRect(0, 0, 1024, 512);
  const skinImg = c.getImageData(0, 0, 1024, 512);
  const skinData = skinImg.data;
  let seed = 8201;
  for (let i = 0; i < 9000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = seed % 1024;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const y = seed % 512;
    const dark = i % 3 !== 0;
    const alpha = dark ? 16 / 255 : 37 / 255;
    const inv = 1 - alpha;
    const sr = dark ? 24 : 211;
    const sg = dark ? 29 : 208;
    const sb = dark ? 21 : 173;
    const span = Math.min(1024 - x, 1 + (i % 3));
    for (let dx = 0; dx < span; dx++) {
      const o = (y * 1024 + x + dx) * 4;
      skinData[o] = Math.round(skinData[o] * inv + sr * alpha);
      skinData[o + 1] = Math.round(skinData[o + 1] * inv + sg * alpha);
      skinData[o + 2] = Math.round(skinData[o + 2] * inv + sb * alpha);
    }
  }
  c.putImageData(skinImg, 0, 0);
  // Angular gray-green splinter camouflage, with no Allied invasion stripes.
  c.fillStyle = '#4d5d57';
  for (const points of [
    [
      [0, 0],
      [470, 0],
      [330, 190],
      [70, 300],
      [0, 225],
    ],
    [
      [470, 80],
      [720, 0],
      [1024, 0],
      [1024, 220],
      [810, 330],
    ],
    [
      [0, 460],
      [370, 310],
      [700, 390],
      [860, 512],
      [0, 512],
    ],
  ]) {
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  }
  c.strokeStyle = '#242d2666';
  c.lineWidth = 1.5;
  for (const x of [180, 335, 490, 780, 922]) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, 512);
    c.stroke();
    for (let y = 8; y < 512; y += 15) {
      c.fillStyle = '#c0c0a255';
      c.fillRect(x + 4, y, 1.5, 1.5);
    }
  }
  for (const y of [65, 160, 405]) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(1024, y);
    c.stroke();
  }
  for (const x of [255, 420]) {
    c.strokeRect(x, 210, 65, 88);
    for (const y of [216, 290]) {
      c.fillStyle = '#c0c0a2';
      c.fillRect(x + 5, y, 2, 2);
      c.fillRect(x + 57, y, 2, 2);
    }
  }
  // Straight Balkenkreuz, corrected for the wing texture's physical aspect ratio.
  c.save();
  c.translate(770, 254);
  c.scale(1, 2.3);
  c.fillStyle = '#d4d8ce';
  c.fillRect(-52, -21, 104, 42);
  c.fillRect(-21, -52, 42, 104);
  c.fillStyle = '#202928';
  c.fillRect(-52, -13, 104, 26);
  c.fillRect(-13, -52, 26, 104);
  c.restore();
  c.fillStyle = '#dbdbc28a';
  c.font = '9px monospace';
  c.fillText('NICHT BETRETEN', 286, 430);
  c.fillText('KRAFTSTOFF', 415, 193);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
