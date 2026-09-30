'use client';
import { TouchControls, useTouchLayout } from './touch-controls';
import { TouchDrag, type TouchAxis } from '@/lib/touch-input';
import { mouseAimDelta, mouseWheelRange } from '../lib/naval/mouse-aim';
import { useEffect, useRef, useState } from 'react';
import {
  Anchor,
  Home,
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
  Plane,
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
  const [singleStage, setSingleStage] = useState(false);
  const [selected, setSelected] = useState(0);
  const [resultsReady, setResultsReady] = useState(false);
  const reticleElement = useRef<HTMLDivElement>(null);
  const mousePoint = useRef<{ x: number; y: number } | null>(null);
  const mouseFiring = useRef(false);
  const touch = useTouchLayout();
  const touchAxis = useRef<TouchAxis>({ x: 0, y: 0 });
  const touchFiring = useRef(false);
  const drag = useRef(new TouchDrag());
  const clearTouch = () => {
    touchAxis.current = { x: 0, y: 0 };
    touchFiring.current = false;
    drag.current.clear();
  };
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
    setResultsReady(false);
    battle.current = createBattle();
    battle.current.status = 'playing';
    optic.current = false;
    setScoped(false);
    targetIndex.current = 0;
    setSelected(0);
    scene.current?.reset();
    mousePoint.current = null;
    mouseFiring.current = false;
    clearTouch();
    keys.current.clear();
    audio.current?.setPaused(false);
    void audio.current?.start();
    publish();
    root.current?.focus();
  };
  const returnToMenu = () => {
    setResultsReady(false);
    battle.current = createBattle();
    if (document.pointerLockElement === host.current)
      document.exitPointerLock();
    keys.current.clear();
    mouseFiring.current = false;
    mousePoint.current = null;
    clearTouch();
    optic.current = false;
    setScoped(false);
    targetIndex.current = 0;
    setSelected(0);
    scene.current?.reset();
    audio.current?.setPaused(true);
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
    clearTouch();
    keys.current.clear();
    publish();
    root.current?.focus();
  };
  useEffect(() => {
    let cancelled = false,
      frame = 0,
      last = 0,
      accumulator = 0,
      lastHud = 0,
      victoryTime = 0;
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
      clearTouch();
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
    window.addEventListener('orientationchange', blur);
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
        battle.current.range,
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
            const thumb = mouseAimDelta(
              touchAxis.current.x * 600 * dt,
              touchAxis.current.y * 220 * dt,
              optic.current,
              false,
              b.range,
            );
            setAim(b, b.heading + thumb.heading, b.range + thumb.range);
            if (held('Space') || mouseFiring.current || touchFiring.current)
              fire(b);
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
            optic.current && b.status !== 'ready',
          );
          if (now - lastHud > 60) {
            lastHud = now;
            publish();
          }
          if (b.status === 'won') {
            if (victoryTime < 9) {
              victoryTime += dt;
              if (victoryTime >= 9) setResultsReady(true);
            }
          } else victoryTime = 0;
          if (reticleElement.current) {
            const a = (b.heading * Math.PI) / 180;
            const point = scene.current!.project(
              Math.sin(a) * b.range,
              4,
              -Math.cos(a) * b.range,
            );
            reticleElement.current.style.left = `${point.x}px`;
            reticleElement.current.style.top = `${point.y}px`;
            reticleElement.current.style.visibility = point.visible
              ? 'visible'
              : 'hidden';
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
      window.removeEventListener('orientationchange', blur);
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
  return (
    <main
      ref={root}
      tabIndex={-1}
      className={`naval-game ${ready ? 'briefing-state' : ''} ${touch ? 'touch-layout' : ''}`}
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
          if (drag.current.begin(e.pointerId, e.clientX, e.clientY))
            e.currentTarget.setPointerCapture(e.pointerId);
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
                battle.current.range,
              );
              aim(
                battle.current.heading + delta.heading,
                battle.current.range + delta.range,
              );
            }
            return;
          }
          if (!playing) return;
          const delta = drag.current.move(e.pointerId, e.clientX, e.clientY);
          if (!delta) return;
          const change = mouseAimDelta(
            delta.x * 2,
            delta.y,
            optic.current,
            false,
            battle.current.range,
          );
          aim(
            battle.current.heading + change.heading,
            battle.current.range + change.range,
          );
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse') mouseFiring.current = false;
          drag.current.end(e.pointerId);
        }}
        onPointerCancel={(e) => {
          if (e.pointerType === 'mouse') mouseFiring.current = false;
          drag.current.end(e.pointerId);
        }}
        onLostPointerCapture={(e) => {
          drag.current.end(e.pointerId);
        }}
      />
      <div className="vignette" />
      {scoped && !ready && <div className="optic-overlay" aria-hidden="true" />}
      <header className="topbar">
        <div className="brand">
          <Anchor size={22} />
          <span>BEACH HEAD</span>
          <span className="edition">Battle Stations</span>
        </div>
        <div className="top-actions">
          <span className="mission-time">{time(hud.time)}</span>
          {hud.status === 'won' && !resultsReady && (
            <Button
              variant="ghost"
              className="optic-button view-results-control"
              onClick={() => setResultsReady(true)}
            >
              View results
            </Button>
          )}
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
            className="icon-control fullscreen-control"
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
              aria-label="Return to main menu"
              title="Return to main menu"
              onClick={returnToMenu}
            >
              <Home />
              <span>Main menu</span>
            </Button>
          )}
          {!ready && (
            <Button
              variant="ghost"
              className="optic-button"
              aria-label={scoped ? 'Return to deck view' : 'Use gunnery optic'}
              aria-pressed={scoped}
              disabled={!playing && hud.status !== 'won'}
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
          {!ready && !finished && (
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
      {playing && (
        <div ref={reticleElement} className="aim-reticle" aria-hidden="true">
          <span />
          <i />
        </div>
      )}
      {ready && !error && (
        <section className="briefing main-menu" aria-label="Main menu">
          <div className="main-menu-intro">
            <div className="operation">
              <span /> Choose your mission
            </div>
            <h1>
              BEACH <br />
              HEAD
              <span className="title-rule" />
            </h1>
            <h2>Battle Stations</h2>
            <p className="briefing-copy">
              Break the naval blockade. Defend the captured beach. Play the
              campaign or jump into either playable battle.
            </p>
            <div className="legacy-note">
              Inspired by the 1983 classic.
              <br />A new landing begins here.
            </div>
          </div>
          {touch && (
            <p className="touch-menu-hint">
              Touch controls included · Landscape gives you a wider view
            </p>
          )}
          <nav className="mission-tiles" aria-label="Play modes">
            <button
              className="mission-tile campaign-tile"
              aria-label="Play campaign"
              disabled={!loaded}
              onClick={() => {
                setSingleStage(false);
                start();
              }}
            >
              <span className="mission-tile-copy">
                <strong>Play campaign</strong>
                <span>
                  {loaded
                    ? 'Start at sea. Fight through both stages.'
                    : 'Preparing the guns…'}
                </span>
              </span>
              <Play size={32} aria-hidden="true" />
            </button>
            <button
              className="mission-tile naval-tile"
              aria-label="Play Stage 1 — Naval battle"
              disabled={!loaded}
              onClick={() => {
                setSingleStage(true);
                start();
              }}
            >
              <Anchor className="mission-tile-art" aria-hidden="true" />
              <span className="mission-stage">Stage 1</span>
              <strong>Naval battle</strong>
              <span>Break the blockade</span>
              <span className="mission-tile-action">
                Play Stage 1 <ArrowUpRight size={18} aria-hidden="true" />
              </span>
            </button>
            <button
              className="mission-tile beach-tile"
              aria-label="Play Stage 2 — Hold the beach"
              onClick={onPractice}
            >
              <Shield className="mission-tile-art" aria-hidden="true" />
              <span className="mission-stage">Stage 2</span>
              <strong>Hold the beach</strong>
              <span>Defend the pillbox</span>
              <span className="mission-tile-action">
                Play Stage 2 <ArrowUpRight size={18} aria-hidden="true" />
              </span>
            </button>
            <div
              className="mission-tile air-tile"
              aria-label="Stage 3 — Air assault — Coming soon"
            >
              <Plane className="mission-tile-art" aria-hidden="true" />
              <span className="mission-stage">Stage 3</span>
              <strong>Air assault</strong>
              <span>Break the landing</span>
              <span className="mission-tile-action">Coming soon</span>
            </div>
          </nav>
        </section>
      )}
      {(paused || (finished && (hud.status === 'lost' || resultsReady))) &&
        !error && (
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
                  ? touch
                    ? 'Drag the aim pad gently for fine adjustments. Hold Fire guns to shoot as each salvo reloads. Use the optic for a closer view.'
                    : 'Your guns are ready when you are.'
                  : hud.status === 'won'
                    ? singleStage
                      ? 'Enemy ships neutralized. Naval mission complete. Choose another battle from the main menu.'
                      : 'Enemy ships neutralized. The fleet has secured the landing. Take the captured pillbox and hold the beach against the counterattack.'
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
                      {hud.shots ? Math.round((hud.hits / hud.shots) * 100) : 0}
                      %
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
                  paused
                    ? pause
                    : hud.status === 'won'
                      ? singleStage
                        ? returnToMenu
                        : onContinue
                      : start
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
                    ? singleStage
                      ? 'Choose another mission'
                      : 'Stage 2 — Hold the beach'
                    : 'Sail again'}
              </Button>
              <Button variant="ghost" onClick={returnToMenu}>
                <Home />
                Return to main menu
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
      {touch && playing && (
        <button
          className="touch-target"
          onClick={cycle}
          aria-label="Cycle tracked target"
        >
          <span>
            Tracking <b>{target?.health > 0 ? target.name : 'Next target'}</b>
          </span>
          <small>
            {target?.health > 0
              ? `${number(Math.hypot(target.x, target.z))} m · ${Math.round((bearing(target.x, target.z) + 360) % 360)}°`
              : 'Tap to switch'}
          </small>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      )}
      {touch && playing && (
        <TouchControls
          onAim={(axis) => {
            touchAxis.current = axis;
          }}
          onFire={(value) => {
            touchFiring.current = value;
          }}
          fireLabel={hud.reload > 0 ? 'Reloading' : 'Fire guns'}
          fireDetail={
            hud.reload > 0 ? `${hud.reload.toFixed(1)} s` : 'Hold to fire'
          }
        >
          <span>
            Hull <b>{Math.round(hud.health)}%</b>
          </span>
          <meter
            aria-label="Hull integrity"
            min={0}
            max={100}
            value={hud.health}
          />
          <span>
            Range <b>{number(hud.range)} m</b>
          </span>
          <small>{((hud.heading + 360) % 360).toFixed(1)}° bearing</small>
        </TouchControls>
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
              {hud.status === 'won'
                ? 'Cease fire'
                : hud.reload > 0
                  ? 'Reloading'
                  : 'Fire guns'}
              <small>
                {hud.status === 'won'
                  ? 'Mission complete'
                  : hud.reload > 0
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
          Mouse: wheel for range · Shift / right: fine aim
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
