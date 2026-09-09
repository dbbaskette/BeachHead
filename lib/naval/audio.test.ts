import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { NavalAudio } from './audio';

class FakeAudioParam {
  value = 0;
  cancelScheduledValues(): void {}
  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }
  setTargetAtTime(value: number): void {
    this.value = value;
  }
  setValueAtTime(value: number): void {
    this.value = value;
  }
}

class FakeNode {
  disconnected = false;
  connect<T>(destination: T): T {
    return destination;
  }
  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGain extends FakeNode {
  gain = new FakeAudioParam();
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeAudioParam();
  Q = new FakeAudioParam();
}

class FakePanner extends FakeNode {
  pan = new FakeAudioParam();
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  playbackRate = new FakeAudioParam();
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeAudioParam();
  onended: (() => void) | null = null;
  start(): void {}
  stop(): void {}
}

class FakeBuffer {
  private readonly data: Float32Array;
  constructor(length: number) {
    this.data = new Float32Array(length);
  }
  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state: AudioContextState = 'suspended';
  currentTime = 2;
  sampleRate = 48000;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  filters: FakeFilter[] = [];
  panners: FakePanner[] = [];
  createdBuffers = 0;
  decodedBuffers = 0;
  closed = false;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }
  async close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
  }
  createGain(): FakeGain {
    return new FakeGain();
  }
  createDynamicsCompressor(): FakeGain & {
    threshold: FakeAudioParam;
    knee: FakeAudioParam;
    ratio: FakeAudioParam;
    attack: FakeAudioParam;
    release: FakeAudioParam;
  } {
    return Object.assign(new FakeGain(), {
      threshold: new FakeAudioParam(),
      knee: new FakeAudioParam(),
      ratio: new FakeAudioParam(),
      attack: new FakeAudioParam(),
      release: new FakeAudioParam(),
    });
  }
  createBuffer(_channels: number, length: number): FakeBuffer {
    this.createdBuffers += 1;
    return new FakeBuffer(length);
  }
  createBufferSource(): FakeSource {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  createBiquadFilter(): FakeFilter {
    const filter = new FakeFilter();
    this.filters.push(filter);
    return filter;
  }
  createStereoPanner(): FakePanner {
    const panner = new FakePanner();
    this.panners.push(panner);
    return panner;
  }
  createOscillator(): FakeOscillator {
    return new FakeOscillator();
  }
  async decodeAudioData(): Promise<FakeBuffer> {
    this.decodedBuffers += 1;
    return new FakeBuffer(32);
  }
}

const originalAudioContext = globalThis.AudioContext;
const originalFetch = globalThis.fetch;
let fetchCalls = 0;

void describe('NavalAudio', () => {
  beforeEach(() => {
    FakeAudioContext.instances = [];
    fetchCalls = 0;
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: FakeAudioContext,
    });
    globalThis.fetch = async () => {
      fetchCalls += 1;
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    };
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: originalAudioContext,
    });
    globalThis.fetch = originalFetch;
  });

  void test('preloads bytes without creating an AudioContext', async () => {
    const audio = new NavalAudio();
    await audio.preload();

    assert.equal(fetchCalls, 4);
    assert.equal(FakeAudioContext.instances.length, 0);
    audio.dispose();
  });

  void test('decodes assets after a user-start and applies spatial controls', async () => {
    const audio = new NavalAudio();
    await audio.preload();
    await audio.start();

    const context = FakeAudioContext.instances[0];
    assert.ok(context);
    assert.equal(context.state, 'running');
    assert.equal(context.decodedBuffers, 4);

    audio.play('impact', { pan: 3, distance: 1 });
    assert.equal(context.sources.length, 1);
    assert.equal(context.sources[0].started, true);
    assert.equal(context.panners[0].pan.value, 1);
    assert.equal(context.filters[0].frequency.value, 3500);

    audio.dispose();
    assert.equal(context.closed, true);
    assert.equal(context.sources[0].stopped, true);
  });

  void test('creates one fallback buffer and caps overlapping voices', async () => {
    globalThis.fetch = async () => new Response(null, { status: 404 });
    const audio = new NavalAudio();
    await audio.start();
    const context = FakeAudioContext.instances[0];

    for (let i = 0; i < 12; i++) audio.play('splash');

    assert.equal(context.createdBuffers, 1);
    assert.equal(context.sources.length, 12);
    assert.equal(context.sources[0].stopped, true);
    assert.equal(context.sources[1].stopped, true);
    assert.equal(context.sources[11].started, true);
    audio.dispose();
  });

  void test('mute and pause gate playback without creating or resuming a context', async () => {
    const audio = new NavalAudio();
    audio.setEnabled(false);
    audio.setEnabled(true);
    assert.equal(FakeAudioContext.instances.length, 0);

    // start() is the explicit user-gesture boundary even if the game was muted
    // before play began; unmuting later must not leave audio uninitialized.
    audio.setEnabled(false);
    await audio.start();
    const context = FakeAudioContext.instances[0];
    audio.play('fire');
    assert.equal(context.sources.length, 0);

    audio.setEnabled(true);
    audio.play('fire');
    assert.equal(context.sources.length, 1);

    audio.setPaused(true);
    assert.equal(context.sources[0].stopped, true);
    audio.play('fire');
    assert.equal(context.sources.length, 1);

    audio.setPaused(false);
    audio.play('fire');
    assert.equal(context.sources.length, 2);
    audio.dispose();
  });
});
