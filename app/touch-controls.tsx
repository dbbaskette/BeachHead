'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Crosshair, Move } from 'lucide-react';
import {
  thumbAxis,
  TOUCH_LAYOUT_QUERY,
  type TouchAxis,
} from '@/lib/touch-input';

export function useTouchLayout() {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(TOUCH_LAYOUT_QUERY);
    const update = () => setTouch(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return touch;
}

export function TouchControls({
  onAim,
  onFire,
  fireLabel,
  fireDetail,
  hot,
  children,
}: {
  onAim: (axis: TouchAxis) => void;
  onFire: (held: boolean) => void;
  fireLabel: string;
  fireDetail: string;
  hot?: boolean;
  children: ReactNode;
}) {
  const callbacks = useRef({ onAim, onFire });
  useEffect(() => {
    callbacks.current = { onAim, onFire };
  }, [onAim, onFire]);
  const aimId = useRef<number | null>(null);
  const fireId = useRef<number | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [firing, setFiring] = useState(false);
  const stopAim = () => {
    aimId.current = null;
    setStick({ x: 0, y: 0 });
    callbacks.current.onAim({ x: 0, y: 0 });
  };
  const stopFire = () => {
    fireId.current = null;
    setFiring(false);
    callbacks.current.onFire(false);
  };
  useEffect(
    () => () => {
      callbacks.current.onAim({ x: 0, y: 0 });
      callbacks.current.onFire(false);
    },
    [],
  );
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - rect.left - rect.width / 2;
    const dy = e.clientY - rect.top - rect.height / 2;
    const distance = Math.hypot(dx, dy);
    const scale = distance > 32 ? 32 / distance : 1;
    setStick({ x: dx * scale, y: dy * scale });
    callbacks.current.onAim(thumbAxis(dx, dy));
  };
  return (
    <div className="touch-controls" aria-label="Touch combat controls">
      <button
        className="touch-aim"
        aria-label="Drag thumb pad to aim"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (aimId.current !== null || e.button !== 0) return;
          e.preventDefault();
          aimId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          move(e);
        }}
        onPointerMove={(e) => {
          if (aimId.current === e.pointerId) move(e);
        }}
        onPointerUp={(e) => {
          if (aimId.current === e.pointerId) stopAim();
        }}
        onPointerCancel={(e) => {
          if (aimId.current === e.pointerId) stopAim();
        }}
        onLostPointerCapture={(e) => {
          if (aimId.current === e.pointerId) stopAim();
        }}
        onBlur={stopAim}
      >
        <Move size={46} aria-hidden="true" />
        <i style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} />
        <span>Aim</span>
      </button>
      <div className="touch-readouts">{children}</div>
      <button
        className={`touch-fire ${firing ? 'pressed' : ''} ${hot ? 'hot' : ''}`}
        aria-label="Hold to fire"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (fireId.current !== null || e.button !== 0) return;
          e.preventDefault();
          fireId.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          setFiring(true);
          callbacks.current.onFire(true);
        }}
        onPointerUp={(e) => {
          if (fireId.current === e.pointerId) stopFire();
        }}
        onPointerCancel={(e) => {
          if (fireId.current === e.pointerId) stopFire();
        }}
        onLostPointerCapture={(e) => {
          if (fireId.current === e.pointerId) stopFire();
        }}
        onKeyDown={(e) => {
          if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault();
            setFiring(true);
            callbacks.current.onFire(true);
          }
        }}
        onKeyUp={(e) => {
          if (e.code === 'Space' || e.code === 'Enter') stopFire();
        }}
        onBlur={stopFire}
      >
        <Crosshair size={26} aria-hidden="true" />
        <b>{fireLabel}</b>
        <small>{fireDetail}</small>
      </button>
    </div>
  );
}
