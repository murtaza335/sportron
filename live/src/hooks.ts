import { useEffect, useRef, useState } from 'react';

/** Size of an element (ResizeObserver, with a window-resize fallback for old browsers). */
export function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }));
    };
    measure();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return [ref, size];
}

// One shared 1 Hz timer for every clock and "waiting for scorer" check on the wall.
const subs = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let now = Date.now();

export function useNow(): number {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((n) => n + 1);
    subs.add(cb);
    if (!timer) {
      timer = setInterval(() => {
        now = Date.now();
        subs.forEach((s) => s());
      }, 1000);
    }
    return () => {
      subs.delete(cb);
      if (subs.size === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);
  return now;
}

/** Window aspect ratio (width / height), kept up to date. */
export function useAspect(): number {
  const [a, setA] = useState(() => window.innerWidth / Math.max(1, window.innerHeight));
  useEffect(() => {
    const on = () => setA(window.innerWidth / Math.max(1, window.innerHeight));
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return a;
}

/** Keep the screen on where the Wake Lock API exists; re-acquire after the tab is shown again. */
export function useWakeLock(): void {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    if (!nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let alive = true;
    const acquire = async () => {
      try {
        lock = await nav.wakeLock.request('screen');
      } catch {
        // not allowed right now — try again on the next visibility change
      }
    };
    void acquire();
    const onVis = () => {
      if (document.visibilityState === 'visible' && alive) void acquire();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => {});
    };
  }, []);
}

/** Hide the mouse cursor after 3 s without movement (it's a wall display). */
export function useIdleCursor(): void {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const show = () => {
      document.body.classList.remove('idle');
      if (t) clearTimeout(t);
      t = setTimeout(() => document.body.classList.add('idle'), 3000);
    };
    show();
    window.addEventListener('mousemove', show);
    return () => {
      window.removeEventListener('mousemove', show);
      if (t) clearTimeout(t);
    };
  }, []);
}
