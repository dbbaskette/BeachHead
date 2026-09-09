function smooth(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}
/** Four stable reactions, selected per soldier; time is simulation time, so pause is exact. */
export function deathPose(id: number, time: number) {
  const variant = id % 4;
  const fall = smooth(time / (variant === 3 ? 1.15 : 0.7));
  const settle = smooth((time - 0.25) / 0.9);
  if (variant === 0)
    return {
      pitch: -1.52 * fall,
      roll: 0.16 * settle,
      yaw: 0.15 * fall,
      height: 0.12 * fall,
      shift: -0.35 * fall,
    };
  if (variant === 1)
    return {
      pitch: 1.48 * fall,
      roll: -0.2 * settle,
      yaw: -0.25 * fall,
      height: 0.18 * fall,
      shift: 0.35 * fall,
    };
  if (variant === 2)
    return {
      pitch: -0.25 * fall,
      roll: 1.5 * fall,
      yaw: 0.45 * fall,
      height: 0.14 * fall,
      shift: -0.12 * fall,
    };
  // Knees buckle first, then the torso folds into a forward collapse.
  return {
    pitch: -1.5 * settle,
    roll: -0.35 * fall,
    yaw: -0.2 * fall,
    height: -0.35 * Math.sin(Math.PI * fall) + 0.15 * settle,
    shift: -0.2 * fall,
  };
}
