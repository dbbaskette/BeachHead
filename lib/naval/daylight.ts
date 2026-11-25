import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/** All direct light and water highlights use the same world-space sun direction. */
export const COASTAL_SUN = new THREE.Vector3(-0.52, 0.7, 0.48).normalize();

const SUN_UP_AXIS = new THREE.Vector3(0, 1, 0);
const SUN_RIGHT = new THREE.Vector3()
  .crossVectors(SUN_UP_AXIS, COASTAL_SUN)
  .normalize();
const SUN_UP = new THREE.Vector3()
  .crossVectors(COASTAL_SUN, SUN_RIGHT)
  .normalize();
const _snapPoint = new THREE.Vector3();

/** Snap directional shadow targets to texel increments in light space to avoid shimmer. */
export function snapDirectionalShadow(
  sun: THREE.DirectionalLight,
  x: number,
  y: number,
  z: number,
  distance: number,
) {
  const cam = sun.shadow.camera;
  const texelX = (cam.right - cam.left) / Math.max(1, sun.shadow.mapSize.x);
  const texelY = (cam.top - cam.bottom) / Math.max(1, sun.shadow.mapSize.y);
  _snapPoint.set(x, y, z);
  const u = Math.round(_snapPoint.dot(SUN_RIGHT) / texelX) * texelX;
  const v = Math.round(_snapPoint.dot(SUN_UP) / texelY) * texelY;
  const w = _snapPoint.dot(COASTAL_SUN);
  sun.target.position
    .set(0, 0, 0)
    .addScaledVector(SUN_RIGHT, u)
    .addScaledVector(SUN_UP, v)
    .addScaledVector(COASTAL_SUN, w);
  sun.position
    .copy(COASTAL_SUN)
    .multiplyScalar(distance)
    .add(sun.target.position);
  sun.target.updateMatrixWorld();
}

export function makeDaylightSky() {
  const sky = new Sky();
  sky.name = 'coastal-daylight';
  // Normalize the analytical sky's HDR radiance to the game's daylight exposure.
  // This also calibrates the sky used to bake image-based material lighting.
  sky.material.fragmentShader = sky.material.fragmentShader.replace(
    'vec4( texColor, 1.0 )',
    'vec4( texColor * 0.12, 1.0 )',
  );
  sky.scale.setScalar(14000);
  const uniforms = sky.material.uniforms;
  uniforms.sunPosition.value.copy(COASTAL_SUN).multiplyScalar(10000);
  uniforms.turbidity.value = 2.2;
  uniforms.rayleigh.value = 2.2;
  uniforms.mieCoefficient.value = 0.004;
  uniforms.mieDirectionalG.value = 0.8;
  uniforms.cloudCoverage.value = 0.48;
  uniforms.cloudDensity.value = 0.36;
  uniforms.cloudSpeed.value = 0.000008;
  sky.castShadow = sky.receiveShadow = false;
  return sky;
}

/** Build a temporary environment scene combining sky dome and lower-hemisphere ground bounce. */
export function buildCoastalEnvironmentScene(
  sky: Sky,
  groundColor = '#344a50',
) {
  const scene = new THREE.Scene();
  const skyClone = sky.clone();
  const groundGeo = new THREE.CircleGeometry(6000, 24);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = new THREE.MeshBasicMaterial({ color: groundColor });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.y = -20;
  scene.add(skyClone, ground);
  return {
    scene,
    dispose() {
      groundGeo.dispose();
      groundMat.dispose();
    },
  };
}

/** Bake a PMREM environment from the coastal sky without the HDR sun disc ringing artifact. */
export function bakeCoastalEnvironment(
  renderer: THREE.WebGLRenderer,
  sky: Sky,
  groundColor = '#344a50',
  far = 18000,
): THREE.WebGLRenderTarget {
  const showSunDisc = sky.material.uniforms.showSunDisc;
  const prev = showSunDisc?.value;
  if (showSunDisc) showSunDisc.value = false;
  const env = buildCoastalEnvironmentScene(sky, groundColor);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env.scene, 0.08, 0.1, far);
  if (showSunDisc && prev !== undefined) showSunDisc.value = prev;
  env.dispose();
  pmrem.dispose();
  return target;
}
