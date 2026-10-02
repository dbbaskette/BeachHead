import { assetUrl } from '../asset-url';
import {
  guardPhrases,
  type GuardCallout,
  type GuardPhrase,
} from './guard-voices';

/** Bundled German speech, with a single speaker and short concrete-room reflections. */
export class BunkerVoiceAudio {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private bytes = new Map<GuardPhrase, ArrayBuffer>();
  private buffers = new Map<GuardPhrase, AudioBuffer>();
  private loading?: Promise<void>;
  private decoding?: Promise<void>;
  private abort = new AbortController();
  private active?: { guardId: number; stop: () => void };
  private paused = true;
  private enabled = true;
  private disposed = false;
  async preload() {
    this.loading ??= Promise.all(
      Object.values(guardPhrases)
        .flat()
        .map(async (phrase) => {
          try {
            const r = await fetch(assetUrl(`/audio/guards/${phrase}.mp3`), {
              signal: this.abort.signal,
            });
            if (r.ok) {
              const data = await r.arrayBuffer();
              if (!this.disposed) this.bytes.set(phrase, data);
            }
          } catch {
            /* Voice assets are optional; failed speech never blocks a mission. */
          }
        }),
    ).then(() => {});
    await this.loading;
  }
  async start() {
    if (this.disposed) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.output = this.context.createGain();
        this.output.gain.value = this.enabled && !this.paused ? 0.8 : 0;
        this.output.connect(this.context.destination);
      }
      await this.context.resume();
      await this.preload();
      const context = this.context;
      if (this.disposed) return;
      this.decoding ??= Promise.all(
        [...this.bytes].map(async ([phrase, bytes]) => {
          try {
            const buffer = await context.decodeAudioData(bytes.slice(0));
            if (!this.disposed) this.buffers.set(phrase, buffer);
          } catch {
            /* Stay silent if a device cannot decode a clip. */
          }
        }),
      ).then(() => {});
      await this.decoding;
    } catch {
      /* Autoplay restrictions must not interrupt gameplay. */
    }
  }
  setPaused(value: boolean) {
    this.paused = value;
    if (value) this.stop();
    this.volume();
  }
  setEnabled(value: boolean) {
    this.enabled = value;
    if (!value) this.stop();
    this.volume();
  }
  private volume() {
    if (this.context && this.output)
      this.output.gain.setTargetAtTime(
        this.enabled && !this.paused ? 0.8 : 0,
        this.context.currentTime,
        0.01,
      );
  }
  stop() {
    this.active?.stop();
  }
  stopDeadSpeakers(guards: readonly { id: number; health: number }[]) {
    if (
      this.active &&
      !guards.some((g) => g.id === this.active!.guardId && g.health > 0)
    )
      this.stop();
  }
  play(call: GuardCallout) {
    const ctx = this.context,
      output = this.output,
      buffer = this.buffers.get(call.phrase);
    if (
      !ctx ||
      !output ||
      !buffer ||
      ctx.state !== 'running' ||
      this.paused ||
      !this.enabled ||
      this.disposed
    )
      return;
    // An urgent grenade warning can interrupt another bark; never layer dialogue.
    if (this.active && call.priority < 3) return;
    this.stop();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = 0.98 + (call.guardId % 3) * 0.02;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = call.occluded
      ? 1300
      : 7200 - Math.min(call.distance, 20) * 170;
    const pan = ctx.createStereoPanner();
    pan.pan.value = call.pan;
    const gain = ctx.createGain();
    gain.gain.value =
      (call.occluded ? 0.27 : 0.8) / (1 + call.distance * 0.055);
    const early = ctx.createDelay(0.3);
    early.delayTime.value = 0.075;
    const late = ctx.createDelay(0.3);
    late.delayTime.value = 0.145;
    const reflection = ctx.createGain();
    reflection.gain.value = 0.16;
    const tail = ctx.createGain();
    tail.gain.value = 0.075;
    source.connect(filter).connect(pan).connect(gain).connect(output);
    gain.connect(early).connect(reflection).connect(output);
    gain.connect(late).connect(tail).connect(output);
    const nodes = [source, filter, pan, gain, early, late, reflection, tail];
    let stopped = false;
    const active = {
      guardId: call.guardId,
      stop: () => {
        if (stopped) return;
        stopped = true;
        try {
          source.stop();
        } catch {
          /* Already ended. */
        }
        nodes.forEach((n) => n.disconnect());
        if (this.active === active) this.active = undefined;
      },
    };
    this.active = active;
    source.onended = active.stop;
    source.start();
  }
  dispose() {
    this.disposed = true;
    this.abort.abort();
    this.stop();
    this.output?.disconnect();
    void this.context?.close().catch(() => {});
    this.context = null;
    this.output = null;
    this.buffers.clear();
    this.bytes.clear();
  }
}
