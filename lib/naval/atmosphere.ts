import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type CoastSetting = 'beach' | 'naval';
function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () =>
    (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function aircraftPanelTextures() {
  const size = 64;
  const colorData = new Uint8Array(size * size * 4);
  const roughData = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const seam = x % 32 === 0 || y % 16 === 0;
      const rivet =
        !seam &&
        (x % 8 === 2 || x % 8 === 6) &&
        (y % 16 === 2 || y % 16 === 14);
      const grain = Math.sin(x * 1.9 + y * 3.1) * 10;
      const c = Math.max(
        130,
        Math.min(255, Math.round((seam ? 168 : rivet ? 228 : 216) + grain)),
      );
      const r = Math.max(
        85,
        Math.min(235, Math.round((seam ? 205 : rivet ? 115 : 165) - grain)),
      );
      const idx = (y * size + x) * 4;
      colorData[idx] = colorData[idx + 1] = colorData[idx + 2] = c;
      colorData[idx + 3] = 255;
      roughData[idx] = roughData[idx + 1] = roughData[idx + 2] = r;
      roughData[idx + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(colorData, size, size, THREE.RGBAFormat);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 3);
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;
  const roughnessMap = new THREE.DataTexture(
    roughData,
    size,
    size,
    THREE.RGBAFormat,
  );
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(3, 3);
  roughnessMap.needsUpdate = true;
  return { map, roughnessMap };
}

/** A tapered, low-wing piston aircraft, modelled in metres, nose toward -Z. */
export function makeAircraft() {
  const root = new THREE.Group();
  const surface = aircraftPanelTextures();
  const paint = new THREE.MeshStandardMaterial({
    color: '#5c6456',
    map: surface.map,
    roughnessMap: surface.roughnessMap,
    roughness: 0.72,
    metalness: 0.34,
  });
  const underside = new THREE.MeshStandardMaterial({
    color: '#88918f',
    map: surface.map,
    roughnessMap: surface.roughnessMap,
    roughness: 0.64,
    metalness: 0.38,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#839ca1',
    roughness: 0.08,
    metalness: 0.1,
    reflectivity: 0.9,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    ior: 1.5,
    transparent: true,
    opacity: 0.72,
  });
  const parts: THREE.Mesh[] = [];
  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parts.push(mesh);
    return mesh;
  };
  const profile = [
    [0.05, -5.2],
    [0.4, -4.9],
    [0.62, -4.2],
    [0.7, -2.8],
    [0.64, -1],
    [0.46, 1],
    [0.22, 3.8],
    [0.07, 5.2],
  ].map(([r, z]) => new THREE.Vector2(r, z));
  const body = add(new THREE.LatheGeometry(profile, 20), paint);
  body.rotation.x = Math.PI / 2;
  function wing(span: number, chord: number, z: number, y: number) {
    const outline = new THREE.Shape();
    outline.moveTo(-span, 0.4);
    outline.quadraticCurveTo(-span - 0.12, -0.15, -span + 0.2, -0.45);
    outline.lineTo(-1, -chord * 0.55);
    outline.lineTo(1, -chord * 0.55);
    outline.lineTo(span - 0.2, -0.45);
    outline.quadraticCurveTo(span + 0.12, -0.15, span, 0.4);
    outline.lineTo(1, chord * 0.5);
    outline.lineTo(-1, chord * 0.5);
    outline.closePath();
    const geo = new THREE.ExtrudeGeometry(outline, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.07,
      bevelSize: 0.08,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 8,
    });
    geo.rotateX(Math.PI / 2);
    add(geo, paint, 0, y, z);
  }
  wing(5.9, 2.7, -0.8, -0.2);
  wing(2.15, 1.3, 3.9, 0.2);
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(1.9, 0.2);
  finShape.quadraticCurveTo(2.3, 1.9, 1.2, 1.65);
  finShape.lineTo(0, 0);
  const fin = add(
    new THREE.ExtrudeGeometry(finShape, { depth: 0.13, bevelEnabled: false }),
    paint,
    0,
    0.15,
    3.2,
  );
  fin.rotation.y = -Math.PI / 2;
  const canopy = add(new THREE.SphereGeometry(1, 16, 12), glass, 0, 0.66, -0.7);
  canopy.scale.set(0.46, 0.53, 1.35);
  const belly = add(new THREE.SphereGeometry(1, 12, 8), underside, 0, -0.43, 0);
  belly.scale.set(0.48, 0.23, 2.1);
  for (const x of [-0.64, 0.64])
    for (let i = 0; i < 4; i++)
      add(
        new THREE.CylinderGeometry(0.07, 0.09, 0.21, 6),
        underside,
        x,
        0.08,
        -3.2 + i * 0.26,
      ).rotation.z = Math.PI / 2;
  for (const x of [-2.25, 2.25])
    add(
      new THREE.CylinderGeometry(0.04, 0.05, 0.75, 6),
      underside,
      x,
      -0.17,
      -2,
    ).rotation.x = Math.PI / 2;
  // Merge static parts by material: three draws per aircraft, instead of per detail.
  for (const mat of [paint, underside, glass]) {
    const geometries = parts
      .filter((p) => p.material === mat)
      .map((p) => {
        p.updateMatrix();
        p.geometry.applyMatrix4(p.matrix);
        if (!p.geometry.index) return p.geometry;
        const geometry = p.geometry.toNonIndexed();
        p.geometry.dispose();
        return geometry;
      });
    const merged = mergeGeometries(geometries, false)!;
    geometries.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = !mat.transparent;
    root.add(mesh);
  }
  const prop = new THREE.Mesh(
    new THREE.CircleGeometry(1.42, 32),
    new THREE.MeshBasicMaterial({
      color: '#777a71',
      transparent: true,
      opacity: 0.13,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  prop.position.z = -5.22;
  root.add(prop);
  return root;
}

/** Bounded atmosphere: ten mist banks and a reused formation; no per-frame allocation. */
export class CoastalAtmosphere {
  readonly root = new THREE.Group();
  private banks: {
    x: number;
    y: number;
    z: number;
    sx: number;
    sy: number;
    phase: number;
    speed: number;
  }[] = [];
  private mistMesh: THREE.InstancedMesh<
    THREE.PlaneGeometry,
    THREE.ShaderMaterial
  >;
  private densityAttr: THREE.InstancedBufferAttribute;
  private dummy = new THREE.Object3D();
  private aircraft: THREE.Group[] = [];
  private seed: number;
  private disposed = false;
  constructor(
    scene: THREE.Scene,
    private setting: CoastSetting,
    seed = Math.floor(Math.random() * 0xffffffff),
  ) {
    this.seed = seed;
    this.root.name = 'coastal-atmosphere';
    scene.add(this.root);
    const random = randomGenerator(seed);
    const scale = setting === 'naval' ? 9 : 1;
    const fogGeometry = new THREE.PlaneGeometry(1, 1);
    const phases = new Float32Array(10);
    const densities = new Float32Array(10);
    const phaseAttr = new THREE.InstancedBufferAttribute(phases, 1);
    this.densityAttr = new THREE.InstancedBufferAttribute(densities, 1);
    this.densityAttr.setUsage(THREE.DynamicDrawUsage);
    fogGeometry.setAttribute('aPhase', phaseAttr);
    fogGeometry.setAttribute('aDensity', this.densityAttr);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          time: { value: 0 },
          density: { value: 0.2 },
        },
      ]),
      vertexShader: `attribute float aPhase;attribute float aDensity;varying vec2 vUv;varying float vPhase;varying float vDensity;
        #include <common>
        #include <fog_pars_vertex>
        void main(){vUv=uv;vPhase=aPhase;vDensity=aDensity;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;#include <fog_vertex>}`,
      fragmentShader: `varying vec2 vUv;varying float vPhase;varying float vDensity;uniform float time;uniform float density;
        #include <common>
        #include <fog_pars_fragment>
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
        void main(){vec2 p=vUv*vec2(5.,3.)+vec2(-time*.015+vPhase,time*.004);
          float n=noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;
          vec2 edge=abs(vUv*2.-1.);
          float bottomFade=smoothstep(0.,0.35,vUv.y)*(1.-smoothstep(.55,1.,vUv.y));
          float falloff=(1.-smoothstep(.35,1.,edge.x))*bottomFade;
          float activeDensity=mix(density,vDensity,step(0.001,vDensity));
          float alpha=(1.-exp(-max(0.,n-.23)*activeDensity))*falloff;
          gl_FragColor=vec4(mix(vec3(.55,.63,.65),vec3(.81,.83,.79),n),alpha);
          #include <fog_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mistMesh = new THREE.InstancedMesh(fogGeometry, material, 10);
    this.mistMesh.name = 'drifting-sea-mist';
    this.mistMesh.frustumCulled = false;
    this.mistMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 10; i++) {
      const phase = random() * Math.PI * 2;
      const sx = (38 + random() * 35) * scale;
      const sy = (7 + random() * 8) * scale;
      const x = (random() - 0.5) * 250 * scale;
      const z =
        setting === 'beach' ? -112 - random() * 90 : -1200 - random() * 1100;
      const y = sy * 0.32;
      phases[i] = phase;
      this.banks.push({
        x,
        y,
        z,
        sx,
        sy,
        phase,
        speed: (0.3 + random() * 0.3) * scale,
      });
    }
    this.root.add(this.mistMesh);
    const plane = makeAircraft();
    for (let i = 0; i < 3; i++) {
      const aircraft = i === 0 ? plane : plane.clone();
      aircraft.name = `coastal-flyover-${i}`;
      this.aircraft.push(aircraft);
      this.root.add(aircraft);
    }
    this.update(0);
  }
  update(time: number) {
    this.mistMesh.material.uniforms.time.value = time;
    for (let i = 0; i < this.banks.length; i++) {
      const bank = this.banks[i];
      const px =
        bank.x +
        Math.sin(time * 0.009 + bank.phase) *
          28 *
          (this.setting === 'naval' ? 9 : 1) +
        Math.sin(time * bank.speed * 0.012) * 18;
      this.dummy.position.set(px, bank.y, bank.z);
      this.dummy.scale.set(bank.sx, bank.sy, 1);
      this.dummy.updateMatrix();
      this.mistMesh.setMatrixAt(i, this.dummy.matrix);
      // Independent slow weather pulses, never an opaque screen-wide fog wall.
      const density =
        0.2 +
        0.36 * Math.pow(0.5 + 0.5 * Math.sin(time * 0.035 + bank.phase), 2);
      this.densityAttr.setX(i, density);
      if (i === 0) this.mistMesh.material.uniforms.density.value = density;
    }
    this.mistMesh.instanceMatrix.needsUpdate = true;
    this.densityAttr.needsUpdate = true;
    const period = 52 + (this.seed % 13),
      phase = (time + 11) % period;
    const speed = 83,
      halfSpan = this.setting === 'beach' ? 950 : 2200;
    const duration = (halfSpan * 2) / speed;
    for (let i = 0; i < this.aircraft.length; i++) {
      const plane = this.aircraft[i];
      plane.visible = phase < duration;
      const direction = Math.floor((time + 11) / period) % 2 === 0 ? 1 : -1;
      plane.position.set(
        direction * (-halfSpan + phase * speed - i * 22),
        this.setting === 'beach' ? 48 + i * 3 : 125 + i * 5,
        (this.setting === 'beach' ? -320 : -780) - i * 24,
      );
      plane.rotation.set(
        0.018,
        (-direction * Math.PI) / 2,
        Math.sin(phase * 0.19) * 0.055,
      );
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          materials.add(m);
          for (const v of Object.values(m))
            if (v instanceof THREE.Texture) textures.add(v);
        }
      }
    });
    this.mistMesh.dispose();
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    this.root.removeFromParent();
  }
}
