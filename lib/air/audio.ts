import { assetUrl } from '../asset-url';
import type { AirBattle, AirEvent } from './types';
type Sound = 'gun' | 'blast' | 'water' | 'damage' | 'release';
const files: Record<Exclude<Sound, 'release'>, string> = {
  gun: 'pillbox-machine-gun-fire.mp3',
  blast: 'naval-ship-impact.mp3',
  water: 'naval-water-splash.mp3',
  damage: 'naval-metal-damage.mp3',
};
/** One gesture-started context; a quiet engine bed leaves room for the warning transients. */
export class AirAudio {
  static live = 0;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private engine: AudioBufferSourceNode | null = null;
  private engineGain: GainNode | null = null;
  private voices = new Set<AudioBufferSourceNode>();
  private buffers = new Map<Sound, AudioBuffer>();
  private bytes = new Map<Sound, ArrayBuffer>();
  private fallback: AudioBuffer | null = null;
  private abort = new AbortController();
  private loading: Promise<void> | null = null;
  private disposed = false;
  private paused = true;
  private muted = false;
  private gunAt = -1;
  preload() {
    if (this.loading) return this.loading;
    this.loading = Promise.all(
      Object.entries(files).map(async ([kind, file]) => {
        try {
          const r = await fetch(assetUrl('/audio/' + file), {
            signal: this.abort.signal,
          });
          if (r.ok) {
            const bytes = await r.arrayBuffer();
            if (!this.disposed) this.bytes.set(kind as Sound, bytes);
          }
        } catch {
          /* A generated transient remains available offline. */
        }
      }),
    ).then(() => {});
    return this.loading;
  }
  async start() {
    if (this.disposed) return;
    try {
      if (!this.context) {
        const c = new AudioContext();
        this.context = c;
        AirAudio.live++;
        this.master = c.createGain();
        const compressor = c.createDynamicsCompressor();
        compressor.threshold.value = -16;
        compressor.ratio.value = 5;
        this.master.connect(compressor).connect(c.destination);
        const engine = c.createBuffer(1, c.sampleRate * 2, c.sampleRate),
          data = engine.getChannelData(0);
        let noise = 0,
          seed = 7421;
        for (let i = 0; i < data.length; i++) {
          const t = i / c.sampleRate;
          seed = (seed * 1664525 + 1013904223) >>> 0;
          noise = noise * 0.95 + ((seed / 4294967296) * 2 - 1) * 0.05;
          const pulse = Math.sin(t * Math.PI * 2 * 46);
          data[i] =
            (0.2 * pulse +
              0.09 * Math.sin(t * Math.PI * 2 * 92) +
              0.05 * Math.sin(t * Math.PI * 2 * 138) +
              noise * 0.16) *
            (0.78 + 0.22 * Math.sin(t * Math.PI * 2 * 23));
        }
        const source = c.createBufferSource();
        source.buffer = engine;
        source.loop = true;
        const low = c.createBiquadFilter();
        low.frequency.value = 950;
        this.engineGain = c.createGain();
        this.engineGain.gain.value = 0.32;
        source.connect(low).connect(this.engineGain).connect(this.master);
        source.start();
        this.engine = source;
        const release = c.createBuffer(1, c.sampleRate * 0.14, c.sampleRate),
          releaseData = release.getChannelData(0);
        for (let i = 0; i < releaseData.length; i++) {
          const t = i / c.sampleRate;
          seed = (seed * 1664525 + 1013904223) >>> 0;
          releaseData[i] =
            Math.sin(t * 2 * Math.PI * 380) * Math.exp(-t * 65) * 0.45 +
            ((seed / 4294967296) * 2 - 1) * Math.exp(-t * 40) * 0.2;
        }
        this.buffers.set('release', release);
        this.fallback = c.createBuffer(1, c.sampleRate * 0.65, c.sampleRate);
        const d = this.fallback.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          seed = (seed * 1664525 + 1013904223) >>> 0;
          d[i] =
            ((seed / 4294967296) * 2 - 1) *
            Math.exp((-i / c.sampleRate) * 10) *
            0.3;
        }
      }
      this.paused = false;
      const c = this.context;
      if (c.state === 'suspended') await c.resume();
      if (this.disposed) return;
      this.gain();
      await this.preload();
      if (this.disposed) return;
      await Promise.all(
        [...this.bytes].map(async ([kind, bytes]) => {
          if (this.buffers.has(kind)) return;
          try {
            const b = await c.decodeAudioData(bytes.slice(0));
            if (!this.disposed) this.buffers.set(kind, b);
          } catch {
            /* Unsupported codecs use the transient fallback. */
          }
        }),
      );
    } catch {
      /* Silent play remains usable if audio is unavailable. */
    }
  }
  private gain() {
    if (this.context && this.master)
      this.master.gain.setTargetAtTime(
        this.paused || this.muted ? 0 : 0.48,
        this.context.currentTime,
        0.025,
      );
  }
  setMuted(muted: boolean) {
    this.muted = muted;
    this.gain();
    if (muted) this.stopVoices();
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.gain();
    if (paused) this.stopVoices();
  }
  private stopVoices() {
    for (const v of this.voices) {
      try {
        v.stop();
      } catch {
        /* Already ended. */
      }
    }
    this.voices.clear();
  }
  private play(kind: Sound, pan = 0, gain = 1) {
    const c = this.context;
    if (
      !c ||
      !this.master ||
      this.paused ||
      this.muted ||
      this.disposed ||
      c.state !== 'running'
    )
      return;
    if (this.voices.size >= 12) {
      const oldest = this.voices.values().next().value!;
      oldest.stop();
      this.voices.delete(oldest);
    }
    const source = c.createBufferSource(),
      volume = c.createGain(),
      panner = c.createStereoPanner();
    source.buffer = this.buffers.get(kind) ?? this.fallback;
    volume.gain.value = gain;
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(volume).connect(panner).connect(this.master);
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      volume.disconnect();
      panner.disconnect();
    };
    source.start();
  }
  event(e: AirEvent, b: AirBattle) {
    if (e.type === 'guns' && b.time - this.gunAt > 0.1) {
      this.gunAt = b.time;
      this.play('gun', -0.3, 0.44);
      this.play('gun', 0.3, 0.44);
    } else if (e.type === 'impact' && e.bomb)
      this.play(
        e.water ? 'water' : 'blast',
        (e.position.x - b.aircraft.position.x) / 400,
        0.75,
      );
    else if (e.type === 'flak-burst')
      this.play('blast', (e.position.x - b.aircraft.position.x) / 400, 0.3);
    else if (e.type === 'damage') this.play('damage', 0, 0.75);
    else if (e.type === 'bomb-release') this.play('release', 0, 0.7);
  }
  update(b: AirBattle) {
    if (this.context && this.engine) {
      this.engine.playbackRate.setTargetAtTime(
        1 + b.aircraft.velocity.y * 0.003,
        this.context.currentTime,
        0.15,
      );
      this.engineGain?.gain.setTargetAtTime(
        b.health < 30 ? 0.24 : 0.32,
        this.context.currentTime,
        0.2,
      );
    }
  }
  reset() {
    this.stopVoices();
    this.gunAt = -1;
  }
  get count() {
    return this.voices.size;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.stopVoices();
    this.engine?.stop();
    this.engine?.disconnect();
    this.master?.disconnect();
    if (this.context) {
      void this.context.close().catch(() => {});
      AirAudio.live--;
    }
    this.context = null;
    this.buffers.clear();
    this.bytes.clear();
  }
}
