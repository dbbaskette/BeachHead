import { thumbAxis, type TouchAxis } from '../touch-input';
export type ControlRole = 'move' | 'turn' | 'look' | 'fire';
type Contact = {
  id: number;
  role: ControlRole;
  kind: string;
  x: number;
  y: number;
  originX: number;
  originY: number;
  touchId?: number;
};
/** Each finger owns one action. Releases must be routed here regardless of DOM target. */
export class BunkerControls {
  private contacts = new Map<number, Contact>();
  axis: TouchAxis = { x: 0, y: 0 };
  stick: TouchAxis = { x: 0, y: 0 };
  turn: TouchAxis = { x: 0, y: 0 };
  aimStick: TouchAxis = { x: 0, y: 0 };
  get firing() {
    return [...this.contacts.values()].some(
      (p) => p.role === 'fire' || (p.role === 'look' && p.kind === 'mouse'),
    );
  }
  begin(role: ControlRole, id: number, x: number, y: number, kind: string) {
    if ([...this.contacts.values()].some((p) => p.role === role && p.id !== id))
      return false;
    this.end(id); // A fresh down with a reused ID supersedes a missed release.
    this.contacts.set(id, { role, id, x, y, originX: x, originY: y, kind });
    return true;
  }
  move(id: number, x: number, y: number): TouchAxis | null {
    const p = this.contacts.get(id);
    if (!p) return null;
    const delta = { x: x - p.x, y: y - p.y };
    p.x = x;
    p.y = y;
    if (p.role !== 'move' && p.role !== 'turn') return delta;
    const dx = x - p.originX,
      dy = y - p.originY;
    const axis = thumbAxis(dx, dy);
    const scale = Math.min(1, 25 / Math.max(1, Math.hypot(dx, dy)));
    const stick = { x: dx * scale, y: dy * scale };
    if (p.role === 'move') {
      this.axis = axis;
      this.stick = stick;
    } else {
      this.turn = axis;
      this.aimStick = stick;
    }
    return null;
  }
  end(id: number) {
    const p = this.contacts.get(id);
    if (!p) return false;
    this.contacts.delete(id);
    if (p.role === 'move') {
      this.axis = { x: 0, y: 0 };
      this.stick = { x: 0, y: 0 };
    }
    if (p.role === 'turn') {
      this.turn = { x: 0, y: 0 };
      this.aimStick = { x: 0, y: 0 };
    }
    return true;
  }
  associateTouches(
    touches: ArrayLike<{
      identifier: number;
      clientX: number;
      clientY: number;
    }>,
  ) {
    for (const t of Array.from(touches)) {
      if ([...this.contacts.values()].some((p) => p.touchId === t.identifier))
        continue;
      const p = [...this.contacts.values()].find(
        (p) =>
          p.kind === 'touch' &&
          p.touchId === undefined &&
          Math.hypot(p.x - t.clientX, p.y - t.clientY) < 3,
      );
      if (p) p.touchId = t.identifier;
    }
  }
  reconcileTouches(touches: ArrayLike<{ identifier: number }>) {
    const active = new Set(Array.from(touches, (t) => t.identifier));
    for (const p of this.contacts.values())
      if (
        p.kind === 'touch' &&
        (active.size === 0 ||
          (p.touchId !== undefined && !active.has(p.touchId)))
      )
        this.end(p.id);
  }
  clear() {
    this.contacts.clear();
    this.axis = { x: 0, y: 0 };
    this.stick = { x: 0, y: 0 };
    this.turn = { x: 0, y: 0 };
    this.aimStick = { x: 0, y: 0 };
  }
}

/** Capture-phase releases survive retargeting, an out-of-pad lift, or DOM capture loss.
 * The legacy touch end is a Safari safety net; stationary held fingers never time out. */
export function bindControlRelease(
  target: EventTarget,
  controls: BunkerControls,
  changed: () => void,
) {
  const end = (event: Event) => {
    if (controls.end((event as PointerEvent).pointerId)) changed();
  };
  const touchstart = (event: Event) =>
    controls.associateTouches((event as TouchEvent).touches);
  const touches = (event: Event) => {
    controls.reconcileTouches((event as TouchEvent).touches);
    changed();
  };
  const reset = () => {
    controls.clear();
    changed();
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    target.addEventListener(type, end, true);
  target.addEventListener('touchstart', touchstart, {
    capture: true,
    passive: true,
  });
  for (const type of ['touchend', 'touchcancel'])
    target.addEventListener(type, touches, { capture: true, passive: true });
  for (const type of ['blur', 'pagehide', 'orientationchange'])
    target.addEventListener(type, reset);
  return () => {
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
      target.removeEventListener(type, end, true);
    target.removeEventListener('touchstart', touchstart, true);
    for (const type of ['touchend', 'touchcancel'])
      target.removeEventListener(type, touches, true);
    for (const type of ['blur', 'pagehide', 'orientationchange'])
      target.removeEventListener(type, reset);
    controls.clear();
  };
}
