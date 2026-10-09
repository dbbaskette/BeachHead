import { useSyncExternalStore } from 'react';

/** Player preferences shared by every stage and kept between visits. */
export type Settings = { muted: boolean; reducedMotion: boolean };
/** Only what the player has chosen; an absent key follows its default. */
export type SavedSettings = Partial<Settings>;

export const SETTINGS_KEY = 'beach-head:settings';
export const DEFAULT_SETTINGS: Settings = {
  muted: false,
  reducedMotion: false,
};
const MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Missing, corrupt or foreign values are ignored rather than trusted. */
export function parseSettings(raw: string | null | undefined): SavedSettings {
  const saved: SavedSettings = {};
  if (!raw) return saved;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return saved;
    const { muted, reducedMotion } = value as Record<string, unknown>;
    if (typeof muted === 'boolean') saved.muted = muted;
    if (typeof reducedMotion === 'boolean') saved.reducedMotion = reducedMotion;
  } catch {
    /* Unreadable settings fall back to the defaults. */
  }
  return saved;
}

export const serializeSettings = ({ muted, reducedMotion }: SavedSettings) =>
  JSON.stringify({ muted, reducedMotion });

/** Camera motion follows the system preference until the player chooses. */
export const resolveSettings = (
  saved: SavedSettings,
  prefersReducedMotion: boolean,
): Settings => ({
  muted: saved.muted ?? DEFAULT_SETTINGS.muted,
  reducedMotion: saved.reducedMotion ?? prefersReducedMotion,
});

/** The browser facilities the store needs; any of them may be missing or throw. */
export interface SettingsHost {
  storage(): Pick<Storage, 'getItem' | 'setItem'> | null | undefined;
  prefersReducedMotion(): boolean;
  /** Reports settings saved by another tab and system motion-preference changes. */
  watch(saved: (raw: string | null) => void, motion: () => void): () => void;
}

/**
 * Settings live in memory and are mirrored to storage when it is available, so
 * they carry across stages even where storage is blocked (private browsing).
 * Nothing touches the host until the first read, which keeps module load and
 * pre-rendering free of browser globals.
 */
export function createSettingsStore(host: SettingsHost) {
  let saved: SavedSettings | null = null,
    current = DEFAULT_SETTINGS,
    unwatch: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const update = (next: SavedSettings) => {
    saved = next;
    let prefersReducedMotion = false;
    try {
      prefersReducedMotion = host.prefersReducedMotion();
    } catch {
      /* No media queries here: keep full camera motion unless chosen. */
    }
    const value = resolveSettings(next, prefersReducedMotion);
    if (
      value.muted === current.muted &&
      value.reducedMotion === current.reducedMotion
    )
      return false;
    current = value;
    return true;
  };
  const load = () => {
    if (saved) return saved;
    let raw: string | null = null;
    try {
      raw = host.storage()?.getItem(SETTINGS_KEY) ?? null;
    } catch {
      /* Blocked storage: settings last for this visit only. */
    }
    const next = parseSettings(raw);
    update(next);
    return next;
  };
  const apply = (next: SavedSettings) => {
    if (update(next)) for (const listener of listeners) listener();
  };
  return {
    /** A stable snapshot: the same object until a setting changes. */
    get: (): Settings => {
      load();
      return current;
    },
    set: (change: SavedSettings) => {
      const next = { ...load(), ...change };
      try {
        host.storage()?.setItem(SETTINGS_KEY, serializeSettings(next));
      } catch {
        /* Private mode or a full quota: the choice still holds in memory. */
      }
      apply(next);
    },
    subscribe: (listener: () => void) => {
      // Later changes are reported against what is saved at this moment.
      load();
      listeners.add(listener);
      unwatch ??= host.watch(
        (raw) => apply(parseSettings(raw)),
        () => apply(load()),
      );
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        unwatch?.();
        unwatch = null;
      };
    },
  };
}
export type SettingsStore = ReturnType<typeof createSettingsStore>;

export const settings = createSettingsStore({
  storage: () => window.localStorage,
  prefersReducedMotion: () => window.matchMedia(MOTION_QUERY).matches,
  watch(saved, motion) {
    const media = window.matchMedia(MOTION_QUERY);
    const stored = (e: StorageEvent) => {
      if (e.key === SETTINGS_KEY) saved(e.newValue);
    };
    window.addEventListener('storage', stored);
    media.addEventListener('change', motion);
    return () => {
      window.removeEventListener('storage', stored);
      media.removeEventListener('change', motion);
    };
  },
});

const serverSettings = () => DEFAULT_SETTINGS;
/**
 * Pre-rendered and hydrating markup always uses the defaults; React swaps in
 * the saved values immediately after hydration, so the two never mismatch.
 */
export function useSettings(store: SettingsStore = settings): Settings {
  return useSyncExternalStore(store.subscribe, store.get, serverSettings);
}
