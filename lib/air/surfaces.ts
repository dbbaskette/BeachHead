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
    ['AIR SPEED', 410, 136, 126],
    ['RPM', 630, 136, 2200],
    ['OIL', 830, 136, 70],
  ] as const;
  for (const [name, x, y, value] of gauges) {
    const radius = name === 'OIL' ? 68 : 86;
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
    c.fillText(name, x, y - 20);
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
            ? 'PSI'
            : '×100 KT',
      x,
      y + 38,
    );
    const maximum = name === 'RPM' ? 7000 : name === 'OIL' ? 70 : 700;
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
  c.textAlign = 'left';
  c.fillStyle = '#b5b9a4';
  c.font = '14px monospace';
  c.fillText('FUEL   L     R', 75, 295);
  c.fillText('MAGNETO', 352, 295);
  c.fillText('BOMB RELEASE', 592, 295);
  c.fillText('ARMED', 848, 295);
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

/** World-scale sand/grass blending avoids the checkerboard repetition visible from altitude. */
export function coastalMaterial(map: THREE.Texture, normal: THREE.Texture) {
  const material = new THREE.MeshStandardMaterial({
    map,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.18, 0.18),
    roughness: 0.93,
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
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec2 p=coastPosition.xz;
      float shore=sin(p.y*.0025)*24.+sin(p.y*.009)*6.;
      float inland=p.x-shore;
      float macro=terrainNoise(p*.012);
      vec2 warp=vec2(noise2(p*.018),noise2(p*.018+53.))*2.;
      vec3 sandA=texture2D(map,p*.038+warp*.15).rgb;
      vec3 sandB=texture2D(map,mat2(.8,-.6,.6,.8)*p*.019+warp*.09).rgb;
      vec3 sand=mix(sandA,sandB,.52)*vec3(1.2,1.13,.98);
      float duneGrass=smoothstep(92.,230.,inland+(macro-.5)*170.);
      vec3 vegetation=mix(vec3(.18,.23,.105),vec3(.42,.4,.22),macro);
      float closeGrain=terrainNoise(p*.29);
      vegetation*=.88+closeGrain*.24;
      vec3 surface=mix(sand,vegetation,duneGrass*.88);
      float wet=1.-smoothstep(1.,24.,inland+(macro-.5)*12.);
      surface*=mix(1.,.52,wet);
      float road=1.-smoothstep(4.,8.,abs(inland-(320.+sin(p.y*.002)*35.)));
      surface=mix(surface,sand*.66,road*.65);
      surface*=.85+macro*.3;
      diffuseColor.rgb*=surface;
    `,
    );
  };
  material.customProgramCacheKey = () => 'air-coast-v2';
  return material;
}

/** Painted wing skin: subdued seams, rivets, access panels and period-style markings. */
export function aircraftSkin() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#70765a';
  c.fillRect(0, 0, 1024, 512);
  const shade = c.createLinearGradient(0, 0, 0, 512);
  shade.addColorStop(0, '#93977b');
  shade.addColorStop(0.2, '#747a5d');
  shade.addColorStop(1, '#505742');
  c.fillStyle = shade;
  c.fillRect(0, 0, 1024, 512);
  let seed = 8201;
  for (let i = 0; i < 9000; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = seed % 1024;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const y = seed % 512;
    c.fillStyle = i % 3 ? '#181d1510' : '#d3d0ad25';
    c.fillRect(x, y, 1 + (i % 3), 1);
  }
  for (let i = 0; i < 5; i++) {
    c.fillStyle = i % 2 ? '#242b26' : '#cecdb7';
    c.fillRect(565 + i * 35, 0, 35, 512);
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
  // Five-point star and bars, rendered in the wing's physical aspect ratio.
  c.save();
  c.translate(847, 254);
  c.scale(1, 2.3);
  c.fillStyle = '#273b4b';
  c.fillRect(-70, -19, 140, 38);
  c.beginPath();
  c.arc(0, 0, 43, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#dedfc9';
  c.fillRect(-66, -12, 132, 24);
  c.fillStyle = '#273b4b';
  c.beginPath();
  c.arc(0, 0, 39, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#dedfc9';
  c.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5,
      r = i % 2 ? 16 : 37;
    if (i) c.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else c.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  c.closePath();
  c.fill();
  c.restore();
  c.fillStyle = '#dbdbc28a';
  c.font = '9px monospace';
  c.fillText('NO STEP', 286, 430);
  c.fillText('FUEL', 415, 193);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
