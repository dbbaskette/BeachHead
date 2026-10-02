import {
  sightLine,
  worldSolids,
  type BunkerState,
  type GuardMode,
} from './simulation';

export const guardPhrases = {
  alert: ['achtung', 'da-ist-er'],
  cover: ['deckung', 'beschuss'],
  grenade: ['granate', 'weg-da'],
  search: ['wo-ist-er', 'sucht-ihn'],
} as const;
export type GuardPhrase =
  (typeof guardPhrases)[keyof typeof guardPhrases][number];
export type GuardCallout = {
  guardId: number;
  phrase: GuardPhrase;
  priority: number;
  pan: number;
  distance: number;
  occluded: boolean;
};
type Memory = {
  mode: GuardMode;
  hits: number;
  entered: number;
  spokeAt: number;
  searched: boolean;
};

/** Simulation-time scheduling: no queued barks survive a pause, death, or retry. */
export class GuardVoiceDirector {
  private guards = new Map<number, Memory>();
  private warnedGrenades = new Set<number>();
  private lastSpoken = -100;
  private variation = new Map<string, number>();
  reset() {
    this.guards.clear();
    this.warnedGrenades.clear();
    this.lastSpoken = -100;
    this.variation.clear();
  }
  update(b: BunkerState): GuardCallout | undefined {
    if (b.status !== 'playing') return;
    const solids = worldSolids(b);
    const candidates: (GuardCallout & {
      kind: keyof typeof guardPhrases;
      grenadeId?: number;
    })[] = [];
    for (const id of this.warnedGrenades)
      if (!b.activeGrenades.some((p) => p.id === id))
        this.warnedGrenades.delete(id);
    for (const g of b.guards) {
      const old = this.guards.get(g.id) ?? {
        mode: 'idle' as const,
        hits: 0,
        entered: b.time,
        spokeAt: -100,
        searched: false,
      };
      const changed = old.mode !== g.mode;
      const newlyAlert = changed && g.mode === 'engage';
      const hit = g.hits > old.hits;
      if (changed) {
        old.entered = b.time;
        old.searched = false;
      }
      old.mode = g.mode;
      old.hits = g.hits;
      this.guards.set(g.id, old);
      if (g.health <= 0) continue;
      const dx = g.x - b.x,
        dz = g.z - b.z,
        distance = Math.hypot(dx, dz);
      if (distance > 22) continue;
      const occluded = !sightLine(g.x, g.z, b.x, b.z, solids);
      // Thick walls should not announce guards from distant rooms.
      if (occluded && distance > 10) continue;
      const grenade = b.activeGrenades.find(
        (p) =>
          !this.warnedGrenades.has(p.id) &&
          p.fuse > 0.25 &&
          Math.hypot(p.x - g.x, p.z - g.z) < 6 &&
          sightLine(g.x, g.z, p.x, p.z, solids),
      );
      let kind: keyof typeof guardPhrases | undefined;
      if (grenade && b.time - old.spokeAt > 1.2 && b.time - this.lastSpoken > 1)
        kind = 'grenade';
      else if (b.time - old.spokeAt >= 9 && b.time - this.lastSpoken >= 3.6) {
        if (hit) kind = 'cover';
        else if (newlyAlert) kind = 'alert';
        else if (
          g.mode === 'search' &&
          !old.searched &&
          b.time - old.entered > 1.2 &&
          g.memory > 0
        )
          kind = 'search';
      }
      if (!kind) continue;
      const choices = guardPhrases[kind];
      candidates.push({
        guardId: g.id,
        kind,
        phrase: choices[(this.variation.get(kind) ?? 0) % choices.length],
        priority:
          kind === 'grenade'
            ? 3
            : kind === 'cover'
              ? 2
              : kind === 'alert'
                ? 1
                : 0,
        pan: Math.max(
          -0.95,
          Math.min(
            0.95,
            (dx * Math.cos(b.yaw) - dz * Math.sin(b.yaw)) /
              Math.max(2, distance),
          ),
        ),
        distance,
        occluded,
        grenadeId: kind === 'grenade' ? grenade!.id : undefined,
      });
    }
    candidates.sort(
      (a, c) => c.priority - a.priority || a.distance - c.distance,
    );
    const winner = candidates[0];
    if (!winner) return;
    this.lastSpoken = b.time;
    const memory = this.guards.get(winner.guardId)!;
    memory.spokeAt = b.time;
    if (winner.kind === 'search') memory.searched = true;
    if (winner.grenadeId !== undefined)
      this.warnedGrenades.add(winner.grenadeId);
    this.variation.set(winner.kind, (this.variation.get(winner.kind) ?? 0) + 1);
    return winner;
  }
}
