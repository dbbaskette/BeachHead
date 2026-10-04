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
  Move,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useTouchLayout } from './touch-controls';
import { bindControlRelease, type ControlRole } from '@/lib/bunker/controls';
import { FlakControls } from '@/lib/flak/controls';
import { createFlak, stepFlak, aimFlak } from '@/lib/flak/simulation';
import { PillboxAudio } from '@/lib/pillbox/audio';
import type { FlakScene } from '@/lib/flak/scene';
const snapshot = (s: ReturnType<typeof createFlak>) => ({
  status: s.status,
  integrity: Math.ceil(s.integrity),
  magazine: s.magazine,
  reload: s.reload,
  downed: s.downed,
  stopped: s.stopped,
  wave: Math.min(3, 1 + Math.floor(s.time / 32)),
  time: s.time,
});
export default function FlakGame({
  campaign,
  onReturn,
  onContinue,
}: {
  campaign: boolean;
  onReturn: () => void;
  onContinue: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null),
    battle = useRef(createFlak()),
    scene = useRef<FlakScene | null>(null),
    audio = useRef<PillboxAudio | null>(null),
    controls = useRef(new FlakControls()),
    keys = useRef(new Set<string>()),
    zoomRef = useRef(false);
  const [hud, setHud] = useState(() => snapshot(createFlak())),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [muted, setMuted] = useState(false),
    [zoom, setZoom] = useState(false),
    [stick, setStick] = useState({ x: 0, y: 0 });
  const touch = useTouchLayout();
  const publish = () => setHud(snapshot(battle.current));
  const clear = () => {
    controls.current.clear();
    keys.current.clear();
    setStick({ x: 0, y: 0 });
  };
  const pause = () => {
    if (battle.current.status !== 'playing') return;
    battle.current.status = 'paused';
    clear();
    audio.current?.setPaused(true);
    publish();
  };
  const start = (retry = false) => {
    clear();
    if (retry || battle.current.status === 'ready') {
      battle.current = createFlak();
      scene.current?.reset();
    }
    battle.current.status = 'playing';
    audio.current?.setPaused(false);
    void audio.current?.start();
    publish();
    root.current?.focus();
  };
  const toggleZoom = () => {
    zoomRef.current = !zoomRef.current;
    setZoom(zoomRef.current);
    root.current?.focus();
  };
  const aim = (x: number, y: number) => {
    if (battle.current.status === 'playing') {
      const sensitivity = zoomRef.current ? 0.00135 : 0.0024;
      aimFlak(battle.current, x * sensitivity, -y * sensitivity);
    }
  };
  useEffect(() => {
    let cancelled = false,
      frame = 0,
      last = 0,
      publishClock = 0;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    audio.current = new PillboxAudio();
    void audio.current.preload();
    const keySet = keys.current;
    const release = bindControlRelease(window, controls.current, () =>
      setStick({ ...controls.current.aimStick }),
    );
    const move = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        controls.current.end(e.pointerId);
        return;
      }
      const delta = controls.current.move(e.pointerId, e.clientX, e.clientY);
      if (delta) aim(delta.x, delta.y);
      else setStick({ ...controls.current.aimStick });
    };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('button')) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        pause();
        return;
      }
      if (battle.current.status !== 'playing') return;
      if (e.code === 'KeyZ' && !e.repeat) toggleZoom();
      if (e.code === 'Space' && !e.repeat) controls.current.queueShot();
      if (
        [
          'KeyW',
          'KeyS',
          'KeyA',
          'KeyD',
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'Space',
          'ShiftLeft',
          'ShiftRight',
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const visibility = () => {
      if (document.hidden) pause();
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', pause);
    window.addEventListener('pagehide', pause);
    window.addEventListener('orientationchange', pause);
    document.addEventListener('visibilitychange', visibility);
    const tick = (stamp: number) => {
      if (cancelled) return;
      const dt = Math.min(0.1, (stamp - (last || stamp)) / 1000);
      last = stamp;
      const s = battle.current,
        held = (k: string) => keys.current.has(k);
      if (s.status === 'playing') {
        const speed =
          zoomRef.current || held('ShiftLeft') || held('ShiftRight')
            ? 0.42
            : 0.85;
        aimFlak(
          s,
          ((held('KeyD') || held('ArrowRight') ? 1 : 0) -
            (held('KeyA') || held('ArrowLeft') ? 1 : 0) +
            controls.current.turn.x) *
            dt *
            speed,
          ((held('KeyW') || held('ArrowUp') ? 1 : 0) -
            (held('KeyS') || held('ArrowDown') ? 1 : 0) -
            controls.current.turn.y) *
            dt *
            speed,
        );
      }
      const before = s.status;
      stepFlak(s, dt, controls.current.takeFire(held('Space')));
      for (const e of s.events) {
        if (e.kind === 'shot') audio.current?.play('fire');
        else if (e.kind === 'strafe')
          audio.current?.play('fire', {
            distance: 0.85,
            pan: Math.max(-1, Math.min(1, e.at.x / 500)),
          });
        else if (e.kind === 'damage') audio.current?.play('damage');
        else if (e.kind === 'hit' || e.kind === 'crash' || e.kind === 'strike')
          audio.current?.play('impact', {
            distance: 0.8,
            pan: Math.max(-1, Math.min(1, e.at.x / 500)),
          });
      }
      if (before !== s.status) {
        clear();
        audio.current?.setPaused(true);
        publish();
      }
      scene.current?.render(s, zoomRef.current, reduced);
      publishClock += dt;
      if (publishClock > 0.1) {
        publishClock = 0;
        publish();
      }
      frame = requestAnimationFrame(tick);
    };
    void import('@/lib/flak/scene')
      .then(({ FlakScene }) => {
        if (cancelled || !host.current) return;
        scene.current = new FlakScene(host.current, (message) => {
          pause();
          setError(message);
        });
        scene.current.render(battle.current, false);
        setLoaded(true);
        frame = requestAnimationFrame(tick);
      })
      .catch(() =>
        setError(
          'Unable to start the 3D scene. Please return to the menu and try again.',
        ),
      );
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      release();
      keySet.clear();
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', pause);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('orientationchange', pause);
      document.removeEventListener('visibilitychange', visibility);
      scene.current?.dispose();
      scene.current = null;
      audio.current?.dispose();
    };
  }, []);
  const begin = (role: ControlRole, e: ReactPointerEvent<HTMLElement>) => {
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
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Global release handling remains available. */
    }
  };
  const playing = hud.status === 'playing';
  return (
    <main
      ref={root}
      tabIndex={-1}
      className={`flak-game ${touch ? 'flak-touch' : ''}`}
      aria-label="Stage 2 — Hold the skies"
    >
      <div className="flak-canvas" ref={host} />
      <div
        className="flak-look"
        aria-label="Drag the sky to aim"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => begin('look', e)}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse' && e.buttons === 0)
            aim(e.movementX, e.movementY);
        }}
      />
      <header className="flak-header">
        <div>
          <span>BEACH HEAD</span>
          <small>02 / HOLD THE SKIES</small>
        </div>
        <nav aria-label="Antiaircraft options">
          <button
            aria-label={muted ? 'Enable sound' : 'Mute sound'}
            onClick={() => {
              audio.current?.setEnabled(muted);
              setMuted(!muted);
            }}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button
            aria-label={zoom ? 'Wide sight' : 'Precision sight'}
            aria-pressed={zoom}
            onClick={toggleZoom}
          >
            {zoom ? <ZoomOut /> : <ZoomIn />}
          </button>
          <button aria-label="Return to main menu" onClick={onReturn}>
            <Home />
          </button>
          <button
            aria-label={playing ? 'Pause mission' : 'Resume mission'}
            disabled={!loaded || !['playing', 'paused'].includes(hud.status)}
            onClick={() => (playing ? pause() : start())}
          >
            {playing ? <Pause /> : <Play />}
          </button>
        </nav>
      </header>
      {playing && (
        <>
          <div
            className={`flak-reticle ${zoom ? 'zoom' : ''}`}
            aria-hidden="true"
          >
            <i />
            <b />
          </div>
          <div className="flak-status">
            <div>
              <small>BATTERY</small>
              <strong>{hud.integrity}%</strong>
              <meter min="0" max="100" value={hud.integrity} />
            </div>
            <div>
              <small>RAID {hud.wave} / 3</small>
              <strong>
                {hud.reload > 0 ? 'Changing magazines' : `${hud.magazine} / 80`}
              </strong>
              <span>
                {hud.reload > 0
                  ? `${hud.reload.toFixed(1)} s`
                  : '20 mm · four barrels'}
              </span>
            </div>
          </div>
          {touch ? (
            <div className="flak-touch-controls">
              <button
                className="flak-aim"
                aria-label="Hold and move thumb to aim"
                onPointerDown={(e) => begin('turn', e)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <Move />
                <i
                  style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}
                />
                <span>Aim</span>
              </button>
              <button
                className="flak-fire"
                aria-label="Hold to fire antiaircraft guns"
                onPointerDown={(e) => begin('fire', e)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <Crosshair />
                <span>Fire</span>
              </button>
            </div>
          ) : (
            <p className="flak-help">
              Mouse / arrows to aim · Hold click / Space to fire · Z precision
              sight · Esc pause
            </p>
          )}
        </>
      )}
      {(!playing || error) && (
        <div className="flak-overlay">
          <section className="flak-panel">
            <p className="flak-eyebrow">STAGE 02 / COASTAL ANTIAIRCRAFT</p>
            <h1>
              {error
                ? 'Battery unavailable'
                : hud.status === 'ready'
                  ? 'Hold the skies'
                  : hud.status === 'paused'
                    ? 'Guns standing by'
                    : hud.status === 'won'
                      ? 'The sky is clear'
                      : 'The battery has fallen'}
            </h1>
            <p>
              {error ||
                (hud.status === 'ready'
                  ? 'All raids approach from the same offshore sector. Stop transports before they drop parachutes, break up low fighter strafing runs, and down bombers before they release bombs at your battery.'
                  : hud.status === 'paused'
                    ? 'Take a breath. The raid will wait.'
                    : `${hud.downed} aircraft downed · ${hud.stopped} parachute landings stopped · ${hud.integrity}% battery integrity`)}
            </p>
            {hud.status === 'ready' && !error && (
              <>
                <div className="flak-briefing">
                  <span>
                    <b>Lead your shots</b>Shells take time to reach an aircraft.
                    Aim ahead of its nose.
                  </span>
                  <span>
                    <b>Watch the transports</b>Four parachutes can turn one
                    aircraft into several threats.
                  </span>
                  <span>
                    <b>Pick your bursts</b>80 rounds, then a three-second
                    magazine change. Zoom for precision.
                  </span>
                </div>
                <p className="flak-instructions">
                  {touch
                    ? 'Left thumb: aim · Right thumb: hold Fire. You can also swipe the sky.'
                    : 'Move mouse or use WASD / arrows to aim. Hold click or Space to fire. Z zooms; Shift slows aim.'}
                </p>
              </>
            )}
            <div className="flak-actions">
              {!error && (
                <button
                  disabled={!loaded}
                  className="flak-primary"
                  onClick={() =>
                    hud.status === 'won' && campaign
                      ? onContinue()
                      : start(hud.status === 'won' || hud.status === 'lost')
                  }
                >
                  <Play size={18} />
                  {!loaded
                    ? 'Preparing the battery…'
                    : hud.status === 'ready'
                      ? 'Man the guns'
                      : hud.status === 'paused'
                        ? 'Resume defense'
                        : hud.status === 'won' && campaign
                          ? 'Stage 3 — Air assault'
                          : 'Defend again'}
                </button>
              )}
              {hud.status === 'paused' && !error && (
                <button onClick={() => start(true)}>
                  <RotateCcw size={18} />
                  Restart raid
                </button>
              )}
              <button onClick={onReturn}>
                <Home size={18} />
                Main menu
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
