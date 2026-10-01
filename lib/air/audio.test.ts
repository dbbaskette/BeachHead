import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AirAudio } from './audio';
import { startAirBattle } from './simulation';

class Param {
  value = 0;
  setTargetAtTime(value: number) {
    this.value = value;
  }
}
class Node {
  disconnected = false;
  connect<T>(n: T) {
    return n;
  }
  disconnect() {
    this.disconnected = true;
  }
}
class Source extends Node {
  playbackRate = new Param();
  loop = false;
  buffer: unknown;
  onended: (() => void) | null = null;
  stopped = false;
  start() {}
  stop() {
    this.stopped = true;
    this.onended?.();
  }
}
class Context {
  static all: Context[] = [];
  static wait: (() => Promise<void>) | null = null;
  state = 'suspended';
  sampleRate = 8000;
  currentTime = 0;
  destination = new Node();
  sources: Source[] = [];
  gains: Array<Node & { gain: Param }> = [];
  closed = false;
  constructor() {
    Context.all.push(this);
  }
  async resume() {
    await Context.wait?.();
    this.state = 'running';
  }
  async close() {
    this.closed = true;
    this.state = 'closed';
  }
  createGain() {
    const n = Object.assign(new Node(), { gain: new Param() });
    this.gains.push(n);
    return n;
  }
  createDynamicsCompressor() {
    return Object.assign(new Node(), {
      threshold: new Param(),
      ratio: new Param(),
    });
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  createBufferSource() {
    const n = new Source();
    this.sources.push(n);
    return n;
  }
  createBiquadFilter() {
    return Object.assign(new Node(), { frequency: new Param() });
  }
  createStereoPanner() {
    return Object.assign(new Node(), { pan: new Param() });
  }
  async decodeAudioData() {
    return this.createBuffer(1, 100);
  }
}
void test('audio is gesture-started, bounded, quiet on pause, reused on retry and fully disposed', async () => {
  const original = globalThis.AudioContext,
    fetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: Context,
  });
  globalThis.fetch = async () =>
    new Response(new Uint8Array([1, 2]), { status: 200 });
  const audio = new AirAudio();
  try {
    await audio.preload();
    assert.equal(Context.all.length, 0);
    await audio.start();
    const c = Context.all[0];
    assert.equal(AirAudio.live, 1);
    const b = startAirBattle();
    for (let i = 0; i < 40; i++) audio.event({ type: 'damage', amount: 10 }, b);
    assert.equal(audio.count, 12);
    assert.equal(c.sources.filter((s) => !s.stopped).length, 13);
    audio.setPaused(true);
    assert.equal(audio.count, 0);
    assert.equal(c.gains[0].gain.value, 0);
    audio.event({ type: 'damage', amount: 10 }, b);
    assert.equal(audio.count, 0);
    audio.setPaused(false);
    audio.setMuted(true);
    audio.event({ type: 'bomb-release', position: b.aircraft.position }, b);
    assert.equal(audio.count, 0);
    audio.setMuted(false);
    await audio.start();
    assert.equal(Context.all.length, 1);
    audio.reset();
    audio.dispose();
    audio.dispose();
    assert.equal(AirAudio.live, 0);
    assert.equal(c.closed, true);
    assert.ok(c.sources.every((s) => s.stopped));
  } finally {
    audio.dispose();
    globalThis.fetch = fetch;
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: original,
    });
  }
});
void test('a pending gesture resume cannot unpause or resurrect a disposed mission', async () => {
  const original = globalThis.AudioContext,
    fetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: Context,
  });
  globalThis.fetch = async () =>
    new Response(new Uint8Array([1]), { status: 200 });
  let finish!: () => void;
  Context.wait = () =>
    new Promise<void>((resolve) => {
      finish = resolve;
    });
  const audio = new AirAudio();
  try {
    const pending = audio.start();
    audio.setPaused(true);
    finish();
    await pending;
    assert.equal(Context.all.at(-1)!.gains[0].gain.value, 0);
    audio.dispose();
    await audio.start();
    assert.equal(AirAudio.live, 0);
    const other = new AirAudio();
    const start = other.start();
    other.dispose();
    finish();
    await start;
    assert.equal(AirAudio.live, 0);
  } finally {
    Context.wait = null;
    audio.dispose();
    globalThis.fetch = fetch;
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: original,
    });
  }
});
