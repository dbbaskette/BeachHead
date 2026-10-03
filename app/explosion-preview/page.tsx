'use client';
import { useEffect, useRef, useState } from 'react';
import {
  BunkerFinale,
  DETONATION_TIME,
  FINALE_DURATION,
} from '../../lib/bunker/cinematic';
import { assetUrl } from '../../lib/asset-url';

export default function ExplosionPreview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const clock = useRef(0);
  const playing = useRef(true);
  const [running, setRunning] = useState(true);
  const [time, setTime] = useState(0);
  const [ready, setReady] = useState(false);
  const [reduced, setReduced] = useState(false);
  const reduce = useRef(false);
  useEffect(() => {
    const renderer = new BunkerFinale();
    const preference = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    reduce.current = preference;
    let disposed = false,
      raf = 0,
      last = 0,
      loaded = false;
    void renderer.ready.then(() => {
      if (!disposed) {
        loaded = true;
        setReady(true);
        setReduced(preference);
      }
    });
    const pause = () => {
      playing.current = false;
      setRunning(false);
    };
    const visibility = () => {
      if (document.hidden) pause();
    };
    const tick = (stamp: number) => {
      const dt = Math.min(0.05, (stamp - (last || stamp)) / 1000);
      last = stamp;
      if (loaded && playing.current) {
        clock.current = Math.min(FINALE_DURATION, clock.current + dt);
        if (clock.current >= FINALE_DURATION) pause();
        setTime(clock.current);
      }
      if (canvas.current)
        renderer.render(canvas.current, clock.current, reduce.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    window.addEventListener('blur', pause);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('blur', pause);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  const seek = (n: number) => {
    clock.current = n;
    setTime(n);
    playing.current = false;
    setRunning(false);
  };
  return (
    <main
      style={{
        minHeight: '100svh',
        background: '#0b1013',
        color: '#e9dfcd',
        padding: 'clamp(12px,3vw,32px)',
        fontFamily: 'system-ui,sans-serif',
      }}
    >
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <a href={assetUrl('/')} style={{ color: '#c8b383' }}>
          ← Back to missions
        </a>
        <h1
          style={{
            fontFamily: 'Georgia,serif',
            fontSize: 'clamp(24px,3vw,38px)',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
            maxWidth: 'none',
            margin: '18px 0 6px',
          }}
        >
          The battery falls silent
        </h1>
        <p style={{ color: '#a6b0af', margin: '0 0 20px' }}>
          Bunker demolition · continuous explosion preview
        </p>
        <canvas
          ref={canvas}
          width={1672}
          height={941}
          aria-label="Animated bunker explosion above the Normandy landing beach"
          style={{
            display: 'block',
            width: '100%',
            maxHeight: '70svh',
            objectFit: 'contain',
            background: '#090d10',
            borderRadius: 4,
          }}
        />
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 10,
            marginTop: 16,
            alignItems: 'center',
          }}
        >
          <button
            disabled={!ready}
            onClick={() => {
              if (clock.current >= FINALE_DURATION) clock.current = 0;
              playing.current = !playing.current;
              setRunning(playing.current);
            }}
            style={buttonStyle}
          >
            {!ready ? 'Loading…' : running ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={() => {
              clock.current = 0;
              playing.current = true;
              setRunning(true);
            }}
            style={buttonStyle}
          >
            Replay
          </button>
          <button
            onClick={() => seek(DETONATION_TIME + 0.65)}
            style={buttonStyle}
          >
            Blast
          </button>
          <button
            onClick={() => seek(DETONATION_TIME + 2.5)}
            style={buttonStyle}
          >
            Collapse
          </button>
          <button onClick={() => seek(DETONATION_TIME + 7)} style={buttonStyle}>
            Aftermath
          </button>
          <label
            style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              minHeight: 44,
            }}
          >
            <input
              type="checkbox"
              checked={reduced}
              onChange={(e) => {
                reduce.current = e.target.checked;
                setReduced(e.target.checked);
              }}
            />
            Reduced motion
          </label>
        </div>
        <label
          style={{
            display: 'flex',
            gap: 14,
            alignItems: 'center',
            marginTop: 14,
          }}
        >
          Timeline
          <input
            aria-label="Explosion timeline"
            type="range"
            min={0}
            max={FINALE_DURATION}
            step={0.01}
            value={time}
            onChange={(e) => seek(Number(e.target.value))}
            style={{ flex: 1, minHeight: 44, accentColor: '#c8b383' }}
          />
          <output style={{ minWidth: 75 }}>
            {time.toFixed(1)} / {FINALE_DURATION}s
          </output>
        </label>
      </div>
    </main>
  );
}
const buttonStyle = {
  minHeight: 44,
  padding: '8px 20px',
  border: '1px solid #6a6558',
  background: '#1d292e',
  color: '#e9dfcd',
  borderRadius: 4,
  cursor: 'pointer',
};
