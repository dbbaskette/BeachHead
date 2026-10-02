import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBunker, throwGrenade } from './simulation';
import { GuardVoiceDirector } from './guard-voices';
import { BunkerVoiceAudio } from './voice-audio';

function setup() {
  const b = createBunker();
  b.status = 'playing';
  b.x = 0;
  b.z = 10;
  b.yaw = 0;
  b.guards = b.guards.slice(0, 2);
  b.guards.forEach((g, i) => {
    g.x = i * 2;
    g.z = 6;
    g.mode = 'idle';
  });
  return b;
}
void test('spotted-player barks arbitrate nearest speaker, alternate phrases and do not repeat every frame', () => {
  const b = setup(),
    director = new GuardVoiceDirector();
  assert.equal(director.update(b), undefined);
  b.guards.forEach((g) => {
    g.mode = 'engage';
  });
  b.time = 1;
  const call = director.update(b)!;
  assert.equal(call.guardId, b.guards[0].id);
  assert.equal(call.phrase, 'achtung');
  for (let i = 0; i < 100; i++) {
    b.time += 0.05;
    assert.equal(director.update(b), undefined);
  }
  b.guards[1].mode = 'idle';
  director.update(b);
  b.time = 12;
  b.guards[1].mode = 'engage';
  const next = director.update(b)!;
  assert.equal(next.phrase, 'da-ist-er');
  assert.ok(next.pan > 0);
});
void test('survivors warn about hits; dead and distant guards never speak', () => {
  const b = setup(),
    director = new GuardVoiceDirector();
  director.update(b);
  b.guards[0].hits++;
  b.time = 1;
  assert.equal(director.update(b)?.phrase, 'deckung');
  b.time = 12;
  b.guards[0].hits++;
  b.guards[0].health = 0;
  b.guards[1].z = -40;
  b.guards[1].mode = 'engage';
  assert.equal(director.update(b), undefined);
});
void test('visible nearby grenades override chatter cooldown but each grenade gets only one warning', () => {
  const b = setup(),
    director = new GuardVoiceDirector();
  b.guards[0].mode = 'engage';
  assert.equal(director.update(b)?.phrase, 'achtung');
  b.time = 1.5;
  throwGrenade(b);
  b.activeGrenades[0].z = 7;
  assert.equal(director.update(b)?.phrase, 'granate');
  b.time = 12;
  assert.equal(director.update(b), undefined);
  b.activeGrenades[0].id = 20;
  assert.equal(director.update(b)?.phrase, 'weg-da');
  b.time = 24;
  b.activeGrenades[0].id = 21;
  b.activeGrenades[0].z = -30;
  assert.equal(director.update(b), undefined);
});
void test('search lines wait for lost contact, do not repeat, and pause/retry reset scheduling', () => {
  const b = setup(),
    director = new GuardVoiceDirector();
  director.update(b);
  b.guards[0].mode = 'search';
  b.guards[0].memory = 4;
  assert.equal(director.update(b), undefined);
  b.time = 1.3;
  assert.equal(director.update(b)?.phrase, 'wo-ist-er');
  b.time = 20;
  assert.equal(director.update(b), undefined);
  b.status = 'paused';
  b.guards[1].mode = 'engage';
  assert.equal(director.update(b), undefined);
  director.reset();
  b.status = 'playing';
  b.time = 0;
  assert.equal(director.update(b)?.phrase, 'achtung');
});

class Param {
  value = 0;
  setTargetAtTime(v: number) {
    this.value = v;
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
  buffer: unknown;
  stopped = false;
  onended?: () => void;
  start() {}
  stop() {
    this.stopped = true;
    this.onended?.();
  }
}
class Context {
  static all: Context[] = [];
  state = 'suspended';
  currentTime = 0;
  destination = new Node();
  sources: Source[] = [];
  constructor() {
    Context.all.push(this);
  }
  async resume() {
    this.state = 'running';
  }
  async close() {
    this.state = 'closed';
  }
  createGain() {
    return Object.assign(new Node(), { gain: new Param() });
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
  createDelay() {
    return Object.assign(new Node(), { delayTime: new Param() });
  }
  async decodeAudioData() {
    return {};
  }
}
void test('voice audio requires a gesture, limits overlap, and stops immediately on mute, death, pause and disposal', async () => {
  const original = globalThis.AudioContext,
    fetch = globalThis.fetch;
  Object.defineProperty(globalThis, 'AudioContext', {
    configurable: true,
    value: Context,
  });
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2]));
  const audio = new BunkerVoiceAudio();
  const call = {
    guardId: 1,
    phrase: 'achtung' as const,
    priority: 1,
    pan: 0,
    distance: 5,
    occluded: false,
  };
  try {
    await audio.preload();
    assert.equal(Context.all.length, 0);
    audio.setPaused(false);
    await audio.start();
    const ctx = Context.all[0];
    audio.play(call);
    audio.play(call);
    assert.equal(ctx.sources.length, 1);
    audio.play({ ...call, phrase: 'granate', priority: 3 });
    assert.equal(ctx.sources.length, 2);
    assert.ok(ctx.sources[0].stopped);
    audio.setEnabled(false);
    assert.ok(ctx.sources[1].stopped);
    audio.play(call);
    assert.equal(ctx.sources.length, 2);
    audio.setEnabled(true);
    audio.play(call);
    audio.stopDeadSpeakers([{ id: 1, health: 0 }]);
    assert.ok(ctx.sources[2].stopped);
    audio.play(call);
    audio.setPaused(true);
    assert.ok(ctx.sources[3].stopped);
    audio.play(call);
    assert.equal(ctx.sources.length, 4);
    audio.setPaused(false);
    audio.play(call);
    audio.dispose();
    assert.equal(ctx.state, 'closed');
    assert.ok(ctx.sources.every((s) => s.stopped && s.disconnected));
  } finally {
    audio.dispose();
    globalThis.fetch = fetch;
    Object.defineProperty(globalThis, 'AudioContext', {
      configurable: true,
      value: original,
    });
  }
});
