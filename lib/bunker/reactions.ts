import type { Guard } from './simulation';
export const PELVIS_HEIGHT = 0.9;
const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
/** Authored impact → balance loss → contact → settle. Each action has its own
 * silhouette and rhythm, with finite, immutable end poses. */
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
      pitch: hit * localZ * (g.hitRegion === 'head' ? 0.22 : 0.14),
      roll: -hit * (localX * 0.15 + g.hitSide * 0.1),
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
      yaw: -hit * g.hitSide * 0.16,
      travel: 0,
      spread: 0,
      twist: -hit * g.hitSide * 0.24,
      armRelease: 0,
    };
  }
  const action = g.deathAction;
  const kneel = action === 'kneel',
    spin = action === 'spin',
    reel = action === 'reel';
  const side = g.fallStyle === 'left' ? -1 : g.fallStyle === 'right' ? 1 : 0;
  // A fast flinch precedes the fall. The accelerating descent avoids a slow board-like tip.
  const start = kneel ? 0.34 : reel ? 0.22 : spin ? 0.24 : 0.09;
  const contact = kneel ? 0.82 : spin ? 0.8 : reel ? 0.74 : 0.65;
  const t = Math.max(0, Math.min(1, (g.down - start) / (contact - start)));
  const fall = smooth(Math.pow(t, 1.25));
  const impact = Math.sin(Math.PI * smooth(g.down / 0.32)) * (1 - fall);
  const buckle =
    Math.sin(Math.PI * smooth(g.down / contact)) *
    (kneel ? 0.85 : action === 'fold' ? 0.6 : 0.22);
  const settle = Math.max(0, (g.down - contact) / (1 - contact));
  const bounce = Math.sin(settle * Math.PI * 2) * Math.exp(-settle * 5) * 0.025;
  const forward = g.fallStyle === 'front' || g.fallStyle === 'kneel';
  const spread = action === 'sprawl' ? 0.4 : reel ? 0.28 : spin ? 0.32 : 0.13;
  return {
    pitch:
      fall * (side ? -0.12 : forward ? -1.52 : 1.52) +
      impact * (action === 'fold' ? -0.32 : reel ? 0.2 : 0.08),
    roll:
      -fall * side * 1.52 +
      impact * (spin ? 0.19 : 0.07) * (g.deathTurn < 0 ? -1 : 1),
    height: PELVIS_HEIGHT * (1 - fall) + 0.23 * fall - buckle * 0.36 + bounce,
    knees: buckle,
    fold:
      buckle * (action === 'fold' ? 0.85 : 0.35) +
      impact * (reel ? -0.18 : spin ? 0.15 : 0.05) +
      fall * (forward ? 0.12 : -0.055),
    fall,
    side,
    leftHip: -buckle * 0.7 - fall * (spin ? 0.4 : 0.08),
    rightHip: -buckle * 0.6 - fall * (action === 'fold' ? 0.38 : 0.15),
    leftKnee: buckle * 1.5 + fall * (spin ? 0.6 : 0.12),
    rightKnee: buckle * 1.3 + fall * (action === 'fold' ? 0.62 : 0.25),
    headTilt: fall * (g.id % 2 ? 0.27 : -0.24) + impact * (reel ? -0.16 : 0.1),
    settle,
    yaw: g.deathTurn * smooth((g.down - 0.04) / (spin ? 0.65 : 0.6)),
    travel: g.deathTravel * smooth((g.down - 0.035) / contact),
    spread: (side ? 0.035 : spread) * smooth(g.down / contact),
    twist:
      Math.sin(Math.PI * smooth(g.down / contact)) *
      (spin ? -0.5 : action === 'fold' ? 0.22 : 0.08),
    armRelease: smooth(g.down / 0.18),
  };
}

type Point = [number, number, number];
/** Elbow/wrist targets in the standing body frame. Late poses are deliberately
 * asymmetric: one arm overhead, an outstretched palm, or a bent arm beside the ribs. */
export function deathArmTarget(g: Guard, index: number): Point {
  const side = index < 2 ? -1 : 1,
    wrist = index % 2 === 1;
  const left = side < 0;
  let gesture: Point, rest: Point;
  switch (g.deathAction) {
    case 'reel':
      gesture = wrist
        ? [side * (left ? 0.25 : 0.72), left ? 1.98 : 1.65, -0.12]
        : [side * 0.42, left ? 1.52 : 1.33, -0.03];
      rest = wrist
        ? [side * (left ? 0.7 : 0.56), left ? 1.73 : 1.04, 0]
        : [side * 0.42, left ? 1.48 : 1.05, 0];
      break;
    case 'spin':
      gesture = wrist
        ? [side * (left ? 0.16 : 0.8), left ? 1.55 : 1.24, left ? -0.38 : 0.26]
        : [side * 0.43, 1.35, left ? -0.14 : 0.16];
      rest = wrist
        ? [side * (left ? 0.75 : 0.38), left ? 1.2 : 1.72, 0]
        : [side * 0.4, left ? 1.12 : 1.48, 0];
      break;
    case 'sprawl':
      gesture = wrist
        ? [side * 0.84, left ? 1.52 : 1.15, -0.12]
        : [side * 0.45, 1.3, -0.1];
      rest = wrist
        ? [side * 0.84, left ? 1.45 : 0.96, 0]
        : [side * 0.46, left ? 1.35 : 1.08, 0];
      break;
    case 'fold':
      gesture = wrist
        ? [side * 0.13, left ? 1.08 : 1.3, -0.27]
        : [side * 0.3, 1.05, -0.2];
      rest = wrist
        ? [side * (left ? 0.7 : 0.27), left ? 0.93 : 1.56, 0]
        : [side * 0.37, 1.16, 0];
      break;
    default:
      gesture = wrist ? [side * 0.48, 0.62, -0.4] : [side * 0.34, 0.96, -0.24];
      rest = wrist
        ? [side * 0.5, left ? 1.8 : 1.52, 0]
        : [side * 0.38, 1.45, 0];
  }
  const drop = smooth((g.down - 0.3) / 0.5);
  if (g.fallStyle === 'left' || g.fallStyle === 'right') {
    rest[2] = rest[0] * 0.85;
    rest[0] = side * 0.16;
  }
  return gesture.map((v, i) => v + (rest[i] - v) * drop) as Point;
}
