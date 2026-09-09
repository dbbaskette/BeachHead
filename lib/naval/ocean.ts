import { assetUrl } from '../asset-url';
import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';
import type { Battle } from './simulation';

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
    sunDirection: new THREE.Vector3(-0.5, 0.38, 0.75).normalize(),
    sunColor: '#ffe1b0',
    waterColor: '#0c5360',
    distortionScale: 1.8,
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
    update(time: number, battle: Battle) {
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
export function makeSky() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(14000, 32, 20),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `varying vec3 vDir;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){vec3 d=normalize(vDir);float h=max(d.y,0.);vec3 c=mix(vec3(.56,.72,.78),vec3(.14,.35,.53),pow(h,.5));
        float sun=max(dot(d,normalize(vec3(-.5,.38,.75))),0.);c+=vec3(1.,.76,.43)*pow(sun,180.)*.75;c+=vec3(1.,.91,.7)*pow(sun,1300.);
        vec2 uv=d.xz/max(.06,d.y)*2.;float n=noise(uv)+noise(uv*2.)*.5+noise(uv*4.)*.25;
        float cloud=smoothstep(.91,1.35,n)*smoothstep(.02,.16,h)*.7;c=mix(c,vec3(.9,.91,.86),cloud);
        gl_FragColor=vec4(c,1.);#include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`.replace(';#include', ';\n#include'),
    }),
  );
}
