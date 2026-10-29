import { useRef } from 'react';

/**
 * Press-and-hold detection that coexists with the swipe pager (a stationary
 * hold never starts a horizontal swipe). `fired` lets the caller suppress the
 * click that would otherwise follow the long press.
 */
// moveTolerance must be smaller than the swipe pager's 8px axis-lock threshold,
// so starting a horizontal/vertical swipe cancels the long press BEFORE the
// pager captures the pointer (otherwise the menu would pop up mid-swipe).
export function useLongPress(onLongPress, { delay = 450, moveTolerance = 6 } = {}) {
  const timer = useRef(null);
  const start = useRef(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const handlers = {
    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, delay);
    },
    onPointerMove(e) {
      if (!start.current) return;
      if (
        Math.abs(e.clientX - start.current.x) > moveTolerance ||
        Math.abs(e.clientY - start.current.y) > moveTolerance
      ) {
        clear();
      }
    },
    onPointerUp() {
      clear();
      start.current = null;
    },
    onPointerCancel() {
      clear();
      start.current = null;
    },
    onContextMenu(e) {
      e.preventDefault();
    },
  };

  return { fired, handlers };
}
