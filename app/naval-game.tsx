'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Anchor,
  Crosshair,
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
export default function NavalGame() {
  const host = useRef<HTMLDivElement>(null),
    root = useRef<HTMLElement>(null);
  const battle = useRef<Battle>(createBattle()),
    scene = useRef<NavalScene | null>(null),
    audio = useRef<NavalAudio | null>(null);
  const keys = useRef(new Set<string>()),
    reduced = useRef(false),
    targetIndex = useRef(0);
  const [hud, setHud] = useState<Battle>(createBattle);
  const [loaded, setLoaded] = useState(false),
    [error, setError] = useState(''),
    [sound, setSound] = useState(true),
    [steady, setSteady] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>([]),
    [selected, setSelected] = useState(0);
  const [reticle, setReticle] = useState({ x: 0, y: 0, visible: false });
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
    targetIndex.current = 0;
    setSelected(0);
    scene.current?.reset();
    keys.current.clear();
    void audio.current?.start();
    publish();
    root.current?.focus();
  };
  const pause = () => {
    const b = battle.current;
    if (b.status === 'playing') b.status = 'paused';
    else if (b.status === 'paused') b.status = 'playing';
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
      if (battle.current.status === 'playing') {
        battle.current.status = 'paused';
        publish();
      }
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
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
            if (held('Space')) fire(b);
            accumulator += dt;
            while (accumulator >= 1 / 60) {
              const events = step(b, 1 / 60);
              accumulator -= 1 / 60;
              for (const event of events) {
                scene.current?.event(event, b);
                if (event.type === 'fired') audio.current?.play('fire');
                if (event.type === 'hit' || event.type === 'sunk')
                  audio.current?.play('impact');
                if (event.type === 'miss') audio.current?.play('splash');
                if (event.type === 'damaged') audio.current?.play('damage');
              }
            }
          } else accumulator = 0;
          scene.current?.render(b, dt, reduced.current);
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
        className="scene"
        aria-label="3D naval battlefield"
        onPointerDown={(e) => {
          if (!playing || e.button !== 0) return;
          root.current?.focus();
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            heading: battle.current.heading,
            range: battle.current.range,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || !playing) return;
          const dx = e.clientX - d.x,
            dy = e.clientY - d.y;
          if (Math.abs(dx) + Math.abs(dy) > 5) d.moved = true;
          aim(d.heading + dx * 0.055, d.range - dy * 2);
        }}
        onPointerUp={() => {
          if (drag.current && !drag.current.moved) shoot();
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      />
      <div className="vignette" />
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
          <p className="briefing-hint">Headphones recommended</p>
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
                  ? 'Enemy ships neutralized. The fleet can approach the island.'
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
            <Button className="start-button" onClick={paused ? pause : start}>
              {paused ? <Play /> : <RotateCcw />}
              {paused ? 'Resume battle' : 'Sail again'}
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
              onClick={() => aim(hud.heading - 1, hud.range)}
            >
              <ChevronLeft />
            </Button>
            <b>
              {String(Math.round((hud.heading + 360) % 360)).padStart(3, '0')}
              <small>°</small>
            </b>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Turn guns right"
              disabled={!playing}
              onClick={() => aim(hud.heading + 1, hud.range)}
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
          Drag to aim
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
