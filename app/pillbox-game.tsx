'use client';
import { TouchControls, useTouchLayout } from './touch-controls';
import { TouchDrag, type TouchAxis } from '@/lib/touch-input';
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
  SUPPORT_REQUIRED,
  type SupplyChoice,
  type PillboxBattle,
} from '@/lib/pillbox/types';
import type { PillboxScene } from '@/lib/pillbox/scene';
import { PillboxAudio } from '@/lib/pillbox/audio';
import { registerPillboxTools } from '@/lib/pillbox/webmcp';
import { PointerAim } from '@/lib/pillbox/pointer-aim';
import {
  throwPlayerGrenade,
  callAirSupport,
  chooseSupplies,
} from '@/lib/pillbox/combat-actions';

export default function PillboxGame({
  onReturn,
  campaign = false,
}: {
  onReturn: () => void;
  campaign?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const aimSurface = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLElement>(null);
  const battle = useRef(createPillboxBattle());
  const scene = useRef<PillboxScene | null>(null);
  const audio = useRef<PillboxAudio | null>(null);
  const held = useRef(false);
  const touch = useTouchLayout();
  const touchFiring = useRef(false);
  const touchDrag = useRef(new TouchDrag());
  const keys = useRef(new Set<string>());
  const reduced = useRef(false);
  const [hud, setHud] = useState<PillboxBattle>(createPillboxBattle);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(true);
  const [steady, setSteady] = useState(false);
  const reticleElement = useRef<HTMLDivElement>(null);
  const pointerAim = useRef(new PointerAim());
  const publish = () =>
    setHud({ ...battle.current, soldiers: [...battle.current.soldiers] });
  const release = () => {
    held.current = false;
    touchFiring.current = false;
    touchDrag.current.clear();
    keys.current.clear();
    pointerAim.current.clear();
  };
  const applyPointerAim = () => {
    if (!scene.current) return;
    const point = pointerAim.current.resolve(
      (x, y) => scene.current!.aim(x, y),
      (x, y) => scene.current!.aimTouch(x, y),
    );
    if (point) aimPillbox(battle.current, point.x, point.z);
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
  const grenade = () => {
    applyPointerAim();
    throwPlayerGrenade(battle.current);
    publish();
    root.current?.focus();
  };
  const support = () => {
    applyPointerAim();
    callAirSupport(battle.current);
    publish();
    root.current?.focus();
  };
  const resupply = (choice: SupplyChoice) => {
    if (chooseSupplies(battle.current, choice)) {
      release();
      audio.current?.setPaused(false);
      publish();
      root.current?.focus();
    }
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
      aim: (x, z) => {
        pointerAim.current.clear();
        aimPillbox(battle.current, x, z);
      },
      grenade,
      support,
      supplies: resupply,
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
      if ((e.code === 'KeyG' || e.code === 'KeyV') && !e.repeat) {
        e.preventDefault();
        if (e.code === 'KeyG') grenade();
        else support();
        return;
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
        ].includes(e.code)
      ) {
        e.preventDefault();
        if (e.code !== 'Space') pointerAim.current.clear();
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
    window.addEventListener('orientationchange', blur);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    const surface = aimSurface.current;
    const wheel = (event: WheelEvent) => {
      if (battle.current.status !== 'playing') return;
      event.preventDefault();
      pointerAim.current.clear();
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
            applyPointerAim();
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
                held.current ||
                  touchFiring.current ||
                  keys.current.has('Space'),
              )) {
                scene.current?.event(event);
                if (event.type === 'shot') soundEngine.play('fire');
                if (event.type === 'breach') soundEngine.play('damage');
                if (event.type === 'grenade-impact')
                  soundEngine.play('impact', {
                    distance: 0,
                    pan: event.x / 12,
                  });
                if (
                  event.type === 'jeep-destroyed' ||
                  event.type === 'player-blast'
                )
                  soundEngine.play('impact', {
                    distance: Math.min(1, Math.hypot(event.x, event.z) / 140),
                    pan: event.x / 50,
                  });
                if (event.type === 'enemy-fire')
                  soundEngine.play('fire', {
                    distance: 0.85,
                    pan: event.x / 50,
                  });
                if (event.type === 'mortar-launch')
                  soundEngine.play('impact', {
                    distance: 0.95,
                    pan: event.x / 50,
                  });
                if (event.type === 'wave-cleared') {
                  release();
                  soundEngine.setPaused(true);
                }
              }
              accumulator -= 1 / 60;
            }
          } else {
            accumulator = 0;
            held.current = false;
          }
          scene.current?.render(b, dt, reduced.current);
          if (reticleElement.current) {
            const pointer = pointerAim.current.screen(
              element.getBoundingClientRect(),
            );
            const reticle = pointer
              ? { ...pointer, visible: true }
              : scene.current!.project(b.aimX, b.aimZ);
            reticleElement.current.style.left = `${reticle.x}px`;
            reticleElement.current.style.top = `${reticle.y}px`;
            reticleElement.current.style.visibility = reticle.visible
              ? 'visible'
              : 'hidden';
          }
          if (now - lastHud > 65) {
            publish();
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
      window.removeEventListener('orientationchange', blur);
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
  const swipeAim = (delta: TouchAxis) => {
    if (battle.current.status !== 'playing' || !scene.current || !host.current)
      return;
    const rect = host.current.getBoundingClientRect();
    const origin = scene.current.project(
      battle.current.aimX,
      battle.current.aimZ,
    );
    pointerAim.current.moveRelative(delta.x * 0.8, delta.y * 0.8, {
      x: rect.left + origin.x,
      y: rect.top + origin.y,
    });
  };
  const aimPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if (battle.current.status !== 'playing') return;
    if (e.pointerType === 'touch') {
      const delta = touchDrag.current.move(e.pointerId, e.clientX, e.clientY);
      if (!delta) return;
      swipeAim(delta);
    } else pointerAim.current.move(e.clientX, e.clientY);
  };
  const playing = hud.status === 'playing',
    ready = hud.status === 'ready',
    paused = hud.status === 'paused';
  const finished = hud.status === 'won' || hud.status === 'lost';
  return (
    <main
      className={`pillbox-game ${touch ? 'touch-layout' : ''} ${ready ? 'briefing-state' : ''}`}
      ref={root}
      tabIndex={-1}
      aria-label="Stage 4 beach defense"
    >
      <div
        ref={host}
        className="pillbox-canvas"
        aria-label="3D pillbox overlooking the beach"
      />
      <div
        ref={aimSurface}
        className={`pillbox-aim-surface ${playing ? 'active-aim' : ''}`}
        aria-hidden="true"
        onPointerMove={aimPointer}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse' && !held.current)
            pointerAim.current.clear();
        }}
        onPointerDown={(e) => {
          if (!playing || e.button !== 0) return;
          if (e.pointerType === 'touch') {
            if (!touchDrag.current.begin(e.pointerId, e.clientX, e.clientY))
              return;
          } else {
            aimPointer(e);
            held.current = true;
          }
          e.currentTarget.setPointerCapture(e.pointerId);
          root.current?.focus();
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'touch') touchDrag.current.end(e.pointerId);
          else held.current = false;
        }}
        onPointerCancel={(e) => {
          touchDrag.current.end(e.pointerId);
          if (e.pointerType !== 'touch') held.current = false;
        }}
        onLostPointerCapture={(e) => {
          touchDrag.current.end(e.pointerId);
          if (e.pointerType !== 'touch') held.current = false;
        }}
      />
      <header className="pillbox-header">
        <div className="pillbox-brand">
          <Shield size={20} />
          <strong>BEACH HEAD</strong>
          <span>04 / HOLD THE BEACH</span>
        </div>
        <div className="pillbox-options">
          {!ready && (
            <span className="pillbox-wave-status">Wave {hud.wave} / 3</span>
          )}
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
              disabled={finished || hud.status === 'resupply'}
              onClick={pause}
            >
              {paused ? <Play size={18} /> : <Pause size={18} />}
            </button>
          )}
        </div>
      </header>
      {playing && (
        <div
          ref={reticleElement}
          className={`pillbox-crosshair ${hud.overheated ? 'hot' : ''}`}
          aria-hidden="true"
        >
          <Crosshair size={38} />
        </div>
      )}
      {ready && !error && (
        <section className="pillbox-briefing">
          <p className="pillbox-eyebrow">STAGE 04 / GERMAN COASTAL DEFENSE</p>
          <h1>
            HOLD THE
            <br />
            <em>BEACH.</em>
          </h1>
          <p>
            The Allied landing force has reached shore. Man the German pillbox
            as the ramps drop and infantry storm the beach. Hold the defense
            line through three waves in the campaign’s final stand.
          </p>
          <div className="pillbox-orders">
            <span>
              <b>03</b> assault waves
            </span>
            <span>
              <b>01</b> belt-fed machine gun
            </span>
          </div>
          {touch && (
            <p className="touch-briefing-hint">
              Swipe the left pad to aim; the sight stops when your thumb stops.
              Lift and swipe again to keep moving. Hold Fire with your other
              thumb. You can also drag the beach. Use short bursts and grenades
              for foxholes.
            </p>
          )}
          <p className="pillbox-hint">
            Use the mouse to aim and hold the left button to fire. G throws a
            rifle grenade at your aim point (115 m range); V calls an earned
            strafing run. Both also have on-screen buttons. Foxholes hold
            squads: catch them peeking, pin them down, or clear them with a
            grenade. Watch for smoke-screened rushes, MG teams and mortar crews.
            Shoot craft gunners or jam ramps to slow the landing. Fire in short
            bursts. After each wave, choose repairs, a better barrel, or extra
            grenades.
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
            Back to main menu
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
      {hud.status === 'resupply' && !error && (
        <div className="pillbox-overlay">
          <section className="pillbox-result pillbox-supplies">
            <Shield size={30} />
            <p className="pillbox-eyebrow">WAVE {hud.wave} REPELLED</p>
            <h2>Prepare the position.</h2>
            <p>
              Choose one benefit for the next assault. Your gun cools and you
              receive three rifle grenades with every choice.
            </p>
            <div className="supply-choices">
              <button onClick={() => resupply('repair')}>
                <b>Repair bunker</b>
                <span>Restore up to 35 integrity</span>
              </button>
              <button onClick={() => resupply('barrel')}>
                <b>Improve barrel</b>
                <span>Less heat per shot and faster cooling</span>
              </button>
              <button onClick={() => resupply('grenades')}>
                <b>Extra grenades</b>
                <span>Start the next wave with five</span>
              </button>
            </div>
            <button className="pillbox-back" onClick={onReturn}>
              Return to main menu
            </button>
          </section>
        </div>
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
                    ? campaign
                      ? 'CAMPAIGN COMPLETE'
                      : 'MISSION COMPLETE'
                    : 'POSITION OVERRUN'}
            </p>
            <h2>
              {error
                ? 'Stand by.'
                : paused
                  ? 'Take a breath.'
                  : hud.status === 'won'
                    ? 'The line holds.'
                    : 'The line was breached.'}
            </h2>
            <p>
              {error ||
                (paused
                  ? 'The assault is paused. Resume when you are ready.'
                  : hud.status === 'won'
                    ? campaign
                      ? 'From the naval approach to the air attack and the final beach defense, the battle is over. The pillbox has held.'
                      : 'The landing assault is defeated. Your pillbox holds the defense line.'
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
                  : 'Retry Stage 4'}
            </button>
            <button className="pillbox-back" onClick={onReturn}>
              Return to main menu
            </button>
          </section>
        </div>
      )}
      {!ready && !finished && hud.status !== 'resupply' && (
        <div className="pillbox-tactics">
          <button
            onClick={grenade}
            disabled={!playing || !hud.grenadeAmmo || hud.grenadeCooldown > 0}
            aria-label={`Throw rifle grenade, ${hud.grenadeAmmo} remaining`}
          >
            <kbd>G</kbd> Grenade <b>{hud.grenadeAmmo}</b>
          </button>
          <button
            onClick={support}
            disabled={
              !playing || !hud.airSupportCharges || Boolean(hud.airStrike)
            }
            aria-label="Call strafing run"
          >
            <kbd>V</kbd>{' '}
            {hud.airStrike
              ? 'Support inbound'
              : hud.airSupportCharges
                ? 'Call strafing run'
                : `Air support ${Math.min(SUPPORT_REQUIRED, hud.supportProgress)}/${SUPPORT_REQUIRED}`}
          </button>
        </div>
      )}
      {touch && playing && (
        <TouchControls
          onAim={() => {}}
          onAimDrag={swipeAim}
          onFire={(value) => {
            touchFiring.current = value;
          }}
          fireLabel={hud.overheated ? 'Cooling' : 'Fire'}
          fireDetail={hud.overheated ? 'Let barrel cool' : 'Hold for bursts'}
          hot={hud.overheated}
        >
          <span>
            Bunker <b>{hud.health}%</b>
          </span>
          <meter
            aria-label="Bunker integrity"
            min={0}
            max={100}
            value={hud.health}
          />
          <span>
            Heat <b>{Math.round(hud.heat)}%</b>
          </span>
          <meter
            className="touch-heat"
            aria-label="Barrel temperature"
            min={0}
            max={100}
            value={hud.heat}
          />
        </TouchControls>
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
                : 'Short bursts. Unlimited belt.'}
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
                pointerAim.current.clear();
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
                pointerAim.current.clear();
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
        Mouse to aim · Hold left button to fire · Wheel for range <span>G</span>{' '}
        Grenade <span>V</span> Air support <span>ESC</span> Pause
      </div>
    </main>
  );
}
