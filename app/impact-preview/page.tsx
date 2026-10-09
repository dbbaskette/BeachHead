'use client';
import { useEffect, useRef, useState } from 'react';
import { TankScene } from '../../lib/tank/scene';
import {
  createTank,
  coverNormal,
  type TankEvent,
  type TankState,
} from '../../lib/tank/simulation';
import { assetUrl } from '../../lib/asset-url';
type Mode = 'idle' | 'hit' | 'collapse' | 'stress';
function setup() {
  const s = createTank();
  s.status = 'playing';
  s.x = 0;
  s.z = -4;
  s.turret = -0.57;
  s.pitch = 0.015;
  return s;
}
export default function ImpactPreview() {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<TankScene | null>(null),
    state = useRef<TankState>(setup());
  const mode = useRef<Mode>('idle'),
    clock = useRef(0),
    run = useRef(false),
    paused = useRef(false),
    slow = useRef(false);
  const [status, setStatus] = useState('Ready. Select an effect or baseline.'),
    [stats, setStats] = useState(''),
    [isPaused, setPaused] = useState(false);
  const choose = (next: Mode) => {
    mode.current = next;
    state.current = setup();
    view.current?.reset();
    clock.current = 0;
    run.current = true;
    paused.current = false;
    setPaused(false);
    setStats('Measuring 8 seconds…');
    setStatus(
      next === 'idle'
        ? 'Baseline: intact village'
        : next === 'collapse'
          ? 'Roof failure → wall collapse → rubble'
          : next === 'stress'
            ? 'Stress: repeated hits and three collapses'
            : 'Repeated shell impacts on masonry',
    );
  };
  useEffect(() => {
    let frame = 0,
      last = performance.now(),
      samples: number[] = [],
      cost: number[] = [],
      frames = 0,
      maxDraws = 0,
      maxParticles = 0;
    const scene = new TankScene(host.current!, state.current, setStatus);
    view.current = scene;
    const tick = (now: number) => {
      const frameMs = now - last;
      const dt = Math.min(0.05, frameMs / 1000) * (slow.current ? 0.25 : 1);
      last = now;
      const s = state.current;
      if (!paused.current) {
        s.time += dt;
        if (run.current && clock.current === 0) {
          samples = [];
          cost = [];
          frames = 0;
          maxDraws = 0;
          maxParticles = 0;
        }
        const before = clock.current;
        clock.current += dt;
        const emit = (id: number, destroy: boolean) => {
          const c = s.cover.find((c) => c.id === id)!;
          if (c.health <= 0) return;
          const at = { x: c.x + c.w / 2 + 0.015, y: 3.7, z: c.z + 3 };
          const e: TankEvent = {
            kind: destroy ? 'destroy' : 'impact',
            at,
            strength: 2,
            surface: 'masonry',
            coverId: c.id,
            normal: coverNormal(c, at),
          };
          s.events.push(e);
          if (destroy) c.health = 0;
        };
        if (run.current && clock.current < 8) {
          if (
            mode.current === 'hit' &&
            Math.floor(before * 1.4) !== Math.floor(clock.current * 1.4)
          )
            emit(1, false);
          if (mode.current === 'collapse' && before < 1 && clock.current >= 1)
            emit(1, true);
          if (mode.current === 'stress') {
            if (Math.floor(before * 10) !== Math.floor(clock.current * 10))
              emit(clock.current < 2 ? 1 : 3, false);
            if (before < 2 && clock.current >= 2) {
              emit(1, true);
              emit(2, true);
              emit(3, true);
            }
          }
        }
      }
      const start = performance.now();
      scene.render(s, false, true);
      const elapsed = performance.now() - start;
      if (run.current && !paused.current) {
        if (clock.current > 0.7) {
          samples.push(frameMs);
          cost.push(elapsed);
          frames++;
          const m = scene.metrics();
          maxDraws = Math.max(maxDraws, m.draws);
          maxParticles = Math.max(maxParticles, m.particles);
        }
        if (clock.current >= 8) {
          samples.sort((a, b) => a - b);
          cost.sort((a, b) => a - b);
          const p95 = samples[Math.floor(samples.length * 0.95)] ?? 0;
          const mean = samples.reduce((a, b) => a + b, 0) / Math.max(1, frames);
          const m = scene.metrics();
          setStats(
            `${(1000 / mean).toFixed(1)} FPS · frame p95 ${p95.toFixed(1)} ms · render CPU p95 ${(cost[Math.floor(cost.length * 0.95)] ?? 0).toFixed(1)} ms · peak ${maxDraws} draws / ${maxParticles} particles · ${m.geometries} geometries / ${m.textures} textures`,
          );
          run.current = false;
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      scene.dispose();
      view.current = null;
    };
  }, []);
  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        background: '#17211e',
        color: '#eee',
      }}
    >
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      <section
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          right: 12,
          padding: 12,
          background: '#13201edb',
          font: '13px system-ui',
          borderRadius: 8,
        }}
      >
        <strong>Breakout · impact study</strong>
        <p style={{ margin: '6px 0' }}>{status}</p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['idle', 'hit', 'collapse', 'stress'] as const).map((m) => (
            <button
              key={m}
              onClick={() => choose(m)}
              style={{
                padding: '8px 12px',
                background: '#ddd3ad',
                color: '#15231c',
                border: 0,
                borderRadius: 4,
              }}
            >
              {m === 'idle'
                ? 'Baseline'
                : m === 'hit'
                  ? 'Shell hits'
                  : m === 'collapse'
                    ? 'Building collapse'
                    : 'Stress test'}
            </button>
          ))}
          <button
            onClick={() => {
              paused.current = !paused.current;
              setPaused(paused.current);
            }}
          >
            {isPaused ? 'Resume' : 'Freeze frame'}
          </button>
          <label style={{ padding: 8 }}>
            <input
              type="checkbox"
              onChange={(e) => {
                slow.current = e.target.checked;
              }}
            />{' '}
            Slow motion
          </label>
          <a href={assetUrl('/')} style={{ color: '#ddd3ad', padding: 8 }}>
            Return to game
          </a>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 11 }}>
          {stats} · Synthetic browser test; not a physical-phone FPS rating.
        </p>
      </section>
    </main>
  );
}
