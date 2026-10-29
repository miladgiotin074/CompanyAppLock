import { useEffect, useRef, useState } from 'react';

const TRIGGER = 72;
const HOLD = 56;
const MAX = 128;

function ignoreTarget(target) {
  return Boolean(target?.closest?.('input, textarea, select, [role="switch"]'));
}

function resisted(distance) {
  return Math.min(MAX, Math.max(0, distance) * 0.55);
}

function RefreshMark({ progress, spinning }) {
  const amount = Math.max(0.08, Math.min(1, progress));
  const radius = 10;
  const length = 2 * Math.PI * radius;
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 36 36"
      className={spinning ? 'animate-spin' : ''}
      aria-hidden="true"
    >
      <circle cx="18" cy="18" r={radius} fill="none" stroke="#D3E3FD" strokeWidth="3" />
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        stroke="#1A73E8"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={`${amount * length} ${length}`}
        transform={spinning ? undefined : `rotate(${amount * 300} 18 18)`}
      />
    </svg>
  );
}

/**
 * Android-style pull-to-refresh. The gesture starts only when the list is
 * already at the top, so a normal scroll and a horizontal tab swipe still win.
 */
export default function SwipeRefresh({ onRefresh, children, className = '' }) {
  const scrollerRef = useRef(null);
  const pull = useRef(null);
  const offsetRef = useRef(0);
  const refreshingRef = useRef(false);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  function setPull(next) {
    offsetRef.current = next;
    setOffset(next);
  }

  function suppressClick() {
    const block = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('click', block, true);
    window.setTimeout(() => window.removeEventListener('click', block, true), 400);
  }

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  function beginRefresh() {
    refreshingRef.current = true;
    setRefreshing(true);
    setPull(HOLD);
    const started = Date.now();
    Promise.resolve()
      .then(() => onRefreshRef.current?.())
      .catch(() => {})
      .finally(async () => {
        const remain = 400 - (Date.now() - started);
        if (remain > 0) await new Promise((resolve) => setTimeout(resolve, remain));
        refreshingRef.current = false;
        setRefreshing(false);
        setPull(0);
      });
  }

  function finishPull(wasActive) {
    setDragging(false);
    if (!wasActive) return;
    suppressClick();
    if (offsetRef.current >= TRIGGER) beginRefresh();
    else setPull(0);
  }

  function onPointerDown(event) {
    if (event.pointerType === 'touch') return;
    if (refreshingRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (ignoreTarget(event.target)) return;
    const scroller = scrollerRef.current;
    if (!scroller || scroller.scrollTop > 0) return;
    pull.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      active: false,
    };
  }

  function onPointerMove(event) {
    const gesture = pull.current;
    if (!gesture || event.pointerId !== gesture.id || refreshingRef.current) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      const scroller = scrollerRef.current;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || !scroller || scroller.scrollTop > 0) {
        pull.current = null;
        return;
      }
      gesture.active = true;
      setDragging(true);
      if (event.currentTarget.setPointerCapture) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* The pull still follows the finger without capture. */
        }
      }
    }
    setPull(resisted(dy));
  }

  function onPointerUp(event) {
    const gesture = pull.current;
    if (!gesture || event.pointerId !== gesture.id) return;
    pull.current = null;
    setDragging(false);
    if (!gesture.active) return;
    finishPull(gesture.active);
  }

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return undefined;
    const gesture = { x: 0, y: 0, tracking: false, active: false };

    function onStart(event) {
      if (refreshingRef.current || event.touches.length !== 1) return;
      if (ignoreTarget(event.target)) return;
      if (el.scrollTop > 0) return;
      const touch = event.touches[0];
      gesture.x = touch.clientX;
      gesture.y = touch.clientY;
      gesture.tracking = true;
      gesture.active = false;
    }

    function onMove(event) {
      if (!gesture.tracking || refreshingRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - gesture.x;
      const dy = touch.clientY - gesture.y;
      if (!gesture.active) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || el.scrollTop > 0) {
          gesture.tracking = false;
          return;
        }
        gesture.active = true;
        setDragging(true);
      }
      if (event.cancelable) event.preventDefault();
      setPull(resisted(dy));
    }

    function onEnd() {
      if (!gesture.tracking && !gesture.active) return;
      const wasActive = gesture.active;
      gesture.tracking = false;
      gesture.active = false;
      finishPull(wasActive);
    }

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const travel = refreshing ? HOLD : offset;

  return (
    <div className={`relative min-h-0 overflow-hidden ${className}`}>
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-center"
        style={{ height: travel, opacity: travel > 6 ? 1 : 0 }}
        aria-hidden={travel <= 6}
      >
        <RefreshMark progress={refreshing ? 0.75 : travel / TRIGGER} spinning={refreshing} />
      </div>
      <div
        ref={scrollerRef}
        data-swipe-refresh=""
        className="no-scrollbar h-full overflow-y-auto"
        style={{
          transform: travel ? `translate3d(0, ${travel}px, 0)` : undefined,
          transition: dragging ? 'none' : 'transform 180ms ease',
          overscrollBehavior: 'contain',
          touchAction: 'pan-y',
        }}
        aria-busy={refreshing || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}
