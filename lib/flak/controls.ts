import { BunkerControls, type ControlRole } from '../bunker/controls';
/** Preserve a brief tap that starts and ends between two animation frames. */
export class FlakControls extends BunkerControls {
  private queuedShot = false;
  override begin(
    role: ControlRole,
    id: number,
    x: number,
    y: number,
    kind: string,
  ) {
    const accepted = super.begin(role, id, x, y, kind);
    if (accepted && (role === 'fire' || (role === 'look' && kind === 'mouse')))
      this.queueShot();
    return accepted;
  }
  queueShot() {
    this.queuedShot = true;
  }
  takeFire(keyHeld = false) {
    const fire = this.queuedShot || this.firing || keyHeld;
    this.queuedShot = false;
    return fire;
  }
  override clear() {
    super.clear();
    this.queuedShot = false;
  }
}
