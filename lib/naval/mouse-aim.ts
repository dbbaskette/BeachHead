/** Consistent, unaccelerated aiming; optics and precision reduce both axes. */
export function mouseAimDelta(
  dx: number,
  dy: number,
  scoped = false,
  precision = false,
) {
  const gain = (scoped ? 0.45 : 1) * (precision ? 0.2 : 1);
  return { heading: dx * 0.035 * gain, range: -dy * 0.7 * gain };
}
export function mouseWheelRange(
  delta: number,
  mode: number,
  precision = false,
) {
  const units = mode === 1 ? 16 : mode === 2 ? 400 : 1;
  return -delta * units * (precision ? 0.025 : 0.15);
}
