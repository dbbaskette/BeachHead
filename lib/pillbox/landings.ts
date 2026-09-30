import {
  LANES,
  WAVE_COUNTS,
  type LandingCraft,
  type PillboxBattle,
} from './types';
import { beachHeight } from './terrain';
export const BERTH_Z = -140;
export const RAMP_END_Z = -132;
export const RAMP_LENGTH = Math.hypot(
  RAMP_END_Z - (BERTH_Z + 6),
  0.72 - beachHeight(0, RAMP_END_Z),
);
export const RAMP_ANGLE = Math.atan2(
  RAMP_END_Z - (BERTH_Z + 6),
  beachHeight(0, RAMP_END_Z) - 0.72,
);
export function nextInfantryId(wave: number, spawned: number) {
  return (
    WAVE_COUNTS.slice(0, wave - 1).reduce((sum, n) => sum + n, 0) + spawned + 1
  );
}
export function infantryLane(id: number, wave: number) {
  return (id * 2 + wave) % LANES.length;
}
export function createLandingCraft(wave: number): LandingCraft[] {
  return LANES.map((x, lane) => {
    const capacity = Array.from({ length: WAVE_COUNTS[wave - 1] }, (_, i) =>
      infantryLane(nextInfantryId(wave, i), wave),
    ).filter((l) => l === lane).length;
    return {
      id: wave * 10 + lane,
      lane,
      x,
      z: -174 - ((lane + 2) % 5) * 7,
      capacity,
      passengers: capacity,
      ramp: 0,
      phase: 'approach',
    };
  });
}
export function updateLandingCraft(battle: PillboxBattle, dt: number) {
  for (const craft of battle.landingCraft) {
    if (craft.phase === 'approach') {
      craft.z = Math.min(BERTH_Z, craft.z + dt * 8);
      if (craft.z === BERTH_Z) craft.phase = 'lowering';
    } else if (craft.phase === 'lowering') {
      craft.ramp = Math.min(1, craft.ramp + dt / 1.2);
      if (craft.ramp === 1) craft.phase = 'unloading';
    } else if (
      craft.phase === 'unloading' &&
      craft.passengers === 0 &&
      !battle.soldiers.some(
        (s) => s.landingCraftId === craft.id && s.phase === 'advance',
      )
    ) {
      craft.phase = 'withdrawing';
    } else if (craft.phase === 'withdrawing') {
      craft.ramp = Math.max(0, craft.ramp - dt);
      // Raise the ramp before applying reverse thrust.
      if (craft.ramp === 0) craft.z -= dt * 5;
      if (craft.z <= -225) craft.phase = 'gone';
    }
  }
}
export function landingDeckHeight(z: number, x: number) {
  const progress = Math.max(
    0,
    Math.min(1, (z - (BERTH_Z + 6)) / (RAMP_END_Z - (BERTH_Z + 6))),
  );
  return 0.72 + (beachHeight(x, RAMP_END_Z) - 0.72) * progress;
}
