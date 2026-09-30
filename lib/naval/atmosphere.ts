import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type CoastSetting = 'beach' | 'naval';
function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () =>
    (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

/** A tapered, low-wing piston aircraft, modelled in metres, nose toward -Z. */
function makeAircraft() {
  const root = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: '#586052',
    roughness: 0.66,
    metalness: 0.3,
  });
  const underside = new THREE.MeshStandardMaterial({
    color: '#858e8c',
    roughness: 0.58,
    metalness: 0.35,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#839ca1',
    roughness: 0.13,
    metalness: 0.15,
    transparent: true,
    opacity: 0.8,
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
    mesh.castShadow = true;
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
    mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
    x: number;
    z: number;
    phase: number;
    speed: number;
  }[] = [];
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
    for (let i = 0; i < 10; i++) {
      const phase = random() * Math.PI * 2;
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          time: { value: 0 },
          phase: { value: phase },
          density: { value: 0 },
        },
        vertexShader:
          'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec2 vUv;uniform float time;uniform float phase;uniform float density;
          float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
          float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
          void main(){vec2 p=vUv*vec2(5.,3.)+vec2(-time*.015+phase,time*.004);
            float n=noise(p)*.57+noise(p*2.03)*.28+noise(p*4.07)*.15;
            vec2 edge=abs(vUv*2.-1.);float falloff=(1.-smoothstep(.35,1.,edge.x))*(1.-smoothstep(.15,1.,edge.y));
            float alpha=(1.-exp(-max(0.,n-.23)*density))*falloff;
            gl_FragColor=vec4(mix(vec3(.55,.63,.65),vec3(.81,.83,.79),n),alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      const mesh = new THREE.Mesh(fogGeometry, material);
      mesh.name = 'drifting-sea-mist';
      mesh.scale.set(
        (38 + random() * 35) * scale,
        (7 + random() * 8) * scale,
        1,
      );
      const x = (random() - 0.5) * 250 * scale,
        z =
          setting === 'beach' ? -112 - random() * 90 : -1200 - random() * 1100;
      mesh.position.set(x, mesh.scale.y * 0.32, z);
      this.root.add(mesh);
      this.banks.push({
        mesh,
        x,
        z,
        phase,
        speed: (0.3 + random() * 0.3) * scale,
      });
    }
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
    for (const bank of this.banks) {
      bank.mesh.position.x =
        bank.x +
        Math.sin(time * 0.009 + bank.phase) *
          28 *
          (this.setting === 'naval' ? 9 : 1) +
        Math.sin(time * bank.speed * 0.012) * 18;
      bank.mesh.material.uniforms.time.value = time;
      // Independent slow weather pulses, never an opaque screen-wide fog wall.
      bank.mesh.material.uniforms.density.value =
        0.2 +
        0.36 * Math.pow(0.5 + 0.5 * Math.sin(time * 0.035 + bank.phase), 2);
    }
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
      materials = new Set<THREE.Material>();
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          materials.add(m);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    this.root.removeFromParent();
  }
}
