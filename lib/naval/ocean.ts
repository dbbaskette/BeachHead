import * as THREE from 'three';
export function makeOcean() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uSun: { value: new THREE.Vector3(-0.5, 0.27, -0.72).normalize() },
    },
    vertexShader: `
      uniform float uTime; varying vec3 vWorld;
      void main(){
        vec3 p=position;
        p.z=sin(p.x*.012+uTime*.7)*1.1+sin(p.y*.018-uTime*.52)*.8+sin((p.x+p.y)*.029+uTime)*.35;
        vec4 world=modelMatrix*vec4(p,1.);vWorld=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }`,
    fragmentShader: `
      uniform float uTime;uniform vec3 uSun;varying vec3 vWorld;
      float waves(vec2 p){return sin(p.x*.11+uTime*1.2)*.3+sin(p.y*.15-uTime)*.25+sin(p.x*.32+p.y*.21+uTime*1.8)*.12+sin(p.x*.61-p.y*.34-uTime*2.)*.045;}
      void main(){
        vec2 p=vWorld.xz;float h=waves(p);float e=.35;
        vec3 n=normalize(vec3((h-waves(p+vec2(e,0.)))/e,1.,(h-waves(p+vec2(0.,e)))/e));
        vec3 v=normalize(cameraPosition-vWorld);float fres=pow(1.-max(dot(n,v),0.),3.);
        vec3 deep=vec3(.027,.135,.19);vec3 sky=vec3(.51,.66,.7);
        vec3 c=mix(deep,sky,fres*.72);
        float spec=pow(max(dot(reflect(-uSun,n),v),0.),130.);
        c+=vec3(1.,.84,.55)*spec*1.15;
        float ripple=smoothstep(.56,.65,h)*.13*(1.-fres*.6);c+=vec3(.43,.67,.7)*ripple;
        float fog=1.-exp(-length(cameraPosition-vWorld)*.00018);c=mix(c,vec3(.62,.73,.75),fog);
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(18000, 18000, 240, 240),
    material,
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.z = -3500;
  return { mesh, material };
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
      void main(){vec3 d=normalize(vDir);float h=max(d.y,0.);vec3 c=mix(vec3(.73,.8,.79),vec3(.29,.47,.60),pow(h,.5));
        float sun=max(dot(d,normalize(vec3(-.5,.27,-.72))),0.);c+=vec3(1.,.76,.43)*pow(sun,180.)*.75;c+=vec3(1.,.91,.7)*pow(sun,1300.);
        vec2 uv=d.xz/max(.06,d.y)*2.;float n=noise(uv)+noise(uv*2.)*.5+noise(uv*4.)*.25;
        float cloud=smoothstep(.91,1.35,n)*smoothstep(.02,.16,h)*.7;c=mix(c,vec3(.9,.91,.86),cloud);
        gl_FragColor=vec4(c,1.);#include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`.replace(';#include', ';\n#include'),
    }),
  );
}
