/** Horizontal aim remains precise; vertical aim compensates for perspective at range. */
export function mouseAimDelta(
  dx: number,
  dy: number,
  scoped = false,
  precision = false,
  range = 820,
) {
  const gain = (scoped ? 0.45 : 1) * (precision ? 0.2 : 1);
  const verticalGain = (scoped ? 0.8 : 1) * (precision ? 0.35 : 1);
  // Move through inverse distance so distant corrections do not require huge mouse sweeps.
  // The reciprocal form is independent of how the browser batches movement events.
  const current = Math.max(250, Math.min(1600, range));
  const inverse = Math.max(
    1 / 1600,
    Math.min(1 / 250, 1 / current + dy * 0.000006 * verticalGain),
  );
  return { heading: dx * 0.035 * gain, range: 1 / inverse - current };
}
export function mouseWheelRange(
  delta: number,
  mode: number,
  precision = false,
) {
  const units = mode === 1 ? 16 : mode === 2 ? 400 : 1;
  return -delta * units * (precision ? 0.06 : 0.4);
}
