import type { AirInput } from './types';
export class AirControls {
  keys = new Set<string>();
  pad = { x: 0, y: 0 };
  private sources = new Set<string>();
  private bombPending = false;
  press(code: string, repeat = false) {
    if (code === 'Space' && !repeat && !this.keys.has(code))
      this.bombPending = true;
    this.keys.add(code);
  }
  release(code: string) {
    this.keys.delete(code);
  }
  fire(source: string, held: boolean) {
    if (held) this.sources.add(source);
    else this.sources.delete(source);
  }
  bomb() {
    this.bombPending = true;
  }
  sample(): AirInput {
    const held = (...codes: string[]) => codes.some((c) => this.keys.has(c));
    const precise = held('ShiftLeft', 'ShiftRight') ? 0.35 : 1;
    const value = {
      x:
        this.pad.x +
        ((held('KeyD', 'ArrowRight') ? 1 : 0) -
          (held('KeyA', 'ArrowLeft') ? 1 : 0)) *
          precise,
      y:
        this.pad.y +
        ((held('KeyW', 'ArrowUp') ? 1 : 0) -
          (held('KeyS', 'ArrowDown') ? 1 : 0)) *
          precise,
      fire: held('KeyF') || this.sources.size > 0,
      bomb: this.bombPending,
    };
    this.bombPending = false;
    return value;
  }
  reset() {
    this.keys.clear();
    this.pad = { x: 0, y: 0 };
    this.sources.clear();
    this.bombPending = false;
  }
}
