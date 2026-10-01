import type { Guard } from './simulation';

export type FallModel = 'backward-stumble' | 'knee-buckle' | 'side-collapse';
export type FallPose = {
  hip: number;
  knee: number;
  shoulder: number;
  elbow: number;
  spread: number;
  brace: number;
  support: number;
  step: number;
};
const smooth = (a: number, b: number, t: number) => {
  const x = Math.max(0, Math.min(1, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};
/** Art-directed loss-of-support phases, inspired by fall mechanics rather than injury simulation. */
export function fallModel(g: Guard): FallModel {
  return g.deathAction === 'kneel' || g.deathAction === 'fold'
    ? 'knee-buckle'
    : g.deathAction === 'spin' || g.deathAction === 'sprawl'
      ? 'side-collapse'
      : 'backward-stumble';
}
export function fallPose(
  model: FallModel,
  age: number,
  leading: boolean,
): FallPose {
  const give = smooth(0.12, 0.55, age),
    release = 1 - smooth(0.55, 1.05, age);
  if (model === 'knee-buckle')
    return {
      hip: 0.2 + give * (leading ? 0.8 : 0.45),
      knee: 0.3 + give * (leading ? 1.65 : 1.1),
      shoulder: 0.4 + give * 0.5,
      elbow: 0.85 - give * 0.25,
      spread: leading ? 0.15 : 0.3,
      brace: release,
      support: 1 - smooth(0.12, leading ? 0.3 : 0.42, age),
      step: 0,
    };
  if (model === 'side-collapse')
    return {
      hip: 0.15 + give * (leading ? 0.55 : 0.15),
      knee: 0.25 + give * (leading ? 0.8 : 0.4),
      shoulder: leading ? 0.55 : 0.2,
      elbow: leading ? 0.45 : 1.05,
      spread: leading ? 0.8 : 0.22,
      brace: release,
      support: 1 - smooth(0.08, leading ? 0.17 : 0.28, age),
      step: leading ? 0.12 : 0,
    };
  return {
    hip: 0.1 + give * (leading ? 0.4 : 0.18),
    knee: 0.18 + give * (leading ? 0.65 : 0.35),
    shoulder: 0.45 + smooth(0, 0.18, age) * 0.8 - give * 0.55,
    elbow: 0.65 - give * 0.3,
    spread: leading ? 0.48 : 0.32,
    brace: release,
    support: 1 - smooth(0.13, leading ? 0.35 : 0.24, age),
    step: leading ? 0.28 : 0,
  };
}
