'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Plane,
  Home,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Bomb,
  RotateCcw,
  Waves,
  Crosshair,
  ArrowUpRight,
} from 'lucide-react';
import { TouchControls, useTouchLayout } from './touch-controls';
import { TouchDrag } from '@/lib/touch-input';
import { AirControls } from '@/lib/air/input';
import { createAirBattle, startAirBattle, stepAir } from '@/lib/air/simulation';
import { steerRelative, settleFlight } from '@/lib/air/flight';
import type { AirBattle } from '@/lib/air/types';
import type { AirScene } from '@/lib/air/scene';
import type { AirAudio } from '@/lib/air/audio';
import { settings, useSettings } from '@/lib/settings';

const passes = ['Across the bay', 'Along the beach', 'Break the landing'];
function snapshot(b: AirBattle) {
  return {
    status: b.status,
    phase: b.phase,
    pass: b.pass,
    time: b.time,
    phaseTime: b.phaseTime,
    health: b.health,
    bombs: b.bombs,
    heat: b.heat,
    hot: b.overheated,
    altitude: b.aircraft.position.y,
    score: b.score,
    destroyed: b.destroyed,
    deniedCargo: b.deniedCargo,
    outcome: b.outcome,
    commandDestroyed: b.targets.some(
      (t) => t.kind === 'command' && t.health <= 0,
    ),
  };
}
export default function AirGame({
  onReturn,
  onContinue,
  campaign = false,
}: {
  onReturn: () => void;
  onContinue: () => void;
  campaign?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null),
    gunSight = useRef<HTMLDivElement>(null),
    bombSight = useRef<HTMLDivElement>(null);
  const battle = useRef(createAirBattle()),
    scene = useRef<AirScene | null>(null),
    audio = useRef<AirAudio | null>(null),
    controls = useRef(new AirControls()),
    drag = useRef(new TouchDrag());
  const pointer = useRef<{ x: number; y: number } | null>(null),
    reduced = useRef(false);
  const [hud, setHud] = useState(() => snapshot(createAirBattle())),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [diagnostics, setDiagnostics] = useState('');
  const { muted, reducedMotion: steady } = useSettings();
  const touch = useTouchLayout();
  const publish = () => setHud(snapshot(battle.current));
  const resetInput = () => {
    controls.current.reset();
    drag.current.clear();
    pointer.current = null;
    battle.current.bombHeld = false;
    settleFlight(battle.current);
  };
  const pause = () => {
    const b = battle.current;
    if (!['playing', 'paused'].includes(b.status)) return;
    b.status = b.status === 'paused' ? 'playing' : 'paused';
    resetInput();
    audio.current?.setPaused(b.status === 'paused');
    publish();
    root.current?.focus();
  };
  const start = () => {
    resetInput();
    battle.current = startAirBattle();
    scene.current?.reset();
    audio.current?.reset();
    void audio.current?.start();
    publish();
    root.current?.focus();
  };
  const leave = () => {
    resetInput();
    audio.current?.setPaused(true);
    onReturn();
  };
  useEffect(() => {
    let cancelled = false,
      frame = 0,
      last = 0,
      hudTime = 0,
      accumulator = 0;
    const input = controls.current;
    const debug = new URLSearchParams(window.location.search).has(
      'diagnostics',
    );
    const blur = () => {
      resetInput();
      if (battle.current.status === 'playing') {
        battle.current.status = 'paused';
        audio.current?.setPaused(true);
        publish();
      }
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    const keydown = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && !e.repeat) {
        e.preventDefault();
        pause();
        return;
      }
      if (battle.current.status !== 'playing') return;
      const target = e.target as HTMLElement;
      if (
        target.closest('button,input,textarea,select') &&
        (e.code === 'Space' || e.code === 'Enter')
      )
        return;
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
          'KeyF',
          'Space',
          'ShiftLeft',
          'ShiftRight',
        ].includes(e.code)
      ) {
        e.preventDefault();
        controls.current.press(e.code, e.repeat);
      }
    };
    const keyup = (e: KeyboardEvent) => controls.current.release(e.code);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    window.addEventListener('orientationchange', blur);
    document.addEventListener('visibilitychange', visibility);
    void Promise.all([import('@/lib/air/scene'), import('@/lib/air/audio')])
      .then(([graphics, sound]) => {
        if (cancelled || !host.current) return;
        try {
          scene.current = new graphics.AirScene(host.current, (message) => {
            blur();
            setError(message);
          });
          audio.current = new sound.AirAudio();
          audio.current.setMuted(settings.get().muted);
          void audio.current.preload();
          setLoaded(true);
          const tick = (now: number) => {
            if (cancelled) return;
            const frameMs = last ? now - last : 0,
              dt = Math.min(frameMs / 1000, 0.1);
            last = now;
            const b = battle.current;
            if (b.status === 'playing') {
              accumulator += dt;
              while (accumulator >= 1 / 60) {
                for (const event of stepAir(b, controls.current.sample())) {
                  scene.current?.event(event);
                  audio.current?.event(event, b);
                  if (event.type === 'phase') resetInput();
                }
                accumulator -= 1 / 60;
              }
              audio.current?.update(b);
              if (b.status !== 'playing') {
                resetInput();
                audio.current?.setPaused(true);
              }
            } else accumulator = 0;
            scene.current?.render(
              b,
              b.status === 'playing' ? dt : 0,
              reduced.current,
              frameMs,
            );
            for (const [element, point] of [
              [gunSight.current, scene.current?.gun],
              [bombSight.current, scene.current?.bomb],
            ] as const) {
              if (!element) continue;
              const p = point ? scene.current!.project(point) : null;
              element.style.visibility =
                p?.visible && b.status === 'playing' && b.phase === 'attack'
                  ? 'visible'
                  : 'hidden';
              if (p) {
                element.style.left = `${p.x}px`;
                element.style.top = `${p.y}px`;
              }
            }
            if (now - hudTime > 100) {
              hudTime = now;
              publish();
              if (debug)
                setDiagnostics(
                  JSON.stringify({
                    ...scene.current?.diagnostics(),
                    audioContexts: sound.AirAudio.live,
                    voices: audio.current?.count,
                    phase: b.phase,
                    pass: b.pass + 1,
                    bombsInFlight: b.projectiles.filter(
                      (p) => p.kind === 'bomb',
                    ).length,
                  }),
                );
            }
            frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        } catch {
          setError(
            'The flight scene could not start. Check that hardware acceleration is enabled, then return to the menu.',
          );
        }
      })
      .catch(() =>
        setError(
          'The flight assets could not load. Return to the menu and try again.',
        ),
      );
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      window.removeEventListener('orientationchange', blur);
      document.removeEventListener('visibilitychange', visibility);
      input.reset();
      scene.current?.dispose();
      scene.current = null;
      audio.current?.dispose();
      audio.current = null;
    };
    // Event listeners and the frame loop use stable refs; one owner disposes each mission.
  }, []);
  useEffect(() => {
    audio.current?.setMuted(muted);
  }, [muted]);
  useEffect(() => {
    reduced.current = steady;
  }, [steady]);
  const playing = hud.status === 'playing',
    ready = hud.status === 'ready',
    paused = hud.status === 'paused',
    finished = hud.status === 'won' || hud.status === 'lost',
    attack = playing && hud.phase === 'attack';
  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!playing) return;
    if (e.pointerType === 'touch') {
      const delta = drag.current.move(e.pointerId, e.clientX, e.clientY);
      if (delta) steerRelative(battle.current, delta.x, delta.y);
      return;
    }
    if (pointer.current)
      steerRelative(
        battle.current,
        e.clientX - pointer.current.x,
        e.clientY - pointer.current.y,
        e.shiftKey,
      );
    pointer.current = { x: e.clientX, y: e.clientY };
  };
  return (
    <main
      ref={root}
      tabIndex={-1}
      className={`air-game ${touch ? 'air-touch' : ''}`}
      aria-label="Stage 3 air assault"
    >
      <div
        ref={host}
        className="air-canvas"
        aria-label="3D aircraft attack over the landing"
      />
      <div
        className={`air-flight-surface ${playing ? 'flying' : ''}`}
        aria-hidden="true"
        onPointerMove={move}
        onPointerLeave={() => {
          pointer.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (!playing) return;
          e.preventDefault();
          root.current?.focus();
          if (e.button === 2) {
            controls.current.bomb();
            return;
          }
          if (e.button !== 0) return;
          if (e.pointerType === 'touch') {
            if (drag.current.begin(e.pointerId, e.clientX, e.clientY))
              e.currentTarget.setPointerCapture(e.pointerId);
          } else {
            pointer.current = { x: e.clientX, y: e.clientY };
            controls.current.fire(`pointer-${e.pointerId}`, true);
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
        onPointerUp={(e) => {
          drag.current.end(e.pointerId);
          controls.current.fire(`pointer-${e.pointerId}`, false);
        }}
        onPointerCancel={(e) => {
          drag.current.end(e.pointerId);
          controls.current.fire(`pointer-${e.pointerId}`, false);
          pointer.current = null;
        }}
        onLostPointerCapture={(e) => {
          drag.current.end(e.pointerId);
          controls.current.fire(`pointer-${e.pointerId}`, false);
        }}
      />
      <div className={`air-damage ${hud.health < 30 ? 'critical' : ''}`} />
      <header className="air-header">
        <div className="air-brand">
          <Plane size={25} />
          <span>
            BEACH HEAD <small>03 / AIR ASSAULT</small>
          </span>
        </div>
        {!ready && (
          <div className="air-pass">
            {hud.phase === 'turn'
              ? 'Turning for next pass'
              : hud.phase === 'exit'
                ? 'Exit the combat area'
                : `Pass ${hud.pass + 1} / 3`}
            <small>{passes[hud.pass]}</small>
          </div>
        )}
        <nav aria-label="Flight options">
          <button
            aria-label={muted ? 'Enable sound' : 'Mute sound'}
            onClick={() => settings.set({ muted: !muted })}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </button>
          <button
            aria-label="Reduce camera motion"
            aria-pressed={steady}
            onClick={() => settings.set({ reducedMotion: !steady })}
          >
            <Waves />
          </button>
          <button aria-label="Return to main menu" onClick={leave}>
            <Home />
          </button>
          {!ready && !finished && (
            <button
              aria-label={paused ? 'Resume flight' : 'Pause flight'}
              onClick={pause}
            >
              {paused ? <Play /> : <Pause />}
            </button>
          )}
        </nav>
      </header>
      <div ref={gunSight} className="air-gun-sight" aria-hidden="true">
        <i />
        <i />
      </div>
      <div ref={bombSight} className="air-bomb-sight" aria-hidden="true">
        <i />
      </div>
      {ready && !error && (
        <section className="air-briefing" aria-label="Air assault briefing">
          <div>
            <p className="air-eyebrow">STAGE 03 / GERMAN AIR ASSAULT</p>
            <h1>
              BREAK THE
              <br />
              <em>LANDING.</em>
            </h1>
            <p>
              Switch to the German side. Fly an Fw 190–inspired fighter-bomber
              against the approaching Allied landing. Three passes. Six bombs.
              Silence the shore guns, destroy the striped command transport, and
              bring your aircraft home.
            </p>
            <div className="air-route">
              <span>
                01 <b>Bay</b>
              </span>
              <ArrowUpRight />
              <span>
                02 <b>Beach</b>
              </span>
              <ArrowUpRight />
              <span>
                03 <b>Command</b>
              </span>
            </div>
          </div>
          <div className="air-orders">
            <svg
              viewBox="0 0 300 100"
              aria-label="Command transport: two tall funnels, a red pennant and three white deck stripes"
            >
              <path fill="#778b8c" d="M18 71 282 71 265 91 42 91Z" />
              <path fill="#bfcbc3" d="M132 35H203V70H132Z" />
              <path fill="#253e47" d="M139 44H195V52H139Z" />
              <path fill="#d9d7c2" d="M89 20H103V70H89Z M113 20H127V70H113Z" />
              <path fill="#33494d" d="M89 26H103V35H89Z M113 26H127V35H113Z" />
              <path
                stroke="#f1e6ce"
                strokeWidth="8"
                d="M48 68H78 M48 57H78 M48 46H78"
              />
              <path stroke="#b5c3bb" strokeWidth="2" d="M230 14V72" />
              <path fill="#b0573c" d="M231 14 261 21 231 28Z" />
            </svg>
            <p className="air-identify">
              Find the twin funnels and striped bow on the final pass.
            </p>
            <dl>
              <div>
                <dt>Fly</dt>
                <dd>
                  {touch
                    ? 'Left pad or drag the sky'
                    : 'Move mouse · WASD / arrows · Shift for fine control'}
                </dd>
              </div>
              <div>
                <dt>Strafe</dt>
                <dd>
                  {touch
                    ? 'Hold the right fire button'
                    : 'Hold left mouse or F'}
                </dd>
              </div>
              <div>
                <dt>Bomb</dt>
                <dd>
                  {touch
                    ? 'Tap Bomb once per release'
                    : 'Space or right click · one press, one bomb'}
                </dd>
              </div>
            </dl>
            <p className="air-aid-key">
              <Crosshair size={16} /> Gun sight{' '}
              <span className="air-ring-key" /> Bomb landing point
            </p>
            <p className="air-tip">
              Bank after flak launches. Short bursts keep the guns cool. The
              route handles forward flight and turns.
            </p>
            <button className="air-primary" disabled={!loaded} onClick={start}>
              <Plane size={20} />
              {loaded ? 'Begin attack run' : 'Preparing the aircraft…'}
            </button>
            <small className="air-credit">
              Gun audio:{' '}
              <a
                href="https://opengameart.org/content/light-machine-gun"
                target="_blank"
                rel="noreferrer"
              >
                KuraiWolf
              </a>{' '}
              · CC BY 4.0 · modified
            </small>
          </div>
        </section>
      )}
      {playing && (
        <>
          <p className="air-objective">
            {hud.commandDestroyed
              ? 'Command transport destroyed — survive the exit'
              : hud.phase === 'approach'
                ? 'Safe approach · line up your first pass'
                : hud.phase === 'turn'
                  ? 'Guns safe · lining up the next pass'
                  : hud.phase === 'exit'
                    ? 'Pulling clear · resolving your last bombs'
                    : hud.pass === 0
                      ? 'Strike the landing craft'
                      : hud.pass === 1
                        ? 'Silence flak and break up the supplies'
                        : 'Destroy the striped command transport'}
          </p>
          {touch ? (
            <>
              <TouchControls
                aimLabel="Fly"
                aimAriaLabel="Flight control pad"
                onAim={(axis) => {
                  controls.current.pad = { x: axis.x, y: -axis.y };
                }}
                onFire={(held) => controls.current.fire('touch', held)}
                fireLabel={hud.hot ? 'Cooling' : 'Strafe'}
                fireDetail="Hold to fire"
                hot={hud.hot}
              >
                <span>
                  Aircraft <b>{Math.ceil(hud.health)}%</b>
                </span>
                <meter
                  aria-label="Aircraft integrity"
                  min="0"
                  max="100"
                  value={hud.health}
                />
                <span>
                  Gun heat <b>{Math.round(hud.heat)}%</b>
                </span>
                <meter
                  className="touch-heat"
                  aria-label="Gun temperature"
                  min="0"
                  max="100"
                  value={hud.heat}
                />
              </TouchControls>
              <button
                className="air-bomb-button"
                aria-label={`Release bomb, ${hud.bombs} remaining`}
                disabled={!attack || hud.bombs === 0}
                onClick={() => controls.current.bomb()}
              >
                <Bomb />
                <span>
                  Bomb <b>{hud.bombs}</b>
                </span>
              </button>
              <span className="air-altitude">{Math.round(hud.altitude)} m</span>
            </>
          ) : (
            <footer className="air-instruments">
              <div>
                <small>AIRCRAFT</small>
                <strong>
                  {Math.ceil(hud.health)}
                  <span>%</span>
                </strong>
                <meter
                  aria-label="Aircraft integrity"
                  min="0"
                  max="100"
                  value={hud.health}
                />
              </div>
              <div>
                <small>ALTITUDE / SPEED</small>
                <strong>
                  {Math.round(hud.altitude)}
                  <span>m · 126 kt</span>
                </strong>
              </div>
              <div>
                <small>{hud.hot ? 'GUNS COOLING' : 'GUN TEMPERATURE'}</small>
                <meter
                  aria-label="Gun temperature"
                  min="0"
                  max="100"
                  value={hud.heat}
                />
                <span>Hold F / left mouse</span>
              </div>
              <button
                className="air-bomb-button"
                aria-label={`Release bomb, ${hud.bombs} remaining`}
                disabled={!attack || hud.bombs === 0}
                onClick={() => controls.current.bomb()}
              >
                <Bomb />
                <span>
                  Drop bomb <b>{hud.bombs} / 6</b>
                  <small>Space / right click</small>
                </span>
              </button>
            </footer>
          )}
        </>
      )}
      {(paused || finished || error) && (
        <div className="air-overlay">
          <section className="air-result">
            <Plane size={28} />
            <p className="air-eyebrow">
              {error
                ? 'FLIGHT INTERRUPTED'
                : paused
                  ? 'HOLDING POSITION'
                  : hud.status === 'won'
                    ? 'MISSION COMPLETE'
                    : 'MISSION ENDED'}
            </p>
            <h2>
              {paused
                ? 'Take a breath.'
                : error
                  ? 'Stand by.'
                  : hud.status === 'won'
                    ? 'The assault is disrupted.'
                    : 'Another pass awaits.'}
            </h2>
            <p>
              {error ||
                (paused
                  ? 'Flight is paused. Resume when you are ready.'
                  : hud.outcome)}
            </p>
            {hud.status === 'won' && campaign && (
              <p>
                Surviving landing craft are reaching shore. Take command of the
                German pillbox for the final stand.
              </p>
            )}
            {finished && (
              <div className="air-result-stats">
                <span>
                  <b>{hud.score.toLocaleString()}</b>Score
                </span>
                <span>
                  <b>{hud.destroyed}</b>Targets stopped
                </span>
                <span>
                  <b>{hud.bombs}</b>Bombs remaining
                </span>
              </div>
            )}
            {!error && (
              <button
                className="air-primary"
                onClick={
                  paused
                    ? pause
                    : hud.status === 'won' && campaign
                      ? () => {
                          resetInput();
                          audio.current?.setPaused(true);
                          onContinue();
                        }
                      : start
                }
              >
                {paused ? (
                  <Play />
                ) : hud.status === 'won' && campaign ? (
                  <ArrowUpRight />
                ) : (
                  <RotateCcw />
                )}
                {paused
                  ? 'Resume flight'
                  : hud.status === 'won' && campaign
                    ? 'Stage 4 — Hold the beach'
                    : 'Retry Stage 3'}
              </button>
            )}
            <button className="air-back" onClick={leave}>
              <Home size={17} />
              Return to main menu
            </button>
          </section>
        </div>
      )}
      {diagnostics && (
        <output className="air-diagnostics" aria-label="Flight diagnostics">
          {diagnostics}
        </output>
      )}
    </main>
  );
}
