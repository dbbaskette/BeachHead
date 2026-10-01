import * as THREE from 'three';
import { AirArt } from './art';
import { shoreline } from './targets';
import { noiseGLSL } from './surfaces';

/** One shoreline draw and one bank of mist; no per-frame particle allocation. */
export function makeCoastalAtmosphere(art: AirArt) {
  const root = new THREE.Group();
  const geometry = art.geo(new THREE.PlaneGeometry(155, 9000, 12, 300));
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i),
      inland = p.getX(i) - 72.5;
    p.setXYZ(i, shoreline(z) + inland, 0.12, z);
  }
  const time = { value: 0 };
  const surf = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time },
    vertexShader: `varying vec3 coast; varying float distanceToEye;
      void main(){coast=position;vec4 view=modelViewMatrix*vec4(position,1.);distanceToEye=length(view.xyz);gl_Position=projectionMatrix*view;}`,
    fragmentShader: `uniform float time;varying vec3 coast;varying float distanceToEye;${noiseGLSL}
      void main(){
        float shore=sin(coast.z*.0025)*24.+sin(coast.z*.009)*6.;
        float inland=coast.x-shore;
        float n=terrainNoise(vec2(coast.z*.08,inland*.16-time*.17));
        float phase=fract((-inland+n*7.)/24.+time*.085);
        float wave=1.-smoothstep(.025,.13,abs(phase-.5));
        float breakup=smoothstep(.24,.7,terrainNoise(vec2(coast.z*.034+time*.09,inland*.12)));
        float breaker=wave*breakup*smoothstep(-65.,-22.,inland)*(1.-smoothstep(-4.,3.,inland));
        float shorewash=(1.-smoothstep(0.,7.,abs(inland+4.+sin(time*.7+coast.z*.02)*2.)))*(.35+n*.65);
        float foam=clamp(breaker*(.24+n*.75)+shorewash*.7,0.,.85);
        vec3 color=mix(vec3(.13,.31,.27),vec3(.78,.84,.77),foam);
        float shallow=smoothstep(-150.,-30.,inland)*(1.-smoothstep(0.,4.,inland));
        float alpha=(shallow*.24+foam*.65)*(1.-smoothstep(1700.,4400.,distanceToEye));
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  art.materials.add(surf);
  root.add(new THREE.Mesh(geometry, surf));
  const mistMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { time },
    vertexShader: `varying vec2 vUv; varying float distanceToEye;
      void main(){vUv=uv;vec4 view=modelViewMatrix*instanceMatrix*vec4(position,1.);distanceToEye=length(view.xyz);gl_Position=projectionMatrix*view;}`,
    fragmentShader: `uniform float time;varying vec2 vUv;varying float distanceToEye;${noiseGLSL}
      void main(){vec2 p=vUv*2.-1.;float soft=pow(max(0.,1.-dot(p,p)),2.);
        float wisps=terrainNoise(vUv*vec2(8.,3.)+vec2(time*.017,0.));
        float alpha=soft*wisps*.14*smoothstep(65.,220.,distanceToEye)*(1.-smoothstep(1700.,3200.,distanceToEye));
        gl_FragColor=vec4(vec3(.66,.74,.72),alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  art.materials.add(mistMaterial);
  const mist = new THREE.InstancedMesh(
    art.geo(new THREE.PlaneGeometry(1, 1)),
    mistMaterial,
    18,
  );
  const object = new THREE.Object3D();
  for (let i = 0; i < 18; i++) {
    const z = -3000 + i * 350,
      x = shoreline(z) + Math.sin(i * 2.73) * 140;
    object.position.set(x, 9 + Math.sin(i) * 4, z);
    object.scale.set(150 + (i % 3) * 55, 18 + (i % 4) * 3, 1);
    object.rotation.y = Math.sin(i) * 0.4;
    object.updateMatrix();
    mist.setMatrixAt(i, object.matrix);
  }
  root.add(mist);
  return {
    root,
    update: (seconds: number) => {
      time.value = seconds;
    },
    dispose: () => mist.dispose(),
  };
}
