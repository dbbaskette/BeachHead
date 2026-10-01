import type { Guard } from './simulation';
export const PELVIS_HEIGHT = 0.9;
/** Small live posture adjustments. Fatal movement is solved per joint in ragdoll.ts. */
export function guardReaction(g: Guard) {
  const age = 0.42 - g.hitTime;
  const hit =
    g.hitTime > 0
      ? Math.sin((Math.min(1, age / 0.09) * Math.PI) / 2) *
        Math.exp(-age * 5) *
        (g.hitTime / 0.42)
      : 0;
  const localX =
    Math.cos(g.yaw) * g.hitDirection.x - Math.sin(g.yaw) * g.hitDirection.z;
  const localZ =
    Math.sin(g.yaw) * g.hitDirection.x + Math.cos(g.yaw) * g.hitDirection.z;

  const startled = Math.sin((g.startle / 0.48) * Math.PI) * 0.045;
  return {
    pitch: hit * localZ * (g.hitRegion === 'head' ? 0.22 : 0.14),
    roll: -hit * (localX * 0.15 + g.hitSide * 0.1),
    height:
      PELVIS_HEIGHT - startled - hit * (g.hitRegion === 'leg' ? 0.1 : 0.025),
    knees: hit * (g.hitRegion === 'leg' ? 0.42 : 0.08) + startled,
    fold: hit * 0.13 + g.readiness * 0.035,
    yaw: -hit * g.hitSide * 0.16,
    twist: -hit * g.hitSide * 0.24,
  };
}
