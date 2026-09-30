import { COASTAL_SUN } from '../naval/daylight';
import * as THREE from 'three';

export const CRATERS: Array<[number, number, number]> = [
  [-55, -32, 4.8],
  [-27, -40, 3.4],
  [10, -31, 3.1],
  [28, -39, 4.6],
  [53, -52, 3.7],
  [-47, -63, 3.2],
  [-9, -65, 4.1],
  [48, -76, 4.9],
  [-57, -92, 3.8],
  [-28, -101, 4.3],
  [10, -95, 3.6],
  [29, -111, 3.5],
  [55, -119, 4.6],
  [-9, -128, 3.2],
];
export function beachHeight(x: number, z: number): number {
  let height = -Math.max(0, -z - 119) * 0.035;
  height +=
    Math.max(0, Math.min(1, (Math.abs(x) - 45) / 20)) *
    (1.1 + Math.sin(x * 0.12 + z * 0.065) * 0.55 + Math.sin(z * 0.14) * 0.25);
  for (const [cx, cz, r] of CRATERS) {
    const dx = x - cx,
      dz = (z - cz) * 1.22,
      angle = Math.atan2(dz, dx);
    const distance =
      Math.hypot(dx, dz) / (r * (1 + 0.09 * Math.sin(angle * 5 + cx)));
    if (distance < 1.4)
      height +=
        -0.42 * Math.exp(-distance * distance * 3.5) +
        0.17 * Math.exp(-Math.pow((distance - 0.92) / 0.19, 2));
  }
  return height;
}
export function createBeachGeometry() {
  const geometry = new THREE.PlaneGeometry(240, 190, 240, 190);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -77);
  const p = geometry.getAttribute('position');
  for (let i = 0; i < p.count; i++)
    p.setY(i, beachHeight(p.getX(i), p.getZ(i)));
  geometry.computeVertexNormals();
  return geometry;
}

/** Layer large-scale colour variation over the existing scanned PBR sand textures. */
export function naturalSand(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vBeachPosition;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvBeachPosition = (modelMatrix * vec4(position,1.)).xyz;',
    );
    shader.fragmentShader =
      `varying vec3 vBeachPosition;
      float beachHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float beachNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(beachHash(i),beachHash(i+vec2(1,0)),f.x),mix(beachHash(i+vec2(0,1)),beachHash(i+1.),f.x),f.y);}
    ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
      float broad = beachNoise(vBeachPosition.xz*.065)*.65 + beachNoise(vBeachPosition.xz*.19)*.35;
      float wet = smoothstep(112.,138.,-vBeachPosition.z + sin(vBeachPosition.x*.085)*2.);
      diffuseColor.rgb *= mix(vec3(.88,.85,.77),vec3(1.1,1.07,.99),broad);
      diffuseColor.rgb *= mix(1.,.52,wet);
      float ripplePhase=vBeachPosition.x*5.8+vBeachPosition.z*2.1+beachNoise(vBeachPosition.xz*.22)*6.;
      float rippleFade=1.-smoothstep(25.,100.,distance(cameraPosition,vBeachPosition));
      diffuseColor.rgb *= 1.+sin(ripplePhase)*.045*rippleFade*(1.-wet);

    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, .36, smoothstep(118.,140.,-vBeachPosition.z));',
    );
  };
  material.customProgramCacheKey = () => 'natural-beach-v2';
}

export class CoastalWater {
  private geometry = new THREE.PlaneGeometry(2400, 2400, 128, 256);
  private material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      sunDirection: { value: COASTAL_SUN.clone() },
    },
    transparent: true,
    depthWrite: true,
    vertexShader: `uniform float time; varying vec3 vWorld;
      void main(){vec4 w=modelMatrix*vec4(position,1.);float offshore=smoothstep(134.,190.,-w.z);
        // Gravity-wave dispersion: omega squared = g*k, k = 2*pi / wavelength.
        float h=.36*sin(dot(w.xz,vec2(.022,.084))-sqrt(9.81*.087)*time);
        h+=.17*sin(dot(w.xz,vec2(-.115,.138))-sqrt(9.81*.18)*time);
        w.y=.04+offshore*h;vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform float time;uniform vec3 sunDirection;varying vec3 vWorld;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      void main(){
        float shore=132.+sin(vWorld.x*.06)*1.8+sin(vWorld.x*.19)*.5;
        float depth=-vWorld.z-shore;
        float surge=sin(time*.7+vWorld.x*.025)*1.7;
        if(depth+surge<0.)discard;
        float n=noise(vWorld.xz*.25+vec2(time*.12,-time*.18));
        float phase=depth*.46+time*1.35+sin(vWorld.x*.075)*2.1+noise(vWorld.xz*.04)*3.;
        float breaker=pow(max(0.,sin(phase)),14.)*(1.-smoothstep(8.,65.,depth));
        float wash=(1.-smoothstep(0.,2.4,depth+surge))*.8;
        float foam=clamp((breaker*.9+wash)*smoothstep(.15,.7,n),0.,1.);
        float swellA=dot(vWorld.xz,vec2(.022,.084))-sqrt(9.81*.087)*time;
        float swellB=dot(vWorld.xz,vec2(-.115,.138))-sqrt(9.81*.18)*time;
        vec2 slope=.36*vec2(.022,.084)*cos(swellA)+.17*vec2(-.115,.138)*cos(swellB);
        float detailFade=(1.-smoothstep(20.,240.,distance(cameraPosition,vWorld)))*(1.-smoothstep(.35,1.2,length(fwidth(vWorld.xz))));
        // Short wind ripples fade with distance to avoid sparkling aliasing.
        slope+=detailFade*(vec2(.052,.068)*cos(dot(vWorld.xz,vec2(1.3,1.7))-time*4.6)
          +vec2(-.035,.05)*cos(dot(vWorld.xz,vec2(-2.1,3.))-time*6.));
        vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
        vec3 eye=normalize(cameraPosition-vWorld);
        float fresnel=.0204+.9796*pow(1.-max(0.,dot(eye,normal)),5.);
        // Wavelength-dependent absorption gives shallow water its green tint.
        vec3 transmission=exp(-vec3(.19,.065,.035)*max(0.,depth)*.12);
        vec3 water=mix(vec3(.012,.075,.10),vec3(.23,.34,.26),transmission);
        vec3 reflectedSky=mix(vec3(.16,.30,.42),vec3(.38,.49,.53),pow(1.-max(0.,reflect(-eye,normal).y),3.));
        water=mix(water,reflectedSky,fresnel);
        vec3 halfVector=normalize(eye+sunDirection);
        float glint=pow(max(dot(normal,halfVector),0.),240.)*3.;
        water+=vec3(1.,.88,.65)*glint;
        water=mix(water,vec3(.8,.85,.78),foam*.85);
        water=mix(water,vec3(.38,.49,.53),smoothstep(250.,2000.,-vWorld.z));
        gl_FragColor=vec4(water,smoothstep(0.,1.5,depth+surge));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  readonly mesh = new THREE.Mesh(this.geometry, this.material);
  constructor(scene: THREE.Scene) {
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.z = -1320;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'animated-coastal-surf';
    scene.add(this.mesh);
  }
  update(time: number) {
    this.material.uniforms.time.value = time;
  }
  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
