type Point = { x: number; y: number };
type AimPoint = { x: number; z: number };

/** Keep cursor motion independent of target assistance, and pick only the latest input. */
export class PointerAim {
  private pointer: Point | null = null;
  private pending = false;
  private relative = false;
  private accepted: Point | null = null;

  move(x: number, y: number) {
    this.relative = false;
    this.accepted = null;
    this.pointer = { x, y };
    this.pending = true;
  }

  /** A swipe moves the sight in pixels, independently of target depth or assistance. */
  moveRelative(dx: number, dy: number, origin: Point) {
    if (!this.relative || !this.pointer) {
      this.pointer = { ...origin };
      this.accepted = { ...origin };
      this.relative = true;
    }
    this.pointer = { x: this.pointer.x + dx, y: this.pointer.y + dy };
    this.pending = true;
  }

  resolve(
    pick: (x: number, y: number) => AimPoint | null,
    touchPick = pick,
  ): AimPoint | null {
    if (!this.pending || !this.pointer) return null;
    this.pending = false;
    if (!this.relative) return pick(this.pointer.x, this.pointer.y);
    const target = touchPick(this.pointer.x, this.pointer.y);
    if (target) {
      this.accepted = { ...this.pointer };
      return target;
    }
    // Stop at the reachable beach edge. Reversing the swipe responds immediately,
    // rather than requiring the player to drag back from an invisible off-screen aim.
    if (!this.accepted) return null;
    const from = this.accepted,
      to = this.pointer;
    let low = 0,
      high = 1;
    let best = touchPick(from.x, from.y);
    for (let i = 0; i < 8; i++) {
      const t = (low + high) / 2;
      const point = {
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
      };
      const hit = touchPick(point.x, point.y);
      if (hit) {
        low = t;
        this.accepted = point;
        best = hit;
      } else high = t;
    }
    this.pointer = { ...this.accepted };
    return best;
  }

  screen(rect: { left: number; top: number }): Point | null {
    return this.pointer
      ? { x: this.pointer.x - rect.left, y: this.pointer.y - rect.top }
      : null;
  }

  clear() {
    this.pointer = null;
    this.pending = false;
    this.relative = false;
    this.accepted = null;
  }
}
