'use client';
import { mouseAimDelta, mouseWheelRange } from '../lib/naval/mouse-aim';
import { useEffect, useRef, useState } from 'react';
import {
  Anchor,
  Crosshair,
  ScanEye,
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  MoveHorizontal,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Waves,
  Maximize,
  Shield,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  createBattle,
  setAim,
  fire,
  step,
  rangeToElevation,
  type Battle,
} from '@/lib/naval/simulation';
import { NavalAudio } from '@/lib/naval/audio';
import { registerNavalTools } from '@/lib/naval/webmcp';
import { flushSync } from 'react-dom';
import type { NavalScene } from '@/lib/naval/scene';

type Marker = {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  health: number;
  maxHealth: number;
  name: string;
};
const bearing = (x: number, z: number) => (Math.atan2(x, -z) * 180) / Math.PI;
const number = (n: number) => Math.round(n).toLocaleString('en-US');
const time = (n: number) =>
  `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(Math.floor(n % 60)).padStart(2, '0')}`;
export default function NavalGame({
  onContinue,
  onPractice,
}: {
  onContinue: () => void;
  onPractice: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null);
  const battle = useRef<Battle>(createBattle()),
    scene = useRef<NavalScene | null>(null),
    audio = useRef<NavalAudio | null>(null);
  const keys = useRef(new Set<string>()),
    reduced = useRef(false),
    optic = useRef(false),
    targetIndex = useRef(0);
  const [scoped, setScoped] = useState(false);
  const [hud, setHud] = useState<Battle>(createBattle);
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [sound, setSound] = useState(true),
    [steady, setSteady] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]),
    [selected, setSelected] = useState(0);
  const [reticle, setReticle] = useState({ x: 0, y: 0, visible: false });
  const mousePoint = useRef<{ x: number; y: number } | null>(null);
  const mouseFiring = useRef(false);
  const drag = useRef<{
    x: number;
    y: number;
    heading: number;
    range: number;
    moved: boolean;
  } | null>(null);
  const publish = () =>
    setHud({
      ...battle.current,
      ships: battle.current.ships.map((s) => ({ ...s })),
    });
  const cycle = () => {
    const b = battle.current;
    for (let i = 1; i <= b.ships.length; i++) {
      const index = (targetIndex.current + i) % b.ships.length;
      if (b.ships[index].health > 0) {
        targetIndex.current = index;
        setSelected(index);
        break;
      }
    }
  };
  const shoot = () => {
    if (fire(battle.current)) publish();
  };
  const aim = (heading: number, range: number) => {
    setAim(battle.current, heading, range);
    publish();
  };
  const start = () => {
    battle.current = createBattle();
    battle.current.status = 'playing';
    optic.current = false;
    setScoped(false);
    targetIndex.current = 0;
    setSelected(0);
    scene.current?.reset();
    mousePoint.current = null;
    mouseFiring.current = false;
    drag.current = null;
    keys.current.clear();
    audio.current?.setPaused(false);
    void audio.current?.start();
    publish();
    root.current?.focus();
  };
  const pause = () => {
    const b = battle.current;
    if (b.status === 'playing') b.status = 'paused';
    else if (b.status === 'paused') b.status = 'playing';
    if (b.status === 'paused' && document.pointerLockElement === host.current)
      document.exitPointerLock();
    audio.current?.setPaused(b.status === 'paused');
    mousePoint.current = null;
    mouseFiring.current = false;
    drag.current = null;
    keys.current.clear();
    publish();
    root.current?.focus();
  };
  useEffect(() => {
    let cancelled = false,
      frame = 0,
      last = 0,
      accumulator = 0,
      lastHud = 0;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    reduced.current = media.matches;
    audio.current = new NavalAudio();
    void audio.current.preload();
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const b = battle.current;
      if (e.code === 'Escape') {
        e.preventDefault();
        pause();
        return;
      }
      if (
        el.closest(
          'input,[role="slider"],textarea,select,[contenteditable="true"]',
        )
      )
        return;
      if (el.closest('button') && ['Space', 'Enter', 'Tab'].includes(e.code))
        return;
      if (e.shiftKey && e.code === 'Tab') return;
      if (b.status !== 'playing') return;
      if (e.code === 'KeyZ' && !e.repeat) {
        optic.current = !optic.current;
        setScoped(optic.current);
        e.preventDefault();
        return;
      }
      if (
        [
          'KeyA',
          'KeyD',
          'KeyW',
          'KeyS',
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          'Space',
          'Tab',
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.current.add(e.code);
        if (e.code === 'Tab' && !e.repeat) cycle();
      }
    };
    const keyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
    const blur = () => {
      keys.current.clear();
      mousePoint.current = null;
      mouseFiring.current = false;
      drag.current = null;
      if (battle.current.status === 'playing') {
        battle.current.status = 'paused';
        audio.current?.setPaused(true);
        publish();
      }
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    const releaseMouse = () => {
      mouseFiring.current = false;
    };
    const lockedMove = (event: MouseEvent) => {
      if (
        document.pointerLockElement !== host.current ||
        battle.current.status !== 'playing'
      )
        return;
      const delta = mouseAimDelta(
        event.movementX,
        event.movementY,
        optic.current,
        event.shiftKey || (event.buttons & 2) !== 0,
      );
      aim(
        battle.current.heading + delta.heading,
        battle.current.range + delta.range,
      );
    };
    let ownedPointer = false;
    const lockChanged = () => {
      const locked = document.pointerLockElement === host.current;
      if (ownedPointer && !locked) blur();
      ownedPointer = locked;
      mousePoint.current = null;
    };
    document.addEventListener('mousemove', lockedMove);
    document.addEventListener('pointerlockchange', lockChanged);
    window.addEventListener('pointerup', releaseMouse);
    window.addEventListener('pointercancel', releaseMouse);
    const wheelHost = host.current;
    const wheel = (event: WheelEvent) => {
      if (battle.current.status !== 'playing') return;
      event.preventDefault();
      aim(
        battle.current.heading,
        battle.current.range +
          mouseWheelRange(
            event.deltaY,
            event.deltaMode,
            event.shiftKey || optic.current,
          ),
      );
    };
    wheelHost?.addEventListener('wheel', wheel, { passive: false });
    document.addEventListener('visibilitychange', visibility);
    import('@/lib/naval/scene')
      .then(({ NavalScene }) => {
        if (cancelled || !host.current) return;
        try {
          scene.current = new NavalScene(host.current, (message) => {
            blur();
            setError(message);
          });
          setSteady(media.matches);
          setLoaded(true);
        } catch {
          setError(
            'This game needs WebGL 2. Enable hardware acceleration in your browser, then reload.',
          );
          return;
        }
        const animate = (now: number) => {
          if (cancelled) return;
          const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
          last = now;
          const b = battle.current;
          if (b.status === 'playing') {
            const held = (...names: string[]) =>
              names.some((n) => keys.current.has(n));
            const turn =
              (held('KeyD', 'ArrowRight') ? 1 : 0) -
              (held('KeyA', 'ArrowLeft') ? 1 : 0);
            const range =
              (held('KeyW', 'ArrowUp') ? 1 : 0) -
              (held('KeyS', 'ArrowDown') ? 1 : 0);
            setAim(b, b.heading + turn * 18 * dt, b.range + range * 230 * dt);
            if (held('Space') || mouseFiring.current) fire(b);
            accumulator += dt;
            while (accumulator >= 1 / 60) {
              const events = step(b, 1 / 60);
              accumulator -= 1 / 60;
              for (const event of events) {
                scene.current?.event(event, b);
                if (event.type === 'fired') audio.current?.play('fire');
                if (event.type === 'hit' || event.type === 'enemy-fired') {
                  const ship = b.ships.find((s) => s.id === event.shipId);
                  if (ship)
                    audio.current?.play(
                      event.type === 'hit' ? 'impact' : 'fire',
                      {
                        pan: Math.sin(
                          Math.atan2(ship.x, -ship.z) -
                            (b.heading * Math.PI) / 180,
                        ),
                        distance: Math.min(
                          1,
                          Math.hypot(ship.x, ship.z) / 1600,
                        ),
                      },
                    );
                }
                if (event.type === 'miss')
                  audio.current?.play('splash', {
                    pan: Math.sin(
                      Math.atan2(event.x, -event.z) -
                        (b.heading * Math.PI) / 180,
                    ),
                    distance: Math.min(1, Math.hypot(event.x, event.z) / 1600),
                  });
                if (event.type === 'damaged') audio.current?.play('damage');
              }
            }
          } else accumulator = 0;
          if (
            b.status !== 'playing' &&
            document.pointerLockElement === host.current
          )
            document.exitPointerLock();
          scene.current?.render(
            b,
            dt,
            reduced.current,
            optic.current && b.status === 'playing',
          );
          if (now - lastHud > 60) {
            lastHud = now;
            publish();
            setMarkers(
              b.ships.map((s) => ({
                ...scene.current!.project(s.x, 40, s.z),
                id: s.id,
                health: s.health,
                maxHealth: s.maxHealth,
                name: s.name,
              })),
            );
            const a = (b.heading * Math.PI) / 180;
            setReticle(
              scene.current!.project(
                Math.sin(a) * b.range,
                4,
                -Math.cos(a) * b.range,
              ),
            );
          }
          frame = requestAnimationFrame(animate);
        };
        frame = requestAnimationFrame(animate);
      })
      .catch(() =>
        setError('The 3D engine could not load. Reload the game to try again.'),
      );
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      document.removeEventListener('mousemove', lockedMove);
      document.removeEventListener('pointerlockchange', lockChanged);
      if (document.pointerLockElement === wheelHost) document.exitPointerLock();
      window.removeEventListener('pointerup', releaseMouse);
      window.removeEventListener('pointercancel', releaseMouse);
      wheelHost?.removeEventListener('wheel', wheel);
      document.removeEventListener('visibilitychange', visibility);
      scene.current?.dispose();
      scene.current = null;
      audio.current?.dispose();
    };
    // The simulation is deliberately held in refs; the loop must survive HUD updates.
  }, []);
  useEffect(() => {
    if (!loaded || error) return;
    return registerNavalTools({
      read: () => battle.current,
      start: () => flushSync(start),
      aim: (heading, range) => flushSync(() => aim(heading, range)),
      fire: () => flushSync(shoot),
    });
    // Actions read stable simulation refs; registration follows engine readiness.
  }, [loaded, error]);
  const playing = hud.status === 'playing',
    ready = hud.status === 'ready',
    paused = hud.status === 'paused',
    finished = hud.status === 'won' || hud.status === 'lost';
  const target = hud.ships[selected];
  const sunk = hud.ships.filter((s) => s.health <= 0).length;
  return (
    <main
      ref={root}
      tabIndex={-1}
      className={`naval-game ${ready ? 'briefing-state' : ''}`}
    >
      <div
        ref={host}
        className={`scene ${playing ? 'single-aim-cursor' : ''}`}
        aria-label="3D naval battlefield"
        onContextMenu={(e) => e.preventDefault()}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse')
            mousePoint.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerLeave={() => {
          mousePoint.current = null;
        }}
        onPointerDown={(e) => {
          if (!playing || e.button !== 0) return;
          root.current?.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          if (e.pointerType === 'mouse') {
            if (document.pointerLockElement !== e.currentTarget) {
              void e.currentTarget.requestPointerLock?.()?.catch(() => {
                /* Keep relative aiming when capture is unavailable. */
              });
            }
            mousePoint.current = { x: e.clientX, y: e.clientY };
            mouseFiring.current = true;
            shoot();
            return;
          }
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            heading: battle.current.heading,
            range: battle.current.range,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          if (document.pointerLockElement === e.currentTarget) return;
          if (e.pointerType === 'mouse') {
            const previous = mousePoint.current;
            mousePoint.current = { x: e.clientX, y: e.clientY };
            if (playing && previous) {
              const delta = mouseAimDelta(
                e.clientX - previous.x,
                e.clientY - previous.y,
                optic.current,
                e.shiftKey || (e.buttons & 2) !== 0,
              );
              aim(
                battle.current.heading + delta.heading,
                battle.current.range + delta.range,
              );
            }
            return;
          }
          const d = drag.current;
          if (!d || !playing) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
          aim(d.heading + dx * 0.055, d.range - dy * 2);
        }}
        onPointerUp={() => {
          mouseFiring.current = false;
          if (drag.current && !drag.current.moved) shoot();
          drag.current = null;
        }}
        onPointerCancel={() => {
          mouseFiring.current = false;
          mousePoint.current = null;
          drag.current = null;
        }}
        onLostPointerCapture={() => {
          mouseFiring.current = false;
          drag.current = null;
        }}
      />
      <div className="vignette" />
      {scoped && playing && (
        <div className="optic-overlay" aria-hidden="true">
          <span>Gunnery optic / 2.1×</span>
        </div>
      )}
      <header className="topbar">
        <div className="brand">
          <Anchor size={22} />
          <span>BEACH HEAD</span>
          <span className="edition">Battle Stations</span>
        </div>
        <div className="top-actions">
          <span className="mission-time">{time(hud.time)}</span>
          <Button
            variant="ghost"
            size="icon"
            className="icon-control"
            aria-label={sound ? 'Mute sound' : 'Enable sound'}
            onClick={() => {
              setSound(!sound);
              audio.current?.setEnabled(!sound);
              if (!sound) void audio.current?.start();
            }}
          >
            {sound ? <Volume2 /> : <VolumeX />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="icon-control motion-control"
            aria-label={
              steady ? 'Enable camera motion' : 'Reduce camera motion'
            }
            aria-pressed={steady}
            onClick={() => {
              setSteady(!steady);
              reduced.current = !steady;
            }}
          >
            <Waves />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="icon-control"
            aria-label="Toggle fullscreen"
            onClick={() => {
              if (document.fullscreenElement)
                void document.exitFullscreen().catch(() => {});
              else void root.current?.requestFullscreen?.().catch(() => {});
            }}
          >
            <Maximize />
          </Button>
          {!ready && (
            <Button
              variant="ghost"
              className="optic-button"
              aria-label={scoped ? 'Return to deck view' : 'Use gunnery optic'}
              aria-pressed={scoped}
              disabled={!playing}
              onClick={() => {
                optic.current = !optic.current;
                setScoped(optic.current);
                root.current?.focus();
              }}
            >
              <ScanEye />
              <span>{scoped ? 'Deck view' : '2× optic'}</span>
            </Button>
          )}
          {!ready && (
            <Button
              variant="ghost"
              size="icon"
              className="icon-control"
              aria-label={paused ? 'Resume battle' : 'Pause battle'}
              disabled={finished}
              onClick={pause}
            >
              {paused ? <Play /> : <Pause />}
            </Button>
          )}
        </div>
      </header>
      <div className="compass" aria-hidden="true">
        <div className="compass-ticks">
          {[-40, -30, -20, -10, 0, 10, 20, 30, 40].map((n) => (
            <span key={n}>
              <i />
              {String(Math.round((hud.heading + n + 360) % 360)).padStart(
                3,
                '0',
              )}
            </span>
          ))}
        </div>
        <b>▼</b>
      </div>
      {!ready && (
        <>
          <aside className="mission-status">
            <span className="instrument-label">Objective</span>
            <h2>Break the blockade</h2>
            <p>
              <span className="status-dot" />
              {3 - sunk} enemy {3 - sunk === 1 ? 'ship' : 'ships'} remaining
            </p>
            <div className="fleet-pips">
              {hud.ships.map((s) => (
                <span key={s.id} className={s.health <= 0 ? 'sunk' : ''}>
                  <svg viewBox="0 0 48 16">
                    <path d="M2 8h43l-7 6H8zM12 7V3h12v4m4 0V1h4v6" />
                  </svg>
                </span>
              ))}
            </div>
          </aside>
          <div className="target-markers" aria-hidden="true">
            {markers
              .filter((m) => m.visible && m.health > 0)
              .map((m) => (
                <div
                  key={m.id}
                  className={`target-marker ${m.id === target?.id ? 'selected' : ''}`}
                  style={{ left: m.x, top: m.y }}
                >
                  <span>{m.name}</span>
                  <i>
                    <b
                      style={{ width: `${(m.health / m.maxHealth) * 100}%` }}
                    />
                  </i>
                  <div className="target-bracket" />
                </div>
              ))}
          </div>
          {playing && reticle.visible && (
            <div
              className="aim-reticle"
              aria-hidden="true"
              style={{ left: reticle.x, top: reticle.y }}
            >
              <span />
              <i />
              <b>{number(hud.range)} m</b>
            </div>
          )}
          <output className="radio-message" aria-live="polite">
            <span className="radio-line" />
            <p>{hud.message}</p>
          </output>
          {playing && hud.shells.some((s) => s.enemy) && (
            <div className="incoming">Incoming fire — brace for impact</div>
          )}
        </>
      )}
      {ready && !error && (
        <section className="briefing">
          <div className="operation">
            <span /> Naval engagement / 01
          </div>
          <h1>
            BEACH
            <br />
            HEAD
            <span className="title-rule" />
          </h1>
          <h2>Battle Stations</h2>
          <p className="briefing-copy">
            The island is in sight. Three enemy warships stand between your
            fleet and the shore. Take the forward guns. Clear a path.
          </p>
          <div className="mission-details">
            <span>
              <Crosshair />3 enemy warships
            </span>
            <span>
              <Shield />
              One ship. Your command.
            </span>
          </div>
          <Button className="start-button" disabled={!loaded} onClick={start}>
            {loaded ? 'Take command' : 'Preparing the guns…'}
            <ArrowUpRight size={22} />
          </Button>
          <p className="briefing-hint">
            Click sea to capture mouse · Hold left to fire · Esc releases mouse
          </p>
          <button className="stage-practice" onClick={onPractice}>
            Stage 2 practice — Hold the beach <ArrowUpRight size={14} />
          </button>
          <div className="legacy-note">
            Inspired by the 1983 classic.
            <br />A new landing begins here.
          </div>
        </section>
      )}
      {(paused || finished) && !error && (
        <div className="overlay">
          <section className="result-panel">
            <Anchor size={30} />
            <p className="operation">
              {paused
                ? 'All stations holding'
                : hud.status === 'won'
                  ? 'Blockade broken'
                  : 'Ship lost'}
            </p>
            <h2>
              {paused
                ? 'Stand by.'
                : hud.status === 'won'
                  ? 'The way is clear.'
                  : 'We fought to the last.'}
            </h2>
            <p>
              {paused
                ? 'Your guns are ready when you are.'
                : hud.status === 'won'
                  ? 'Enemy ships neutralized. The fleet has secured the landing. Take the captured pillbox and hold the beach against the counterattack.'
                  : 'The blockade held. Adjust your range, lead your targets, and try again.'}
            </p>
            {!paused && (
              <div className="result-stats">
                <div>
                  <b>{number(hud.score)}</b>
                  <span>Score</span>
                </div>
                <div>
                  <b>
                    {hud.shots ? Math.round((hud.hits / hud.shots) * 100) : 0}%
                  </b>
                  <span>Accuracy</span>
                </div>
                <div>
                  <b>{time(hud.time)}</b>
                  <span>Time</span>
                </div>
              </div>
            )}
            <Button
              className="start-button"
              onClick={
                paused ? pause : hud.status === 'won' ? onContinue : start
              }
            >
              {paused ? (
                <Play />
              ) : hud.status === 'won' ? (
                <ArrowUpRight />
              ) : (
                <RotateCcw />
              )}
              {paused
                ? 'Resume battle'
                : hud.status === 'won'
                  ? 'Stage 2 — Hold the beach'
                  : 'Sail again'}
            </Button>
          </section>
        </div>
      )}
      {error && (
        <div className="overlay">
          <section className="result-panel">
            <h2>Unable to launch</h2>
            <p>{error}</p>
            <Button
              className="start-button"
              onClick={() => window.location.reload()}
            >
              Reload game
            </Button>
          </section>
        </div>
      )}
      <footer className={`instruments ${ready ? 'preview-instruments' : ''}`}>
        <section className="hull-instrument">
          <div className="instrument-label">
            <Shield size={14} />
            Hull integrity
          </div>
          <div className="hull-value">
            {Math.round(hud.health)}
            <small>%</small>
          </div>
          <div className={`hull-bar ${hud.health < 30 ? 'critical' : ''}`}>
            <i style={{ width: `${hud.health}%` }} />
          </div>
          <p>
            {hud.health > 65
              ? 'Ship operational'
              : hud.health > 30
                ? 'Damage sustained'
                : 'Critical damage'}
          </p>
        </section>
        <section className="target-instrument">
          <div className="instrument-label">Tracked target</div>
          <Button
            variant="ghost"
            className="target-cycle"
            onClick={cycle}
            disabled={!playing}
          >
            <span>
              {target?.health > 0 ? target.name : 'Target neutralized'}
            </span>
            <ChevronRight size={16} />
          </Button>
          <p>
            {target?.health > 0
              ? `${number(Math.hypot(target.x, target.z))} m / ${String(Math.round((bearing(target.x, target.z) + 360) % 360)).padStart(3, '0')}°`
              : 'Select another target'}
          </p>
          <span className="tiny-hint">Tab to cycle</span>
        </section>
        <section className="range-instrument">
          <div className="range-heading">
            <span className="instrument-label">Gun range</span>
            <b>
              {number(hud.range)} <small>m</small>
            </b>
          </div>
          <div className="range-controls">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Decrease range"
              disabled={!playing}
              onClick={() => aim(hud.heading, hud.range - 10)}
            >
              <Minus />
            </Button>
            <Slider
              aria-label="Gun range in meters"
              min={250}
              max={1600}
              step={5}
              value={[hud.range]}
              disabled={!playing}
              onValueChange={(value) =>
                aim(
                  battle.current.heading,
                  Array.isArray(value) ? value[0] : value,
                )
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Increase range"
              disabled={!playing}
              onClick={() => aim(hud.heading, hud.range + 10)}
            >
              <Plus />
            </Button>
          </div>
          <div className="range-ends">
            <span>250 m</span>
            <span>Elevation {rangeToElevation(hud.range).toFixed(1)}°</span>
            <span>1,600 m</span>
          </div>
        </section>
        <section className="bearing-instrument">
          <div className="instrument-label">Bearing</div>
          <div className="bearing-controls">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Turn guns left"
              disabled={!playing}
              onClick={() => aim(hud.heading - 0.2, hud.range)}
            >
              <ChevronLeft />
            </Button>
            <b>
              {((hud.heading + 360) % 360).toFixed(1).padStart(5, '0')}
              <small>°</small>
            </b>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Turn guns right"
              disabled={!playing}
              onClick={() => aim(hud.heading + 0.2, hud.range)}
            >
              <ChevronRight />
            </Button>
          </div>
          <p>A / D to traverse</p>
        </section>
        <section className="fire-instrument">
          <Button
            className="fire-button"
            disabled={!playing || hud.reload > 0}
            onClick={shoot}
          >
            <Crosshair size={22} />
            <span>
              {hud.reload > 0 ? 'Reloading' : 'Fire guns'}
              <small>
                {hud.reload > 0
                  ? `${hud.reload.toFixed(1)} s`
                  : 'Space / click'}
              </small>
            </span>
          </Button>
          <div className="reload-track">
            <i
              style={{ width: `${Math.max(0, 1 - hud.reload / 2.2) * 100}%` }}
            />
          </div>
        </section>
      </footer>
      <div className="controls-strip">
        <span>
          <MoveHorizontal size={14} />
          Click sea: capture mouse · Left: fire · Shift / right: fine aim · Esc:
          release
        </span>
        <span>
          <kbd>A</kbd>
          <kbd>D</kbd> Bearing
        </span>
        <span>
          <kbd>W</kbd>
          <kbd>S</kbd> Range
        </span>
        <span>
          <kbd>Space</kbd> Fire
        </span>
        <span>
          <kbd>Esc</kbd> Pause
        </span>
        <span className="prototype">Naval combat prototype</span>
      </div>
    </main>
  );
}
