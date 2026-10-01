import type { Guard } from './simulation';
const smooth = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};
/** Loss of balance with a knee buckle, followed by a animated fall.
 * Small hit flinches never launch a body; death direction/pose varies by wound. */
export function guardReaction(g: Guard) {
  const hit = Math.sin(Math.min(1, g.hitTime / 0.32) * Math.PI);
  if (g.health > 0)
    return {
      pitch: hit * (g.hitRegion === 'head' ? -0.09 : 0.065),
      roll: hit * (g.id % 2 ? -0.06 : 0.06),
      height: 0,
      knees: g.hitRegion === 'leg' ? hit * 0.2 : 0,
      fold: hit * 0.12,
      fall: 0,
      side: 0,
    };
  const fall = smooth((g.down - 0.16) / 0.84),
    buckle =
      Math.sin(Math.PI * smooth(g.down / 0.8)) *
      (g.hitRegion === 'leg' ? 0.5 : 0.3);
  const side = g.hitRegion === 'head' ? 0 : g.id % 2 ? 1 : -1;
  return {
    pitch: fall * (side ? -0.35 : -1.5),
    roll: fall * side * 1.48,
    height: fall * 0.16 - buckle * 0.35,
    knees: buckle + fall * 0.12,
    fold: buckle * 0.65,
    fall,
    side,
  };
}
