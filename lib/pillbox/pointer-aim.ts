type Point = { x: number; y: number };
type AimPoint = { x: number; z: number };

/** Keep cursor motion independent of target assistance, and pick only the latest input. */
export class PointerAim {
  private pointer: Point | null = null;
  private pending = false;

  move(x: number, y: number) {
    this.pointer = { x, y };
    this.pending = true;
  }

  resolve(pick: (x: number, y: number) => AimPoint | null): AimPoint | null {
    if (!this.pending || !this.pointer) return null;
    this.pending = false;
    return pick(this.pointer.x, this.pointer.y);
  }

  screen(rect: { left: number; top: number }): Point | null {
    return this.pointer
      ? { x: this.pointer.x - rect.left, y: this.pointer.y - rect.top }
      : null;
  }

  clear() {
    this.pointer = null;
    this.pending = false;
  }
}
