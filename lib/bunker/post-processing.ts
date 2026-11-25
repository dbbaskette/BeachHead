import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

export const WEAPON_LAYER = 2;

/** Low-key tungsten & concrete environment for underground metallic speculars. */
export function createBunkerEnvironmentScene() {
  const scene = new T.Scene();
  const geometries: T.BufferGeometry[] = [];
  const materials: T.Material[] = [];

  const track = <G extends T.BufferGeometry>(g: G) => {
    geometries.push(g);
    return g;
  };
  const trackMat = <M extends T.Material>(m: M) => {
    materials.push(m);
    return m;
  };

  const wallMat = trackMat(
    new T.MeshBasicMaterial({ color: '#2b2d29', side: T.BackSide }),
  );
  const room = new T.Mesh(track(new T.BoxGeometry(12, 5, 14)), wallMat);
  room.position.y = 2.5;
  scene.add(room);

  const floor = new T.Mesh(
    track(new T.PlaneGeometry(12, 14)),
    trackMat(new T.MeshBasicMaterial({ color: '#1e1f1c' })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.02;
  scene.add(floor);

  const ceiling = new T.Mesh(
    track(new T.PlaneGeometry(12, 14)),
    trackMat(new T.MeshBasicMaterial({ color: '#242622' })),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 4.98;
  scene.add(ceiling);

  const fixtureGeo = track(new T.BoxGeometry(1.4, 0.12, 0.45));
  const warmMat = trackMat(
    new T.MeshBasicMaterial({
      color: new T.Color('#ffcb7d').multiplyScalar(3.5),
    }),
  );
  for (const z of [-4.2, 0, 4.2]) {
    const strip = new T.Mesh(fixtureGeo, warmMat);
    strip.position.set(0, 4.88, z);
    scene.add(strip);
  }

  const slit = new T.Mesh(
    track(new T.BoxGeometry(4.5, 0.85, 0.12)),
    trackMat(
      new T.MeshBasicMaterial({
        color: new T.Color('#7d9aa3').multiplyScalar(1.5),
      }),
    ),
  );
  slit.position.set(0, 2.2, 6.9);
  scene.add(slit);

  return {
    scene,
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

export function bakeBunkerEnvironment(renderer: T.WebGLRenderer) {
  const env = createBunkerEnvironmentScene();
  const pmrem = new T.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env.scene, 0.06);
  env.dispose();
  pmrem.dispose();
  return target;
}

/** Half-resolution SSAO pass that excludes transparent decals and viewmodel meshes. */
export class BunkerSSAOPass extends SSAOPass {
  constructor(
    scene: T.Scene,
    camera: T.Camera,
    private excludedRoots: T.Object3D[] = [],
  ) {
    super(scene, camera, 1, 1, 16);
  }

  override setSize(width: number, height: number) {
    const halfW = Math.max(1, Math.floor(width * 0.5));
    const halfH = Math.max(1, Math.floor(height * 0.5));
    super.setSize(halfW, halfH);
  }

  withHiddenNonCasters(fn: () => void) {
    const excluded = new Set<T.Object3D>();
    for (const root of this.excludedRoots) {
      root.traverse((o) => excluded.add(o));
    }
    const hidden: T.Object3D[] = [];
    this.scene.traverse((object) => {
      if (!object.visible) return;
      if (excluded.has(object)) {
        object.visible = false;
        hidden.push(object);
        return;
      }
      if (object instanceof T.Mesh) {
        const transparent = Array.isArray(object.material)
          ? object.material.some((m) => m.transparent)
          : object.material.transparent;
        if (transparent) {
          object.visible = false;
          hidden.push(object);
        }
      }
    });
    try {
      fn();
    } finally {
      for (const object of hidden) object.visible = true;
    }
  }

  override render(
    renderer: T.WebGLRenderer,
    writeBuffer: T.WebGLRenderTarget,
    readBuffer: T.WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ) {
    this.withHiddenNonCasters(() => {
      super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    });
  }

  override dispose() {
    super.dispose();
    this.ssaoMaterial.dispose();
    this.noiseTexture.dispose();
  }
}

/** Depth-cleared pass rendering the first-person weapon cleanly after world AO. */
export class WeaponOverlayPass extends Pass {
  constructor(
    private scene: T.Scene,
    private camera: T.Camera,
  ) {
    super();
    this.needsSwap = false;
  }

  override render(
    renderer: T.WebGLRenderer,
    _writeBuffer: T.WebGLRenderTarget,
    readBuffer: T.WebGLRenderTarget,
  ) {
    const prevAutoClear = renderer.autoClear;
    const prevMask = this.camera.layers.mask;
    const prevBackground = this.scene.background;
    this.scene.background = null;
    try {
      renderer.autoClear = false;
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      renderer.clearDepth();
      this.camera.layers.set(WEAPON_LAYER);
      renderer.render(this.scene, this.camera);
    } finally {
      this.scene.background = prevBackground;
      this.camera.layers.mask = prevMask;
      renderer.autoClear = prevAutoClear;
    }
  }
}

/** Multisampled Bunker EffectComposer: world + half-res AO + viewmodel overlay + selective bloom. */
export function createBunkerComposer(
  renderer: T.WebGLRenderer,
  scene: T.Scene,
  camera: T.Camera,
  viewmodelRoots: T.Object3D[],
) {
  for (const root of viewmodelRoots) {
    root.traverse((o) => o.layers.set(WEAPON_LAYER));
  }
  scene.traverse((o) => {
    if (o instanceof T.Light) o.layers.enable(WEAPON_LAYER);
  });

  const renderTarget = new T.WebGLRenderTarget(1, 1, {
    type: T.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, renderTarget);
  const renderPass = new RenderPass(scene, camera);
  const ao = new BunkerSSAOPass(scene, camera, viewmodelRoots);
  ao.kernelRadius = 0.55;
  ao.minDistance = 0.001;
  ao.maxDistance = 0.075;
  const weaponPass = new WeaponOverlayPass(scene, camera);
  const bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.32, 0.45, 1.05);
  const output = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(ao);
  composer.addPass(weaponPass);
  composer.addPass(bloom);
  composer.addPass(output);

  return {
    composer,
    renderPass,
    ao,
    weaponPass,
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
      ao.dispose();
      weaponPass.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
    },
  };
}
