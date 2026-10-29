import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useLongPress } from '../lib/useLongPress.js';

function TabButton({ t, selected, onChange, onLongPress, scrollable, innerRef }) {
  const lp = useLongPress(() => onLongPress?.(t.key));
  const armed = Boolean(onLongPress);
  return (
    <button
      ref={innerRef}
      type="button"
      {...(armed ? lp.handlers : {})}
      onClick={() => {
        if (armed && lp.fired.current) {
          lp.fired.current = false;
          return;
        }
        onChange(t.key);
      }}
      className={`relative z-10 select-none whitespace-nowrap py-3 text-sm ${
        scrollable ? 'shrink-0 px-5' : 'flex-1'
      } ${selected ? 'font-bold text-brand-700' : 'text-muted'}`}
    >
      {t.label}
      {t.count != null && ` (${t.count})`}
    </button>
  );
}

/**
 * Material primary tabs.
 * - `scrollable`: Android-style scrolling tab strip — tabs keep their natural
 *   width and the row scrolls (with a measured indicator) instead of shrinking.
 * - `add: true` on a tab renders a "+" action button (next to the last tab).
 * - `onTabLongPress(key)` fires on press-and-hold of a normal tab.
 * - `progress` is a fractional index so the indicator follows a finger drag.
 */
export default function Tabs({
  tabs,
  value,
  progress,
  dragging = false,
  onChange,
  onAction,
  onTabLongPress,
  scrollable = false,
}) {
  const realTabs = tabs.filter((t) => !t.add);
  const realKeys = realTabs.map((t) => t.key);
  const selected = Math.max(0, realTabs.findIndex((t) => t.key === value));
  const n = tabs.length || 1;
  const index = progress == null || Number.isNaN(progress) ? selected : progress;

  const contentRef = useRef(null);
  const tabRefs = useRef({});
  const [metrics, setMetrics] = useState({});

  const measure = useCallback(() => {
    const m = {};
    for (const [k, el] of Object.entries(tabRefs.current)) {
      if (el) m[k] = { left: el.offsetLeft, width: el.offsetWidth };
    }
    setMetrics(m);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (scrollable) measure();
  }, [scrollable, measure, realKeys.join(','), tabs.length]);

  useEffect(() => {
    if (!scrollable) return undefined;
    const ro = new ResizeObserver(measure);
    if (contentRef.current) ro.observe(contentRef.current);
    const t = setTimeout(measure, 60); // after web-font layout settles
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [scrollable, measure]);

  useEffect(() => {
    if (!scrollable) return;
    // Re-scroll on tab-set changes too (e.g. custom tabs load after mount), so
    // the selected tab — "همه" on a fresh open — is brought back into view.
    tabRefs.current[realKeys[selected]]?.scrollIntoView?.({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollable, selected, value, realKeys.join(',')]);

  let indStyle;
  if (scrollable) {
    const i0 = Math.max(0, Math.floor(index));
    const i1 = Math.min(realTabs.length - 1, Math.ceil(index));
    const frac = index - i0;
    const m0 = metrics[realKeys[i0]];
    const m1 = metrics[realKeys[i1]];
    const left = m0 && m1 ? m0.left + (m1.left - m0.left) * frac : m0?.left ?? 0;
    const width = m0 && m1 ? m0.width + (m1.width - m0.width) * frac : m0?.width ?? 0;
    indStyle = {
      left: `${left + 12}px`,
      width: `${Math.max(0, width - 24)}px`,
      opacity: m0 ? 1 : 0,
      transition: dragging
        ? 'none'
        : 'left 220ms cubic-bezier(0.22, 1, 0.36, 1), width 220ms cubic-bezier(0.22, 1, 0.36, 1)',
    };
  } else {
    indStyle = {
      width: `calc(${100 / n}% - 2rem)`,
      insetInlineStart: `calc(${(index / n) * 100}% + 1rem)`,
      transition: dragging ? 'none' : 'inset-inline-start 220ms cubic-bezier(0.22, 1, 0.36, 1)',
    };
  }

  return (
    <div className={scrollable ? 'no-scrollbar overflow-x-auto border-b border-outline' : 'border-b border-outline'}>
      <div ref={contentRef} className={`relative flex ${scrollable ? 'w-max min-w-full' : 'w-full'}`}>
        {tabs.map((t) =>
          t.add ? (
            <button
              key="__add__"
              type="button"
              onClick={onAction}
              className={`flex items-center justify-center py-3 text-muted ${scrollable ? 'shrink-0 px-4' : 'flex-1'}`}
              aria-label="تب جدید"
            >
              <Icon name="add" size={20} />
            </button>
          ) : (
            <TabButton
              key={t.key}
              t={t}
              selected={value === t.key}
              onChange={onChange}
              onLongPress={onTabLongPress}
              scrollable={scrollable}
              innerRef={scrollable ? (el) => { tabRefs.current[t.key] = el; } : undefined}
            />
          ),
        )}
        <span className="pointer-events-none absolute bottom-0 h-[3px] rounded-t-full bg-brand-600" style={indStyle} />
      </div>
    </div>
  );
}
