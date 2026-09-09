import { assetUrl } from '../asset-url';
export type PillboxSound = 'fire' | 'impact' | 'damage';

export interface PillboxSoundOptions {
  /** Stereo position from full left (-1) to full right (1). */
  pan?: number;
  /** Normalized listener distance: 0 is close and 1 is far away. */
  distance?: number;
}

const ASSET_URLS: Record<PillboxSound, string> = {
  fire: assetUrl('/audio/pillbox-machine-gun-fire.mp3'),
  impact: assetUrl('/audio/naval-ship-impact.mp3'),
  damage: assetUrl('/audio/naval-metal-damage.mp3'),
};

const SOURCE_GAIN: Record<PillboxSound, number> = {
  fire: 0.52,
  impact: 0.38,
  damage: 0.52,
};

const DEFAULT_DISTANCE: Record<PillboxSound, number> = {
  fire: 0.12,
  impact: 0.45,
  damage: 0.1,
};

// Four short voices allow a little natural tail at 8 shots/second without a
// sustained burst growing louder on every shot.
const MAX_VOICES = 4;
const MASTER_GAIN = 0.48;
const SOUND_KINDS = Object.keys(ASSET_URLS) as PillboxSound[];

interface ActiveVoice {
  stop: () => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Short, voice-limited effects for the Stage 2 pillbox sequence. */
export class PillboxAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private output: DynamicsCompressorNode | null = null;
  private fallbackBuffer: AudioBuffer | null = null;
  private readonly assetBytes = new Map<PillboxSound, ArrayBuffer>();
  private readonly buffers = new Map<PillboxSound, AudioBuffer>();
  private readonly voices = new Set<ActiveVoice>();
  private preloadPromise: Promise<void> | null = null;
  private decodePromise: Promise<void> | null = null;
  private abortController: AbortController | null = null;
  private variation = 0;
  private paused = false;
  private disposed = false;
  enabled = true;

  /** Fetch assets without creating an AudioContext. */
  async preload(): Promise<void> {
    if (this.disposed) return;
    if (!this.preloadPromise) {
      this.abortController = new AbortController();
      const { signal } = this.abortController;
      this.preloadPromise = Promise.all(
        SOUND_KINDS.map(async (kind) => {
          try {
            const response = await fetch(ASSET_URLS[kind], { signal });
            if (!response.ok) return;
            const bytes = await response.arrayBuffer();
            if (!this.disposed) this.assetBytes.set(kind, bytes);
          } catch {
            // Missing assets are non-fatal; play() uses a synthesized fallback.
          }
        }),
      ).then(() => undefined);
    }
    await this.preloadPromise;
    if (this.context) await this.decodeAssets(this.context);
  }

  /** Create/resume Web Audio from a user gesture, then finish preloading. */
  async start(): Promise<void> {
    if (this.disposed) return;
    try {
      if (!this.context) this.createAudioGraph();
      if (this.context?.state === 'suspended') await this.context.resume();
      this.updateMasterGain();
    } catch {
      this.enabled = false;
      return;
    }
    await this.preload();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.updateMasterGain();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) this.stopAllVoices();
    this.updateMasterGain();
  }

  play(kind: PillboxSound, options: PillboxSoundOptions = {}): void {
    const context = this.context;
    const master = this.master;
    if (
      !this.enabled ||
      this.paused ||
      this.disposed ||
      !context ||
      !master ||
      context.state !== 'running'
    )
      return;

    const pan = clamp(options.pan ?? 0, -1, 1);
    const distance = clamp(options.distance ?? DEFAULT_DISTANCE[kind], 0, 1);
    const buffer = this.buffers.get(kind);
    if (buffer) this.playBuffer(kind, buffer, pan, distance);
    else this.playFallback(kind, pan, distance);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController?.abort();
    this.stopAllVoices();
    this.master?.disconnect();
    this.output?.disconnect();
    if (this.context) void this.context.close().catch(() => undefined);
    this.context = null;
    this.master = null;
    this.output = null;
    this.fallbackBuffer = null;
    this.assetBytes.clear();
    this.buffers.clear();
  }

  private createAudioGraph(): void {
    const context = new AudioContext();
    const master = context.createGain();
    const output = context.createDynamicsCompressor();
    master.gain.value = this.enabled && !this.paused ? MASTER_GAIN : 0;
    output.threshold.value = -18;
    output.knee.value = 10;
    output.ratio.value = 6;
    output.attack.value = 0.002;
    output.release.value = 0.1;
    master.connect(output).connect(context.destination);
    this.context = context;
    this.master = master;
    this.output = output;
    this.fallbackBuffer = this.makeFallbackBuffer(context);
  }

  private async decodeAssets(context: AudioContext): Promise<void> {
    if (this.decodePromise) return this.decodePromise;
    this.decodePromise = Promise.all(
      SOUND_KINDS.map(async (kind) => {
        if (this.buffers.has(kind)) return;
        const bytes = this.assetBytes.get(kind);
        if (!bytes) return;
        try {
          const buffer = await context.decodeAudioData(bytes.slice(0));
          if (!this.disposed && context === this.context)
            this.buffers.set(kind, buffer);
        } catch {
          // Retain the per-kind fallback when decoding fails.
        }
      }),
    )
      .then(() => undefined)
      .finally(() => {
        this.decodePromise = null;
      });
    return this.decodePromise;
  }

  private playBuffer(
    kind: PillboxSound,
    buffer: AudioBuffer,
    pan: number,
    distance: number,
  ): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = 1 + ((this.variation++ % 7) - 3) * 0.006;
    filter.type = 'lowpass';
    filter.frequency.value = 17500 - distance * 13750;
    filter.Q.value = 0.3;
    panner.pan.value = pan;
    gain.gain.value = SOURCE_GAIN[kind] * (1 - distance * 0.62);
    source.connect(filter).connect(panner).connect(gain).connect(master);
    this.registerVoice(source, [filter, panner, gain]);
    source.start(context.currentTime);
  }

  private playFallback(
    kind: PillboxSound,
    pan: number,
    distance: number,
  ): void {
    const context = this.context;
    const master = this.master;
    const buffer = this.fallbackBuffer;
    if (!context || !master || !buffer) return;
    const now = context.currentTime;
    const duration = kind === 'fire' ? 0.11 : 0.22;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const panner = context.createStereoPanner();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value =
      (kind === 'fire' ? 1900 : 850) * (1 - distance * 0.35);
    filter.Q.value = kind === 'fire' ? 0.55 : 0.35;
    panner.pan.value = pan;
    gain.gain.setValueAtTime(SOURCE_GAIN[kind] * 0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    source.connect(filter).connect(panner).connect(gain).connect(master);
    this.registerVoice(source, [filter, panner, gain]);
    source.start(now);
    source.stop(now + duration);
  }

  private registerVoice(
    source: AudioBufferSourceNode,
    nodes: AudioNode[],
  ): ActiveVoice {
    while (this.voices.size >= MAX_VOICES) {
      const oldest = this.voices.values().next().value as
        | ActiveVoice
        | undefined;
      if (!oldest) break;
      oldest.stop();
    }
    let active = true;
    const cleanup = () => {
      if (!active) return;
      active = false;
      this.voices.delete(voice);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
    const voice: ActiveVoice = {
      stop: () => {
        if (!active) return;
        try {
          source.stop();
        } catch {
          // The source may have ended between checks.
        }
        cleanup();
      },
    };
    source.onended = cleanup;
    this.voices.add(voice);
    return voice;
  }

  private stopAllVoices(): void {
    for (const voice of this.voices) voice.stop();
  }

  private updateMasterGain(): void {
    if (!this.context || !this.master) return;
    const target = this.enabled && !this.paused ? MASTER_GAIN : 0;
    const gain = this.master.gain;
    gain.cancelScheduledValues(this.context.currentTime);
    gain.setTargetAtTime(target, this.context.currentTime, 0.01);
  }

  private makeFallbackBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(
      1,
      Math.ceil(context.sampleRate * 0.24),
      context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let seed = 0x71af821;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 0xffffffff) * 2 - 1;
      data[i] = noise * Math.exp((-i / data.length) * 7.5);
    }
    return buffer;
  }
}
