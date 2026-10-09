import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  parseSettings,
  resolveSettings,
  serializeSettings,
  SETTINGS_KEY,
  settings,
  useSettings,
  type SettingsHost,
} from './settings';

/** A browser stand-in: a key/value store, a system preference and the two change signals. */
function fakeHost(initial: string | null = null, prefersReducedMotion = false) {
  const data = new Map<string, string>();
  if (initial !== null) data.set(SETTINGS_KEY, initial);
  const host: {
    data: Map<string, string>;
    prefersReducedMotion: boolean;
    watchers: number;
    otherTabSaved: (raw: string | null) => void;
    systemMotionChanged: () => void;
  } = {
    data,
    prefersReducedMotion,
    watchers: 0,
    otherTabSaved: () => {},
    systemMotionChanged: () => {},
  };
  const api: SettingsHost = {
    storage: () => ({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
    }),
    prefersReducedMotion: () => host.prefersReducedMotion,
    watch(saved, motion) {
      host.watchers++;
      host.otherTabSaved = saved;
      host.systemMotionChanged = motion;
      return () => {
        host.watchers--;
      };
    },
  };
  return { host, api, store: createSettingsStore(api) };
}

void test('unusable saved values are ignored instead of trusted', () => {
  for (const raw of [
    null,
    undefined,
    '',
    'not json',
    '{"muted":',
    'null',
    'true',
    '7',
    '"muted"',
    '[true,false]',
    '{"muted":"yes","reducedMotion":1}',
    '{"muted":null,"reducedMotion":null}',
  ])
    assert.deepEqual(parseSettings(raw), {}, String(raw));
  assert.deepEqual(parseSettings('{"muted":true,"reducedMotion":"on"}'), {
    muted: true,
  });
  assert.deepEqual(parseSettings('{"reducedMotion":false,"volume":11}'), {
    reducedMotion: false,
  });
});

void test('saved settings round-trip and keep only what the player chose', () => {
  for (const saved of [
    {},
    { muted: true },
    { reducedMotion: false },
    { muted: false, reducedMotion: true },
  ])
    assert.deepEqual(parseSettings(serializeSettings(saved)), saved);
  assert.equal(serializeSettings({}), '{}');
  assert.equal(
    serializeSettings({ muted: true, extra: 1 } as { muted: boolean }),
    '{"muted":true}',
  );
});

void test('camera motion follows the system preference until the player chooses', () => {
  assert.deepEqual(resolveSettings({}, false), DEFAULT_SETTINGS);
  assert.deepEqual(resolveSettings({}, true), {
    muted: false,
    reducedMotion: true,
  });
  assert.equal(
    resolveSettings({ reducedMotion: false }, true).reducedMotion,
    false,
  );
  assert.equal(
    resolveSettings({ reducedMotion: true }, false).reducedMotion,
    true,
  );
  assert.equal(resolveSettings({ muted: true }, true).muted, true);
});

void test('a new visit starts from what the previous visit saved', () => {
  const first = fakeHost();
  assert.deepEqual(first.store.get(), DEFAULT_SETTINGS);
  first.store.set({ muted: true });
  assert.deepEqual(first.store.get(), { muted: true, reducedMotion: false });
  assert.equal(first.host.data.get(SETTINGS_KEY), '{"muted":true}');
  first.store.set({ reducedMotion: true });
  assert.deepEqual(parseSettings(first.host.data.get(SETTINGS_KEY)), {
    muted: true,
    reducedMotion: true,
  });

  const reload = fakeHost(first.host.data.get(SETTINGS_KEY));
  assert.deepEqual(reload.store.get(), { muted: true, reducedMotion: true });
});

void test('an explicit camera motion choice outlives the system preference', () => {
  const unset = fakeHost(null, true);
  assert.equal(unset.store.get().reducedMotion, true);
  unset.store.set({ muted: true });
  assert.equal(
    unset.host.data.get(SETTINGS_KEY),
    '{"muted":true}',
    'muting must not freeze the motion default',
  );
  unset.store.set({ reducedMotion: false });
  assert.equal(unset.store.get().reducedMotion, false);

  const reload = fakeHost(unset.host.data.get(SETTINGS_KEY), true);
  assert.deepEqual(reload.store.get(), { muted: true, reducedMotion: false });
});

void test('the snapshot is stable until a setting really changes', () => {
  const { store } = fakeHost('{"muted":true}');
  let notified = 0;
  const unsubscribe = store.subscribe(() => notified++);
  const before = store.get();
  assert.equal(store.get(), before);
  store.set({ muted: true });
  assert.equal(store.get(), before);
  assert.equal(notified, 0);
  store.set({ muted: false });
  assert.notEqual(store.get(), before);
  assert.equal(notified, 1);
  unsubscribe();
  store.set({ muted: true });
  assert.equal(notified, 1);
  assert.equal(store.get().muted, true);

  assert.equal(
    fakeHost().store.get(),
    DEFAULT_SETTINGS,
    'default settings reuse the pre-rendered snapshot, so hydration has nothing to redo',
  );
});

void test('settings still carry across stages when storage is unavailable', () => {
  const blocked = () => {
    throw new Error('SecurityError');
  };
  const watch = () => () => {};
  const hosts: SettingsHost[] = [
    { storage: blocked, prefersReducedMotion: () => false, watch },
    { storage: () => null, prefersReducedMotion: () => false, watch },
    { storage: () => undefined, prefersReducedMotion: blocked, watch },
    {
      storage: () => ({ getItem: blocked, setItem: blocked }),
      prefersReducedMotion: () => false,
      watch,
    },
    {
      storage: () => ({ getItem: () => '{"muted":false}', setItem: blocked }),
      prefersReducedMotion: () => false,
      watch,
    },
  ];
  for (const host of hosts) {
    const store = createSettingsStore(host);
    assert.deepEqual(store.get(), DEFAULT_SETTINGS);
    let notified = 0;
    store.subscribe(() => notified++);
    store.set({ muted: true });
    store.set({ reducedMotion: true });
    assert.deepEqual(store.get(), { muted: true, reducedMotion: true });
    assert.equal(notified, 2);
  }
});

void test('corrupt storage falls back to defaults and is repaired by the next change', () => {
  const { host, store } = fakeHost('{"muted":"loud"', true);
  assert.deepEqual(store.get(), { muted: false, reducedMotion: true });
  store.set({ muted: true });
  assert.equal(host.data.get(SETTINGS_KEY), '{"muted":true}');
});

void test('changes from another tab and from the system preference arrive live', () => {
  const { host, store } = fakeHost();
  const seen: boolean[][] = [];
  const record = () => seen.push(Object.values(store.get()));
  assert.equal(host.watchers, 0, 'nothing is observed before a stage mounts');
  const stopFirst = store.subscribe(record);
  const stopSecond = store.subscribe(() => {});
  assert.equal(host.watchers, 1);

  host.prefersReducedMotion = true;
  host.systemMotionChanged();
  host.otherTabSaved('{"muted":true}');
  host.otherTabSaved('{"muted":true,"reducedMotion":false}');
  host.systemMotionChanged();
  host.otherTabSaved(null);
  assert.deepEqual(seen, [
    [false, true],
    [true, true],
    [true, false],
    [false, true],
  ]);

  stopFirst();
  assert.equal(host.watchers, 1);
  stopSecond();
  assert.equal(host.watchers, 0);
  const stopThird = store.subscribe(record);
  assert.equal(host.watchers, 1);
  stopThird();
});

void test('pre-rendered markup uses the defaults whatever the browser has saved', () => {
  const { store } = fakeHost('{"muted":true,"reducedMotion":true}');
  const Probe = () => {
    const { muted, reducedMotion } = useSettings(store);
    return createElement('p', null, `${muted}/${reducedMotion}`);
  };
  assert.equal(
    renderToStaticMarkup(createElement(Probe)),
    '<p>false/false</p>',
  );
  assert.deepEqual(store.get(), { muted: true, reducedMotion: true });
});

void test('the shared store is inert without a browser', () => {
  assert.deepEqual(settings.get(), DEFAULT_SETTINGS);
  settings.set({ muted: true });
  assert.equal(settings.get().muted, true);
  settings.set({ muted: false });
  assert.equal(settings.get(), settings.get());
});
