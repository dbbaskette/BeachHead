import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/** All direct light and water highlights use the same world-space sun direction. */
export const COASTAL_SUN = new THREE.Vector3(-0.52, 0.7, 0.48).normalize();

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
