import * as T from 'three';
import { consolidateTank, type TankArt } from './art';
import type { Cover } from './map';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function terrainHeight(x: number, z: number) {
  // Keep the drivable village aligned with collision geometry; hills start outside it.
  const outside = Math.max(-86 - x, x - 69, z - 34, -379 - z, 0);
  const hills =
    smooth(0, 70, outside) *
    (7 + 5 * Math.sin(x * 0.019 + z * 0.012) + 3 * Math.cos(z * 0.031));
  const bank = 1 - smooth(10, 17, Math.abs(z + 322));
  return -0.08 + hills - bank * 2.4;
}
export const ROADS = [
  [0, -133, 15, 322],
  [-44, -144, 12, 270],
  [-22, -18, 55, 12],
  [-22, -280, 55, 16],
  [0, -299, 46, 29],
];
export function roadDistance(x: number, z: number) {
  return Math.min(
    ...ROADS.map(([cx, cz, w, d]) =>
      Math.max(Math.abs(x - cx) - w / 2, Math.abs(z - cz) - d / 2),
    ),
  );
}
function random(seed: number) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function paving(a: TankArt) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#484a40';
  ctx.fillRect(0, 0, 512, 512);
  // Rounded, imperfect individual stones with recessed mortar, not an outlined grid.
  for (let row = -1; row < 17; row++)
    for (let col = -1; col < 11; col++) {
      const seed = row * 37 + col * 13;
      const x = col * 52 + (row % 2) * 26;
      const y = row * 32;
      const shade = Math.floor(105 + random(seed) * 52);
      ctx.fillStyle = `rgb(${shade},${shade + 1},${shade - 4})`;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, 47 + random(seed + 5) * 2, 27, 5);
      ctx.fill();
      ctx.strokeStyle = '#d0c8b12d';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (random(seed + 9) > 0.78) {
        ctx.strokeStyle = '#30352f70';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 12, y + 2);
        ctx.lineTo(x + 22, y + 14);
        ctx.lineTo(x + 18, y + 28);
        ctx.stroke();
      }
    }
  for (let i = 0; i < 28000; i++) {
    ctx.fillStyle = i % 2 ? '#ffffff12' : '#121b1424';
    ctx.fillRect(random(i) * 512, random(i + 919) * 512, 1, 2);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 4;
  a.textures.add(texture);
  return texture;
}

export function buildTerrain(
  a: TankArt,
  scene: T.Scene,
  cover: Cover[],
  touch: boolean,
) {
  const ground = a.mat('#ffffff', 0.96);
  ground.map = a.texture('pillbox-sand-diffuse.jpg', true);
  ground.normalMap = a.texture('pillbox-sand-normal.jpg');
  ground.normalScale.set(0.35, 0.35);
  ground.map.repeat.set(200, 200);
  ground.normalMap.repeat.copy(ground.map.repeat);
  const stone = paving(a);
  ground.onBeforeCompile = (shader) => {
    shader.uniforms.paving = { value: stone };
    shader.vertexShader = 'varying vec2 terrainXZ;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nterrainXZ = (modelMatrix * vec4(transformed, 1.0)).xz;',
    );
    shader.fragmentShader =
      `
      varying vec2 terrainXZ;
      uniform sampler2D paving;
      float thash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float tnoise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(thash(i),thash(i+vec2(1,0)),f.x),
          mix(thash(i+vec2(0,1)),thash(i+vec2(1,1)),f.x),f.y);
      }
      float rect(vec2 p,vec2 c,vec2 h) { vec2 d=abs(p-c)-h; return max(d.x,d.y); }
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
      vec2 p=terrainXZ;
      float grain=tnoise(p*1.6), broad=tnoise(p*.075), fine=tnoise(p*7.0);
      float high=rect(p,vec2(0,-133),vec2(7.5,161));
      high=min(high,rect(p,vec2(-22,-280),vec2(27.5,8)));
      high=min(high,rect(p,vec2(0,-299),vec2(23,14.5)));
      float lane=min(rect(p,vec2(-44,-144),vec2(6,135)),rect(p,vec2(-22,-18),vec2(27.5,6)));
      float edge=(grain-.5)*1.25+(broad-.5)*1.1;
      float cobble=1.0-smoothstep(-.7,1.1,high+edge);
      float road=1.0-smoothstep(-.8,2.8,min(high,lane)+edge);
      vec3 soil=texture2D(map,vMapUv).rgb;
      vec3 grass=mix(vec3(.14,.185,.085),vec3(.29,.31,.155),broad);
      vec3 earth=mix(vec3(.15,.12,.078),vec3(.31,.265,.17),grain);
      vec3 stones=texture2D(paving,p*.42).rgb;
      stones*=mix(.68,1.0,broad);
      vec3 base=mix(grass,earth,road);
      base*=mix(vec3(.8),soil*1.6,.55);
      base=mix(base,stones*.73,cobble);
      float ruts=exp(-pow((abs(p.x+44.0)-1.65)*2.0,2.0));
      base*=1.0-ruts*(1.0-smoothstep(-1.0,1.0,lane))*.30;
      float scars=0.0;
      scars+=exp(-dot((p-vec2(10,-66))/vec2(2.5,4),(p-vec2(10,-66))/vec2(2.5,4)));
      scars+=exp(-dot((p-vec2(-10,-159))/vec2(3,4),(p-vec2(-10,-159))/vec2(3,4)));
      scars+=exp(-dot((p-vec2(16,-287))/vec2(4,3),(p-vec2(16,-287))/vec2(4,3)));
      base=mix(base,vec3(.065,.057,.044),clamp(scars*(.6+grain*.3),0.0,.8));
      diffuseColor.rgb*=base*(.94+fine*.12);
    `,
    );
    // Per-fragment relief follows the same world-space cobbles as the albedo.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
      #include <normal_fragment_maps>
      float relief=dot(stones,vec3(.333))*.07*cobble + fine*.004;
      vec3 sx=dFdx(vViewPosition), sy=dFdy(vViewPosition);
      vec3 r1=cross(sy,normal), r2=cross(normal,sx);
      float det=dot(sx,r1);
      normal=normalize(abs(det)*normal-sign(det)*(dFdx(relief)*r1+dFdy(relief)*r2));
    `,
    );
  };
  ground.customProgramCacheKey = () => 'breakout-terrain-v1';
  const geometry = a.geo(
    new T.PlaneGeometry(1200, 1200, touch ? 120 : 200, 300),
  );
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -150);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      z = position.getZ(i);
    position.setY(i, terrainHeight(x, z));
  }
  geometry.computeVertexNormals();
  const mesh = new T.Mesh(geometry, ground);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // Small silhouettes at verge level make the ground read in depth, including on mobile.
  const blades = new T.BufferGeometry();
  const vertices: number[] = [];
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.399,
      x = Math.cos(angle) * 0.23,
      z = Math.sin(angle) * 0.23;
    const h = 0.16 + random(i + 4) * 0.23,
      lean = 0.04 + random(i) * 0.08;
    // A bent ribbon tapers through a knee into a fine tip.
    vertices.push(
      x - 0.014,
      0,
      z,
      x + 0.014,
      0,
      z,
      x + lean + 0.008,
      h * 0.6,
      z + 0.025,
      x - 0.014,
      0,
      z,
      x + lean + 0.008,
      h * 0.6,
      z + 0.025,
      x + lean - 0.008,
      h * 0.6,
      z + 0.025,
      x + lean - 0.008,
      h * 0.6,
      z + 0.025,
      x + lean + 0.008,
      h * 0.6,
      z + 0.025,
      x + lean * 1.8,
      h,
      z + 0.07,
    );
  }
  blades.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  blades.computeVertexNormals();
  a.geo(blades);
  const grassMat = a.mat('#bfc3a1', 1);
  grassMat.side = T.DoubleSide;
  const count = touch ? 3200 : 6400;
  const grass = new T.InstancedMesh(blades, grassMat, count);
  const rocks = new T.InstancedMesh(
    a.geo(new T.IcosahedronGeometry(1, 0)),
    a.stone,
    380,
  );
  const transform = new T.Object3D(),
    color = new T.Color();
  let n = 0,
    r = 0;
  for (let i = 0; i < 36000 && n < count; i++) {
    const x = -101 + random(i * 3) * 192,
      z = 26 - random(i * 3 + 1) * 398;
    const distance = roadDistance(x, z);
    if (distance < 0.3 || Math.abs(z + 322) < 17) continue;
    if (
      cover.some(
        (c) =>
          c.kind === 'house' &&
          Math.abs(x - c.x) < c.w / 2 + 0.4 &&
          Math.abs(z - c.z) < c.d / 2 + 0.4,
      )
    )
      continue;
    if (distance > 5 && random(i + 76) > 0.4) continue;
    transform.position.set(x, terrainHeight(x, z), z);
    transform.rotation.set(0, random(i + 6) * 6.28, 0);
    transform.scale.setScalar(0.65 + random(i + 11) * 0.8);
    transform.updateMatrix();
    grass.setMatrixAt(n, transform.matrix);
    color.setHSL(
      0.19 + random(i + 2) * 0.05,
      0.22 + random(i + 3) * 0.16,
      0.21 + random(i + 4) * 0.13,
    );
    grass.setColorAt(n++, color);
    if (r < 380 && distance < 4.5 && i % 3 === 0) {
      transform.position.y += 0.035;
      transform.rotation.set(i, 0.3 * i, 0.7 * i);
      transform.scale.set(
        0.07 + random(i) * 0.19,
        0.045 + random(i + 7) * 0.06,
        0.09 + random(i + 8) * 0.2,
      );
      transform.updateMatrix();
      rocks.setMatrixAt(r++, transform.matrix);
    }
  }
  grass.count = n;
  rocks.count = r;
  grass.receiveShadow = true;
  rocks.receiveShadow = true;
  grass.computeBoundingSphere();
  rocks.computeBoundingSphere();
  scene.add(grass, rocks);

  // Shallow irregular puddles and damp margins lie in orchard wheel ruts.
  const wet = a.mat('#454c42', 0.17);
  wet.metalness = 0.12;
  const puddles = new T.Group();
  for (let i = 0; i < 20; i++) {
    const shape = new T.Shape();
    for (let j = 0; j <= 24; j++) {
      const angle = (j / 24) * Math.PI * 2,
        radius = 0.7 + random(i * 91 + (j % 24)) * 0.3;
      const x = Math.cos(angle) * radius,
        y = Math.sin(angle) * radius;
      if (j === 0) shape.moveTo(x, y);
      else shape.lineTo(x, y);
    }
    const g = a.geo(new T.ShapeGeometry(shape));
    g.rotateX(-Math.PI / 2);
    const m = new T.Mesh(g, wet);
    m.position.set(-44 + (i % 2 ? 1.6 : -1.6), -0.055, -27 - i * 12.4);
    m.scale.set(0.45 + random(i + 1) * 0.4, 1, 1.1 + random(i + 2) * 1.5);
    puddles.add(m);
  }
  consolidateTank(puddles, a);
  puddles.children.forEach((m) => {
    (m as T.Mesh).castShadow = false;
  });
  scene.add(puddles);
  return { ground };
}
