import type { Guard } from './simulation';
export const PELVIS_HEIGHT = 0.9;
const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
/** Pelvis-centered loss of support, then floor contact and a small damped settle.
 * Impact changes balance and pose, never launches the body like an explosion. */
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
  if (g.health > 0) {
    const startled = Math.sin((g.startle / 0.48) * Math.PI) * 0.045;
    return {
      pitch: hit * localZ * (g.hitRegion === 'head' ? 0.12 : 0.075),
      roll: -hit * localX * 0.095,
      height:
        PELVIS_HEIGHT - startled - hit * (g.hitRegion === 'leg' ? 0.1 : 0.025),
      knees: hit * (g.hitRegion === 'leg' ? 0.42 : 0.08) + startled,
      fold: hit * 0.13 + g.readiness * 0.035,
      fall: 0,
      side: 0,
      leftHip: 0,
      rightHip: 0,
      leftKnee: 0,
      rightKnee: 0,
      headTilt: 0,
      settle: 0,
    };
  }
  const kneel = g.fallStyle === 'kneel',
    side = g.fallStyle === 'left' ? -1 : g.fallStyle === 'right' ? 1 : 0;
  const fall = smooth((g.down - (kneel ? 0.28 : 0.12)) / (kneel ? 0.55 : 0.6));
  const buckle =
    Math.sin(Math.PI * smooth(g.down / (kneel ? 0.85 : 0.6))) *
    (kneel ? 0.68 : 0.23);
  const settle = Math.max(0, (g.down - 0.76) / 0.24);
  const bounce = Math.sin(settle * Math.PI * 2) * Math.exp(-settle * 6) * 0.026;
  const forward = g.fallStyle === 'front' || kneel;
  return {
    pitch: fall * (side ? -0.12 : forward ? -1.52 : 1.52),
    roll: -fall * side * 1.52,
    height: PELVIS_HEIGHT * (1 - fall) + 0.23 * fall - buckle * 0.35 + bounce,
    knees: buckle,
    fold: buckle * 0.4 + fall * (forward ? 0.12 : -0.055),
    fall,
    side,
    leftHip: -buckle * 0.7 - fall * (g.id % 2 ? 0.12 : 0.04),
    rightHip: -buckle * 0.6 - fall * (g.id % 2 ? 0.04 : 0.18),
    leftKnee: buckle * 1.5 + fall * (g.id % 2 ? 0.28 : 0.12),
    rightKnee: buckle * 1.3 + fall * (g.id % 2 ? 0.13 : 0.36),
    headTilt: fall * (g.id % 2 ? 0.18 : -0.16),
    settle,
  };
}
