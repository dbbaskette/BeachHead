'use client';

import { useEffect, useRef, useState } from 'react';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { assetUrl } from '../../lib/asset-url';
import {
  animateGuard,
  resetGuardActor,
  type GuardActor,
} from '../../lib/bunker/guard-animation';
import { PELVIS_HEIGHT } from '../../lib/bunker/reactions';
import { GuardMotion, loadGuardMotions } from '../../lib/bunker/guard-motion';
import { createBunker, type Guard } from '../../lib/bunker/simulation';
import {
  guardClips,
  smoothGuardNormals,
  uniformMaterial,
} from '../../lib/bunker/uniform';

const variants = [
  {
    name: 'Backward fall',
    action: 'reel',
    note: 'Torso impact · backward loss of balance',
  },
  {
    name: 'Forward fall',
    action: 'kneel',
    note: 'Front hit · loss of support',
  },
  {
    name: 'Side collapse',
    action: 'spin',
    note: 'Off-center impact · sideways fall',
  },
] as const;

// Inspection harness: calls the unchanged game animation and ragdoll code.
function rig(source: T.Object3D, scene: T.Scene): GuardActor {
  const bounds = new T.Box3().setFromObject(source),
    model = clone(source);
  const root = new T.Group(),
    body = new T.Group();
  root.add(body);
  body.position.y = -PELVIS_HEIGHT;
  model.scale.setScalar(1.8 / (bounds.max.y - bounds.min.y));
  model.position.y = -bounds.min.y * model.scale.y;
  model.rotation.y = Math.PI;
  body.add(model);
  scene.add(root);
  model.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });
  const rifle = new T.Group();
  const wood = new T.MeshStandardMaterial({ color: '#493220', roughness: 0.8 });
  const metal = new T.MeshStandardMaterial({
    color: '#232829',
    roughness: 0.5,
    metalness: 0.65,
  });
  const stock = new T.Mesh(new T.BoxGeometry(0.085, 0.095, 0.48), wood);
  stock.position.set(0, 0, 0.1);
  const barrel = new T.Mesh(
    new T.CylinderGeometry(0.023, 0.023, 0.55, 12),
    metal,
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.04, -0.24);
  const magazine = new T.Mesh(new T.BoxGeometry(0.045, 0.18, 0.075), metal);
  magazine.position.set(0, -0.13, 0.12);
  rifle.add(stock, barrel, magazine);
  body.add(rifle);
  rifle.position.set(0, 1.25, -0.35);
  const flash = new T.Mesh(
    new T.SphereGeometry(0.09, 8, 6),
    new T.MeshBasicMaterial({ color: '#ffd087' }),
  );
  rifle.add(flash);
  flash.position.set(0, 0.04, -0.55);
  flash.visible = false;
  const mixer = new T.AnimationMixer(model),
    clips = guardClips(source);
  const idle = mixer.clipAction(clips[0]),
    walk = mixer.clipAction(clips[1]);
  idle.play();
  walk.play();
  walk.setEffectiveWeight(0);
  const names = [
    'Spine',
    'Spine1',
    'Spine2',
    'Neck',
    'Head',
    'LeftUpLeg',
    'RightUpLeg',
    'LeftLeg',
    'RightLeg',
    'LeftArm',
    'RightArm',
    'LeftForeArm',
    'RightForeArm',
  ];
  return {
    root,
    body,
    model,
    rifle,
    flash,
    mixer,
    idle,
    walk,
    walkWeight: 0,
    helmet: model.getObjectByName('Helmet'),
    head: model.getObjectByName('Head'),
    arms: ['RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm'].map((n) =>
      model.getObjectByName(n),
    ),
    joints: names.flatMap((name) => {
      const bone = model.getObjectByName(name);
      return bone ? [{ name, bone, rest: bone.quaternion.clone() }] : [];
    }),
  };
}

export default function AnimationPreview() {
  const host = useRef<HTMLDivElement>(null);
  const settings = useRef({
    speed: 1,
    playing: true,
    replay: 0,
    angle: 0.65,
    routine: false,
    seek: -1,
  });
  const [playing, setPlaying] = useState(true),
    [speed, setSpeed] = useState(1);
  const [routine, setRoutine] = useState(false);
  const [status, setStatus] = useState('Loading the game’s soldier model…');
  const [progress, setProgress] = useState(0),
    [ready, setReady] = useState(false);
  useEffect(() => {
    const container = host.current!;
    let disposed = false,
      raf = 0;
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    const scenes: T.Scene[] = [],
      actors: GuardActor[] = [],
      guards: Guard[] = [];
    const camera = new T.PerspectiveCamera(42, 1, 0.05, 50);
    const materials = new Set<T.Material>(),
      geometries = new Set<T.BufferGeometry>();
    const textures = new Set<T.Texture>();
    const release = (object: T.Object3D) =>
      object.traverse((o) => {
        if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
        if (!(o instanceof T.Mesh)) return;
        geometries.add(o.geometry);
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          materials.add(m);
          for (const value of Object.values(m))
            if (value instanceof T.Texture) textures.add(value);
        }
      });
    let elapsed = 0,
      accumulator = 0,
      lastReplay = 0;
    const restart = () => {
      elapsed = 0;
      accumulator = 0;
      actors.forEach((a, i) => {
        resetGuardActor(a);
        guards[i] = {
          ...createBunker().guards[0],
          id: i,
          x: 0,
          z: 0,
          yaw: Math.PI,
          readiness: settings.current.routine && i !== 2 ? 0 : 1,
          moving: settings.current.routine && i === 1,
          health: 100,
          hitSide: i === 2 ? 0.9 : 0.25,
          hitPower: 1,
          deathAction: variants[i].action,
          hitDirection: { x: i === 2 ? 0.35 : 0, z: -1 },
          hitPoint: { x: 0, y: i === 1 ? 0.65 : 1.3, z: 0 },
          hitRegion: i === 1 ? 'leg' : 'torso',
        };
        animateGuard(a, guards[i], 0, scenes[i], true, []);
      });
    };
    void (async () => {
      const source = (
        await new GLTFLoader().loadAsync(
          assetUrl('/models/bunker/ww2-soldier.glb'),
        )
      ).scene;
      if (disposed) {
        release(source);
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
        textures.forEach((t) => t.dispose());
        return;
      }
      const material = await uniformMaterial();
      source.traverse((o) => {
        if (o instanceof T.Mesh) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
            m.dispose(),
          );
          o.material = material;
          smoothGuardNormals(o.geometry);
        }
      });
      if (disposed) {
        release(source);
        geometries.forEach((g) => g.dispose());
        materials.forEach((m) => m.dispose());
        textures.forEach((t) => t.dispose());
        return;
      }
      variants.forEach(() => {
        const scene = new T.Scene();
        scene.background = new T.Color('#333e40');
        scene.add(new T.HemisphereLight('#e5efff', '#796c57', 2.1));
        const light = new T.DirectionalLight('#fff0d6', 3.5);
        light.position.set(-3, 5, 4);
        light.castShadow = true;
        light.shadow.mapSize.set(1024, 1024);
        Object.assign(light.shadow.camera, {
          left: -3,
          right: 3,
          top: 3,
          bottom: -3,
          near: 0.1,
          far: 15,
        });
        light.shadow.normalBias = 0.018;
        scene.add(light);
        const floor = new T.Mesh(
          new T.PlaneGeometry(200, 200),
          new T.MeshStandardMaterial({ color: '#657171', roughness: 0.96 }),
        );
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.012;
        floor.receiveShadow = true;
        scene.add(floor);
        scenes.push(scene);
        actors.push(rig(source, scene));
      });
      source.traverse((o) => {
        if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
      });
      const motions = await loadGuardMotions();
      if (disposed) return;
      actors.forEach((a) => {
        a.motion = new GuardMotion(a, motions);
      });
      restart();
      setReady(true);
      let previous = performance.now(),
        lastReport = -1,
        width = 0,
        height = 0;
      const frame = (now: number) => {
        if (disposed) return;
        const delta = Math.min((now - previous) / 1000, 0.06);
        previous = now;
        if (lastReplay !== settings.current.replay) {
          restart();
          lastReplay = settings.current.replay;
        }
        if (settings.current.seek >= 0) {
          const target = settings.current.seek;
          settings.current.seek = -1;
          restart();
          accumulator = target;
        }
        if (settings.current.playing && !document.hidden)
          accumulator += delta * settings.current.speed;
        while (accumulator >= 1 / 60) {
          const before = elapsed;
          elapsed += 1 / 60;
          accumulator -= 1 / 60;
          for (const shotTime of [0.7, 1.05, 1.4])
            if (
              !settings.current.routine &&
              before < shotTime &&
              elapsed >= shotTime
            ) {
              guards.forEach((g) => {
                g.hits++;
                g.hitTime = 0.42;
                g.health = g.hits >= 3 ? 0 : 100 - g.hits * 34;
              });
            }
          actors.forEach((a, i) => {
            const g = guards[i];
            g.hitTime = Math.max(0, g.hitTime - 1 / 60);
            if (g.health <= 0) g.down = Math.min(1, g.down + 1 / 90);
            animateGuard(a, g, 1 / 60, scenes[i], true, []);
          });
          if (elapsed >= 6) {
            if (settings.current.routine) elapsed = 0;
            else restart();
          }
        }
        if (Math.floor(elapsed * 10) !== lastReport) {
          lastReport = Math.floor(elapsed * 10);
          setProgress(elapsed / 6);
          setStatus(
            settings.current.routine
              ? 'Idle · patrol · aiming'
              : elapsed < 0.7
                ? 'Ready'
                : elapsed < 1.4
                  ? 'Hit reaction'
                  : elapsed < 3.5
                    ? 'Collapse and landing'
                    : 'Settled — replaying shortly',
          );
        }
        const w = container.clientWidth,
          h = container.clientHeight;
        if (w !== width || h !== height) {
          width = w;
          height = h;
          renderer.setSize(w, h);
        }
        const stacked = window.innerWidth <= 755,
          panelW = stacked ? w : w / 3,
          panelH = stacked ? h / 3 : h;
        renderer.setScissorTest(true);
        camera.aspect = panelW / panelH;
        camera.updateProjectionMatrix();
        camera.position.set(
          Math.sin(settings.current.angle) * 4.5,
          2.3,
          Math.cos(settings.current.angle) * 4.5,
        );
        camera.lookAt(0, 0.7, -0.35);
        scenes.forEach((scene, i) => {
          const x = stacked ? 0 : i * panelW,
            y = stacked ? (2 - i) * panelH : 0;
          const focus = new T.Vector3();
          for (const name of ['Hips', 'Head', 'LeftFoot', 'RightFoot'])
            focus.add(
              actors[i].model
                .getObjectByName(name)!
                .getWorldPosition(new T.Vector3()),
            );
          focus.multiplyScalar(0.25);
          camera.position.set(
            focus.x + Math.sin(settings.current.angle) * 4.5,
            2.3,
            focus.z + Math.cos(settings.current.angle) * 4.5,
          );
          camera.lookAt(focus.x, 0.7, focus.z);
          renderer.setViewport(x, y, panelW, panelH);
          renderer.setScissor(x, y, panelW, panelH);
          renderer.render(scene, camera);
        });
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    })().catch((error) => {
      if (!disposed) setStatus(`Preview could not load: ${String(error)}`);
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      actors.forEach((a) => a.mixer.stopAllAction());
      scenes.forEach(release);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <main className="animation-study">
      <header>
        <p className="eyebrow">BENEATH THE GUNS / ANIMATION STUDY</p>
        <h1>Authored hit & fall animations</h1>
        <p>
          Mixamo rifle animations on our WWII soldier, in clear studio lighting.
          Switch between falls and everyday guard movements.
        </p>
      </header>
      <div className="study-controls">
        <button
          disabled={!ready}
          onClick={() => {
            settings.current.replay++;
            settings.current.playing = true;
            setPlaying(true);
          }}
        >
          ↻ Replay
        </button>
        <button
          disabled={!ready}
          onClick={() => {
            settings.current.playing = !playing;
            setPlaying(!playing);
          }}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <div className="speed-controls" aria-label="Playback speed">
          {[0.25, 0.5, 1].map((value) => (
            <button
              key={value}
              aria-pressed={speed === value}
              onClick={() => {
                settings.current.speed = value;
                setSpeed(value);
              }}
            >
              {value === 0.25 ? '¼×' : value === 0.5 ? '½×' : '1×'}
            </button>
          ))}
        </div>
        <label>
          View{' '}
          <select
            defaultValue=".65"
            onChange={(e) => {
              settings.current.angle = Number(e.target.value);
            }}
          >
            <option value=".65">Three-quarter</option>
            <option value="0">Front</option>
            <option value="1.57">Side</option>
          </select>
        </label>
        <button
          onClick={() => {
            settings.current.routine = !routine;
            setRoutine(!routine);
            settings.current.replay++;
            settings.current.playing = true;
            setPlaying(true);
          }}
        >
          {routine ? 'Show falls' : 'Everyday motions'}
        </button>
        {!routine && (
          <button
            disabled={!ready}
            onClick={() => {
              settings.current.seek = 5.5;
              settings.current.playing = false;
              setPlaying(false);
            }}
          >
            Final poses
          </button>
        )}
        <output>{status}</output>
      </div>
      <div className="study-stage">
        <div ref={host} className="study-canvas" />
        <div className="study-labels">
          {(routine
            ? [
                {
                  name: 'Idle / rifle ready',
                  action: 'idle',
                  note: 'Authored rifle idle',
                },
                {
                  name: 'Patrol walk',
                  action: 'walk',
                  note: 'Authored walking cycle',
                },
                {
                  name: 'Aiming',
                  action: 'aim',
                  note: 'Authored aiming stance',
                },
              ]
            : variants
          ).map((v, i) => (
            <section key={v.action}>
              <span>0{i + 1}</span>
              <h2>{v.name}</h2>
              <p>{v.note}</p>
            </section>
          ))}
        </div>
      </div>
      <progress
        className="study-progress"
        aria-label="Animation playback"
        value={progress}
        max={1}
      />
      <footer>
        Use ¼× to inspect joint movement and landing. This preview isolates body
        motion; combat blood, lighting and camera effects are omitted.
      </footer>
      <style>{`
      .animation-study{min-height:100dvh;background:#121b1e;color:#e4e9e7;padding:28px;font-family:system-ui,sans-serif}
      .animation-study header,.study-controls,.study-stage,.study-progress,.animation-study footer{max-width:1440px;margin-left:auto;margin-right:auto}
      .animation-study .eyebrow{font-size:11px;letter-spacing:2.5px;color:#cbb58a;margin-bottom:8px}
      .animation-study h1{font-size:clamp(24px,3vw,36px);font-weight:600;letter-spacing:-1px;margin-bottom:8px}
      .animation-study header>p:last-child{color:#aebbbb;font-size:14px}
      .study-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:24px 0 18px;font-size:13px}
      .study-controls button,.study-controls select{background:#253337;border:1px solid #455255;border-radius:7px;color:#e8ecea;padding:9px 14px;cursor:pointer;min-height:40px}
      .study-controls button:disabled{opacity:.5}.study-controls button[aria-pressed=true]{background:#cbb58a;color:#172124;border-color:#cbb58a}
      .speed-controls{display:flex;gap:3px;margin-left:8px}.study-controls label{margin-left:8px}.study-controls select{margin-left:8px}
      .study-controls output{margin-left:auto;color:#cbb58a;font-size:12px}
      .study-stage{position:relative;border:1px solid #485354;border-radius:10px;overflow:hidden}
      .study-canvas{height:clamp(360px,58vh,620px);width:100%}.study-canvas canvas{display:block}
      .study-labels{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);pointer-events:none}
      .study-labels section{padding:18px;background:linear-gradient(#142124b8,transparent 28%);border-right:1px solid #ffffff24}
      .study-labels section:last-child{border:0}.study-labels span{color:#d4bf96;font-size:11px;letter-spacing:2px}.study-labels h2{font-size:18px;margin:4px 0;font-weight:600}.study-labels p{font-size:11px;color:#c5cfcc}
      .study-progress{display:block;width:100%;border:0;appearance:none;height:3px;background:#344144;margin-top:12px}.study-progress::-webkit-progress-bar{background:#344144}.study-progress::-webkit-progress-value{background:#cbb58a}
      .animation-study footer{color:#94a6a6;font-size:12px;padding-top:16px;line-height:1.7}
      @media(max-width:755px){.animation-study{padding:14px}.study-canvas{height:1080px}.study-labels{grid-template-columns:1fr;grid-template-rows:repeat(3,1fr)}.study-labels section{border-right:0;border-bottom:1px solid #ffffff24}.study-controls output{width:100%;margin:0}.study-labels h2{font-size:16px}}
    `}</style>
    </main>
  );
}
