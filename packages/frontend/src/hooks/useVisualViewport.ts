/**
 * While active, publishes the visible area as --chat-vv-height and --chat-vv-top
 * and reports whether an on-screen keyboard is taking up part of it. iOS leaves
 * the layout viewport alone when the keyboard opens, so `dvh` cannot see it.
 */
import { useEffect, useState } from "react";

/** Matches the side-panel breakpoint in styles.css: a shrunken window there is not a keyboard. */
const PHONE_LAYOUT = "(max-width: 939px)";
/** More than the browser's own toolbars ever take back. */
const KEYBOARD_MIN_PX = 120;

export function useVisualViewport(active: boolean): boolean {
  const [keyboardUp, setKeyboardUp] = useState(false);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return;
    const root = document.documentElement;
    let width = viewport.width;
    let tallest = viewport.height;

    const sync = (): void => {
      if (viewport.width !== width) {
        width = viewport.width; // Rotated: the old height means nothing now.
        tallest = viewport.height;
      }
      tallest = Math.max(tallest, viewport.height);
      root.style.setProperty("--chat-vv-height", `${viewport.height}px`);
      root.style.setProperty("--chat-vv-top", `${viewport.offsetTop}px`);
      setKeyboardUp(window.matchMedia(PHONE_LAYOUT).matches && tallest - viewport.height > KEYBOARD_MIN_PX);
    };

    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      root.style.removeProperty("--chat-vv-height");
      root.style.removeProperty("--chat-vv-top");
      setKeyboardUp(false);
    };
  }, [active]);

  return keyboardUp;
}
