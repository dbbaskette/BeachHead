'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Crosshair, Move } from 'lucide-react';
import {
  thumbAxis,
  TouchDrag,
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
  onAimDrag,
  onFire,
  fireLabel,
  fireDetail,
  hot,
  children,
}: {
  onAim: (axis: TouchAxis) => void;
  onAimDrag?: (delta: TouchAxis) => void;
  onFire: (held: boolean) => void;
  fireLabel: string;
  fireDetail: string;
  hot?: boolean;
  children: ReactNode;
}) {
  const callbacks = useRef({ onAim, onAimDrag, onFire });
  useEffect(() => {
    callbacks.current = { onAim, onAimDrag, onFire };
  }, [onAim, onAimDrag, onFire]);
  const aimId = useRef<number | null>(null);
  const aimGesture = useRef(new TouchDrag());
  const aimOrigin = useRef({ x: 0, y: 0 });
  const fireId = useRef<number | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const [firing, setFiring] = useState(false);
  const stopAim = () => {
    aimId.current = null;
    aimGesture.current.clear();
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
    const delta = aimGesture.current.move(e.pointerId, e.clientX, e.clientY);
    if (!delta) return;
    const dx = e.clientX - aimOrigin.current.x;
    const dy = e.clientY - aimOrigin.current.y;
    const distance = Math.hypot(dx, dy);
    const scale = distance > 32 ? 32 / distance : 1;
    setStick({ x: dx * scale, y: dy * scale });
    if (callbacks.current.onAimDrag) callbacks.current.onAimDrag(delta);
    else callbacks.current.onAim(thumbAxis(dx, dy));
  };
  return (
    <div className="touch-controls" aria-label="Touch combat controls">
      <button
        className="touch-aim"
        aria-label={onAimDrag ? 'Swipe pad to aim' : 'Drag thumb pad to aim'}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (aimId.current !== null || e.button !== 0) return;
          e.preventDefault();
          aimId.current = e.pointerId;
          aimOrigin.current = { x: e.clientX, y: e.clientY };
          aimGesture.current.begin(e.pointerId, e.clientX, e.clientY);
          e.currentTarget.setPointerCapture(e.pointerId);
          callbacks.current.onAim({ x: 0, y: 0 });
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
        <span>{onAimDrag ? 'Swipe to aim' : 'Aim'}</span>
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
