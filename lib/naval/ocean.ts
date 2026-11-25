import { COASTAL_SUN } from './daylight';
import { assetUrl } from '../asset-url';
import * as THREE from 'three';

export const WATER_REFLECTION_LAYER = 1;

/** Allow an object (and its descendants) to appear in planar ocean reflections. */
export function enableWaterReflection(object: THREE.Object3D) {
  object.traverse((child) => child.layers.enable(WATER_REFLECTION_LAYER));
}

export type OceanShip = {
  x: number;
  z: number;
  heading: number;
  length: number;
  health: number;
};

export type OceanOptions = {
  reflection?: 'planar' | 'environment';
  textureSize?: number;
  reflectionLayer?: number;
  shorelineZ?: number;
  normalMap?: THREE.Texture;
};

export function makeOcean(options: OceanOptions = {}) {
  const reflection = options.reflection ?? 'planar';
  const textureSize = options.textureSize ?? 512;
  const reflectionLayer = options.reflectionLayer ?? WATER_REFLECTION_LAYER;
  const ownsNormal = !options.normalMap;
  const normal =
    options.normalMap ??
    new THREE.TextureLoader().load(assetUrl('/textures/water-normal.jpg'));
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.anisotropy = 8;

  const geometry = new THREE.PlaneGeometry(20000, 20000, 1, 1);
  const renderTarget =
    reflection === 'planar'
      ? new THREE.WebGLRenderTarget(textureSize, textureSize, {
          type: THREE.HalfFloatType,
        })
      : null;
  const mirrorCamera =
    reflection === 'planar' ? new THREE.PerspectiveCamera() : null;
  if (mirrorCamera) mirrorCamera.layers.set(reflectionLayer);

  const textureMatrix = new THREE.Matrix4();
  const eye = new THREE.Vector3();
  const wakes = Array.from({ length: 4 }, () => new THREE.Vector4());

  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      normalSampler: { value: null },
      alpha: { value: 1.0 },
      time: { value: 0.0 },
      size: { value: 3.5 },
      distortionScale: { value: 5.5 },
      sunColor: { value: null },
      sunDirection: { value: null },
      eye: { value: null },
      waterColor: { value: null },
      uWakes: { value: null },
      uShorelineZ: { value: options.shorelineZ ?? 1e6 },
      uHasShoreline: { value: options.shorelineZ !== undefined ? 1.0 : 0.0 },
      ...(renderTarget
        ? {
            mirrorSampler: { value: null },
            textureMatrix: { value: null },
          }
        : {}),
    },
  ]);
  uniforms.normalSampler.value = normal;
  uniforms.sunColor.value = new THREE.Color('#ffe1b0');
  uniforms.sunDirection.value = COASTAL_SUN.clone();
  uniforms.eye.value = eye;
  uniforms.waterColor.value = new THREE.Color('#0c5360');
  uniforms.uWakes.value = wakes;
  if (renderTarget) {
    uniforms.mirrorSampler.value = renderTarget.texture;
    uniforms.textureMatrix.value = textureMatrix;
  }

  const vertexShader = /* glsl */ `
    ${renderTarget ? 'uniform mat4 textureMatrix;\nvarying vec4 mirrorCoord;' : ''}
    varying vec4 worldPosition;

    #include <common>
    #include <fog_pars_vertex>
    #include <logdepthbuf_pars_vertex>

    void main() {
      worldPosition = modelMatrix * vec4( position, 1.0 );
      ${renderTarget ? 'mirrorCoord = textureMatrix * worldPosition;' : ''}
      vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
      gl_Position = projectionMatrix * mvPosition;

      #include <logdepthbuf_vertex>
      #include <fog_vertex>
    }
  `;

  const reflectionUniforms = renderTarget
    ? /* glsl */ `
        uniform sampler2D mirrorSampler;
        varying vec4 mirrorCoord;
      `
    : '';

  const reflectionSnippet = renderTarget
    ? /* glsl */ `
        vec2 reflectionUv = mirrorCoord.xy / max( mirrorCoord.w, 0.0001 ) + distortion;
        vec2 spread = vec2( 0.0012, 0.0032 ) * ( 1.0 + min( distance / 1400.0, 1.0 ) );
        vec3 reflectionSample = texture2D( mirrorSampler, clamp( reflectionUv, 0.002, 0.998 ) ).rgb * 0.4;
        reflectionSample += texture2D( mirrorSampler, clamp( reflectionUv + spread, 0.002, 0.998 ) ).rgb * 0.15;
        reflectionSample += texture2D( mirrorSampler, clamp( reflectionUv - spread, 0.002, 0.998 ) ).rgb * 0.15;
        reflectionSample += texture2D( mirrorSampler, clamp( reflectionUv + vec2( -spread.x, spread.y ), 0.002, 0.998 ) ).rgb * 0.15;
        reflectionSample += texture2D( mirrorSampler, clamp( reflectionUv + vec2( spread.x, -spread.y ), 0.002, 0.998 ) ).rgb * 0.15;
        float reflectionWeight = reflectance * 0.58;
      `
    : /* glsl */ `
        vec3 refl = reflect( -eyeDirection, surfaceNormal );
        float elev = clamp( refl.y, 0.0, 1.0 );
        vec3 reflectionSample = mix( vec3( 0.46, 0.56, 0.58 ), vec3( 0.11, 0.25, 0.42 ), pow( elev, 0.55 ) )
          + sunColor * pow( max( dot( normalize( refl ), sunDirection ), 0.0 ), 8.0 ) * 0.24;
        float reflectionWeight = reflectance * 0.65;
      `;

  const fragmentShader = /* glsl */ `
    ${reflectionUniforms}
    uniform float alpha;
    uniform float time;
    uniform float size;
    uniform float distortionScale;
    uniform sampler2D normalSampler;
    uniform vec3 sunColor;
    uniform vec3 sunDirection;
    uniform vec3 eye;
    uniform vec3 waterColor;
    uniform vec4 uWakes[4];
    uniform float uShorelineZ;
    uniform float uHasShoreline;

    varying vec4 worldPosition;

    vec4 getNoise( vec2 uv ) {
      vec2 uv0 = ( uv / 103.0 ) + vec2( time / 17.0, time / 29.0 );
      vec2 uv1 = uv / 107.0 - vec2( time / -19.0, time / 31.0 );
      vec2 uv2 = uv / vec2( 8907.0, 9803.0 ) + vec2( time / 101.0, time / 97.0 );
      vec2 uv3 = uv / vec2( 1091.0, 1027.0 ) - vec2( time / 109.0, time / -113.0 );
      vec4 noise = texture2D( normalSampler, uv0 ) +
        texture2D( normalSampler, uv1 ) +
        texture2D( normalSampler, uv2 ) +
        texture2D( normalSampler, uv3 );
      return noise * 0.5 - 1.0;
    }

    void sunLight( const vec3 surfaceNormal, const vec3 eyeDirection, float shiny, float spec, float diffuse, inout vec3 diffuseColor, inout vec3 specularColor ) {
      vec3 reflection = normalize( reflect( -sunDirection, surfaceNormal ) );
      float direction = max( 0.0, dot( eyeDirection, reflection ) );
      specularColor += pow( direction, shiny ) * sunColor * spec;
      diffuseColor += max( dot( sunDirection, surfaceNormal ), 0.0 ) * sunColor * diffuse;
    }

    float wakeFoam( vec2 p, vec4 ship, vec4 n ) {
      if ( ship.w < 1.0 ) return 0.0;
      vec2 d = p - ship.xy;
      vec2 forward = vec2( sin( ship.z ), -cos( ship.z ) );
      float aft = -dot( d, forward );
      float side = dot( d, vec2( cos( ship.z ), sin( ship.z ) ) );
      float start = ship.w * 0.38;
      float tail = max( 0.0, aft - start );
      float width = ship.w * 0.055 + tail * 0.055;
      float trail = smoothstep( start, start + 6.0, aft ) * exp( -tail / ( ship.w * 1.6 ) ) * exp( -pow( side / width, 2.0 ) );
      float v = exp( -pow( ( abs( side ) - ( tail * 0.24 + ship.w * 0.08 ) ) / 2.5, 2.0 ) ) * exp( -tail / ( ship.w * 1.3 ) ) * smoothstep( start, start + 8.0, aft );
      float bow = exp( -pow( ( aft + ship.w * 0.43 ) / 5.0, 2.0 ) ) * exp( -pow( ( abs( side ) - ship.w * 0.06 ) / 2.0, 2.0 ) );
      float breakup = clamp( 0.68 + 0.32 * sin( tail * 0.15 - time * 0.65 ) * sin( side * 0.4 + tail * 0.07 ) + ( n.x + n.y ) * 0.18, 0.35, 1.15 );
      return clamp( ( trail * 0.34 + v * 0.14 + bow * 0.32 ) * breakup, 0.0, 0.62 );
    }

    #include <common>
    #include <fog_pars_fragment>
    #include <logdepthbuf_pars_fragment>

    void main() {
      #include <logdepthbuf_fragment>
      vec4 noise = getNoise( worldPosition.xz * size );
      vec3 surfaceNormal = normalize( noise.xzy * vec3( 1.5, 1.0, 1.5 ) );

      vec3 diffuseLight = vec3( 0.0 );
      vec3 specularLight = vec3( 0.0 );

      vec3 worldToEye = eye - worldPosition.xyz;
      vec3 eyeDirection = normalize( worldToEye );
      sunLight( surfaceNormal, eyeDirection, 100.0, 2.0, 0.5, diffuseLight, specularLight );

      float distance = length( worldToEye );
      vec2 distortion = surfaceNormal.xz * ( 0.001 + 1.0 / max( distance, 1.0 ) ) * distortionScale;
      float theta = max( dot( eyeDirection, surfaceNormal ), 0.0 );
      float rf0 = 0.02;
      float reflectance = rf0 + ( 1.0 - rf0 ) * pow( ( 1.0 - theta ), 5.0 );

      ${reflectionSnippet}

      vec3 scatter = max( 0.0, dot( surfaceNormal, eyeDirection ) ) * waterColor;
      vec3 albedo = mix( sunColor * diffuseLight * 0.3 + scatter, reflectionSample + specularLight, reflectionWeight );

      float foam = 0.0;
      for ( int i = 0; i < 4; i++ ) foam += wakeFoam( worldPosition.xz, uWakes[ i ], noise );

      float shoreFoam = 0.0;
      vec3 baseOcean = albedo * vec3( 0.74, 0.92, 1.03 );
      if ( uHasShoreline > 0.5 ) {
        float shore = uShorelineZ + sin( worldPosition.x * 0.015 ) * 6.0;
        float offshore = shore - worldPosition.z;
        float shallow = 1.0 - smoothstep( 0.0, 48.0, offshore );
        baseOcean = mix( baseOcean, vec3( 0.18, 0.35, 0.31 ), shallow * 0.55 );
        float breaker = pow( max( 0.0, sin( offshore * 0.24 + time * 1.6 + sin( worldPosition.x * 0.05 ) * 1.5 ) ), 10.0 ) * ( 1.0 - smoothstep( 4.0, 42.0, offshore ) );
        float wash = ( 1.0 - smoothstep( -1.5, 3.2, offshore ) ) * 0.72;
        float edgeMask = smoothstep( -4.0, 2.0, offshore );
        shoreFoam = clamp( ( breaker * 0.65 + wash ) * ( 0.65 + 0.35 * noise.y ) * edgeMask, 0.0, 0.75 );
      }

      float crest = smoothstep( 0.55, 0.84, noise.y ) * 0.11;
      vec3 foamTint = vec3( 0.76, 0.88, 0.87 ) * ( 0.58 + 0.42 * max( dot( surfaceNormal, sunDirection ), 0.0 ) );
      vec3 outgoingLight = mix( baseOcean, foamTint, clamp( foam + crest + shoreFoam, 0.0, 0.85 ) );

      gl_FragColor = vec4( outgoingLight, alpha );

      #include <fog_fragment>
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `;

  const material = new THREE.ShaderMaterial({
    name: 'CoastalOcean',
    uniforms,
    vertexShader,
    fragmentShader,
    fog: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.z = -3000;

  if (renderTarget && mirrorCamera) {
    const mirrorPlane = new THREE.Plane();
    const normalVec = new THREE.Vector3();
    const mirrorWorldPosition = new THREE.Vector3();
    const cameraWorldPosition = new THREE.Vector3();
    const rotationMatrix = new THREE.Matrix4();
    const lookAtPosition = new THREE.Vector3(0, 0, -1);
    const clipPlane = new THREE.Vector4();
    const view = new THREE.Vector3();
    const target = new THREE.Vector3();
    const q = new THREE.Vector4();

    mesh.onBeforeRender = (renderer, scene, camera) => {
      mirrorWorldPosition.setFromMatrixPosition(mesh.matrixWorld);
      cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);
      rotationMatrix.extractRotation(mesh.matrixWorld);
      normalVec.set(0, 0, 1).applyMatrix4(rotationMatrix);

      view.subVectors(mirrorWorldPosition, cameraWorldPosition);
      if (view.dot(normalVec) > 0) return;

      view.reflect(normalVec).negate().add(mirrorWorldPosition);
      rotationMatrix.extractRotation(camera.matrixWorld);
      lookAtPosition
        .set(0, 0, -1)
        .applyMatrix4(rotationMatrix)
        .add(cameraWorldPosition);
      target
        .subVectors(mirrorWorldPosition, lookAtPosition)
        .reflect(normalVec)
        .negate()
        .add(mirrorWorldPosition);

      mirrorCamera.position.copy(view);
      mirrorCamera.up
        .set(0, 1, 0)
        .applyMatrix4(rotationMatrix)
        .reflect(normalVec);
      mirrorCamera.lookAt(target);
      mirrorCamera.far = (camera as THREE.PerspectiveCamera).far ?? 20000;
      mirrorCamera.updateMatrixWorld();
      mirrorCamera.projectionMatrix.copy(camera.projectionMatrix);

      textureMatrix.set(
        0.5,
        0.0,
        0.0,
        0.5,
        0.0,
        0.5,
        0.0,
        0.5,
        0.0,
        0.0,
        0.5,
        0.5,
        0.0,
        0.0,
        0.0,
        1.0,
      );
      textureMatrix.multiply(mirrorCamera.projectionMatrix);
      textureMatrix.multiply(mirrorCamera.matrixWorldInverse);

      mirrorPlane.setFromNormalAndCoplanarPoint(normalVec, mirrorWorldPosition);
      mirrorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse);
      clipPlane.set(
        mirrorPlane.normal.x,
        mirrorPlane.normal.y,
        mirrorPlane.normal.z,
        mirrorPlane.constant,
      );

      const projectionMatrix = mirrorCamera.projectionMatrix;
      q.x =
        (Math.sign(clipPlane.x) + projectionMatrix.elements[8]) /
        projectionMatrix.elements[0];
      q.y =
        (Math.sign(clipPlane.y) + projectionMatrix.elements[9]) /
        projectionMatrix.elements[5];
      q.z = -1.0;
      q.w =
        (1.0 + projectionMatrix.elements[10]) / projectionMatrix.elements[14];

      clipPlane.multiplyScalar(2.0 / clipPlane.dot(q));
      projectionMatrix.elements[2] = clipPlane.x;
      projectionMatrix.elements[6] = clipPlane.y;
      projectionMatrix.elements[10] = clipPlane.z + 1.0;
      projectionMatrix.elements[14] = clipPlane.w;

      eye.setFromMatrixPosition(camera.matrixWorld);

      const currentRenderTarget = renderer.getRenderTarget();
      const currentXrEnabled = renderer.xr.enabled;
      const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

      mesh.visible = false;
      renderer.xr.enabled = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setRenderTarget(renderTarget);
      renderer.state.buffers.depth.setMask(true);
      if (renderer.autoClear === false) renderer.clear();
      renderer.render(scene, mirrorCamera);
      mesh.visible = true;

      renderer.xr.enabled = currentXrEnabled;
      renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
      renderer.setRenderTarget(currentRenderTarget);

      const viewport = (
        camera as THREE.PerspectiveCamera & { viewport?: THREE.Vector4 }
      ).viewport;
      if (viewport !== undefined) renderer.state.viewport(viewport);
    };
  } else {
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
      eye.setFromMatrixPosition(camera.matrixWorld);
    };
  }

  return {
    mesh,
    material,
    renderTarget,
    mirrorCamera,
    update(
      time: number,
      battle: { ships: readonly OceanShip[] },
      playerShip?: OceanShip | null,
    ) {
      material.uniforms.time.value = time * 0.68;
      for (let i = 0; i < 4; i++) wakes[i].set(0, 0, 0, 0);
      const limit = playerShip ? 3 : 4;
      for (let i = 0; i < Math.min(limit, battle.ships.length); i++) {
        const s = battle.ships[i];
        wakes[i].set(s.x, s.z, s.heading, s.health > 0 ? s.length : 0);
      }
      if (playerShip && playerShip.health > 0) {
        wakes[3].set(
          playerShip.x,
          playerShip.z,
          playerShip.heading,
          playerShip.length,
        );
      }
    },
    dispose() {
      renderTarget?.dispose();
      if (ownsNormal) normal.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
export { makeDaylightSky as makeSky } from './daylight';
