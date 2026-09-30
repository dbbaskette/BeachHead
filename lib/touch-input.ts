export type TouchAxis = { x: number; y: number };
export const TOUCH_LAYOUT_QUERY =
  '(pointer: coarse), (max-width: 600px), (max-width: 900px) and (max-height: 500px)';

/** A quiet center and progressive response allow small corrections with a thumb. */
export function thumbAxis(dx: number, dy: number, radius = 42): TouchAxis {
  const distance = Math.hypot(dx, dy);
  const travel = Math.min(1, distance / radius);
  if (travel <= 0.12) return { x: 0, y: 0 };
  const speed = ((travel - 0.12) / 0.88) ** 1.7;
  return { x: (dx / distance) * speed, y: (dy / distance) * speed };
}

/** One finger owns each gesture; another finger cannot steal or end it. */
export class TouchDrag {
  private point: { id: number; x: number; y: number } | null = null;
  begin(id: number, x: number, y: number) {
    if (this.point) return false;
    this.point = { id, x, y };
    return true;
  }
  move(id: number, x: number, y: number): TouchAxis | null {
    if (!this.point || this.point.id !== id) return null;
    const delta = { x: x - this.point.x, y: y - this.point.y };
    this.point = { id, x, y };
    return delta;
  }
  end(id: number) {
    if (this.point?.id !== id) return false;
    this.clear();
    return true;
  }
  clear() {
    this.point = null;
  }
}

export function mobilePixelRatio(ratio: number, touch: boolean) {
  return Math.min(ratio, touch ? 1.25 : 1.75);
}
