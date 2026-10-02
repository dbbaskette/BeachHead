'use client';
import { useEffect, useRef, useState } from 'react';
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
  const canvas = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({ onComplete, onBlast, onPause });
  useEffect(() => {
    callbacks.current = { onComplete, onBlast, onPause };
  }, [onComplete, onBlast, onPause]);
  const paused = useRef(false);
  const [isPaused, setPaused] = useState(false);
  const [caption, setCaption] = useState('Back on the landing beach');
  const toggle = (value: boolean) => {
    paused.current = value;
    setPaused(value);
    callbacks.current.onPause(value);
  };
  useEffect(() => {
    const film = new BunkerFinale();
    const reduced = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    let raf = 0,
      last = 0,
      time = 0,
      disposed = false,
      blast = false;
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
      const dt = Math.min(0.05, (stamp - (last || stamp)) / 1000);
      last = stamp;
      if (!paused.current) time += dt;
      if (time >= DETONATION_TIME && !blast) {
        blast = true;
        callbacks.current.onBlast();
        setCaption('The radio network falls silent');
      }
      film.render(canvas.current, time, reduced);
      if (time >= FINALE_DURATION) {
        callbacks.current.onComplete();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    // Decoding happens during the establishing shot; slow or missing images cannot stall victory.
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
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
