'use client';
import { useEffect, useRef, useState } from 'react';
import { useSettings } from '@/lib/settings';
import {
  BunkerFinale,
  DETONATION_TIME,
  FINALE_DURATION,
} from '@/lib/bunker/cinematic';

export function BunkerFinaleView({
  onComplete,
  onBlast,
  onPause,
}: {
  onComplete: () => void;
  onBlast: () => void;
  onPause: (paused: boolean) => void;
}) {
  const { reducedMotion } = useSettings();
  const reducedRef = useRef(reducedMotion);
  const canvas = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onComplete, onBlast, onPause });
  useEffect(() => {
    callbacks.current = { onComplete, onBlast, onPause };
  }, [onComplete, onBlast, onPause]);
  const paused = useRef(false);
  const wakeRef = useRef<() => void>(() => {});
  const redrawRef = useRef<() => void>(() => {});
  const [isPaused, setPaused] = useState(false);
  const [caption, setCaption] = useState('Back on the landing beach');
  const toggle = (value: boolean) => {
    paused.current = value;
    setPaused(value);
    callbacks.current.onPause(value);
    if (!value) wakeRef.current();
  };
  useEffect(() => {
    reducedRef.current = reducedMotion;
    redrawRef.current();
  }, [reducedMotion]);
  useEffect(() => {
    const film = new BunkerFinale();
    const element = canvas.current;
    let raf = 0,
      last = 0,
      time = 0,
      disposed = false,
      blast = false,
      completed = false;
    const redraw = () => {
      if (disposed || !canvas.current || raf) return;
      film.render(canvas.current, time, reducedRef.current);
    };
    const resize = () => {
      if (!element) return;
      const host = element.parentElement ?? element;
      const rect = host.getBoundingClientRect();
      if (!rect.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(320, Math.min(1672, Math.round(rect.width * dpr)));
      const height = Math.max(180, Math.round((width * 941) / 1672));
      if (element.width !== width || element.height !== height) {
        element.width = width;
        element.height = height;
        redraw();
      }
    };
    const observer = element ? new ResizeObserver(resize) : undefined;
    if (element) {
      observer?.observe(element.parentElement ?? element);
      resize();
    }
    const visibility = () => {
      if (document.hidden) toggle(true);
    };
    const blur = () => toggle(true);
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        toggle(!paused.current);
      }
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', key);
    const tick = (stamp: number) => {
      if (disposed || !canvas.current) return;
      const dt = last ? Math.min(0.05, (stamp - last) / 1000) : 0;
      last = stamp;
      if (!paused.current) time += dt;
      if (time >= DETONATION_TIME && !blast) {
        blast = true;
        callbacks.current.onBlast();
        setCaption('The radio network falls silent');
      }
      film.render(canvas.current, time, reducedRef.current);
      if (time >= FINALE_DURATION) {
        completed = true;
        raf = 0;
        callbacks.current.onComplete();
        return;
      }
      if (!paused.current) raf = requestAnimationFrame(tick);
      else {
        raf = 0;
        last = 0;
      }
    };
    const wake = () => {
      if (disposed || raf || completed || paused.current) return;
      last = 0;
      raf = requestAnimationFrame(tick);
    };
    wakeRef.current = wake;
    redrawRef.current = redraw;
    // Decoding happens during the establishing shot; slow or missing images cannot stall victory.
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      wakeRef.current = () => {};
      redrawRef.current = () => {};
      observer?.disconnect();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', key);
    };
  }, []);
  return (
    <section className="bunker-finale" aria-label="Bunker demolition cinematic">
      <canvas
        ref={canvas}
        width={1672}
        height={941}
        aria-label="View across the Normandy landing beach: wrecked tanks, landing craft and fallen troops below the exploding cliff gun emplacement"
      />
      <div className="bunker-finale-caption">
        <small>NORMANDY · COASTAL BATTERY</small>
        <p>{caption}</p>
      </div>
      <div className="bunker-finale-controls">
        <button onClick={() => toggle(!paused.current)}>
          {isPaused ? 'Resume' : 'Pause'}
        </button>
        <button onClick={() => callbacks.current.onComplete()}>
          Skip cinematic
        </button>
      </div>
    </section>
  );
}
