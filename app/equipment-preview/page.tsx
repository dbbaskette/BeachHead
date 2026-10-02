'use client';

import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BunkerEquipment } from '../../lib/bunker/equipment';
import { assetUrl } from '../../lib/asset-url';

const items = [
  'Radio rack',
  'Ammunition chest',
  'Bunk bed',
  'Infirmary cot',
  'Oil drum',
] as const;
const descriptions = [
  'Recessed analogue meters, Bakelite controls, curved carrying handles and separate receiver chassis.',
  'Individual timber boards, recessed joints, metal catches and hanging rope handles.',
  'Bent tubular steel, padded mattresses, stitched edges and a blanket draped over the rails.',
  'A curved steel frame, a soft pillow and uneven linen folds.',
  'Rolled rims, pressed reinforcing beads and inset filling plugs.',
];

export default function EquipmentPreview() {
  const host = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  const select = useRef<(n: number) => void>(() => {});
  const reset = useRef<() => void>(() => {});
  const [metrics, setMetrics] = useState('');
  useEffect(() => {
    const root = host.current!;
    const renderer = new T.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    root.appendChild(renderer.domElement);
    const scene = new T.Scene();
    scene.background = new T.Color('#1d2528');
    scene.fog = new T.Fog('#1d2528', 10, 35);
    const room = new RoomEnvironment();
    const generator = new T.PMREMGenerator(renderer);
    const env = generator.fromScene(room, 0.06);
    room.dispose();
    generator.dispose();
    scene.environment = env.texture;
    scene.environmentIntensity = 0.45;
    scene.add(new T.HemisphereLight('#dce6e9', '#504633', 1.2));
    const key = new T.DirectionalLight('#ffe0ad', 4);
    key.position.set(-3, 5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -4;
    key.shadow.camera.right = key.shadow.camera.top = 4;
    key.shadow.normalBias = 0.012;
    scene.add(key);
    const rim = new T.DirectionalLight('#afcfed', 2);
    rim.position.set(3, 3, -3);
    scene.add(rim);
    const loader = new T.TextureLoader();
    const steel = loader.load(assetUrl('/textures/bunker-worn-steel.jpg'));
    const woodMap = loader.load(assetUrl('/textures/bunker-timber.jpg'));
    for (const tex of [steel, woodMap]) {
      tex.colorSpace = T.SRGBColorSpace;
      tex.wrapS = tex.wrapT = T.RepeatWrapping;
      tex.anisotropy = 8;
    }
    woodMap.repeat.set(1.5, 1.5);
    const metal = new T.MeshStandardMaterial({
      map: steel,
      bumpMap: steel,
      bumpScale: 0.008,
      color: '#efeee8',
      roughness: 0.53,
      metalness: 0.28,
    });
    const dark = new T.MeshStandardMaterial({
      map: steel,
      color: '#b0b3ac',
      roughness: 0.43,
      metalness: 0.5,
    });
    const wood = new T.MeshStandardMaterial({
      map: woodMap,
      bumpMap: woodMap,
      bumpScale: 0.012,
      color: '#b9a184',
      roughness: 0.92,
    });
    const brass = new T.MeshStandardMaterial({
      color: '#998353',
      metalness: 0.72,
      roughness: 0.4,
    });
    const equipment = new BunkerEquipment(metal, dark, wood, brass);
    const models = [
      equipment.radioRack(),
      equipment.crate(1.4, 1.2, 2),
      equipment.bed(),
      equipment.bed(false),
      equipment.barrel(),
    ];
    models.forEach((m) => {
      m.visible = false;
      scene.add(m);
    });
    const ground = new T.Mesh(
      new T.PlaneGeometry(200, 200),
      new T.MeshStandardMaterial({ color: '#40484a', roughness: 0.9 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.032;
    ground.receiveShadow = true;
    scene.add(ground);
    const camera = new T.PerspectiveCamera(38, 1, 0.03, 250);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 1;
    controls.maxDistance = 12;
    let current = 0;
    reset.current = () => {
      const bounds = new T.Box3().setFromObject(models[current]);
      const center = bounds.getCenter(new T.Vector3());
      const size = bounds.getSize(new T.Vector3());
      const radius = Math.max(size.x, size.y, size.z);
      controls.target.copy(center);
      camera.position
        .copy(center)
        .add(new T.Vector3(radius * 1.05, radius * 0.65, radius * 1.75));
      controls.update();
    };
    select.current = (n) => {
      current = n;
      models.forEach((m, i) => {
        m.visible = n === i;
      });
      reset.current();
      let triangles = 0;
      models[n].traverse((o) => {
        if (o instanceof T.Mesh)
          triangles +=
            (o.geometry.index?.count ??
              o.geometry.getAttribute('position').count) / 3;
      });
      setMetrics(
        `${models[n].children.length} material batches · ${Math.round(triangles).toLocaleString()} triangles`,
      );
    };
    select.current(0);
    const resize = new ResizeObserver(() => {
      renderer.setSize(root.clientWidth, root.clientHeight);
      camera.aspect = root.clientWidth / Math.max(1, root.clientHeight);
      camera.updateProjectionMatrix();
    });
    resize.observe(root);
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      resize.disconnect();
      controls.dispose();
      renderer.setAnimationLoop(null);
      const mats = new Set<T.Material>([
        metal,
        dark,
        wood,
        brass,
        equipment.enamel,
        equipment.bakelite,
        equipment.canvas,
        equipment.linen,
        equipment.dial,
      ]);
      const textures = new Set<T.Texture>([steel, woodMap]);
      scene.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            mats.add(m),
          );
        }
      });
      mats.forEach((m) => {
        Object.values(m).forEach((v) => {
          if (v instanceof T.Texture) textures.add(v);
        });
        m.dispose();
      });
      textures.forEach((t) => t.dispose());
      env.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <main className="equipment-page">
      <header>
        <div>
          <p>BEACH HEAD · BENEATH THE GUNS</p>
          <h1>Bunker equipment</h1>
        </div>
        <a href={assetUrl('/')}>Back to game ↗</a>
      </header>
      <nav aria-label="Equipment models">
        {items.map((name, i) => (
          <button
            key={name}
            aria-pressed={selected === i}
            onClick={() => {
              setSelected(i);
              select.current(i);
            }}
          >
            {name}
          </button>
        ))}
      </nav>
      <div
        className="equipment-view"
        ref={host}
        aria-label={`Interactive 3D model: ${items[selected]}`}
      />
      <footer>
        <div>
          <h2>{items[selected]}</h2>
          <p>{descriptions[selected]}</p>
          <small>Drag to orbit · Scroll or pinch to zoom · {metrics}</small>
        </div>
        <button onClick={() => reset.current()}>Reset view</button>
      </footer>
      <style>{`
      .equipment-page{height:100dvh;min-height:560px;background:#121b1f;color:#e9e5d9;display:flex;flex-direction:column;font-family:Arial,sans-serif}
      .equipment-page header,.equipment-page footer{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:20px 28px}
      .equipment-page header p{font-size:10px;letter-spacing:2px;color:#bca879;margin:0 0 8px}.equipment-page h1{font-size:25px;margin:0}.equipment-page h2{font-size:18px;margin:0 0 6px}
      .equipment-page a{color:#cbbb93;font-size:13px}.equipment-page nav{display:flex;gap:8px;padding:0 28px 18px;flex-wrap:wrap}
      .equipment-page button{border:1px solid #465052;border-radius:5px;padding:10px 14px;color:#ddd9cc;background:#253034;cursor:pointer}.equipment-page button[aria-pressed=true]{background:#bbab81;color:#141b1d;border-color:#bbab81}
      .equipment-page button:focus-visible{outline:2px solid #e9cc82;outline-offset:3px}.equipment-view{flex:1;min-height:260px;touch-action:none}.equipment-view canvas{display:block}
      .equipment-page footer{border-top:1px solid #344044}.equipment-page footer p{font-size:13px;color:#c6c9c5;margin:0 0 8px;max-width:680px;line-height:1.4}.equipment-page small{color:#96a5a8;font-size:11px}
      @media(max-width:600px){.equipment-page header,.equipment-page footer{padding:15px;gap:10px}.equipment-page nav{padding:0 15px 12px;gap:6px}.equipment-page nav button{font-size:11px;padding:8px}.equipment-page header h1{font-size:21px}.equipment-page footer{align-items:flex-start}.equipment-page footer button{white-space:nowrap;font-size:11px}}
    `}</style>
    </main>
  );
}
