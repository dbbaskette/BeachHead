'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Crosshair,
  Bomb,
  DoorOpen,
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
import { TOUCH_LAYOUT_QUERY } from '@/lib/touch-input';
import {
  BunkerControls,
  BunkerKeyboard,
  BUNKER_KEYS,
  bindControlRelease,
  type ControlRole,
} from '@/lib/bunker/controls';
import {
  createBunker,
  throwGrenade,
  openDoor,
  nearbyDoor,
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
  grenades: b.grenades,
  grenadeReady: b.grenadeCooldown <= 0,
  door: !!nearbyDoor(b),
  reloading: b.reload > 0,
  cleared: b.guards.every((g) => g.health <= 0),
  hurt: b.hurt > 0,
  room:
    b.z > 2
      ? 'Gun emplacement'
      : b.z > -10
        ? 'Service tunnel'
        : b.z > -24
          ? 'Munitions room'
          : b.z > -32
            ? 'Radio room'
            : 'Generator room',
});
export default function BunkerGame({ onReturn }: { onReturn: () => void }) {
  const host = useRef<HTMLDivElement>(null),
    surface = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null);
  const battle = useRef(createBunker()),
    scene = useRef<BunkerScene | null>(null),
    audio = useRef<PillboxAudio | null>(null);
  const keys = useRef(new Set<string>()),
    controls = useRef(new BunkerControls()),
    keyboard = useRef(new BunkerKeyboard()),
    locked = useRef(false);
  const [hud, setHud] = useState(() => snapshot(createBunker())),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [muted, setMuted] = useState(false),
    [preview, setPreview] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [aimStick, setAimStick] = useState({ x: 0, y: 0 });
  const updateSticks = () => {
    setStick({ ...controls.current.stick });
    setAimStick({ ...controls.current.aimStick });
  };
  const touch = useTouchLayout();
  const publish = () => setHud(snapshot(battle.current));
  const clear = () => {
    keys.current.clear();
    keyboard.current.clear();
    controls.current.clear();
    updateSticks();
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
      });
    } catch {
      locked.current = false;
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
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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
      if (['KeyG', 'KeyE'].includes(e.code)) {
        e.preventDefault();
        if (!e.repeat) {
          if (e.code === 'KeyG') throwGrenade(battle.current);
          else openDoor(battle.current);
          publish();
        }
      }
      if (BUNKER_KEYS.has(e.code)) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const keyup = (e: KeyboardEvent) => keys.current.delete(e.code);
    const mouse = (e: MouseEvent) => {
      if (document.pointerLockElement === surface.current)
        look(battle.current, e.movementX, e.movementY);
    };
    const releaseControls = bindControlRelease(
      window,
      controls.current,
      updateSticks,
    );
    const pointermove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        if (controls.current.end(e.pointerId)) updateSticks();
        return;
      }
      const previousStick = controls.current.stick,
        previousAimStick = controls.current.aimStick;
      const delta = controls.current.move(e.pointerId, e.clientX, e.clientY);
      if (
        previousStick !== controls.current.stick ||
        previousAimStick !== controls.current.aimStick
      )
        updateSticks();
      if (delta && !(locked.current && e.pointerType === 'mouse'))
        look(battle.current, delta.x, delta.y);
    };
    const lockChange = () => {
      const now = document.pointerLockElement === surface.current;
      const lost = locked.current && !now;
      locked.current = now;
      if (lost) pause();
    };
    const visibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('mousemove', mouse);
    window.addEventListener('pointermove', pointermove, true);
    window.addEventListener('blur', pause);
    document.addEventListener('pointerlockchange', lockChange);
    document.addEventListener('visibilitychange', visibility);
    const tick = (stamp: number) => {
      if (cancelled) return;
      const dt = Math.min(0.05, (stamp - (last || stamp)) / 1000);
      last = stamp;
      const input = keyboard.current.read(keys.current, dt);
      input.forward -= controls.current.axis.y;
      input.strafe += controls.current.axis.x;
      input.fire ||= controls.current.firing;
      const before = battle.current.status;
      look(
        battle.current,
        controls.current.turn.x * dt * 650,
        controls.current.turn.y * dt * 520,
      );
      stepBunker(battle.current, input, dt);
      const events = battle.current.effects.splice(0);
      for (const e of events) {
        if (e.kind === 'shot' || e.kind === 'enemy')
          audio.current?.play('fire', {
            distance: e.kind === 'enemy' ? 0.65 : 0.05,
          });
        else if (e.kind === 'hurt') audio.current?.play('damage');
        else if (e.kind === 'blast')
          audio.current?.play('impact', { distance: 0.05 });
        else if (e.kind === 'bounce' || e.kind === 'door')
          audio.current?.play('impact', { distance: 0.8 });
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
      window.removeEventListener('pointermove', pointermove, true);
      releaseControls();
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
  const beginPointer = (
    role: ControlRole,
    e: React.PointerEvent<HTMLElement>,
  ) => {
    if (battle.current.status !== 'playing' || e.button !== 0) return;
    e.preventDefault();
    if (
      !controls.current.begin(
        role,
        e.pointerId,
        e.clientX,
        e.clientY,
        e.pointerType,
      )
    )
      return;
    // Global move/release handling remains active if capture is unavailable/interrupted.
    try {
      if (!(role === 'look' && e.pointerType === 'mouse' && locked.current))
        e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer may already have ended */
    }
    if (role === 'fire' || (role === 'look' && e.pointerType === 'mouse'))
      shootBunker(battle.current);
  };
  const playing = hud.status === 'playing';
  return (
    <main
      ref={root}
      tabIndex={-1}
      className={`bunker-game ${touch ? 'bunker-touch' : ''}`}
      aria-label="Stage 5 — Beneath the guns"
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
        onPointerDown={(e) => beginPointer('look', e)}
      />
      <header className="bunker-header">
        <div>
          <span>BEACH HEAD</span>
          <small>05 / BENEATH THE GUNS · SAMPLE</small>
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
                  ? 'Left stick: walk · Right stick: look'
                  : 'WASD move · Arrows aim · Space fire · Shift fine aim · R reload'}
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
          <div className="bunker-actions">
            <button
              className="bunker-grenade"
              disabled={!hud.grenades || !hud.grenadeReady}
              aria-label={`Throw grenade (${hud.grenades} remaining)`}
              onClick={() => {
                throwGrenade(battle.current);
                publish();
                root.current?.focus();
              }}
            >
              <Bomb />
              <span>
                {touch ? 'Grenade' : 'G · Grenade'} <b>{hud.grenades}</b>
              </span>
            </button>
            {hud.door && (
              <button
                className="bunker-door"
                aria-label="Open nearby door"
                onClick={() => {
                  openDoor(battle.current);
                  publish();
                  root.current?.focus();
                }}
              >
                <DoorOpen />
                <span>{touch ? 'Open door' : 'E · Open door'}</span>
              </button>
            )}
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
                onPointerDown={(e) => beginPointer('move', e)}
              >
                <Footprints />
                <i
                  style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}
                />
                <span>Move</span>
              </button>
              <button
                className="bunker-aim"
                aria-label="Drag right stick to turn and aim"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => beginPointer('turn', e)}
              >
                <Crosshair />
                <i
                  style={{
                    transform: `translate(${aimStick.x}px,${aimStick.y}px)`,
                  }}
                />
                <span>Look</span>
              </button>
              <button
                className="bunker-fire bunker-fire-separate"
                aria-label="Hold to fire and drag to aim"
                onContextMenu={(e) => e.preventDefault()}
                onPointerDown={(e) => beginPointer('fire', e)}
              >
                <Crosshair />
                <b>Fire</b>
                <span>Hold</span>
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
            <p className="bunker-eyebrow">STAGE 5 · PLAYABLE SAMPLE</p>
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
                  ? 'Step inside the coastal gun emplacement. Push through the munitions room, radio room and generator room. Open the steel doors and reach the tunnels below.'
                  : hud.status === 'paused'
                    ? 'Take a breath. The bunker will wait.'
                    : hud.status === 'won'
                      ? 'The gun room is secure. Beyond this door, the tunnels run deeper. This is the end of the short sample.'
                      : 'The guards held the bunker. Use the doorways for cover and keep moving when they fire.')}
            </p>
            {hud.status === 'ready' && (
              <>
                <div className="bunker-mission-facts">
                  <span>5 spaces</span>
                  <span>6 guards</span>
                  <span>3 grenades</span>
                </div>
                <p className="bunker-control-help">
                  {touch
                    ? 'Use the left stick to walk and the right stick to turn and aim at the same time. Hold Fire to shoot. You can also drag the view or Fire button to aim. Tap the ammo counter to reload. Tap Grenade to throw, and Open door when near a steel door. Keep clear of your own blast.'
                    : 'Keyboard: WASD moves and strafes. Arrow keys aim in all directions. Hold Space to fire, Shift for fine aim, R to reload, Esc to pause. G throws a grenade; E opens nearby doors. Mouse aiming and click-to-fire also work. Keep clear of your own blast.'}
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
