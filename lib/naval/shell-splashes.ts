import * as THREE from 'three';

const LIFE = 6;
const MAX_SPLASHES = 4;
const DROPS = 96;

/** Keep distant impacts legible in short viewports without moving their origin. */
export function splashScale(
  distance: number,
  height: number,
  fov: number,
  touch: boolean,
) {
  const focal =
    Math.max(1, height) / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
  return THREE.MathUtils.clamp(
    ((touch ? 12 : 9) * distance) / (16 * focal),
    1,
    3.2,
  );
}

export function shellVisualScale(
  distance: number,
  height: number,
  fov: number,
  touch: boolean,
) {
  const base = Math.max(0.8, distance / 500);
  if (!touch) return { width: base, length: base };
  const pixel =
    (2 * distance * Math.tan(THREE.MathUtils.degToRad(fov / 2))) /
    Math.max(1, height);
  return {
    width: Math.max(base, (1.7 * pixel) / 0.72),
    length: Math.max(base, (8 * pixel) / 4.72),
  };
}

const sprayVertex = `
  attribute vec3 velocity;
  attribute float dropSize;
  uniform float age;
  uniform float focal;
  uniform float minPixels;
  varying float aboveWater;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    // Ballistic droplets fall back into the sea under gravity.
    vec3 p = position + velocity * age;
    p.y -= 4.905 * age * age;
    aboveWater = step(0.0, p.y);
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float size = dropSize * length(modelMatrix[0].xyz);
    gl_PointSize = clamp(size * focal / max(1.0, -mvPosition.z), minPixels, 14.0);
    #include <fog_vertex>
  }
`;
const sprayFragment = `
  uniform float age;
  varying float aboveWater;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r = dot(p, p);
    float soft = 1.0 - smoothstep(0.16, 1.0, r);
    float fade = (1.0 - smoothstep(3.6, 5.8, age)) * aboveWater;
    float alpha = soft * fade * 0.86;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(mix(vec3(0.64,0.78,0.8),vec3(1.0,0.99,0.94),soft), alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const foamVertex = `
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position,1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const foamFragment = `
  uniform float age;
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float radius = length(p);
    float angle = atan(p.y,p.x);
    float edge = 0.78 + 0.08*sin(angle*7.0) + 0.06*sin(angle*11.0+1.3);
    float flecks = 0.65 + 0.2*sin(p.x*41.0 + age)*sin(p.y*37.0-age*0.7);
    float foam = (1.0-smoothstep(edge-0.24,edge,radius))*flecks;
    float fade = smoothstep(0.0,0.25,age)*(1.0-smoothstep(2.5,6.0,age));
    float alpha = foam * fade * 0.8;
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(0.85,0.94,0.93,alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const columnFragment = `
  uniform float age;
  varying vec2 vUv;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float y=vUv.y;
    float x=vUv.x*2.0-1.0 + sin(y*24.0-age*3.0)*0.07;
    float width=(0.27+0.62*(1.0-y))*(0.87+0.13*sin(y*31.0));
    float body=1.0-smoothstep(width-0.23,width,abs(x));
    float grain=0.73+0.27*sin(x*32.0+y*23.0+age)*sin(y*47.0-age*5.0);
    float fade=(1.0-smoothstep(2.0,4.2,age))*smoothstep(0.0,0.12,age);
    float alpha=body*(1.0-smoothstep(0.84,1.0,y))*grain*fade*0.94;
    if(alpha<0.01)discard;
    gl_FragColor=vec4(mix(vec3(0.55,0.72,0.75),vec3(0.96,0.99,0.97),body),alpha);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

type SplashBurst = {
  group: THREE.Group;
  spray: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  foam: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  column: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  age: number;
  active: boolean;
};

/** Dedicated pooled capacity: smoke and sinking churn cannot crowd out a player's splash. */
export class ShellSplashVisuals {
  readonly root = new THREE.Group();
  private sprayGeometry = new THREE.BufferGeometry();
  private foamGeometry = new THREE.PlaneGeometry(28, 28);
  private columnGeometry = new THREE.PlaneGeometry(22, 1).translate(0, 0.5, 0);
  private pool: SplashBurst[] = [];
  private active: SplashBurst[] = [];
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.root.name = 'player-shell-splashes';
    scene.add(this.root);
    const position = [],
      velocity = [],
      size = [];
    for (let i = 0; i < DROPS; i++) {
      const angle = i * 2.399963;
      const spread = 1.5 + (i % 7) * 0.48;
      position.push(
        Math.cos(angle) * 0.7,
        0.3 + (i % 4) * 0.2,
        Math.sin(angle) * 0.7,
      );
      velocity.push(
        Math.cos(angle) * spread,
        21 + (i % 11) * 1.1,
        Math.sin(angle) * spread,
      );
      size.push(1.2 + (i % 5) * 0.36);
    }
    this.sprayGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(position, 3),
    );
    this.sprayGeometry.setAttribute(
      'velocity',
      new THREE.Float32BufferAttribute(velocity, 3),
    );
    this.sprayGeometry.setAttribute(
      'dropSize',
      new THREE.Float32BufferAttribute(size, 1),
    );

    for (let i = 0; i < MAX_SPLASHES; i++) {
      const group = new THREE.Group();
      const spray = new THREE.Points(
        this.sprayGeometry,
        new THREE.ShaderMaterial({
          uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            {
              age: { value: 0 },
              focal: { value: 1 },
              minPixels: { value: 1.4 },
            },
          ]),
          vertexShader: sprayVertex,
          fragmentShader: sprayFragment,
          transparent: true,
          depthWrite: false,
          fog: true,
        }),
      );
      spray.name = 'shell-water-plume';
      spray.frustumCulled = false;

      const foam = new THREE.Mesh(
        this.foamGeometry,
        new THREE.ShaderMaterial({
          uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            { age: { value: 0 } },
          ]),
          vertexShader: foamVertex,
          fragmentShader: foamFragment,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: true,
        }),
      );
      foam.name = 'shell-impact-foam';
      foam.rotation.x = -Math.PI / 2;

      const column = new THREE.Mesh(
        this.columnGeometry,
        new THREE.ShaderMaterial({
          uniforms: THREE.UniformsUtils.merge([
            THREE.UniformsLib.fog,
            { age: { value: 0 } },
          ]),
          vertexShader: foamVertex,
          fragmentShader: columnFragment,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: true,
        }),
      );
      column.name = 'shell-water-column';
      group.add(spray, foam, column);
      this.pool.push({
        group,
        spray,
        foam,
        column,
        age: 0,
        active: false,
      });
    }
  }

  impact(x: number, z: number) {
    if (this.disposed) return;
    let slot = this.pool.find((s) => !s.active);
    if (!slot) {
      slot = this.active.shift()!;
      slot.group.removeFromParent();
    }
    slot.active = true;
    slot.age = 0;
    slot.group.position.set(x, 0.25, z);
    slot.group.scale.setScalar(1);
    slot.foam.scale.setScalar(0.55);
    slot.column.scale.y = 0.01;
    slot.spray.material.uniforms.age.value = 0;
    slot.foam.material.uniforms.age.value = 0;
    slot.column.material.uniforms.age.value = 0;
    this.root.add(slot.group);
    this.active.push(slot);
  }

  update(
    dt: number,
    camera: THREE.PerspectiveCamera,
    height: number,
    touch: boolean,
    pixelRatio = 1,
  ) {
    const focal =
      Math.max(1, height) /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    for (let i = this.active.length - 1; i >= 0; i--) {
      const b = this.active[i];
      b.age += Math.max(0, dt);
      if (b.age >= LIFE) {
        b.active = false;
        b.group.removeFromParent();
        this.active.splice(i, 1);
        continue;
      }
      const scale = splashScale(
        b.group.position.distanceTo(camera.position),
        height,
        camera.fov,
        touch,
      );
      b.group.scale.setScalar(scale);
      b.foam.scale.setScalar(0.55 + b.age * 0.12);
      b.spray.material.uniforms.age.value = b.age;
      b.spray.material.uniforms.focal.value = focal * pixelRatio;
      b.spray.material.uniforms.minPixels.value =
        (touch ? 1.6 : 1) * pixelRatio;
      b.foam.material.uniforms.age.value = b.age;
      b.column.material.uniforms.age.value = b.age;
      b.column.scale.y = Math.max(0.01, 32 * b.age - 4.905 * b.age * b.age);
      b.column.rotation.y = Math.atan2(
        camera.position.x - b.group.position.x,
        camera.position.z - b.group.position.z,
      );
    }
  }

  reset() {
    for (const b of this.active) {
      b.active = false;
      b.group.removeFromParent();
    }
    this.active = [];
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.reset();
    for (const b of this.pool) {
      b.spray.material.dispose();
      b.foam.material.dispose();
      b.column.material.dispose();
    }
    this.root.removeFromParent();
    this.sprayGeometry.dispose();
    this.foamGeometry.dispose();
    this.columnGeometry.dispose();
  }
}
