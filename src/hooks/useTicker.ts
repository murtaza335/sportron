import { useEffect, useState } from 'react';

/** Wall-clock ticker (default 4×/s) while `active` — drives on-screen clocks only; nothing is sent per tick. Returns 0 until the first tick. */
export function useTicker(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, intervalMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active, intervalMs]);
  return now;
}
