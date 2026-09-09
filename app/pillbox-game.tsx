'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  Crosshair,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  createPillboxBattle,
  aimPillbox,
  stepPillbox,
} from '@/lib/pillbox/simulation';
import {
  AIM_BOUNDS,
  WAVE_COUNTS,
  type PillboxBattle,
} from '@/lib/pillbox/types';
import type { PillboxScene } from '@/lib/pillbox/scene';
import { PillboxAudio } from '@/lib/pillbox/audio';
import { registerPillboxTools } from '@/lib/pillbox/webmcp';

export default function PillboxGame({ onReturn }: { onReturn: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const aimSurface = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const battle = useRef(createPillboxBattle());
  const scene = useRef<PillboxScene | null>(null);
  const audio = useRef<PillboxAudio | null>(null);
  const held = useRef(false);
  const keys = useRef(new Set<string>());
  const reduced = useRef(false);
  const [hud, setHud] = useState<PillboxBattle>(createPillboxBattle);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(true);
  const [steady, setSteady] = useState(false);
  const [reticle, setReticle] = useState({ x: 0, y: 0, visible: false });
  const publish = () =>
    setHud({ ...battle.current, soldiers: [...battle.current.soldiers] });
  const release = () => {
    held.current = false;
    keys.current.clear();
  };
  const start = () => {
    battle.current = createPillboxBattle();
    battle.current.status = 'playing';
    release();
    audio.current?.setPaused(false);
    void audio.current?.start();
    publish();
    root.current?.focus();
  };
  const pause = () => {
    const b = battle.current;
    if (b.status !== 'playing' && b.status !== 'paused') return;
    b.status = b.status === 'playing' ? 'paused' : 'playing';
    release();
    audio.current?.setPaused(b.status === 'paused');
    publish();
    root.current?.focus();
  };
  useEffect(() => {
    let cancelled = false,
      frame = 0,
      last = 0,
      accumulator = 0,
      lastHud = 0;
    reduced.current = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    setSteady(reduced.current);
    const soundEngine = new PillboxAudio();
    audio.current = soundEngine;
    void soundEngine.preload();
    const unregister = registerPillboxTools({
      read: () => battle.current,
      start: () => {
        if (scene.current) start();
      },
      aim: (x, z) => aimPillbox(battle.current, x, z),
      trigger: (value) => {
        held.current = value;
      },
    });
    const blur = () => {
      release();
      if (battle.current.status === 'playing') {
        battle.current.status = 'paused';
        soundEngine.setPaused(true);
        publish();
      }
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (!e.repeat) pause();
        return;
      }
      if (
        (e.target as HTMLElement).closest(
          'input,select,textarea,button,a,[contenteditable="true"]',
        )
      )
        return;
      if (battle.current.status !== 'playing') return;
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
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.current.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    const pointerUp = () => {
      held.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    const surface = aimSurface.current;
    const wheel = (event: WheelEvent) => {
      if (battle.current.status !== 'playing') return;
      event.preventDefault();
      const units =
        event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      aimPillbox(
        battle.current,
        battle.current.aimX,
        battle.current.aimZ + event.deltaY * units * 0.06,
      );
      publish();
    };
    surface?.addEventListener('wheel', wheel, { passive: false });
    document.addEventListener('visibilitychange', visibility);
    const contextLost = (e: Event) => {
      e.preventDefault();
      blur();
      setError(
        'The graphics context was interrupted. Reload to return to battle.',
      );
    };
    const element = host.current!;
    element.addEventListener('webglcontextlost', contextLost, true);
    import('@/lib/pillbox/scene')
      .then(async ({ PillboxScene }) => {
        if (cancelled) return;
        scene.current = new PillboxScene(element);
        await scene.current.ready;
        if (cancelled) return;
        setLoaded(true);
        const animate = (now: number) => {
          if (cancelled) return;
          const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
          last = now;
          const b = battle.current;
          if (b.status === 'playing') {
            const pressed = (...codes: string[]) =>
              codes.some((c) => keys.current.has(c));
            aimPillbox(
              b,
              b.aimX +
                ((pressed('KeyD', 'ArrowRight') ? 1 : 0) -
                  (pressed('KeyA', 'ArrowLeft') ? 1 : 0)) *
                  dt *
                  24,
              b.aimZ +
                ((pressed('KeyS', 'ArrowDown') ? 1 : 0) -
                  (pressed('KeyW', 'ArrowUp') ? 1 : 0)) *
                  dt *
                  35,
            );
            accumulator += dt;
            while (accumulator >= 1 / 60) {
              for (const event of stepPillbox(
                b,
                1 / 60,
                held.current || keys.current.has('Space'),
              )) {
                scene.current?.event(event);
                if (event.type === 'shot') soundEngine.play('fire');
                if (event.type === 'breach') soundEngine.play('damage');
              }
              accumulator -= 1 / 60;
            }
          } else {
            accumulator = 0;
            held.current = false;
          }
          scene.current?.render(b, dt, reduced.current);
          if (now - lastHud > 65) {
            publish();
            setReticle(scene.current!.project(b.aimX, b.aimZ));
            lastHud = now;
          }
          frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
      })
      .catch(() => {
        if (!cancelled)
          setError('The 3D battlefield could not load. Reload to try again.');
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      release();
      unregister();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerUp);
      surface?.removeEventListener('wheel', wheel);
      document.removeEventListener('visibilitychange', visibility);
      element.removeEventListener('webglcontextlost', contextLost, true);
      scene.current?.dispose();
      scene.current = null;
      soundEngine.dispose();
      audio.current = null;
    };
    // The animation and event listeners intentionally read the current battle through refs.
  }, []);
  const aimPointer = (e: React.PointerEvent) => {
    if (battle.current.status !== 'playing') return;
    const point = scene.current?.aim(e.clientX, e.clientY);
    if (point) aimPillbox(battle.current, point.x, point.z);
  };
  const playing = hud.status === 'playing',
    ready = hud.status === 'ready',
    paused = hud.status === 'paused';
  const finished = hud.status === 'won' || hud.status === 'lost';
  const alive = hud.soldiers.filter(
    (s) => s.phase === 'advance' || s.phase === 'cover',
  ).length;
  const remaining =
    alive + Math.max(0, (WAVE_COUNTS[hud.wave - 1] ?? 0) - hud.spawned);
  return (
    <main
      className="pillbox-game"
      ref={root}
      tabIndex={-1}
      aria-label="Stage 2 beach defense"
    >
      <div
        ref={host}
        className="pillbox-canvas"
        aria-label="3D pillbox overlooking the beach"
      />
      <div
        ref={aimSurface}
        className="pillbox-aim-surface"
        aria-hidden="true"
        onPointerMove={aimPointer}
        onPointerDown={(e) => {
          if (!playing || e.button !== 0) return;
          aimPointer(e);
          held.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          root.current?.focus();
        }}
        onPointerUp={() => {
          held.current = false;
        }}
        onPointerCancel={() => {
          held.current = false;
        }}
        onLostPointerCapture={() => {
          held.current = false;
        }}
      />
      <header className="pillbox-header">
        <div className="pillbox-brand">
          <Shield size={20} />
          <strong>BEACH HEAD</strong>
          <span>02 / HOLD THE BEACH</span>
        </div>
        <div className="pillbox-options">
          <button
            aria-label={sound ? 'Mute sound' : 'Enable sound'}
            onClick={() => {
              audio.current?.setEnabled(!sound);
              if (!sound) void audio.current?.start();
              setSound(!sound);
            }}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            aria-label="Reduce camera motion"
            aria-pressed={steady}
            onClick={() => {
              reduced.current = !steady;
              setSteady(!steady);
            }}
          >
            Steady
          </button>
          {!ready && (
            <button
              aria-label={paused ? 'Resume defense' : 'Pause defense'}
              disabled={finished}
              onClick={pause}
            >
              {paused ? <Play size={18} /> : <Pause size={18} />}
            </button>
          )}
        </div>
      </header>
      {!ready && (
        <aside className="pillbox-objective">
          <span>DEFEND THE CAPTURED POSITION</span>
          <h2>Hold the beach.</h2>
          <p>
            Wave {hud.wave} / 3 <i />
            {remaining} approaching
          </p>
          <div className="pillbox-wave-pips">
            {[1, 2, 3].map((w) => (
              <b key={w} className={w <= hud.wave ? 'active' : ''} />
            ))}
          </div>
        </aside>
      )}
      {playing && reticle.visible && (
        <div
          className={`pillbox-crosshair ${hud.overheated ? 'hot' : ''}`}
          style={{ left: reticle.x, top: reticle.y }}
          aria-hidden="true"
        >
          <Crosshair size={38} />
          <small>{Math.round(Math.hypot(hud.aimX, hud.aimZ))} m</small>
        </div>
      )}
      {playing && (
        <output className="pillbox-radio" aria-live="polite">
          {hud.message}
        </output>
      )}
      {ready && !error && (
        <section className="pillbox-briefing">
          <p className="pillbox-eyebrow">STAGE 02 / COASTAL DEFENSE</p>
          <h1>
            HOLD THE
            <br />
            <em>BEACH.</em>
          </h1>
          <p>
            The landing is secure. Enemy infantry are coming to take it back.
            Man the pillbox and stop them before they reach the defense line.
          </p>
          <div className="pillbox-orders">
            <span>
              <b>03</b> assault waves
            </span>
            <span>
              <b>01</b> belt-fed machine gun
            </span>
          </div>
          <p className="pillbox-hint">
            Aim at advancing soldiers. Cover protects them while they crouch.
            Move the mouse to aim; hold the left button to fire. Use the wheel
            for range adjustments. You have about five seconds of sustained
            fire; release briefly to cool the barrel.
          </p>
          <button
            className="pillbox-primary"
            onClick={start}
            disabled={!loaded}
          >
            {loaded ? 'Man the machine gun' : 'Preparing the position…'}
            <ArrowUpRight size={20} />
          </button>
          <button className="pillbox-back" onClick={onReturn}>
            <ChevronLeft size={16} />
            Back to Stage 1
          </button>
          <p className="pillbox-credit">
            Gunshot:{' '}
            <a
              href="https://opengameart.org/content/light-machine-gun"
              target="_blank"
              rel="noreferrer"
            >
              KuraiWolf
            </a>{' '}
            ·{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noreferrer"
            >
              CC BY 4.0
            </a>{' '}
            · edited for automatic fire
          </p>
        </section>
      )}
      {(paused || finished || error) && (
        <div className="pillbox-overlay">
          <section className="pillbox-result">
            <Shield size={30} />
            <p className="pillbox-eyebrow">
              {error
                ? 'GRAPHICS INTERRUPTED'
                : paused
                  ? 'ALL STATIONS HOLDING'
                  : hud.status === 'won'
                    ? 'CAMPAIGN COMPLETE'
                    : 'POSITION OVERRUN'}
            </p>
            <h2>
              {error
                ? 'Stand by.'
                : paused
                  ? 'Take a breath.'
                  : hud.status === 'won'
                    ? 'The beach is ours.'
                    : 'The line was breached.'}
            </h2>
            <p>
              {error ||
                (paused
                  ? 'The assault is paused. Resume when you are ready.'
                  : hud.status === 'won'
                    ? 'Blockade broken. Counterattack defeated. Your fleet holds the island.'
                    : 'Watch the closest soldiers, catch them between cover, and manage your barrel heat.')}
            </p>
            {!paused && !error && (
              <div className="pillbox-result-stats">
                <span>
                  <b>{hud.score}</b>Score
                </span>
                <span>
                  <b>{hud.kills}</b>Stopped
                </span>
                <span>
                  <b>
                    {hud.shots ? Math.round((hud.hits / hud.shots) * 100) : 0}%
                  </b>
                  Accuracy
                </span>
              </div>
            )}
            <button
              className="pillbox-primary"
              onClick={
                error ? () => window.location.reload() : paused ? pause : start
              }
            >
              {paused ? <Play size={18} /> : <RotateCcw size={18} />}
              {error
                ? 'Reload game'
                : paused
                  ? 'Resume defense'
                  : 'Retry Stage 2'}
            </button>
            <button className="pillbox-back" onClick={onReturn}>
              Return to campaign start
            </button>
          </section>
        </div>
      )}
      {!ready && (
        <footer className="pillbox-instruments">
          <section>
            <label htmlFor="bunker-integrity">BUNKER INTEGRITY</label>
            <strong className={hud.health <= 40 ? 'danger' : ''}>
              {hud.health}
              <small>%</small>
            </strong>
            <meter
              min={0}
              max={100}
              value={hud.health}
              id="bunker-integrity"
              aria-label="Bunker integrity"
            />
          </section>
          <section className="pillbox-heat">
            <label htmlFor="barrel-temperature">BARREL TEMPERATURE</label>
            <strong className={hud.overheated ? 'danger' : ''}>
              {hud.overheated ? 'COOLING' : hud.heat > 70 ? 'HOT' : 'READY'}
            </strong>
            <meter
              min={0}
              max={100}
              value={hud.heat}
              id="barrel-temperature"
              aria-label="Barrel temperature"
            />
            <small>
              {hud.overheated
                ? 'Let the barrel cool'
                : '5-second bursts. Unlimited belt.'}
            </small>
          </section>
          <section className="pillbox-aim-controls">
            <label htmlFor="beach-bearing">TRAVERSE</label>
            <input
              id="beach-bearing"
              type="range"
              min={AIM_BOUNDS.minX}
              max={AIM_BOUNDS.maxX}
              step={0.5}
              value={hud.aimX}
              disabled={!playing}
              onChange={(e) => {
                aimPillbox(
                  battle.current,
                  Number(e.target.value),
                  battle.current.aimZ,
                );
                publish();
              }}
            />
            <label htmlFor="beach-range">RANGE</label>
            <input
              id="beach-range"
              type="range"
              min={-AIM_BOUNDS.maxZ}
              max={-AIM_BOUNDS.minZ}
              step={0.5}
              value={-hud.aimZ}
              disabled={!playing}
              onChange={(e) => {
                aimPillbox(
                  battle.current,
                  battle.current.aimX,
                  -Number(e.target.value),
                );
                publish();
              }}
            />
          </section>
          <button
            className={`pillbox-fire ${hud.overheated ? 'hot' : ''}`}
            disabled={!playing || hud.overheated}
            onPointerDown={(e) => {
              held.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerUp={() => {
              held.current = false;
            }}
            onPointerCancel={() => {
              held.current = false;
            }}
            onLostPointerCapture={() => {
              held.current = false;
            }}
            onKeyDown={(e) => {
              if (e.code === 'Space' || e.code === 'Enter') {
                e.preventDefault();
                held.current = true;
              }
            }}
            onKeyUp={() => {
              held.current = false;
            }}
            onBlur={() => {
              held.current = false;
            }}
          >
            <Crosshair size={21} />
            <span>
              {hud.overheated ? 'Barrel cooling' : 'Hold to fire'}
              <small>SPACE / PRESS & HOLD</small>
            </span>
          </button>
        </footer>
      )}
      <div className="pillbox-controls">
        Mouse to aim · Hold left button to fire · Wheel for range{' '}
        <span>SPACE</span> Fire <span>ESC</span> Pause
      </div>
    </main>
  );
}
