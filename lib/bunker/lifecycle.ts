/** Touch browsers may blur a still-visible page while interacting with browser
 * chrome or controls. Visibility/pagehide, rather than focus, determine whether
 * that mobile mission has actually left the foreground. Desktop blur still pauses. */
export const bunkerBlurIsInterruption = (touch: boolean, hidden: boolean) =>
  !touch || hidden;

export function bindBunkerInterruptions(
  windowTarget: EventTarget,
  documentTarget: EventTarget & { readonly hidden: boolean },
  isTouch: () => boolean,
  pause: () => void,
) {
  const blur = () => {
    if (bunkerBlurIsInterruption(isTouch(), documentTarget.hidden)) pause();
  };
  const visibility = () => {
    if (documentTarget.hidden) pause();
  };
  windowTarget.addEventListener('blur', blur);
  windowTarget.addEventListener('pagehide', pause);
  documentTarget.addEventListener('visibilitychange', visibility);
  return () => {
    windowTarget.removeEventListener('blur', blur);
    windowTarget.removeEventListener('pagehide', pause);
    documentTarget.removeEventListener('visibilitychange', visibility);
  };
}
