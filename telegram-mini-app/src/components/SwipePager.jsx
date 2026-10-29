import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import SwipeRefresh from './SwipeRefresh.jsx';

const SNAP_MS = 220;

function isRtl() {
  return document.documentElement.dir === 'rtl';
}

function ignoreTarget(target) {
  return Boolean(target.closest('input, textarea, select, [role="switch"]'));
}

/** Pixel offset that puts panel `index` inside the viewport. */
function baseFor(index, width, count, rtl) {
  if (!width) return 0;
  return rtl ? -(count - 1 - index) * width : -index * width;
}

function progressFor(x, width, count, rtl) {
  if (!width) return 0;
  const raw = rtl ? count - 1 + x / width : -x / width;
  return Math.min(count - 1, Math.max(0, raw));
}

/**
 * One viewport, every tab mounted beside the current one.
 * The finger moves that strip, so the next tab is already on screen while dragging.
 * RTL lays the first tab on the right; dragging right pulls the next tab in from the left.
 */
export default function SwipePager({ keys, value, onChange, onProgress, onRefresh, className = '', renderPanel }) {
  const count = keys.length;
  const index = Math.max(0, keys.indexOf(value));
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const drag = useRef(null);
  const placed = useRef(false);
  const indexSeen = useRef(null);
  const ownSnap = useRef(false);
  const [width, setWidth] = useState(0);
  const [x, setX] = useState(0);
  const [anim, setAnim] = useState(false);
  const rtl = isRtl();
  const onProgressRef = useRef(onProgress);
  const onChangeRef = useRef(onChange);
  onProgressRef.current = onProgress;
  onChangeRef.current = onChange;

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => {
      const next = el.clientWidth;
      if (next > 0) setWidth(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width || drag.current) return undefined;
    if (ownSnap.current) {
      ownSnap.current = false;
      indexSeen.current = index;
      placed.current = true;
      return undefined;
    }
    const indexChanged = indexSeen.current !== index;
    indexSeen.current = index;
    const instant = !placed.current || !indexChanged;
    placed.current = true;
    const nextX = baseFor(index, width, count, isRtl());
    if (instant) {
      setAnim(false);
      setX(nextX);
      return undefined;
    }
    setAnim(true);
    const frame = requestAnimationFrame(() => setX(nextX));
    return () => cancelAnimationFrame(frame);
  }, [index, width, count]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const gesture = { x: 0, y: 0, axis: '' };
    function onStart(event) {
      if (event.touches.length !== 1) return;
      gesture.x = event.touches[0].clientX;
      gesture.y = event.touches[0].clientY;
      gesture.axis = '';
    }
    function onMove(event) {
      if (!gesture.axis) {
        const touch = event.touches[0];
        if (!touch) return;
        const dx = touch.clientX - gesture.x;
        const dy = touch.clientY - gesture.y;
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
      if (gesture.axis === 'h' && event.cancelable) event.preventDefault();
    }
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
    };
  }, []);

  useEffect(() => {
    if (!width) return;
    const rtlNow = isRtl();
    const settled = baseFor(index, width, count, rtlNow);
    const dragging = drag.current != null;
    if (!dragging && !anim && Math.abs(x - settled) > 1) return;
    onProgressRef.current?.(progressFor(x, width, count, rtlNow), dragging);
  }, [x, width, count, index, anim]);

  function liveX() {
    const el = trackRef.current;
    if (!el) return x;
    const transform = getComputedStyle(el).transform;
    if (!transform || transform === 'none') return x;
    return new DOMMatrix(transform).m41;
  }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (ignoreTarget(e.target)) return;
    const origin = liveX();
    drag.current = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      origin,
      axis: null,
      at: Date.now(),
    };
    setAnim(false);
    setX(origin);
  }

  function onPointerMove(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (d.axis === 'v') {
        drag.current = null;
        return;
      }
      if (e.currentTarget.setPointerCapture) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* Capture is optional; the strip still follows the finger. */
        }
      }
    }
    if (d.axis !== 'h' || !width) return;
    const rtlNow = isRtl();
    const towardNext = rtlNow ? dx > 0 : dx < 0;
    const towardPrev = rtlNow ? dx < 0 : dx > 0;
    const atEnd = (towardNext && index >= count - 1) || (towardPrev && index <= 0);
    const applied = atEnd ? dx * 0.22 : dx;
    setX(d.origin + applied);
  }

  function suppressClick() {
    const block = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    window.addEventListener('click', block, true);
    window.setTimeout(() => window.removeEventListener('click', block, true), 400);
  }

  function onPointerUp(e) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.axis !== 'h' || !width) return;
    suppressClick();
    const dx = e.clientX - d.x;
    const dt = Math.max(1, Date.now() - d.at);
    const rtlNow = isRtl();
    const flung = Math.abs(dx / dt) > 0.45;
    const threshold = flung ? 20 : Math.max(48, width * 0.18);
    let delta = 0;
    if (Math.abs(dx) >= threshold) delta = rtlNow ? (dx > 0 ? 1 : -1) : dx < 0 ? 1 : -1;
    const next = Math.min(count - 1, Math.max(0, index + delta));
    const target = baseFor(next, width, count, rtlNow);
    if (next !== index) ownSnap.current = true;
    setAnim(true);
    requestAnimationFrame(() => setX(target));
    if (next !== index) onChangeRef.current?.(keys[next]);
  }

  const visualKeys = rtl ? [...keys].reverse() : keys;

  return (
    <div className={`relative min-h-0 ${className}`}>
    <div
      ref={viewportRef}
      className="absolute inset-0 overflow-hidden"
      style={{ touchAction: 'auto' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        ref={trackRef}
        className="flex h-full"
        style={{
          direction: 'ltr',
          position: 'absolute',
          top: 0,
          left: 0,
          height: '100%',
          width: width ? count * width : '100%',
          transform: `translate3d(${x}px, 0, 0)`,
          transition: anim ? `transform ${SNAP_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : 'none',
        }}
      >
        {visualKeys.map((key) => (
          <div
            key={key}
            className={`h-full shrink-0 ${onRefresh ? 'overflow-hidden' : 'no-scrollbar overflow-y-auto'}`}
            aria-hidden={key !== value}
            style={{
              width: width || '100%',
              direction: rtl ? 'rtl' : 'ltr',
              touchAction: 'auto',
              overscrollBehavior: 'contain',
              pointerEvents: key === value ? 'auto' : 'none',
            }}
          >
            {onRefresh ? (
              <SwipeRefresh className="h-full" onRefresh={() => onRefresh(key)}>
                {renderPanel(key)}
              </SwipeRefresh>
            ) : (
              renderPanel(key)
            )}
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
