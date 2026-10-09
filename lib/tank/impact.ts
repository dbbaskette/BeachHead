/** Timed structural failure: roof drops under gravity; wall footings hinge inward. */
export function collapsePose(
  seconds: number,
  part: number,
  height: number,
  seed: number,
) {
  const delay =
    part >= 4 ? 0.12 + (part - 4) * 0.16 : 0.22 + ((part + seed) % 4) * 0.11;
  const t = Math.max(0, seconds - delay);
  const fall = Math.min(height - 0.7, 4.905 * t * t);
  const angle = Math.min(1.3, t * t * 1.9);
  return {
    y: part >= 4 ? -fall : -Math.min(0.7, t * 0.5),
    x:
      part === 2
        ? angle
        : part === 3
          ? -angle
          : part >= 4
            ? t * (part === 4 ? 0.22 : -0.19)
            : 0,
    z:
      part === 0
        ? -angle
        : part === 1
          ? angle
          : part >= 4
            ? t * (part === 4 ? 0.24 : -0.21)
            : 0,
    visible: seconds < 2.1,
  };
}
export type Fragment = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
};
/** Ballistic fragments lose vertical energy and skid to a stop on first contact. */
export function stepFragment(p: Fragment, dt: number) {
  p.vy -= 9.81 * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  if (p.y < 0.08) {
    p.y = 0.08;
    p.vy = Math.abs(p.vy) > 0.8 ? -p.vy * 0.22 : 0;
    const friction = Math.exp(-dt * 14);
    p.vx *= friction;
    p.vz *= friction;
  }
}
