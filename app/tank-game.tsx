'use client';
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Crosshair,
  Home,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Waves,
  ZoomIn,
  Move,
  Wrench,
  Map as MapIcon,
} from 'lucide-react';
import { useTouchLayout } from './touch-controls';
import { FlakControls } from '@/lib/flak/controls';
import { bindControlRelease, type ControlRole } from '@/lib/bunker/controls';
import {
  bindBunkerInterruptions,
  bunkerBlurIsInterruption,
} from '@/lib/bunker/lifecycle';
import { TOUCH_LAYOUT_QUERY } from '@/lib/touch-input';
import {
  createTank,
  stepTank,
  aimTank,
  objective,
  type TankState,
} from '@/lib/tank/simulation';
import { TankAudio } from '@/lib/tank/audio';
import { settings, useSettings } from '@/lib/settings';
import type { TankScene } from '@/lib/tank/scene';
import './tank.css';
const read = (s: TankState) => ({
  status: s.status,
  health: Math.ceil(s.health),
  weapon: s.weapon,
  reload: s.reload,
  heat: s.heat,
  track: s.track,
  turretDamage: s.turretDamage,
  repair: s.repair,
  objective: objective(s),
  demolition: s.demolition,
  phase: s.phase,
  reason: s.reason,
  kills: s.kills,
  x: s.x,
  z: s.z,
  yaw: s.yaw,
  turret: s.turret,
  speed: s.speed,
  supplied: s.supplied,
  time: s.time,
  houses: s.cover.filter((c) => c.kind === 'house').map((c) => ({ ...c })),
});
export default function TankGame({ onReturn }: { onReturn: () => void }) {
  const root = useRef<HTMLElement>(null),
    host = useRef<HTMLDivElement>(null),
    battle = useRef(createTank()),
    scene = useRef<TankScene | null>(null),
    audio = useRef<TankAudio | null>(null),
    controls = useRef(new FlakControls()),
    keys = useRef(new Set<string>()),
    zoomRef = useRef(false),
    reduced = useRef(false),
    repairRef = useRef(false),
    mousePoint = useRef<{ x: number; y: number } | null>(null);
  const [hud, setHud] = useState(() => read(createTank())),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [zoom, setZoom] = useState(false),
    [map, setMap] = useState(false),
    [sticks, setSticks] = useState({
      move: { x: 0, y: 0 },
      aim: { x: 0, y: 0 },
    }),
    [repairing, setRepairing] = useState(false);
  const { muted, reducedMotion: steady } = useSettings();
  const touch = useTouchLayout();
  const publish = () => setHud(read(battle.current));
  const stick = () =>
    setSticks({
      move: { ...controls.current.stick },
      aim: { ...controls.current.aimStick },
    });
  const clear = () => {
    controls.current.clear();
    mousePoint.current = null;
    keys.current.clear();
    repairRef.current = false;
    setRepairing(false);
    stick();
  };
  const focus = () => {
    if (!matchMedia(TOUCH_LAYOUT_QUERY).matches)
      root.current?.focus({ preventScroll: true });
  };
  const pause = () => {
    if (battle.current.status === 'playing') {
      battle.current.status = 'paused';
      clear();
      audio.current?.setPaused(true);
      publish();
    }
  };
  const start = (retry = false) => {
    clear();
    if (retry || battle.current.status === 'ready') {
      battle.current = createTank();
      scene.current?.reset();
    }
    battle.current.status = 'playing';
    audio.current?.start();
    audio.current?.setPaused(false);
    publish();
    focus();
  };
  const swap = () => {
    battle.current.weapon =
      battle.current.weapon === 'cannon' ? 'mg' : 'cannon';
    publish();
    focus();
  };
  const toggleZoom = () => {
    zoomRef.current = !zoomRef.current;
    setZoom(zoomRef.current);
    focus();
  };
  const aim = (x: number, y: number) => {
    const speed = zoomRef.current ? 0.0011 : 0.0023;
    aimTank(battle.current, x * speed, -y * speed);
  };
  const begin = (role: ControlRole, e: ReactPointerEvent<HTMLElement>) => {
    if (battle.current.status !== 'playing' || e.button !== 0) return;
    e.preventDefault();
    if (
      controls.current.begin(
        role,
        e.pointerId,
        e.clientX,
        e.clientY,
        e.pointerType,
      )
    ) {
      e.currentTarget.setPointerCapture(e.pointerId);
      focus();
    }
  };
  useEffect(() => {
    let cancelled = false,
      frame = 0,
      last = 0,
      publishTime = 0;
    const controlSet = controls.current,
      keySet = keys.current;
    audio.current = new TankAudio();
    audio.current.setEnabled(!settings.get().muted);
    audio.current.preload();
    const release = bindControlRelease(window, controls.current, stick, () =>
      bunkerBlurIsInterruption(
        matchMedia(TOUCH_LAYOUT_QUERY).matches,
        document.hidden,
      ),
    );
    const interruptions = bindBunkerInterruptions(
      window,
      document,
      () => matchMedia(TOUCH_LAYOUT_QUERY).matches,
      pause,
    );
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && !e.buttons) {
        controls.current.end(e.pointerId);
        return;
      }
      const delta = controls.current.move(e.pointerId, e.clientX, e.clientY);
      if (delta) aim(delta.x, delta.y);
      else stick();
    };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('button')) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        pause();
        return;
      }
      if (battle.current.status !== 'playing') return;
      if (!e.repeat) {
        if (e.code === 'KeyQ') swap();
        if (e.code === 'KeyZ') toggleZoom();
        if (e.code === 'KeyM') setMap((v) => !v);
        if (e.code === 'KeyC') battle.current.turret = battle.current.yaw;
        if (e.code === 'Space') controls.current.queueShot();
      }
      if (
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Space',
          'KeyR',
          'ShiftLeft',
          'ShiftRight',
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    const tick = (stamp: number) => {
      if (cancelled) return;
      const dt = Math.min(0.1, (stamp - (last || stamp)) / 1000);
      last = stamp;
      const s = battle.current,
        held = (k: string) => Number(keys.current.has(k)),
        fine =
          keys.current.has('ShiftLeft') ||
          keys.current.has('ShiftRight') ||
          zoomRef.current;
      const input = {
        drive: Math.max(
          -1,
          Math.min(1, held('KeyW') - held('KeyS') - controls.current.axis.y),
        ),
        steer: Math.max(
          -1,
          Math.min(1, held('KeyD') - held('KeyA') + controls.current.axis.x),
        ),
        turn:
          (held('ArrowRight') - held('ArrowLeft') + controls.current.turn.x) *
          (fine ? 0.4 : 1),
        pitch:
          (held('ArrowUp') - held('ArrowDown') - controls.current.turn.y) *
          (fine ? 0.4 : 1),
        fire: controls.current.takeFire(!!held('Space')),
        repair: !!held('KeyR') || repairRef.current,
      };
      if (
        input.drive ||
        input.steer ||
        input.fire ||
        (!s.track && !s.turretDamage)
      ) {
        if (repairRef.current) {
          repairRef.current = false;
          setRepairing(false);
        }
      }
      const before = s.status;
      stepTank(s, dt, input);
      for (const e of s.events) audio.current?.play(e, s);
      audio.current?.update(s);
      if (before !== s.status) {
        clear();
        audio.current?.setPaused(true);
        publish();
      }
      scene.current?.render(s, zoomRef.current, reduced.current);
      publishTime += dt;
      if (publishTime > 0.1) {
        publishTime = 0;
        publish();
      }
      frame = requestAnimationFrame(tick);
    };
    void import('@/lib/tank/scene')
      .then(({ TankScene }) => {
        if (cancelled || !host.current) return;
        scene.current = new TankScene(
          host.current,
          battle.current,
          (message) => {
            setError(message);
            pause();
          },
        );
        setLoaded(true);
        frame = requestAnimationFrame(tick);
      })
      .catch(() =>
        setError(
          'The battlefield could not load. Return to missions and try again.',
        ),
      );
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      release();
      interruptions();
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      controlSet.clear();
      keySet.clear();
      scene.current?.dispose();
      scene.current = null;
      audio.current?.dispose();
      audio.current = null;
    };
    // The loop reads mutable input refs; each mission owns one renderer and listener set.
  }, []);
  useEffect(() => {
    audio.current?.setEnabled(!muted);
  }, [muted]);
  useEffect(() => {
    reduced.current = steady;
  }, [steady]);
  const playing = hud.status === 'playing',
    finished = hud.status === 'won' || hud.status === 'lost';
  const routeMap = (
    <svg
      viewBox="-90 -380 165 425"
      aria-label="Village map: high street down the center, orchard lane west, repair supplies halfway down orchard lane, bridge north"
    >
      <rect x="-87" y="-376" width="161" height="410" fill="#303e36" />
      <path d="M-85 -322H70" stroke="#779b9e" strokeWidth="24" />
      <path
        d="M0 20V-365M0 -18H-44V-280H0"
        stroke="#c6b89b"
        strokeWidth="7"
        fill="none"
      />
      {hud.houses.map((c) => (
        <rect
          key={c.id}
          x={c.x - c.w / 2}
          y={c.z - c.d / 2}
          width={c.w}
          height={c.d}
          fill={c.health > 0 ? '#8e8b78' : '#53594e'}
        />
      ))}
      <path d="M0 -307V-338" stroke="#e9deba" strokeWidth="12" />
      <circle
        cx="17"
        cy="-297"
        r="5"
        fill={hud.phase === 'advance' ? '#d88b61' : '#9fc3a0'}
      />
      <text x="18" y="-283" fontSize="6" fill="#fff3d5">
        Post
      </text>
      <text x="8" y="-349" fontSize="7" fill="#fff3d5">
        Bridge
      </text>
      <text x="-68" y="-163" fontSize="6" fill="#bbdbbd">
        Repairs
      </text>
      {!hud.supplied && (
        <path d="M-47 -172h8m-4 -4v8" stroke="#bbdbbd" strokeWidth="2" />
      )}
      <g
        transform={`translate(${hud.x} ${hud.z}) rotate(${(hud.yaw * 180) / Math.PI})`}
      >
        <path d="M0 -6L4 4H-4Z" fill="#ffe2a1" />
      </g>
    </svg>
  );
  return (
    <main
      ref={root}
      tabIndex={-1}
      className={`tank-game ${touch ? 'tank-mobile' : ''}`}
      aria-label="Stage 6 — Breakout"
    >
      <div ref={host} className="tank-canvas" />
      {playing && (
        <div
          className="tank-look"
          aria-label="Drag battlefield to aim"
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => begin('look', e)}
          onPointerEnter={(e) => {
            mousePoint.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerLeave={() => {
            mousePoint.current = null;
          }}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' && !e.buttons) {
              const prior = mousePoint.current;
              if (prior) aim(e.clientX - prior.x, e.clientY - prior.y);
            }
            mousePoint.current = { x: e.clientX, y: e.clientY };
          }}
        />
      )}
      <header className="tank-header">
        <div>
          <b>Beach Head</b>
          <span>06 / Breakout</span>
        </div>
        <nav aria-label="Tank options">
          <button
            aria-label={muted ? 'Enable sound' : 'Mute sound'}
            onClick={() => {
              settings.set({ muted: !muted });
              focus();
            }}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button
            aria-label={
              steady ? 'Enable camera motion' : 'Reduce camera motion'
            }
            aria-pressed={steady}
            onClick={() => {
              settings.set({ reducedMotion: !steady });
              focus();
            }}
          >
            <Waves />
          </button>
          <button
            aria-label="Show route map"
            aria-pressed={map}
            onClick={() => {
              setMap(!map);
              focus();
            }}
          >
            <MapIcon />
          </button>
          <button
            aria-label="Precision sight"
            aria-pressed={zoom}
            onClick={toggleZoom}
          >
            <ZoomIn />
          </button>
          <button aria-label="Return to missions" onClick={onReturn}>
            <Home />
          </button>
          <button
            aria-label="Pause mission"
            disabled={!playing}
            onClick={pause}
          >
            <Pause />
          </button>
        </nav>
      </header>
      {playing && (
        <>
          <div className="tank-objective">
            <span>{hud.objective}</span>
            {hud.phase === 'advance' && hud.demolition < 240 && (
              <b>{Math.ceil(hud.demolition)}s to demolition</b>
            )}
          </div>
          <div className="tank-reticle" aria-hidden="true">
            <i />
            <i />
          </div>
          <div className="tank-status">
            <div>
              <small>Armor</small>
              <b>{hud.health}%</b>
              <meter min="0" max="100" value={hud.health} />
            </div>
            <div>
              <small>
                {hud.weapon === 'cannon' ? '75 mm cannon' : 'Coaxial MG'}
              </small>
              <b>{hud.reload > 0.12 ? `${hud.reload.toFixed(1)}s` : 'Ready'}</b>
              <meter
                min="0"
                max="1"
                value={hud.weapon === 'mg' ? hud.heat : 1 - hud.reload / 3.6}
              />
            </div>
            <div
              className={`tank-components ${hud.track || hud.turretDamage ? 'tank-damaged' : ''}`}
            >
              <span>{hud.track ? 'Track damaged' : 'Tracks ready'}</span>
              <span>
                {hud.turretDamage ? 'Turret damaged' : 'Turret ready'}
              </span>
              {hud.repair > 0 && (
                <b>Repairing · {Math.ceil(4.5 - hud.repair)}s</b>
              )}
            </div>
          </div>
          <div className="tank-actions">
            <button onClick={swap}>
              Switch to {hud.weapon === 'cannon' ? 'MG' : 'cannon'}{' '}
              {!touch && '· Q'}
            </button>
            <button
              disabled={!hud.track && !hud.turretDamage}
              aria-pressed={repairing}
              onClick={() => {
                repairRef.current = !repairRef.current;
                setRepairing(repairRef.current);
                focus();
              }}
            >
              <Wrench size={16} />
              {repairing ? 'Cancel repair' : 'Repair'} {!touch && '· hold R'}
            </button>
          </div>
          {!touch && (
            <div className="tank-key-help">
              WASD drive · Mouse / arrows aim · Click / Space fire · Z sight · C
              center turret · M map
            </div>
          )}
          {touch && (
            <div className="tank-touch">
              <button
                className="tank-drive"
                aria-label="Drag pad to drive and steer"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => begin('move', e)}
              >
                <Move />
                <i
                  style={{
                    transform: `translate(${sticks.move.x}px,${sticks.move.y}px)`,
                  }}
                />
                <span>Drive</span>
              </button>
              <button
                className="tank-aim"
                aria-label="Drag pad to rotate turret and aim"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => begin('turn', e)}
              >
                <Crosshair />
                <i
                  style={{
                    transform: `translate(${sticks.aim.x}px,${sticks.aim.y}px)`,
                  }}
                />
                <span>Aim</span>
              </button>
              <button
                className="tank-fire"
                aria-label="Hold to fire tank weapon"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => begin('fire', e)}
              >
                <Crosshair />
                <b>Fire</b>
              </button>
            </div>
          )}
          {map && (
            <aside className="tank-map">
              {routeMap}
              <button onClick={() => setMap(false)}>Close map</button>
            </aside>
          )}
        </>
      )}
      {(!playing || error) && (
        <div className="tank-overlay">
          <section
            className="tank-brief"
            aria-label="Breakout mission briefing"
          >
            <div className="tank-orders">
              <p className="tank-chapter">Normandy · Inland advance</p>
              <h1>
                {error
                  ? 'Battlefield unavailable'
                  : hud.status === 'won'
                    ? 'The road is open'
                    : hud.status === 'lost'
                      ? 'Breakout halted'
                      : hud.status === 'paused'
                        ? 'Holding position'
                        : 'Breakout'}
              </h1>
              <p>
                {error ||
                  (hud.status === 'won'
                    ? 'The bridge is secure. Allied infantry are crossing, and the landing force can move inland.'
                    : hud.status === 'lost'
                      ? hud.reason
                      : hud.status === 'paused'
                        ? 'Your crew is standing by.'
                        : 'The cliff guns are silent. Take your Sherman through the village, destroy the demolition post, then hold the bridge for the infantry.')}
              </p>
              {hud.status === 'ready' && (
                <>
                  <ul>
                    <li>
                      <b>Choose your route.</b> The high street is direct. The
                      orchard lane offers cover and repair supplies.
                    </li>
                    <li>
                      <b>Watch for ambushes.</b> Rocket crews raise their
                      weapons before firing. Keep your frontal armor toward
                      enemy guns.
                    </li>
                    <li>
                      <b>Make your own opening.</b> Crush fences and low walls.
                      Use the cannon against buildings and armor; the MG against
                      exposed troops.
                    </li>
                  </ul>
                  <p className="tank-instructions">
                    {touch
                      ? 'Left pad drives and steers. Right pad or a swipe aims. Hold Fire to shoot. Stop before repairing.'
                      : 'WASD drives and steers. Mouse or arrows aim the turret. Click / Space fires. Q switches weapons; hold R to repair while stopped.'}
                  </p>
                </>
              )}
              {finished && (
                <p>
                  {hud.kills} positions neutralized ·{' '}
                  {Math.floor(hud.time / 60)}m {Math.floor(hud.time % 60)}s
                </p>
              )}
              <div className="tank-brief-actions">
                {!error && (
                  <button
                    className="tank-primary"
                    disabled={!loaded}
                    onClick={() => start(finished)}
                  >
                    {hud.status === 'paused' ? (
                      <Play />
                    ) : finished ? (
                      <RotateCcw />
                    ) : (
                      <Crosshair />
                    )}
                    {!loaded
                      ? 'Preparing the Sherman…'
                      : hud.status === 'paused'
                        ? 'Resume mission'
                        : finished
                          ? 'Try again'
                          : 'Begin breakout'}
                  </button>
                )}
                <button onClick={onReturn}>Back to missions</button>
              </div>
            </div>
            {hud.status === 'ready' && (
              <div className="tank-brief-map">
                {routeMap}
                <p>Two roads. One bridge.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
