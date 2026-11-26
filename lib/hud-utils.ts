/** Shallow property comparison using `Object.is` for HUD snapshot deduplication. */
export function shallowEqual<T extends Record<string, unknown>>(
  a: T,
  b: T,
): boolean {
  if (Object.is(a, b)) return true;
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (!Object.is(a[k], b[k])) return false;
  }
  return true;
}
