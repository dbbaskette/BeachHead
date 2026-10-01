import { COASTAL_SUN } from './daylight';
import { assetUrl } from '../asset-url';
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
export type OceanShip = {
  x: number;
  z: number;
  heading: number;
  length: number;
  health: number;
};

export function makeOcean() {
  const normal = new THREE.TextureLoader().load(
    assetUrl('/textures/water-normal.jpg'),
  );
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.anisotropy = 8;
  const mesh = new Water(new THREE.PlaneGeometry(20000, 20000, 1, 1), {
    textureWidth: 768,
    textureHeight: 768,
    waterNormals: normal,
    sunDirection: COASTAL_SUN.clone(),
    sunColor: '#ffe1b0',
    waterColor: '#0c5360',
    distortionScale: 5.5,
    fog: true,
  });
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.z = -3000;
  const material = mesh.material as THREE.ShaderMaterial;
  material.uniforms.size.value = 3.5;
  material.uniforms.uWakes = {
    value: Array.from({ length: 4 }, () => new THREE.Vector4()),
  };
  // Keep reflections readable without mirror-flat island and ship silhouettes.
  material.fragmentShader = material.fragmentShader.replace(
    'reflectionSample + specularLight, reflectance',
    'reflectionSample + specularLight, reflectance * .58',
  );
  material.fragmentShader = material.fragmentShader.replace(
    'vec3 reflectionSample = vec3( texture2D( mirrorSampler, mirrorCoord.xy / mirrorCoord.w + distortion ) );',
    `vec2 reflectionUv=mirrorCoord.xy/mirrorCoord.w+distortion;
     vec2 spread=vec2(.0015,.004)*(1.+min(distance/1400.,1.));
     vec3 reflectionSample=texture2D(mirrorSampler,reflectionUv).rgb*.4;
     reflectionSample+=texture2D(mirrorSampler,reflectionUv+spread).rgb*.15;
     reflectionSample+=texture2D(mirrorSampler,reflectionUv-spread).rgb*.15;
     reflectionSample+=texture2D(mirrorSampler,reflectionUv+vec2(-spread.x,spread.y)).rgb*.15;
     reflectionSample+=texture2D(mirrorSampler,reflectionUv+vec2(spread.x,-spread.y)).rgb*.15;`,
  );
  material.fragmentShader = material.fragmentShader.replace(
    'uniform float size;',
    `uniform float size;
    uniform vec4 uWakes[4];
    float wakeFoam(vec2 p,vec4 ship){
      if(ship.w<1.)return 0.;
      vec2 d=p-ship.xy;vec2 forward=vec2(sin(ship.z),-cos(ship.z));
      float aft=-dot(d,forward),side=dot(d,vec2(cos(ship.z),sin(ship.z)));
      float start=ship.w*.38,tail=max(0.,aft-start),width=ship.w*.055+tail*.055;
      float trail=smoothstep(start,start+6.,aft)*exp(-tail/(ship.w*1.6))*exp(-pow(side/width,2.));
      float v=exp(-pow((abs(side)-(tail*.24+ship.w*.08))/2.5,2.))*exp(-tail/(ship.w*1.3))*smoothstep(start,start+8.,aft);
      float bow=exp(-pow((aft+ship.w*.43)/5.,2.))*exp(-pow((abs(side)-ship.w*.06)/2.,2.));
      float breakup=.78+.22*sin(tail*.15-time*.65)*sin(side*.4+tail*.07);
      return clamp((trail*.15+v*.035+bow*.12)*breakup,0.,.24);
    }`,
  );
  material.fragmentShader = material.fragmentShader.replace(
    'vec3 outgoingLight = albedo;',
    `
    float foam=0.;for(int i=0;i<4;i++)foam+=wakeFoam(worldPosition.xz,uWakes[i]);
    float crest=smoothstep(.55,.84,noise.y)*.11;
    vec3 outgoingLight=mix(albedo*vec3(.74,.92,1.03),vec3(.72,.87,.86),clamp(foam+crest,0.,.85));
  `,
  );
  return {
    mesh,
    material,
    update(time: number, battle: { ships: readonly OceanShip[] }) {
      material.uniforms.time.value = time * 0.68;
      const wakes = material.uniforms.uWakes.value as THREE.Vector4[];
      battle.ships.forEach((s, i) =>
        wakes[i].set(s.x, s.z, s.heading, s.health > 0 ? s.length : 0),
      );
      wakes[3].set(0, 0, 0, 0);
    },
    dispose() {
      normal.dispose();
      material.uniforms.mirrorSampler.value.dispose();
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
export { makeDaylightSky as makeSky } from './daylight';
