/** Whether the main pointer is a finger. */
export const isTouch = () => matchMedia("(pointer: coarse)").matches;

/**
 * Stop the browser from treating play as page gestures: long-press menus and
 * selection, pinch and double-tap zoom, pull-to-refresh and scrolling, and
 * swipes from the screen edge (iOS back and forward).
 */
export function lockGestures(root, signal) {
  const stop = (e) => e.cancelable && e.preventDefault();
  for (const type of ["contextmenu", "selectstart", "dblclick", "dragstart"]) root.addEventListener(type, stop, { signal });
  for (const type of ["gesturestart", "gesturechange"]) document.addEventListener(type, stop, { signal, passive: false });
  root.addEventListener("touchmove", stop, { signal, passive: false });
  root.addEventListener("touchstart", (e) => {
    if (e.target.closest("button, a")) return;
    const x = e.touches[0]?.clientX ?? 50;
    if (e.touches.length > 1 || x < 24 || x > innerWidth - 24) stop(e);
  }, { signal, passive: false });
}

/**
 * Turn the back button or back swipe into a pause while `playing()`: a guard
 * history entry (same URL) is pushed by `arm()`; going back pops it and calls
 * `onBack()`, which should pause. Going back again leaves as usual.
 */
export function backGuard({ signal, playing, onBack }) {
  const arm = () => {
    if (!history.state?.mvgGuard) history.pushState({ ...history.state, mvgGuard: true }, "");
  };
  addEventListener("popstate", () => {
    if (playing()) onBack();
  }, { signal });
  return { arm };
}

/** Keeps the screen on while a song plays. */
export function wakeLock() {
  let lock = null;
  return {
    async hold() {
      try {
        lock ??= await navigator.wakeLock?.request("screen");
        lock?.addEventListener("release", () => (lock = null));
      } catch {
        lock = null;
      }
    },
    release() {
      lock?.release().catch(() => {});
      lock = null;
    },
  };
}

/** A short vibration on phones that support it. */
export const buzz = (ms) => isTouch() && navigator.vibrate?.(ms);

/** On phones, go fullscreen and try to hold landscape. Call inside a user gesture. */
export function goFullscreen() {
  if (!isTouch() || document.fullscreenElement) return;
  document.documentElement
    .requestFullscreen?.({ navigationUI: "hide" })
    .then(() => screen.orientation?.lock?.("landscape"))
    .catch(() => {});
}
