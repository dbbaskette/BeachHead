import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const BILLBOARD_FBM_GLSL = /* glsl */ `
  float vfxHash( vec2 p ) {
    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
  }
  float vfxNoise( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    f = f * f * ( 3.0 - 2.0 * f );
    return mix(
      mix( vfxHash( i ), vfxHash( i + vec2( 1.0, 0.0 ) ), f.x ),
      mix( vfxHash( i + vec2( 0.0, 1.0 ) ), vfxHash( i + vec2( 1.0, 1.0 ) ), f.x ),
      f.y
    );
  }
  float vfxFbm( vec2 p ) {
    return vfxNoise( p ) * 0.55 + vfxNoise( p * 2.07 + 13.7 ) * 0.28 + vfxNoise( p * 4.13 - 9.2 ) * 0.14;
  }
`;

export type BillboardOptions = {
  blending: 'normal' | 'additive';
  kind: 'smoke' | 'fire';
  renderOrder?: number;
};

/** Fixed-capacity camera-facing billboard pool with FBM turbulence and proper fog/tonemapping. */
export class BillboardPool {
  readonly mesh: THREE.InstancedMesh;
  readonly material: THREE.ShaderMaterial;
  private geometry: THREE.PlaneGeometry;
  private centers: Float32Array;
  private scales: Float32Array;
  private alphas: Float32Array;
  private spins: Float32Array;
  private seeds: Float32Array;
  private centerAttr: THREE.InstancedBufferAttribute;
  private scaleAttr: THREE.InstancedBufferAttribute;
  private alphaAttr: THREE.InstancedBufferAttribute;
  private spinAttr: THREE.InstancedBufferAttribute;
  private seedAttr: THREE.InstancedBufferAttribute;
  private color = new THREE.Color();
  private lastCount = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    readonly capacity: number,
    options: BillboardOptions,
  ) {
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.centers = new Float32Array(capacity * 3);
    this.scales = new Float32Array(capacity * 2);
    this.alphas = new Float32Array(capacity);
    this.spins = new Float32Array(capacity);
    this.seeds = new Float32Array(capacity);

    this.centerAttr = new THREE.InstancedBufferAttribute(
      this.centers,
      3,
    ).setUsage(THREE.DynamicDrawUsage);
    this.scaleAttr = new THREE.InstancedBufferAttribute(
      this.scales,
      2,
    ).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.InstancedBufferAttribute(
      this.alphas,
      1,
    ).setUsage(THREE.DynamicDrawUsage);
    this.spinAttr = new THREE.InstancedBufferAttribute(this.spins, 1).setUsage(
      THREE.DynamicDrawUsage,
    );
    this.seedAttr = new THREE.InstancedBufferAttribute(this.seeds, 1).setUsage(
      THREE.DynamicDrawUsage,
    );

    this.geometry.setAttribute('aCenter', this.centerAttr);
    this.geometry.setAttribute('aScale', this.scaleAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);
    this.geometry.setAttribute('aSpin', this.spinAttr);
    this.geometry.setAttribute('aSeed', this.seedAttr);

    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uTime: { value: 0 } },
    ]);

    const vertexShader = /* glsl */ `
      attribute vec3 aCenter;
      attribute vec2 aScale;
      attribute float aAlpha;
      attribute float aSpin;
      attribute float aSeed;

      varying vec2 vUv;
      varying float vAlpha;
      varying vec3 vTint;
      varying float vSeed;

      #include <common>
      #include <fog_pars_vertex>

      void main() {
        vUv = uv;
        vAlpha = aAlpha;
        vSeed = aSeed;
        #ifdef USE_INSTANCING_COLOR
          vTint = instanceColor;
        #else
          vTint = vec3( 1.0 );
        #endif

        vec4 mvPosition = modelViewMatrix * vec4( aCenter, 1.0 );
        float c = cos( aSpin );
        float s = sin( aSpin );
        vec2 rotated = vec2(
          position.x * c - position.y * s,
          position.x * s + position.y * c
        ) * aScale;
        mvPosition.xy += rotated;
        gl_Position = projectionMatrix * mvPosition;

        #include <fog_vertex>
      }
    `;

    const fragmentShader =
      options.kind === 'fire'
        ? /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          varying float vAlpha;
          varying vec3 vTint;
          varying float vSeed;

          #include <common>
          #include <fog_pars_fragment>
          ${BILLBOARD_FBM_GLSL}

          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float r = length( p );
            float n = vfxFbm( vUv * 4.5 + vec2( vSeed * 7.13, vSeed * 3.71 - uTime * 0.45 ) );
            float core = exp( -r * r * 6.0 );
            float halo = ( 1.0 - smoothstep( 0.12, 1.0, r + ( n - 0.5 ) * 0.35 ) ) * ( 0.72 + 0.28 * n );
            float alpha = clamp( halo + core * 0.6, 0.0, 1.0 ) * vAlpha;
            if ( alpha < 0.005 ) discard;

            vec3 hotCore = vec3( 1.8, 1.55, 1.1 ) * max( max( vTint.r, vTint.g ), 1.0 );
            vec3 fireColor = mix( vTint, hotCore, core * 0.68 );

            #ifdef USE_FOG
              #ifdef FOG_EXP2
                float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
              #else
                float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
              #endif
              fireColor *= ( 1.0 - fogFactor );
            #endif

            gl_FragColor = vec4( fireColor, alpha );
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `
        : /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          varying float vAlpha;
          varying vec3 vTint;
          varying float vSeed;

          #include <common>
          #include <fog_pars_fragment>
          ${BILLBOARD_FBM_GLSL}

          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float r = length( p );
            float cloud = vfxFbm( vUv * 5.2 + vec2( vSeed * 11.3 + uTime * 0.04, vSeed * 5.9 ) );
            float edge = 1.0 - smoothstep( 0.28, 1.0, r + ( cloud - 0.5 ) * 0.45 );
            float alpha = edge * ( 0.48 + 0.52 * cloud ) * vAlpha;
            if ( alpha < 0.005 ) discard;

            float shade = 0.68 + 0.36 * vUv.y + ( cloud - 0.5 ) * 0.24;
            gl_FragColor = vec4( vTint * shade, alpha );

            #include <fog_fragment>
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `;

    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      fog: true,
      blending:
        options.blending === 'additive'
          ? THREE.AdditiveBlending
          : THREE.NormalBlending,
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    if (options.renderOrder !== undefined) {
      this.mesh.renderOrder = options.renderOrder;
    }
    scene.add(this.mesh);
  }

  set(
    index: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
    spin: number,
    seed: number,
  ) {
    if (index < 0 || index >= this.capacity) return;
    const o3 = index * 3;
    const o2 = index * 2;
    this.centers[o3] = x;
    this.centers[o3 + 1] = y;
    this.centers[o3 + 2] = z;
    this.scales[o2] = sx;
    this.scales[o2 + 1] = sy;
    this.alphas[index] = alpha;
    this.spins[index] = spin;
    this.seeds[index] = seed;
    this.color.setRGB(r, g, b);
    this.mesh.setColorAt(index, this.color);
  }

  commit(count: number, time = 0) {
    const clamped = Math.max(0, Math.min(this.capacity, count));
    this.material.uniforms.uTime.value = time;
    this.mesh.count = clamped;
    if (clamped > 0 || this.lastCount > 0) {
      this.centerAttr.needsUpdate = true;
      this.scaleAttr.needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
      this.spinAttr.needsUpdate = true;
      this.seedAttr.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    this.lastCount = clamped;
  }

  clear() {
    this.commit(0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

/** Camera-aligned stretched tracer ribbon pool replacing 1px WebGL LineSegments. */
export class TracerPool {
  readonly mesh: THREE.InstancedMesh;
  readonly material: THREE.ShaderMaterial;
  private geometry: THREE.PlaneGeometry;
  private starts: Float32Array;
  private ends: Float32Array;
  private widths: Float32Array;
  private alphas: Float32Array;
  private startAttr: THREE.InstancedBufferAttribute;
  private endAttr: THREE.InstancedBufferAttribute;
  private widthAttr: THREE.InstancedBufferAttribute;
  private alphaAttr: THREE.InstancedBufferAttribute;
  private color = new THREE.Color();
  private lastCount = 0;
  private disposed = false;

  constructor(
    scene: THREE.Scene,
    readonly capacity: number,
  ) {
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.starts = new Float32Array(capacity * 3);
    this.ends = new Float32Array(capacity * 3);
    this.widths = new Float32Array(capacity);
    this.alphas = new Float32Array(capacity);

    this.startAttr = new THREE.InstancedBufferAttribute(
      this.starts,
      3,
    ).setUsage(THREE.DynamicDrawUsage);
    this.endAttr = new THREE.InstancedBufferAttribute(this.ends, 3).setUsage(
      THREE.DynamicDrawUsage,
    );
    this.widthAttr = new THREE.InstancedBufferAttribute(
      this.widths,
      1,
    ).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.InstancedBufferAttribute(
      this.alphas,
      1,
    ).setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('aStart', this.startAttr);
    this.geometry.setAttribute('aEnd', this.endAttr);
    this.geometry.setAttribute('aWidth', this.widthAttr);
    this.geometry.setAttribute('aAlpha', this.alphaAttr);

    const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);

    this.material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aStart;
        attribute vec3 aEnd;
        attribute float aWidth;
        attribute float aAlpha;

        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vTint;

        #include <common>
        #include <fog_pars_vertex>

        void main() {
          vUv = uv;
          vAlpha = aAlpha;
          #ifdef USE_INSTANCING_COLOR
            vTint = instanceColor;
          #else
            vTint = vec3( 1.0 );
          #endif

          float t = position.y + 0.5;
          vec3 seg = aEnd - aStart;
          float len = length( seg );
          vec3 segDir = len > 1e-5 ? seg / len : vec3( 0.0, 0.0, -1.0 );
          vec3 worldPos = mix( aStart, aEnd, t );
          vec3 viewDir = normalize( cameraPosition - worldPos );
          vec3 crossVec = cross( viewDir, segDir );
          float crossLen = length( crossVec );
          vec3 side = crossLen > 1e-4
            ? crossVec / crossLen
            : normalize( cross( vec3( 0.0, 1.0, 0.0 ), segDir ) + vec3( 1e-5, 0.0, 0.0 ) );

          float dist = length( cameraPosition - worldPos );
          float halfW = max( aWidth, dist * 0.0014 ) * ( 0.45 + 0.55 * t );
          worldPos += side * position.x * halfW * 2.0;

          vec4 mvPosition = viewMatrix * vec4( worldPos, 1.0 );
          gl_Position = projectionMatrix * mvPosition;

          #include <fog_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vAlpha;
        varying vec3 vTint;

        #include <common>
        #include <fog_pars_fragment>

        void main() {
          float across = vUv.x * 2.0 - 1.0;
          float along = vUv.y;
          float core = exp( -across * across * 4.5 );
          float tip = smoothstep( 0.0, 0.25, along ) * ( 1.0 - smoothstep( 0.88, 1.0, along ) );
          float alpha = core * tip * vAlpha;
          if ( alpha < 0.005 ) discard;

          vec3 color = mix( vTint, vTint * 1.45 + vec3( 0.45 ), core * 0.65 );
          #ifdef USE_FOG
            #ifdef FOG_EXP2
              float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
            #else
              float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
            #endif
            color *= ( 1.0 - fogFactor );
          #endif

          gl_FragColor = vec4( color, alpha );
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: true,
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    scene.add(this.mesh);
  }

  set(
    index: number,
    sx: number,
    sy: number,
    sz: number,
    ex: number,
    ey: number,
    ez: number,
    width: number,
    r: number,
    g: number,
    b: number,
    alpha: number,
  ) {
    if (index < 0 || index >= this.capacity) return;
    const o = index * 3;
    this.starts[o] = sx;
    this.starts[o + 1] = sy;
    this.starts[o + 2] = sz;
    this.ends[o] = ex;
    this.ends[o + 1] = ey;
    this.ends[o + 2] = ez;
    this.widths[index] = width;
    this.alphas[index] = alpha;
    this.color.setRGB(r, g, b);
    this.mesh.setColorAt(index, this.color);
  }

  commit(count: number) {
    const clamped = Math.max(0, Math.min(this.capacity, count));
    this.mesh.count = clamped;
    if (clamped > 0 || this.lastCount > 0) {
      this.startAttr.needsUpdate = true;
      this.endAttr.needsUpdate = true;
      this.widthAttr.needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    this.lastCount = clamped;
  }

  clear() {
    this.commit(0);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.mesh.dispose();
  }
}

/** Streamlined aerial bomb geometry with cruciform tail fins and stabilizer shroud. */
export function createBombGeometry(noseSign: 1 | -1 = 1): THREE.BufferGeometry {
  const normalize = (g: THREE.BufferGeometry) => {
    const out = g.index ? g.toNonIndexed() : g.clone();
    g.dispose();
    return out;
  };
  const profile = [
    new THREE.Vector2(0.01, -0.7),
    new THREE.Vector2(0.11, -0.58),
    new THREE.Vector2(0.21, -0.25),
    new THREE.Vector2(0.24, 0.15),
    new THREE.Vector2(0.21, 0.45),
    new THREE.Vector2(0.11, 0.64),
    new THREE.Vector2(0.0, 0.72),
  ];
  const body = new THREE.LatheGeometry(profile, 14);
  body.rotateX(noseSign > 0 ? Math.PI / 2 : -Math.PI / 2);

  const finA = new THREE.BoxGeometry(0.56, 0.03, 0.34);
  finA.translate(0, 0, -noseSign * 0.55);

  const finB = new THREE.BoxGeometry(0.03, 0.56, 0.34);
  finB.translate(0, 0, -noseSign * 0.55);

  const ring = new THREE.CylinderGeometry(0.28, 0.28, 0.2, 14, 1, true);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0, -noseSign * 0.58);

  const parts = [body, finA, finB, ring].map(normalize);
  const merged = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('Bomb geometry could not be merged');
  return merged;
}

/** Crossed additive HDR muzzle flash cards for rifles and SMGs. */
export function createMuzzleFlashMesh(scale = 1): THREE.Mesh {
  const parts: THREE.BufferGeometry[] = [];
  const longitudinalA = new THREE.PlaneGeometry(0.22 * scale, 0.44 * scale);
  longitudinalA.rotateX(-Math.PI / 2);
  longitudinalA.translate(0, 0, -0.22 * scale);
  parts.push(longitudinalA);

  const longitudinalB = new THREE.PlaneGeometry(0.22 * scale, 0.44 * scale);
  longitudinalB.rotateX(-Math.PI / 2);
  longitudinalB.rotateZ(Math.PI / 2);
  longitudinalB.translate(0, 0, -0.22 * scale);
  parts.push(longitudinalB);

  const frontStar = new THREE.PlaneGeometry(0.32 * scale, 0.32 * scale);
  frontStar.translate(0, 0, -0.06 * scale);
  parts.push(frontStar);

  const normalized = parts.map((g) => {
    const out = g.index ? g.toNonIndexed() : g.clone();
    g.dispose();
    return out;
  });
  const merged = mergeGeometries(normalized, false);
  normalized.forEach((p) => p.dispose());
  if (!merged) throw new Error('Muzzle flash geometry could not be merged');

  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length( p );
        float crossRays = exp( -abs( p.x ) * 7.5 ) * exp( -abs( p.y ) * 2.2 )
          + exp( -abs( p.y ) * 7.5 ) * exp( -abs( p.x ) * 2.2 );
        float core = exp( -r * r * 5.2 );
        float alpha = clamp( core + crossRays * 0.55, 0.0, 1.0 ) * ( 1.0 - smoothstep( 0.55, 1.0, r ) );
        if ( alpha < 0.01 ) discard;
        vec3 color = mix( vec3( 2.6, 1.45, 0.45 ), vec3( 3.6, 2.9, 1.8 ), core );
        gl_FragColor = vec4( color, alpha );
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });

  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/** Organic instanced blood decal shader supporting per-instance alpha and shape seed. */
export function createBloodSplatMaterial(): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]);
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      attribute float aSeed;

      varying vec2 vUv;
      varying float vAlpha;
      varying float vSeed;

      #include <common>
      #include <fog_pars_vertex>

      void main() {
        vUv = uv;
        vAlpha = aAlpha;
        vSeed = aSeed;
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      varying float vAlpha;
      varying float vSeed;

      #include <common>
      #include <fog_pars_fragment>

      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float angle = atan( p.y, p.x );
        float radius = length( p );
        float edge = 0.62
          + 0.16 * sin( angle * 5.0 + vSeed * 6.28 )
          + 0.11 * cos( angle * 9.0 - vSeed * 11.4 )
          + 0.07 * sin( angle * 13.0 + vSeed * 3.7 );
        float mask = 1.0 - smoothstep( edge - 0.14, edge, radius );
        float alpha = mask * vAlpha;
        if ( alpha < 0.01 ) discard;

        vec3 core = vec3( 0.24, 0.028, 0.022 );
        vec3 rim = vec3( 0.42, 0.065, 0.055 );
        vec3 color = mix( rim, core, smoothstep( edge, 0.15, radius ) );
        gl_FragColor = vec4( color, alpha );

        #include <fog_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: true,
  });
}
