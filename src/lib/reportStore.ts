import { useSyncExternalStore } from 'react';

import type { ReportTarget } from '@/lib/reports';

/** Tiny external store (like toast/celebrate): any component opens the report sheet with one call. */
let current: ReportTarget | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function openReport(target: ReportTarget) {
  current = target;
  emit();
}

export function closeReport() {
  if (current === null) return;
  current = null;
  emit();
}

export function useReportTarget(): ReportTarget | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => null,
  );
}
