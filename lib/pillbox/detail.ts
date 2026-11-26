import { beachHeight } from './terrain';
import { assetUrl } from '../asset-url';
import * as THREE from 'three';

const LANES = [-36, -18, 0, 18, 36];

export type SurfaceTextureSet = {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
};

export type PillboxSurfaceMaps = {
  sand: SurfaceTextureSet;
  concrete: SurfaceTextureSet;
  dispose(): void;
};

/** Load the local 1K CC0 Poly Haven PBR sets used by the beach and bunker. */
export async function createSurfaceMaps(): Promise<PillboxSurfaceMaps> {
  const loader = new THREE.TextureLoader();
  const paths = [
    assetUrl('/textures/pillbox-sand-diffuse.webp'),
    assetUrl('/textures/pillbox-sand-normal.webp'),
    assetUrl('/textures/pillbox-sand-roughness.webp'),
    assetUrl('/textures/pillbox-concrete-diffuse.webp'),
    assetUrl('/textures/pillbox-concrete-normal.webp'),
    assetUrl('/textures/pillbox-concrete-roughness.webp'),
  ];
  const results = await Promise.allSettled(
    paths.map((path) => loader.loadAsync(path)),
  );
  const textures = results.flatMap((result) =>
    result.status === 'fulfilled' ? [result.value] : [],
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failure) {
    textures.forEach((texture) => texture.dispose());
    throw failure.reason;
  }
  if (textures.length !== paths.length) {
    textures.forEach((texture) => texture.dispose());
    throw new Error(
      'Pillbox surface texture loading returned an incomplete set.',
    );
  }
  const [
    sandMap,
    sandNormal,
    sandRough,
    concreteMap,
    concreteNormal,
    concreteRough,
  ] = textures;
  sandMap.colorSpace = concreteMap.colorSpace = THREE.SRGBColorSpace;
  for (const texture of textures) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
  }
  for (const texture of [sandMap, sandNormal, sandRough])
    texture.repeat.set(12, 32);
  for (const texture of [concreteMap, concreteNormal, concreteRough])
    texture.repeat.set(3, 2);
  return {
    sand: { map: sandMap, normalMap: sandNormal, roughnessMap: sandRough },
    concrete: {
      map: concreteMap,
      normalMap: concreteNormal,
      roughnessMap: concreteRough,
    },
    dispose: () => textures.forEach((texture) => texture.dispose()),
  };
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => (value = (value * 1664525 + 1013904223) >>> 0) / 4294967296;
}

function offLane(x: number, clearance = 5.5) {
  return LANES.every((lane) => Math.abs(x - lane) > clearance);
}

function detailSurfaceTexture(
  seed: number,
  contrast: number,
  streaks = false,
  repeat = 2,
) {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wave = streaks
        ? Math.sin(x * 0.45 + Math.sin(y * 0.08) * 3.2) * contrast * 0.7
        : (Math.sin(x * 0.22 + y * 0.17) + Math.cos(x * 0.11 - y * 0.29)) *
          contrast *
          0.35;
      const grain = (rand() - 0.5) * contrast;
      const v = Math.max(95, Math.min(250, Math.round(198 + wave + grain)));
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function warningSignTexture() {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const c = canvas.getContext('2d')!;
    c.fillStyle = '#979180';
    c.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 1800; i++) {
      c.fillStyle = i % 3 ? '#5f5b4f26' : '#c6beab24';
      c.fillRect((i * 73) % 512, (i * 137) % 256, 3, 2);
    }
    c.strokeStyle = '#292722';
    c.lineWidth = 10;
    c.strokeRect(18, 18, 476, 220);
    c.fillStyle = '#201e1a';
    c.textAlign = 'center';
    c.font = 'bold 54px monospace';
    c.fillText('ACHTUNG MINEN', 256, 108);
    c.font = 'bold 30px monospace';
    c.fillText('STRANDSEKTOR 4', 256, 174);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  const data = new Uint8Array(64 * 32 * 4);
  data.fill(150);
  const tex = new THREE.DataTexture(data, 64, 32, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Static, deterministic battlefield dressing for the Stage 3 beach. */
export class BeachDetail {
  private root = new THREE.Group();
  private geometries: THREE.BufferGeometry[] = [];
  private materials: THREE.Material[] = [];
  private textures: THREE.Texture[] = [];
  private dustMaterial?: THREE.ShaderMaterial;
  private grassUniforms = { uTime: { value: 0 } };

  constructor(scene: THREE.Scene) {
    this.root.name = 'beach-battlefield-detail';
    scene.add(this.root);

    const random = seeded(0x19440606);
    const geometry = <T extends THREE.BufferGeometry>(value: T) => {
      this.geometries.push(value);
      return value;
    };
    const material = (parameters: THREE.MeshStandardMaterialParameters) => {
      const value = new THREE.MeshStandardMaterial(parameters);
      this.materials.push(value);
      return value;
    };
    const texture = (tex: THREE.Texture) => {
      this.textures.push(tex);
      return tex;
    };
    const stoneMap = texture(detailSurfaceTexture(0x411, 52, false, 2));
    const concreteMap = texture(detailSurfaceTexture(0x822, 42, false, 2));
    const rustMap = texture(detailSurfaceTexture(0xc33, 60, true, 2));
    const woodMap = texture(detailSurfaceTexture(0xf44, 48, true, 3));
    const sandDark = material({ color: '#574936', roughness: 1 });
    const stone = material({
      color: '#797567',
      map: stoneMap,
      bumpMap: stoneMap,
      bumpScale: 0.04,
      roughness: 0.96,
    });
    const concrete = material({
      color: '#8c8b7d',
      map: concreteMap,
      bumpMap: concreteMap,
      bumpScale: 0.035,
      roughness: 0.98,
    });
    const concreteFace = material({
      color: '#aaa596',
      map: concreteMap,
      bumpMap: concreteMap,
      bumpScale: 0.03,
      roughness: 0.95,
    });
    const rust = material({
      color: '#634131',
      map: rustMap,
      bumpMap: rustMap,
      bumpScale: 0.03,
      roughness: 0.78,
      metalness: 0.48,
    });
    const wood = material({
      color: '#6e5b46',
      map: woodMap,
      bumpMap: woodMap,
      bumpScale: 0.035,
      roughness: 0.96,
    });
    const grass = material({
      color: '#ffffff',
      roughness: 1,
      side: THREE.DoubleSide,
    });
    grass.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.grassUniforms.uTime;
      shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 gWorld = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float gPhase = uTime * 1.9 + gWorld.x * 0.27 + gWorld.z * 0.19;
          float gBend = position.y * position.y;
          transformed.x += (sin(gPhase) * 0.14 + sin(gPhase * 2.3) * 0.04) * gBend;
          transformed.z += cos(gPhase * 0.85) * 0.07 * gBend;
        #endif`,
      );
    };
    grass.customProgramCacheKey = () => 'beach-grass-wind-v1';

    const rockData = Array.from({ length: 62 }, () => {
      let x = 0;
      do x = -65 + random() * 130;
      while (!offLane(x, 4.5));
      return [x, -18 - random() * 116, 0.25 + random() * 0.55] as [
        number,
        number,
        number,
      ];
    });
    this.addInstances(
      geometry(new THREE.DodecahedronGeometry(1, 1)),
      stone,
      rockData,
      ([x, z, size], object) => {
        object.position.set(x, size * 0.34, z);
        object.rotation.set(random() * 2, random() * 2, random() * 2);
        object.scale.set(
          size,
          size * (0.45 + random() * 0.35),
          size * (0.7 + random() * 0.7),
        );
      },
    );

    const rubbleData = Array.from({ length: 34 }, (_, index) => {
      const side = index % 2 ? 1 : -1;
      return [
        side * (20 + random() * 8),
        -5 - random() * 23,
        0.35 + random() * 0.8,
      ] as [number, number, number];
    });
    this.addInstances(
      geometry(new THREE.BoxGeometry(1, 1, 1)),
      concrete,
      rubbleData,
      ([x, z, size], object) => {
        object.position.set(x, size * 0.32, z);
        object.rotation.set(
          random() * 0.7,
          random() * Math.PI,
          random() * 0.45,
        );
        object.scale.set(size * 1.6, size * 0.55, size);
      },
    );
    this.addInstances(
      geometry(new THREE.CylinderGeometry(0.045, 0.045, 2.6, 5)),
      rust,
      rubbleData.filter((_, index) => index % 3 === 0),
      ([x, z], object) => {
        object.position.set(x, 0.55, z);
        object.rotation.set(
          0.55 + random() * 0.4,
          random() * Math.PI,
          random() * 0.5,
        );
      },
    );

    const driftwoodData: Array<[number, number, number]> = [
      [-62, -45, 5.2],
      [62, -67, 4.1],
      [-50, -111, 5.7],
      [51, -101, 3.8],
      [-12, -141, 5.2],
      [26, -136, 4.4],
    ];
    this.addInstances(
      geometry(new THREE.CylinderGeometry(0.14, 0.3, 1, 7)),
      wood,
      driftwoodData,
      ([x, z, length], object) => {
        object.position.set(x, 0.22, z);
        object.rotation.set(Math.PI / 2, random() * Math.PI, Math.PI / 2);
        object.scale.y = length;
      },
    );

    const grassData = Array.from({ length: 76 }, (_, index) => {
      const side = index % 2 ? 1 : -1;
      const x = side * (44 + random() * 25);
      return [x, -16 - random() * 112, 0.55 + random() * 0.8] as [
        number,
        number,
        number,
      ];
    });
    const bladeGeometry = new THREE.BufferGeometry()
      .setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            -0.25, 0, 0, 0.25, 0, 0, -0.13, 0.62, 0.018, 0.13, 0.62, 0.018, 0,
            1.5, 0.07,
          ],
          3,
        ),
      )
      .setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    bladeGeometry.computeVertexNormals();
    const blade = geometry(bladeGeometry);
    const grassTint = new THREE.Color();
    for (const quarterTurn of [false, true]) {
      const grassMesh = this.addInstances(
        blade,
        grass,
        grassData,
        ([x, z, scale], object, index) => {
          object.position.set(x, 0, z);
          object.rotation.y = (quarterTurn ? Math.PI / 2 : 0) + random() * 0.35;
          object.scale.set(scale, scale, scale);
          const jitter = ((index * 17) % 13) / 12;
          grassTint.setHSL(
            0.2 + jitter * 0.055,
            0.24 + jitter * 0.12,
            0.24 + jitter * 0.14,
          );
          return grassTint;
        },
      );
      if (grassMesh.instanceColor) grassMesh.instanceColor.needsUpdate = true;
    }

    // Flat, dark paired impressions suggest churned boot traffic along each route.
    const trackData: Array<[number, number, number]> = [];
    for (const lane of LANES) {
      for (let z = -126; z < -20; z += 5.8) {
        const stagger = Math.floor((z + 126) / 5.8) % 2 ? 0.45 : -0.45;
        trackData.push([
          lane + stagger,
          z + random() * 1.1,
          random() * 0.18 - 0.09,
        ]);
      }
    }
    this.addInstances(
      geometry(new THREE.CapsuleGeometry(0.16, 0.48, 2, 6)),
      sandDark,
      trackData,
      ([x, z, angle], object) => {
        object.position.set(x, 0.025, z);
        object.rotation.set(Math.PI / 2, angle, 0);
        object.scale.set(1, 1, 0.12);
      },
      false,
    );

    // Weathered repair slabs and warning placards frame the embrasure edges.
    const slabData: Array<[number, number, number]> = [
      [-13.6, 1.3, -1.8],
      [13.6, 1.3, 1.8],
      [-15.6, 0.8, -0.7],
      [15.6, 0.8, 0.7],
    ];
    this.addInstances(
      geometry(new THREE.BoxGeometry(3.8, 2.3, 0.28)),
      concreteFace,
      slabData,
      ([x, y, yaw], object) => {
        object.position.set(x, y, 1.5);
        object.rotation.y = yaw;
      },
    );
    const warningTex = texture(warningSignTexture());
    const warningMat = material({
      map: warningTex,
      roughness: 0.92,
    });
    this.addSigns(geometry, warningMat, rust);
    this.addDust(geometry, random);
  }

  private addInstances<T>(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    data: T[],
    place: (
      datum: T,
      object: THREE.Object3D,
      index: number,
    ) => THREE.Color | void,
    shadows = true,
  ) {
    const mesh = new THREE.InstancedMesh(geometry, material, data.length);
    const object = new THREE.Object3D();
    data.forEach((datum, index) => {
      object.position.set(0, 0, 0);
      object.rotation.set(0, 0, 0);
      object.scale.set(1, 1, 1);
      const color = place(datum, object, index);
      object.position.y += beachHeight(object.position.x, object.position.z);
      object.updateMatrix();
      mesh.setMatrixAt(index, object.matrix);
      if (color) mesh.setColorAt(index, color);
    });
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    this.root.add(mesh);
    return mesh;
  }

  private addSigns(
    geometry: <T extends THREE.BufferGeometry>(value: T) => T,
    boardMaterial: THREE.Material,
    postMaterial: THREE.Material,
  ) {
    const board = new THREE.Mesh(
      geometry(new THREE.BoxGeometry(3.2, 1.25, 0.14)),
      boardMaterial,
    );
    board.position.set(-20, 1.7, -12);
    board.rotation.set(-0.08, 0.28, -0.09);
    board.castShadow = true;
    const posts = new THREE.InstancedMesh(
      geometry(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 5)),
      postMaterial,
      2,
    );
    const dummy = new THREE.Object3D();
    [-21.1, -18.9].forEach((x, index) => {
      dummy.position.set(x, 0.85, -12);
      dummy.rotation.z = -0.09;
      dummy.updateMatrix();
      posts.setMatrixAt(index, dummy.matrix);
    });
    this.root.add(board, posts);
  }

  private addDust(
    geometry: <T extends THREE.BufferGeometry>(value: T) => T,
    random: () => number,
  ) {
    const positions = new Float32Array(90 * 3);
    for (let index = 0; index < 90; index++) {
      positions[index * 3] = -85 + random() * 170;
      positions[index * 3 + 1] = 0.15 + random() * 2.3;
      positions[index * 3 + 2] = -18 - random() * 125;
    }
    const pointsGeometry = geometry(new THREE.BufferGeometry());
    pointsGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3),
    );
    const pointsMaterial = new THREE.ShaderMaterial({
      fog: true,
      transparent: true,
      depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uPixelRatio: { value: 1 },
        },
      ]),
      vertexShader: /* glsl */ `
        uniform float uTime;
        uniform float uPixelRatio;
        varying float vAlpha;
        #include <fog_pars_vertex>
        void main() {
          float seed = position.x * 0.37 + position.z * 0.53;
          vec3 drifted = position;
          drifted.x += sin(uTime * 0.45 + seed) * 1.4;
          drifted.y += sin(uTime * 0.75 + seed * 1.7) * 0.22;
          drifted.z += cos(uTime * 0.35 + seed * 1.3) * 0.9;
          vec4 mvPosition = modelViewMatrix * vec4(drifted, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp((0.28 * uPixelRatio * 420.0) / max(1.0, -mvPosition.z), 1.5, 16.0);
          vAlpha = 0.75 + 0.25 * sin(uTime * 1.1 + seed * 2.1);
          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        #include <fog_pars_fragment>
        void main() {
          float dist = length(gl_PointCoord - 0.5);
          if (dist > 0.5) discard;
          float soft = smoothstep(0.5, 0.08, dist);
          gl_FragColor = vec4(vec3(0.816, 0.725, 0.522), soft * 0.24 * vAlpha);
          #include <fog_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.dustMaterial = pointsMaterial;
    this.materials.push(pointsMaterial);
    this.root.add(new THREE.Points(pointsGeometry, pointsMaterial));
  }

  update(time: number, pixelRatio = 1) {
    this.grassUniforms.uTime.value = time;
    if (!this.dustMaterial) return;
    this.dustMaterial.uniforms.uTime.value = time;
    this.dustMaterial.uniforms.uPixelRatio.value = pixelRatio;
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    new Set(this.geometries).forEach((value) => value.dispose());
    new Set(this.materials).forEach((value) => value.dispose());
    new Set(this.textures).forEach((value) => value.dispose());
    this.root.clear();
  }
}
