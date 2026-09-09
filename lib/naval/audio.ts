export class NavalAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  async start() {
    if (!this.enabled) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.32;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      this.enabled = false;
    }
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.master) this.master.gain.value = enabled ? 0.32 : 0;
    if (enabled) void this.start();
  }
  play(kind: 'fire' | 'impact' | 'splash' | 'damage') {
    if (
      !this.enabled ||
      !this.context ||
      !this.master ||
      this.context.state !== 'running'
    )
      return;
    const ctx = this.context,
      now = ctx.currentTime;
    const length = kind === 'fire' ? 0.85 : kind === 'splash' ? 0.5 : 1.1;
    const buffer = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * length),
        ctx.sampleRate,
      ),
      data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.exp((-i / data.length) * 5);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value =
      kind === 'splash' ? 1800 : kind === 'fire' ? 900 : 550;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(kind === 'fire' ? 0.8 : 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + length);
    noise.connect(filter).connect(gain).connect(this.master);
    noise.start();
    noise.onended = () => {
      noise.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    if (kind !== 'splash') {
      const osc = ctx.createOscillator(),
        bass = ctx.createGain();
      osc.frequency.setValueAtTime(90, now);
      osc.frequency.exponentialRampToValueAtTime(28, now + 0.4);
      bass.gain.setValueAtTime(0.6, now);
      bass.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.connect(bass).connect(this.master);
      osc.start();
      osc.stop(now + 0.6);
      osc.onended = () => {
        osc.disconnect();
        bass.disconnect();
      };
    }
  }
  dispose() {
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
  }
}
