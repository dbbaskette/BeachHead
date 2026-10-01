'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Crosshair,
  Footprints,
  Home,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useTouchLayout } from './touch-controls';
import { StageFourPreview } from './stage-four-preview';
import { TouchDrag, thumbAxis, TOUCH_LAYOUT_QUERY } from '@/lib/touch-input';
import {
  createBunker,
  emptyInput,
  look,
  reloadBunker,
  shootBunker,
  stepBunker,
  type BunkerState,
} from '@/lib/bunker/simulation';
import { PillboxAudio } from '@/lib/pillbox/audio';
import type { BunkerScene } from '@/lib/bunker/scene';

const snapshot = (b: BunkerState) => ({
  status: b.status,
  health: b.health,
  ammo: b.ammo,
  reserve: b.reserve,
  reloading: b.reload > 0,
  cleared: b.guards.every((g) => g.health <= 0),
  hurt: b.hurt > 0,
  room:
    b.z > 2
      ? 'Gun emplacement'
      : b.z > -10
        ? 'Service tunnel'
        : 'Munitions room',
});
export default function BunkerGame({ onReturn }: { onReturn: () => void }) {
  const host = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null);
  const battle = useRef(createBunker()),
    scene = useRef<BunkerScene | null>(null),
    audio = useRef<PillboxAudio | null>(null);
  const keys = useRef(new Set<string>()),
    pad = useRef({ x: 0, y: 0 }),
    fire = useRef(false),
    gesture = useRef(new TouchDrag()),
    fireGesture = useRef(new TouchDrag());
  const movePointer = useRef<number | null>(null),
    moveOrigin = useRef({ x: 0, y: 0 }),
    locked = useRef(false);
  const [hud, setHud] = useState(() => snapshot(createBunker())),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [muted, setMuted] = useState(false),
    [preview, setPreview] = useState(false),
    [mouseLocked, setMouseLocked] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const touch = useTouchLayout();
  const publish = () => setHud(snapshot(battle.current));
  const clear = () => {
    keys.current.clear();
    pad.current = { x: 0, y: 0 };
    fire.current = false;
    gesture.current.clear();
    fireGesture.current.clear();
    movePointer.current = null;
    setStick({ x: 0, y: 0 });
  };
  const unlock = () => {
    if (document.pointerLockElement === surface.current)
      document.exitPointerLock();
  };
  const pause = () => {
    if (battle.current.status !== 'playing') return;
    battle.current.status = 'paused';
    clear();
    audio.current?.setPaused(true);
    unlock();
    publish();
  };
  const lock = () => {
    if (touch || !surface.current?.requestPointerLock) return;
    try {
      const request = surface.current.requestPointerLock();
      void request?.catch(() => {
        locked.current = false;
        setMouseLocked(false);
      });
    } catch {
      setMouseLocked(false);
    }
  };
  const start = (retry = false) => {
    clear();
    if (retry || battle.current.status === 'ready') {
      battle.current = createBunker();
      scene.current?.reset();
    }
    battle.current.status = 'playing';
    audio.current?.setPaused(false);
    void audio.current?.start();
    publish();
    root.current?.focus();
    lock();
  };
  const leave = () => {
    clear();
    unlock();
    onReturn();
  };
  useEffect(() => {
    let cancelled = false,
      frame = 0,
      last = 0,
      hudClock = 0;
    const steady = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    audio.current = new PillboxAudio();
    void audio.current.preload();
    const keydown = (e: KeyboardEvent) => {
      const element = e.target as HTMLElement;
      if (element.closest('dialog,input,textarea,select')) return;
      if (element.closest('button') && ['Space', 'Enter'].includes(e.code))
        return;
      if (e.code === 'Escape') {
        e.preventDefault();
        pause();
        return;
      }
      if (battle.current.status !== 'playing') return;
      if (e.code === 'Space' && !e.repeat) shootBunker(battle.current);
      if (
        [
          'KeyW',
          'KeyA',
          'KeyS',
          'KeyD',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Space',
          'KeyR',
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const keyup = (e: KeyboardEvent) => keys.current.delete(e.code);
    const mouse = (e: MouseEvent) => {
      if (document.pointerLockElement === surface.current)
        look(battle.current, e.movementX, e.movementY);
    };
    const pointerup = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') fire.current = false;
    };
    const lockChange = () => {
      const now = document.pointerLockElement === surface.current;
      const lost = locked.current && !now;
      locked.current = now;
      setMouseLocked(now);
      if (lost) pause();
    };
    const visibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('mousemove', mouse);
    window.addEventListener('pointerup', pointerup);
    window.addEventListener('blur', pause);
    document.addEventListener('pointerlockchange', lockChange);
    document.addEventListener('visibilitychange', visibility);
    const tick = (stamp: number) => {
      if (cancelled) return;
      const dt = Math.min(0.05, (stamp - (last || stamp)) / 1000);
      last = stamp;
      const input = emptyInput(),
        held = (code: string) => keys.current.has(code);
      input.forward =
        -pad.current.y +
        (held('KeyW') || held('ArrowUp') ? 1 : 0) -
        (held('KeyS') || held('ArrowDown') ? 1 : 0);
      input.strafe =
        pad.current.x + (held('KeyD') ? 1 : 0) - (held('KeyA') ? 1 : 0);
      input.turn = (held('ArrowRight') ? 1 : 0) - (held('ArrowLeft') ? 1 : 0);
      input.fire = fire.current || held('Space');
      input.reload = held('KeyR');
      const before = battle.current.status;
      stepBunker(battle.current, input, dt);
      const events = battle.current.effects.splice(0);
      for (const e of events) {
        if (e.kind === 'shot' || e.kind === 'enemy')
          audio.current?.play('fire', {
            distance: e.kind === 'enemy' ? 0.65 : 0.05,
          });
        else if (e.kind === 'hurt') audio.current?.play('damage');
        else if (e.kind === 'stone')
          audio.current?.play('impact', { distance: 0.9 });
      }
      if (battle.current.status !== before) {
        clear();
        unlock();
        audio.current?.setPaused(true);
        publish();
      }
      scene.current?.render(battle.current, dt, events, steady);
      hudClock += dt;
      if (hudClock > 0.1) {
        publish();
        hudClock = 0;
      }
      frame = requestAnimationFrame(tick);
    };
    void import('@/lib/bunker/scene')
      .then(async ({ BunkerScene }) => {
        if (cancelled || !host.current) return;
        const view = new BunkerScene(
          host.current,
          window.matchMedia(TOUCH_LAYOUT_QUERY).matches,
        );
        scene.current = view;
        await view.ready;
        if (cancelled) return;
        setLoaded(true);
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {
        if (!cancelled) {
          scene.current?.dispose();
          scene.current = null;
          setError(
            'The bunker could not load. Please return to the menu and try again.',
          );
        }
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('mousemove', mouse);
      window.removeEventListener('pointerup', pointerup);
      window.removeEventListener('blur', pause);
      document.removeEventListener('pointerlockchange', lockChange);
      document.removeEventListener('visibilitychange', visibility);
      unlock();
      scene.current?.dispose();
      scene.current = null;
      audio.current?.dispose();
      audio.current = null;
    };
  }, []);
  const playing = hud.status === 'playing';
  return (
    <main
      ref={root}
      tabIndex={-1}
      className={`bunker-game ${touch ? 'bunker-touch' : ''}`}
      aria-label="Stage 4 — Beneath the guns"
    >
      <div
        ref={host}
        className="bunker-canvas"
        aria-label="First-person bunker battlefield"
      />
      <div
        ref={surface}
        className={`bunker-look ${playing ? 'active' : ''}`}
        aria-label="Drag to look around"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (!playing || e.button !== 0) return;
          if (
            e.pointerType === 'mouse' &&
            document.pointerLockElement === surface.current
          ) {
            fire.current = true;
            shootBunker(battle.current);
            return;
          }
          if (!gesture.current.begin(e.pointerId, e.clientX, e.clientY)) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          if (e.pointerType === 'mouse') {
            fire.current = true;
            shootBunker(battle.current);
          }
        }}
        onPointerMove={(e) => {
          if (locked.current) return;
          const delta = gesture.current.move(e.pointerId, e.clientX, e.clientY);
          if (delta) look(battle.current, delta.x, delta.y);
        }}
        onPointerUp={(e) => {
          if (gesture.current.end(e.pointerId) && e.pointerType === 'mouse')
            fire.current = false;
        }}
        onPointerCancel={(e) => {
          gesture.current.end(e.pointerId);
          if (e.pointerType === 'mouse') fire.current = false;
        }}
        onLostPointerCapture={(e) => {
          gesture.current.end(e.pointerId);
          if (e.pointerType === 'mouse' && !locked.current)
            fire.current = false;
        }}
      />
      <header className="bunker-header">
        <div>
          <span>BEACH HEAD</span>
          <small>04 / BENEATH THE GUNS · SAMPLE</small>
        </div>
        <nav aria-label="Bunker options">
          <button
            aria-label={muted ? 'Enable sound' : 'Mute sound'}
            onClick={() => {
              audio.current?.setEnabled(muted);
              setMuted(!muted);
            }}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button aria-label="Return to main menu" onClick={leave}>
            <Home />
          </button>
          {playing && (
            <button aria-label="Pause bunker sample" onClick={pause}>
              <Pause />
            </button>
          )}
        </nav>
      </header>
      {playing && (
        <>
          <div className="bunker-crosshair" aria-hidden="true">
            <i />
            <i />
          </div>
          <div
            className={`bunker-damage ${hud.hurt ? 'hit' : ''}`}
            aria-hidden="true"
          />
          <div className="bunker-objective">
            {hud.cleared
              ? 'Area clear · Reach the illuminated tunnel door'
              : 'Find the tunnel exit'}
          </div>
          <div className="bunker-hud">
            <div>
              <small>HEALTH</small>
              <strong>{hud.health}</strong>
            </div>
            <div className="bunker-location">
              {hud.room}
              <small>
                {touch
                  ? 'Left pad: move · Drag view: look'
                  : mouseLocked
                    ? 'WASD move · Click fire · R reload · Esc pause'
                    : 'WASD move · Drag to look · Click fire · R reload'}
              </small>
            </div>
            <button
              className="bunker-reload"
              onClick={() => {
                reloadBunker(battle.current);
                publish();
              }}
              aria-label="Reload weapon"
            >
              <small>{hud.reloading ? 'RELOADING' : 'MP40 · RELOAD'}</small>
              <strong>
                {hud.ammo} <span>/ {hud.reserve}</span>
              </strong>
            </button>
          </div>
          {touch && (
            <div
              className="bunker-touch-controls"
              aria-label="Bunker touch controls"
            >
              <button
                className="bunker-move"
                aria-label="Drag left pad to move"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  if (movePointer.current !== null) return;
                  e.preventDefault();
                  movePointer.current = e.pointerId;
                  moveOrigin.current = { x: e.clientX, y: e.clientY };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (movePointer.current !== e.pointerId) return;
                  const x = e.clientX - moveOrigin.current.x,
                    y = e.clientY - moveOrigin.current.y;
                  pad.current = thumbAxis(x, y);
                  const s = Math.min(1, 25 / Math.max(1, Math.hypot(x, y)));
                  setStick({ x: x * s, y: y * s });
                }}
                onPointerUp={(e) => {
                  if (movePointer.current === e.pointerId) {
                    movePointer.current = null;
                    pad.current = { x: 0, y: 0 };
                    setStick({ x: 0, y: 0 });
                  }
                }}
                onPointerCancel={(e) => {
                  if (movePointer.current !== e.pointerId) return;
                  movePointer.current = null;
                  pad.current = { x: 0, y: 0 };
                  setStick({ x: 0, y: 0 });
                }}
                onLostPointerCapture={(e) => {
                  if (movePointer.current !== e.pointerId) return;
                  movePointer.current = null;
                  pad.current = { x: 0, y: 0 };
                  setStick({ x: 0, y: 0 });
                }}
              >
                <Footprints />
                <i
                  style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}
                />
                <span>Move</span>
              </button>
              <button
                className="bunker-fire"
                aria-label="Hold to fire and drag to aim"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => {
                  if (
                    !fireGesture.current.begin(
                      e.pointerId,
                      e.clientX,
                      e.clientY,
                    )
                  )
                    return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  fire.current = true;
                  shootBunker(battle.current);
                }}
                onPointerMove={(e) => {
                  const delta = fireGesture.current.move(
                    e.pointerId,
                    e.clientX,
                    e.clientY,
                  );
                  if (delta) look(battle.current, delta.x, delta.y);
                }}
                onPointerUp={(e) => {
                  if (fireGesture.current.end(e.pointerId))
                    fire.current = false;
                }}
                onPointerCancel={(e) => {
                  if (fireGesture.current.end(e.pointerId))
                    fire.current = false;
                }}
                onLostPointerCapture={(e) => {
                  if (fireGesture.current.end(e.pointerId))
                    fire.current = false;
                }}
              >
                <Crosshair />
                <b>Fire</b>
                <span>Drag to aim</span>
              </button>
            </div>
          )}
        </>
      )}
      {(hud.status !== 'playing' || error) && (
        <div className="bunker-overlay">
          <section
            className="bunker-panel"
            aria-label={
              hud.status === 'ready'
                ? 'Bunker mission briefing'
                : 'Bunker mission status'
            }
          >
            <p className="bunker-eyebrow">STAGE 4 · PLAYABLE SAMPLE</p>
            <h1>
              {error
                ? 'Unable to enter'
                : hud.status === 'ready'
                  ? 'Beneath the guns'
                  : hud.status === 'paused'
                    ? 'Hold your position'
                    : hud.status === 'won'
                      ? 'Into the tunnels'
                      : 'Position lost'}
            </h1>
            <p>
              {error ||
                (hud.status === 'ready'
                  ? 'Step inside the coastal gun emplacement. Clear the service tunnel and munitions room, then reach the door to the tunnels below.'
                  : hud.status === 'paused'
                    ? 'Take a breath. The bunker will wait.'
                    : hud.status === 'won'
                      ? 'The gun room is secure. Beyond this door, the tunnels run deeper. This is the end of the short sample.'
                      : 'The guards held the bunker. Use the doorways for cover and keep moving when they fire.')}
            </p>
            {hud.status === 'ready' && (
              <>
                <div className="bunker-mission-facts">
                  <span>3 spaces</span>
                  <span>4 guards</span>
                  <span>1 tunnel exit</span>
                </div>
                <p className="bunker-control-help">
                  {touch
                    ? 'Left pad to move. Drag the view to look. Hold Fire and drag it to aim while shooting. Tap the ammo counter to reload.'
                    : 'WASD to move · Mouse to look · Click to fire · R to reload. Arrow keys also move and turn. Esc pauses and releases the mouse.'}
                </p>
                <p className="bunker-tip">
                  Use cover. Clear the guards to unlock the tunnel door. A
                  medical kit is just inside the munitions room.
                </p>
              </>
            )}
            {!error && (
              <button
                className="bunker-primary"
                disabled={!loaded}
                onClick={() =>
                  start(hud.status === 'won' || hud.status === 'lost')
                }
              >
                {hud.status === 'paused' ? (
                  <Play />
                ) : hud.status === 'ready' ? (
                  <ArrowLeft />
                ) : (
                  <RotateCcw />
                )}
                {!loaded
                  ? 'Preparing the bunker…'
                  : hud.status === 'paused'
                    ? 'Resume sample'
                    : hud.status === 'ready'
                      ? 'Enter the bunker'
                      : 'Play again'}
              </button>
            )}
            <div className="bunker-panel-links">
              <button onClick={leave}>Back to missions</button>
              {hud.status === 'ready' && (
                <button onClick={() => setPreview(true)}>
                  View concept art
                </button>
              )}
            </div>
          </section>
        </div>
      )}
      <StageFourPreview open={preview} onClose={() => setPreview(false)} />
    </main>
  );
}
