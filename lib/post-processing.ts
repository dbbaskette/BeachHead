import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export type BloomComposerOptions = {
  strength?: number;
  radius?: number;
  threshold?: number;
};

/** Multisampled HDR EffectComposer with selective high-threshold bloom and ACES output. */
export function createBloomComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  options: BloomComposerOptions = {},
) {
  const renderTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, renderTarget);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(1, 1),
    options.strength ?? 0.26,
    options.radius ?? 0.4,
    options.threshold ?? 1.15,
  );
  const output = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);

  return {
    composer,
    renderPass,
    bloom,
    output,
    renderTarget,
    setSize(width: number, height: number) {
      if (width > 0 && height > 0) composer.setSize(width, height);
    },
    render() {
      composer.render();
    },
    dispose() {
      renderPass.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
    },
  };
}
