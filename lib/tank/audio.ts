import { NavalAudio } from '../naval/audio';
import { PillboxAudio } from '../pillbox/audio';
import type { TankEvent, TankState } from './simulation';
export class TankAudio {
  private cannon = new NavalAudio();
  private small = new PillboxAudio();
  private context: AudioContext | null = null;
  private engine: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private enabled = true;
  private paused = true;
  preload() {
    void this.cannon.preload();
    void this.small.preload();
  }
  start() {
    void this.cannon.start();
    void this.small.start();
    if (!this.context) {
      this.context = new AudioContext();
      this.engine = this.context.createOscillator();
      this.engine.type = 'sawtooth';
      this.engine.frequency.value = 37;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 160;
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.engine
        .connect(filter)
        .connect(this.gain)
        .connect(this.context.destination);
      this.engine.start();
    }
    void this.context.resume().catch(() => undefined);
  }
  setPaused(value: boolean) {
    this.paused = value;
    this.cannon.setPaused(value);
    this.small.setPaused(value);
    this.volume();
  }
  setEnabled(value: boolean) {
    this.enabled = value;
    this.cannon.setEnabled(value);
    this.small.setEnabled(value);
    this.volume();
  }
  private volume() {
    if (this.gain && this.context)
      this.gain.gain.setTargetAtTime(
        this.enabled && !this.paused ? 0.025 : 0,
        this.context.currentTime,
        0.12,
      );
  }
  update(s: TankState) {
    if (this.context && this.engine)
      this.engine.frequency.setTargetAtTime(
        37 + Math.abs(s.speed) * 7,
        this.context.currentTime,
        0.15,
      );
  }
  play(e: TankEvent, s: TankState) {
    const distance = Math.min(1, Math.hypot(e.at.x - s.x, e.at.z - s.z) / 150),
      pan = Math.max(-1, Math.min(1, (e.at.x - s.x) / 60));
    if (e.kind === 'mg') this.small.play('fire', { distance, pan });
    else if (e.kind === 'cannon') this.cannon.play('fire', { distance, pan });
    else if (e.kind === 'damage' || e.kind === 'ricochet')
      this.cannon.play('damage', { distance, pan });
    else if (e.kind === 'destroy' || e.kind === 'impact')
      this.cannon.play('impact', { distance, pan });
  }
  dispose() {
    this.cannon.dispose();
    this.small.dispose();
    this.engine?.stop();
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
  }
}
